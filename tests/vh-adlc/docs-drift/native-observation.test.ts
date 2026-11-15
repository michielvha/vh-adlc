/** Actual native-reader processes against owned fake API responses. No provider execution. */
import { afterAll, expect, test } from "bun:test";
import { readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { source } from "./adoption-fixture";
import { nativeReader } from "./runtime-fixture";
import { captureRepositoryState } from "../../../plugins/vh-adlc/scripts/docs-drift/snapshot";
import { OUTPUT_LIMIT } from "../../../plugins/vh-adlc/scripts/docs-drift/owned-process";
import { ArtifactChanged } from "../../../plugins/vh-adlc/scripts/docs-drift/evidence-input";
import { NativeObservationChanged, NativeObservationUnavailable, readNativeContext, withNativeObservation, type NativeObservation } from "../../../plugins/vh-adlc/scripts/docs-drift/transport";

const roots: string[] = [];
let failed = false;
afterAll(() => {
  if (failed) console.error("Preserved failed owned native-observation roots", JSON.stringify(roots));
  else for (const root of roots) rmSync(root, { recursive: true, force: true });
});

function fixture(body = "Original explanation") {
  const f = source(roots), inventory = join(f.root, "pulls.json");
  const repo = { id: 10, full_name: "fixture/docs", default_branch: "main" };
  const pulls = [1, 2].map(number => ({ number, state: "open", merged_at: null, body, draft: false,
    user: { login: "fixture-bot", id: 20, type: "Bot" },
    head: { sha: f.candidate, ref: "docs-drift/" + number, repo },
    base: { sha: f.candidate, ref: "main", repo } }));
  const save = () => writeFileSync(inventory, JSON.stringify(pulls));
  save();
  const native = nativeReader({ ...f, inventory_path: inventory });
  const scope = { hostname: "github.com", repository: "fixture/docs", credential: "synthetic-read-token", path: native.environment.PATH };
  const calls = () => readFileSync(native.trace, "utf8").trim().split("\n").map(line => JSON.parse(line));
  return { ...f, ...native, scope, pulls, save, calls, program: join(f.root, "native-bin/gh") };
}

test("one native observation deduplicates repeated reads and replays its original inputs", async () => {
  try {
    const f = fixture(), before = captureRepositoryState(f.repo);
    await withNativeObservation(f.scope, async observation => {
      for (let index = 0; index < 100; index++) {
        const context = readNativeContext({ ...f.scope, observation });
        expect(context.repository.repository().id).toBe(10);
        expect(context.repository.ref("refs/heads/main").sha).toBe(f.candidate);
        expect(context.repository.pull(1).body).toBe("Original explanation");
        context.identity.actor = "Caller mutation";
        const mutated = context.repository.pull(1);
        mutated.body = "Caller mutation";
      }
    });
    const calls = f.calls();
    expect(calls).toHaveLength(21);
    expect(calls.filter(call => call.args.includes("user/20"))).toHaveLength(3);
    expect(calls.filter(call => call.args.includes("repos/fixture/docs"))).toHaveLength(5);
    expect(calls.filter(call => call.args.includes("repos/fixture/docs/git/ref/heads/main"))).toHaveLength(5);
    expect(calls.filter(call => call.args.includes("repos/fixture/docs/git/commits/" + f.candidate))).toHaveLength(3);
    expect(calls.filter(call => call.args.includes("repos/fixture/docs/pulls/1"))).toHaveLength(2);
    expect(calls.filter(call => call.args.includes("graphql"))).toHaveLength(3);
    expect(calls.every(call => call.provider === null && call.credential && call.enterprise)).toBe(true);
    expect(captureRepositoryState(f.repo)).toEqual(before);
  } catch (error) { failed = true; throw error; }
}, 90000);

test("native observation handles and cached readers expire and cannot be recreated from JSON", async () => {
  try {
    const f = fixture();
    expect(new NativeObservationUnavailable()).not.toBeInstanceOf(ArtifactChanged);
    const expired = await withNativeObservation(f.scope, async observation => {
      const reader = readNativeContext({ ...f.scope, observation }).repository;
      reader.pull(1);
      const copied = JSON.parse(JSON.stringify(observation)) as NativeObservation;
      expect(() => readNativeContext({ ...f.scope, observation: copied })).toThrow(NativeObservationUnavailable);
      return { observation, reader };
    });
    expect(() => readNativeContext({ ...f.scope, observation: expired.observation })).toThrow(NativeObservationUnavailable);
    expect(() => expired.reader.pull(1)).toThrow(NativeObservationUnavailable);
    expect(() => expired.reader.commit(f.candidate)).toThrow(NativeObservationUnavailable);
  } catch (error) { failed = true; throw error; }
}, 90000);

test("only checked reader methods are available inside a native observation", async () => {
  try {
    const f = fixture();
    await withNativeObservation(f.scope, async observation => {
      const reader = readNativeContext({ ...f.scope, observation }).repository;
      expect(() => reader.pulls("main")).toThrow(NativeObservationUnavailable);
      expect(() => reader.commit(f.candidate)).toThrow(NativeObservationUnavailable);
    });
  } catch (error) { failed = true; throw error; }
}, 90000);

test.each(["actor", "source", "pull"])("native observation rejects changed inputs on final replay: %s", async changed => {
  try {
    const f = fixture();
    await expect(withNativeObservation(f.scope, async observation => {
      readNativeContext({ ...f.scope, observation }).repository.pull(1);
      if (changed === "pull") { f.pulls[0].body = "Changed explanation"; f.save(); }
      else {
        const program = readFileSync(f.program, "utf8");
        writeFileSync(f.program, changed === "actor" ? program.replaceAll('"fixture-bot"', '"changed-actor"')
          : program.replace(JSON.stringify(f.candidate), JSON.stringify("f".repeat(40))));
      }
    })).rejects.toBeInstanceOf(NativeObservationChanged);
  } catch (error) { failed = true; throw error; }
}, 90000);

test("swallowing a scope-change exception cannot validate the original observation", async () => {
  try {
    const f = fixture();
    await expect(withNativeObservation(f.scope, async observation => {
      expect(() => readNativeContext({ ...f.scope, credential: "another-token", observation })).toThrow(NativeObservationChanged);
    })).rejects.toBeInstanceOf(NativeObservationChanged);
  } catch (error) { failed = true; throw error; }
}, 90000);

test.each(["unchanged", "actor-changed"])("callback failure preserves material-change classification: %s", async state => {
  try {
    const f = fixture(), transient = Error("Synthetic read failure");
    const result = withNativeObservation(f.scope, async observation => {
      readNativeContext({ ...f.scope, observation }).repository.pull(1);
      if (state === "actor-changed") writeFileSync(f.program, readFileSync(f.program, "utf8").replaceAll('"fixture-bot"', '"changed-actor"'));
      throw transient;
    });
    if (state === "actor-changed") await expect(result).rejects.toBeInstanceOf(NativeObservationChanged);
    else await expect(result).rejects.toBe(transient);
  } catch (error) { failed = true; throw error; }
}, 90000);

test("responses beyond the retained byte budget are reread and observed changes remain invalid after restoration", async () => {
  try {
    const body = "x".repeat(OUTPUT_LIMIT / 2 + 1024), f = fixture(body);
    await expect(withNativeObservation(f.scope, async observation => {
      const reader = readNativeContext({ ...f.scope, observation }).repository;
      expect(reader.pull(1).body.length).toBe(body.length);
      expect(reader.pull(2).body.length).toBe(body.length);
      expect(reader.pull(2).body.length).toBe(body.length);
      f.pulls[1].body = "y" + body.slice(1); f.save();
      expect(() => reader.pull(2)).toThrow(NativeObservationChanged);
      f.pulls[1].body = body; f.save();
    })).rejects.toBeInstanceOf(NativeObservationChanged);
    expect(f.calls().filter(call => call.args.includes("repos/fixture/docs/pulls/2"))).toHaveLength(3);
  } catch (error) { failed = true; throw error; }
}, 90000);

test("an incomplete comments replay stays retryable without asserting a material change", async () => {
  try {
    const f = fixture(), comments = join(f.root, "comments.json");
    writeFileSync(comments, "[]");
    writeFileSync(f.program, readFileSync(f.program, "utf8").replace("const value = endpoint ===",
      'const value = endpoint?.startsWith("repos/fixture/docs/issues/1/comments?") ? '
      + 'JSON.parse(require("node:fs").readFileSync(' + JSON.stringify(comments) + ', "utf8")) : endpoint ==='));
    let failure: unknown;
    try {
      await withNativeObservation(f.scope, async observation => {
        expect(readNativeContext({ ...f.scope, observation }).repository.comments(1).complete).toBe(true);
        writeFileSync(comments, '{"message":"Synthetic temporarily incomplete collection"}');
      });
    } catch (error) { failure = error; }
    expect(failure).toBeInstanceOf(Error);
    expect(failure).not.toBeInstanceOf(NativeObservationChanged);
    writeFileSync(comments, "[]");
    await withNativeObservation(f.scope, async observation => {
      expect(readNativeContext({ ...f.scope, observation }).repository.comments(1).complete).toBe(true);
    });
  } catch (error) { failed = true; throw error; }
}, 90000);


test("a changed GraphQL slug at the same ID preserves the native REST account observation", async () => {
  try {
    const f = fixture();
    await withNativeObservation(f.scope, async observation => {
      const original = readNativeContext({ ...f.scope, observation }).identity;
      expect(original.actor).toBe("fixture-bot");
      // The first occurrence belongs to GraphQL. The REST account response deliberately stays unchanged.
      const program = readFileSync(f.program, "utf8"), changed = program.replace('"fixture-bot"', '"alternate-graphql-slug"');
      expect(changed).not.toBe(program);
      writeFileSync(f.program, changed);
      const reply = Bun.spawnSync([f.program, "api", "--method", "POST", "graphql"], { env: f.environment, stdout: "pipe", stderr: "pipe" });
      expect(reply.exitCode).toBe(0);
      expect(JSON.parse(reply.stdout.toString()).data.viewer).toEqual({ login: "alternate-graphql-slug", databaseId: 20 });
    });
    expect(readNativeContext(f.scope).identity.actor).toBe("fixture-bot");
  } catch (error) { failed = true; throw error; }
}, 90000);
