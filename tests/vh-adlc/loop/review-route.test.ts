// The external command route for reviews: which replies may be stored, and how the
// owning worktree is protected from a reviewer that can run commands.
import { afterAll, describe, expect, test } from "bun:test";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync, utimesSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { runReviewRoute, snapshot, type ReviewOutcome } from "../../../plugins/vh-adlc/scripts/loop/review-route";
import { pidNamespaceAvailable, seatbeltAvailable } from "../../../plugins/vh-adlc/scripts/triage/owned-process";
import { pagesStub } from "./pages-stub";

const made: string[] = [];

// Route tests need a process boundary: a PID namespace or a sandbox-exec write profile. Inside another
// Seatbelt sandbox neither works, so they would each fail obscurely; report that once instead.
const ROUTE_BOUNDARY = pidNamespaceAvailable() || seatbeltAvailable();
const routed = ROUTE_BOUNDARY ? test : test.skip;
if (!ROUTE_BOUNDARY)
  test("the route tests need an unsandboxed run", () => {
    throw Error("The route tests need an unsandboxed run: this process is inside a Seatbelt sandbox, which cannot nest, "
      + "or the host has no PID namespace. Run them outside any sandbox; a command-route reviewer judges them from a recorded run.");
  });
afterAll(() => {
  for (const dir of made) { Bun.spawnSync(["chmod", "-R", "u+w", dir]); rmSync(dir, { recursive: true, force: true }); }
});

/** Git's repository-local variables, which a hook sets for the repository it acts on; fixtures must not inherit them. */
const REPOSITORY_LOCAL_GIT = ["GIT_DIR", "GIT_INDEX_FILE", "GIT_WORK_TREE", "GIT_COMMON_DIR", "GIT_OBJECT_DIRECTORY",
  "GIT_ALTERNATE_OBJECT_DIRECTORIES", "GIT_NAMESPACE", "GIT_PREFIX"];
function fixtureEnvironment() {
  const env: Record<string, string | undefined> = { ...process.env };
  for (const name of REPOSITORY_LOCAL_GIT) delete env[name];
  return env;
}
function git(root: string, ...args: string[]) {
  const run = Bun.spawnSync(["git", ...args], { cwd: root, stdout: "pipe", stderr: "pipe",
    env: { ...fixtureEnvironment(), GIT_AUTHOR_NAME: "t", GIT_AUTHOR_EMAIL: "t@example.invalid", GIT_COMMITTER_NAME: "t", GIT_COMMITTER_EMAIL: "t@example.invalid" } });
  if (run.exitCode !== 0) throw Error(`git ${args.join(" ")}: ${run.stderr.toString()}`);
  return run.stdout.toString().trim();
}

/** A repository with a committed spec, an instruction file, an ignored env file and a scratch directory. */
function repository(extra: (root: string) => void = () => {}) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "vh-review-route-")));
  made.push(root);
  const files: Record<string, string> = {
    "AGENTS.md": "committed instructions\n", "docs/specs/feature.md": "# Feature\n", "src/app.txt": "app\n",
    "README.md": "readme\n", ".gitignore": ".env\nbuild/\n",
  };
  for (const [path, text] of Object.entries(files)) { mkdirSync(dirname(join(root, path)), { recursive: true }); writeFileSync(join(root, path), text); }
  git(root, "init", "-q", "-b", "main"); git(root, "config", "user.name", "t"); git(root, "config", "user.email", "t@example.invalid");
  extra(root);
  git(root, "add", "-A");
  git(root, "commit", "-q", "-m", "fixture");
  writeFileSync(join(root, ".env"), "SECRET=1\n");
  mkdirSync(join(root, "build"));
  return { root, commit: git(root, "rev-parse", "HEAD") };
}

/** A stub reviewer: a bash script that runs `body`, then prints `reply`. */
function stub(body: string, reply: string) {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "vh-review-stub-")));
  made.push(dir);
  const script = join(dir, "reviewer.sh");
  writeFileSync(script, `#!/bin/bash\nset -u\n${body}\ncat <<'REPLY'\n${reply}\nREPLY\n`);
  chmodSync(script, 0o700);
  return script;
}

/** setsid(2) through perl, because macOS ships no setsid binary. */
const SETSID = `perl -MPOSIX -e 'POSIX::setsid(); exec @ARGV or exit 127'`;

const ok = (commit: string, model = "gpt-6.1-sol") => `MODEL: ${model}\nTARGET: ${commit}\n\nNO FINDINGS`;

test("ignored-content exclusion is opt-in and preserves the lifecycle snapshot default", () => {
  const { root } = repository();
  const ordinary = snapshot(root, [], "owning"), excluded = snapshot(root, [], "owning", { ignored: "exclude" });
  writeFileSync(join(root, ".env"), "SECRET=2\n");
  writeFileSync(join(root, "build/cache.txt"), "Generated cache\n");
  expect(snapshot(root, [], "owning")).not.toEqual(ordinary);
  expect(snapshot(root, [], "owning", { ignored: "exclude" })).toEqual(excluded);
});

async function review(root: string, commit: string, script: string, options: { kind?: "spec" | "implementation"; scratch?: string[]; timeoutMs?: number; model?: string } = {}): Promise<ReviewOutcome> {
  return runReviewRoute({ repo: root, commit, kind: options.kind ?? "implementation", document: "docs/specs/feature.md",
    route: { model: options.model ?? "gpt-6.1-sol", argv: [script, "{model}", "{prompt_file}", "{export_dir}"] },
    prompt: `Review docs/specs/feature.md at ${commit}.`, scratch: options.scratch ?? ["build"], timeoutMs: options.timeoutMs ?? 10_000 });
}
function pending(outcome: ReviewOutcome, reason: string) {
  expect(outcome.status).toBe("pending");
  if (outcome.status === "pending") expect(outcome.reason).toContain(reason);
}
/**
 * A reviewer that tries to change a protected path. Under the PID namespace the change happens and the
 * before-and-after check leaves the review pending. Under the macOS write boundary the change is refused,
 * so the review may be ready, but only with the owning worktree unchanged.
 */
async function refusedOrPending(root: string, outcome: Promise<ReviewOutcome>, reason: string) {
  const before = snapshot(root, ["build"], "owning");
  const result = await outcome;
  if (process.platform === "darwin" && result.status === "ready") expect(snapshot(root, ["build"], "owning")).toEqual(before);
  else pending(result, reason);
}

describe("replies", () => {
  routed("a matching reply is ready to store, with the records after both header lines", async () => {
    const { root, commit } = repository();
    const outcome = await review(root, commit, stub("", ok(commit)));
    expect(outcome).toMatchObject({ status: "ready", model: "gpt-6.1-sol", target: commit, records: "NO FINDINGS\n", isolation: "procedural" });
  });

  routed("the placeholders carry the model, the prompt text in a file and the export directory", async () => {
    const { root, commit } = repository();
    const script = stub(`[ "$1" = gpt-6.1-sol ] || exit 7\ngrep -q "Review docs/specs/feature.md at ${commit}" "$2" || exit 8\n[ -f "$3/docs/specs/feature.md" ] || exit 9`, ok(commit));
    expect((await review(root, commit, script, { kind: "spec" })).status).toBe("ready");
  });

  for (const [name, reply, reason] of [
    ["a different model", (c: string) => ok(c, "claude-opus-5-5"), "model"],
    ["an unknown model", (c: string) => ok(c, "unknown"), "model"],
    ["another target", () => ok("0000000000000000000000000000000000000000"), "target"],
    ["no header", () => "NO FINDINGS", "MODEL"],
    ["no target line", () => "MODEL: gpt-6.1-sol\n\nNO FINDINGS", "TARGET"],
    ["a page the reviewer could not read from the cache", (c: string) => `MODEL: gpt-6.1-sol\nTARGET: ${c}\n\nPAGE NOT CACHED: README.md\n`, "page not cached: README.md"],
  ] as const)
    routed(`${name} leaves the review pending`, async () => {
      const { root, commit } = repository();
      pending(await review(root, commit, stub("", reply(commit))), reason);
    });

  routed("a non-zero exit leaves the review pending", async () => {
    const { root, commit } = repository();
    pending(await review(root, commit, stub("exit 3", ok(commit))), "exit");
  });

  routed("a reviewer that hangs is stopped and the review stays pending", async () => {
    const { root, commit } = repository();
    pending(await review(root, commit, stub("sleep 30", ok(commit)), { timeoutMs: 1_000 }), "timed out");
  });
});

describe("the owning worktree is preserved", () => {
  const changes: [string, (root: string) => void, string][] = [
    ["a touched clean file", () => {}, "echo changed > src/app.txt"],
    ["a rewrite that keeps the status line", root => writeFileSync(join(root, "src/app.txt"), "dirty one\n"), "echo dirty two > src/app.txt"],
    ["a new branch", () => {}, "git branch sneaky"],
    ["a moved tag", root => git(root, "tag", "v1"), "git tag -f v1 HEAD~0 >/dev/null 2>&1; git -c user.name=t -c user.email=t@example.invalid commit -q --allow-empty -m x; git tag -f v1 >/dev/null"],
    ["an overwritten ignored file", () => {}, "echo SECRET=2 > .env"],
    ["a new ignored file outside the scratch directories", () => {}, "echo x > other.env; printf 'other.env\\n' >> .git/info/exclude"],
    ["an index flag change", () => {}, "git update-index --assume-unchanged README.md"],
    ["an overwritten assume-unchanged file", root => git(root, "update-index", "--assume-unchanged", "README.md"), "echo changed > README.md"],
  ];
  for (const [name, before, body] of changes)
    routed(`${name} leaves the review pending`, async () => {
      const { root, commit } = repository();
      before(root);
      await refusedOrPending(root, review(root, commit, stub(body, ok(commit))), "changed");
    });

  routed("writes inside a declared scratch directory are allowed", async () => {
    const { root, commit } = repository();
    expect((await review(root, commit, stub("echo out > build/result.txt", ok(commit)))).status).toBe("ready");
  });
});

describe("reviewer processes", () => {
  const late = (file: string) => `(sleep 1; echo late > ${file}) &`;
  routed("a helper left running after success is stopped before the final check", async () => {
    const { root, commit } = repository();
    const marker = join(root, "src/late.txt");
    expect((await review(root, commit, stub(late(marker), ok(commit)))).status).toBe("ready");
    await Bun.sleep(1_500);
    expect(existsSync(marker)).toBe(false);
  });

  routed("a helper left running after a timeout is stopped", async () => {
    const { root, commit } = repository();
    const marker = join(root, "src/late.txt");
    pending(await review(root, commit, stub(`${late(marker)}\nsleep 30`, ok(commit)), { timeoutMs: 500 }), "timed out");
    await Bun.sleep(1_500);
    expect(existsSync(marker)).toBe(false);
  });

  routed("a helper that detached into its own session is stopped too", async () => {
    const { root, commit } = repository();
    const marker = join(root, "src/late.txt");
    // The stub exits only after the helper has left the process group, so a group kill alone misses it.
    const ready = join(realpathSync(mkdtempSync(join(tmpdir(), "vh-review-ready-"))), "detached");
    made.push(dirname(ready));
    const body = `${SETSID} bash -c 'echo $$ > ${ready}; sleep 1; echo late > ${marker}' </dev/null >/dev/null 2>&1 &\nwhile [ ! -s ${ready} ]; do sleep 0.05; done`;
    expect((await review(root, commit, stub(body, ok(commit)))).status).toBe("ready");
    await Bun.sleep(1_500);
    expect(existsSync(marker)).toBe(false);
  });

  routed("a cleanup that cannot confirm every process stopped leaves the review pending", async () => {
    const { root, commit } = repository();
    const outcome = await runReviewRoute({ repo: root, commit, kind: "implementation", document: "docs/specs/feature.md",
      route: { model: "gpt-6.1-sol", argv: [stub("", ok(commit)), "{prompt_file}"] }, prompt: "p", scratch: [], timeoutMs: 5_000,
      cleanup: async () => ({ confirmed: false, survivors: [4242] }) });
    pending(outcome, "cleanup");
  });
});

describe("file-only spec reviews read the committed export", () => {
  routed("an uncommitted instruction edit never reaches the reviewer", async () => {
    const { root, commit } = repository();
    writeFileSync(join(root, "AGENTS.md"), "live uncommitted instructions\n");
    const script = stub(`[ "$(pwd)" = "$3" ] || exit 5\ngrep -q "committed instructions" AGENTS.md || exit 6\n! grep -q live AGENTS.md || exit 9`, ok(commit));
    expect((await review(root, commit, script, { kind: "spec" })).status).toBe("ready");
  });

  routed("the export is read-only", async () => {
    const { root, commit } = repository();
    const script = stub(`if echo x > "$3/written.txt" 2>/dev/null; then exit 4; fi`, ok(commit));
    expect((await review(root, commit, script, { kind: "spec" })).status).toBe("ready");
  });

  routed("a committed symlink that escapes the export leaves the review pending", async () => {
    const live = realpathSync(mkdtempSync(join(tmpdir(), "vh-review-live-")));
    made.push(live);
    writeFileSync(join(live, "instructions.md"), "live\n");
    const { root, commit } = repository(dir => symlinkSync(join(live, "instructions.md"), join(dir, "linked.md")));
    pending(await review(root, commit, stub("", ok(commit)), { kind: "spec" }), "symlink");
    expect(readFileSync(join(live, "instructions.md"), "utf8")).toBe("live\n");
  });
});

describe("model attestation through the Codex session log", () => {
  /** A Codex-style stub: prints a JSON stream with a thread id and the reply as the final agent message, and writes a session log. */
  function codex(reply: string, sessionModel: string | null, home: string, writeLog = true) {
    const dir = realpathSync(mkdtempSync(join(tmpdir(), "vh-review-codex-")));
    made.push(dir);
    const script = join(dir, "codex.sh"), thread = crypto.randomUUID(), replyFile = join(dir, "reply.txt");
    writeFileSync(replyFile, reply);
    const log = join(home, ".codex", "sessions", "2026", "11", "13", `rollout-2026-11-13T00-00-00-${thread}.jsonl`);
    const meta = sessionModel === null ? '{"type":"session_meta","payload":{}}' : `{"type":"turn_context","payload":{"model":"${sessionModel}"}}`;
    writeFileSync(script, `#!/bin/bash
${writeLog ? `mkdir -p ${dirname(log)}; printf '%s\\n' '${meta}' > ${log}` : ""}
printf '%s\\n' '{"type":"thread.started","thread_id":"${thread}"}'
printf '%s\\n' '{"type":"turn.started"}'
python3 -c 'import json,sys; print(json.dumps({"type":"item.completed","item":{"id":"i","type":"agent_message","text":open(sys.argv[1]).read()}}))' ${replyFile}
printf '%s\\n' '{"type":"turn.completed"}'
`);
    chmodSync(script, 0o700);
    return script;
  }
  async function attested(root: string, commit: string, script: string, home: string) {
    return runReviewRoute({ repo: root, commit, kind: "implementation", document: "docs/specs/feature.md",
      route: { model: "gpt-6.1-sol", argv: [script, "--json", "{prompt}"], model_attestation: "codex-session" },
      prompt: "p", scratch: [], timeoutMs: 10_000, env: { HOME: home } });
  }
  const homeDir = () => { const dir = realpathSync(mkdtempSync(join(tmpdir(), "vh-review-home-"))); made.push(dir); return dir; };

  routed("a session log that records the requested model lets a MODEL: unknown reply be stored, recording the attested model", async () => {
    const { root, commit } = repository(), home = homeDir();
    const outcome = await attested(root, commit, codex(`MODEL: unknown\nTARGET: ${commit}\n\nNO FINDINGS`, "gpt-6.1-sol", home), home);
    // Since T55 records keep their exact bytes; this stub's reply has no final newline.
    expect(outcome).toMatchObject({ status: "ready", model: "gpt-6.1-sol", records: "NO FINDINGS" });
  });
  routed("a session log under CODEX_HOME attests the model when HOME holds no .codex", async () => {
    const { root, commit } = repository(), codexParent = homeDir(), emptyHome = homeDir();
    const script = codex(`MODEL: unknown\nTARGET: ${commit}\n\nNO FINDINGS`, "gpt-6.1-sol", codexParent);
    const outcome = await runReviewRoute({ repo: root, commit, kind: "implementation", document: "docs/specs/feature.md",
      route: { model: "gpt-6.1-sol", argv: [script, "--json", "{prompt}"], model_attestation: "codex-session" },
      prompt: "p", scratch: [], timeoutMs: 10_000, env: { HOME: emptyHome, CODEX_HOME: join(codexParent, ".codex") } });
    expect(outcome).toMatchObject({ status: "ready", model: "gpt-6.1-sol" });
  });
  routed("a session log that records another model leaves the review pending", async () => {
    const { root, commit } = repository(), home = homeDir();
    pending(await attested(root, commit, codex(`MODEL: unknown\nTARGET: ${commit}\n\nNO FINDINGS`, "gpt-5.3-codex", home), home), "attest");
  });
  routed("a session log with no recorded model leaves the review pending", async () => {
    const { root, commit } = repository(), home = homeDir();
    pending(await attested(root, commit, codex(`MODEL: unknown\nTARGET: ${commit}\n\nNO FINDINGS`, null, home), home), "attest");
  });
  routed("a missing session log leaves the review pending", async () => {
    const { root, commit } = repository(), home = homeDir();
    pending(await attested(root, commit, codex(`MODEL: unknown\nTARGET: ${commit}\n\nNO FINDINGS`, "gpt-6.1-sol", home, false), home), "attest");
  });
  routed("a self-report naming a different model leaves the review pending even when the log attests the requested one", async () => {
    const { root, commit } = repository(), home = homeDir();
    pending(await attested(root, commit, codex(`MODEL: claude-opus-5-5\nTARGET: ${commit}\n\nNO FINDINGS`, "gpt-6.1-sol", home), home), "model");
  });
});

describe("preservation hardening", () => {
  routed("a same-size replacement inside an ignored directory that keeps its modification time leaves the review pending", async () => {
    const { root, commit } = repository();
    writeFileSync(join(root, ".git/info/exclude"), "cache/\n");
    mkdirSync(join(root, "cache"));
    writeFileSync(join(root, "cache/data.bin"), "AAAA\n");
    // Since the private review clone (T49) the reviewer works in a fresh clone, so it reaches the owning worktree by path.
    const body = `cd "${root}" && cp -p cache/data.bin /tmp/vh-mtime-ref-$$ && printf 'BBBB\\n' > cache/data.bin && touch -r /tmp/vh-mtime-ref-$$ cache/data.bin; rm -f /tmp/vh-mtime-ref-$$`;
    await refusedOrPending(root, review(root, commit, stub(body, ok(commit))), "changed");
  });

  routed("a same-size rewrite of a clean tracked file that restores its modification time leaves the review pending", async () => {
    const { root, commit } = repository();
    // With ctime ignored, Git's stat cache sees an unchanged size and mtime and reports the file clean.
    git(root, "config", "core.trustctime", "false");
    // Backdate the file and refresh the index so its entry is not racily clean, which would make Git re-read it.
    utimesSync(join(root, "src/app.txt"), new Date("2020-01-01T00:00:00Z"), new Date("2020-01-01T00:00:00Z"));
    git(root, "update-index", "--refresh");
    const body = `cd "${root}" && cp -p src/app.txt /tmp/vh-mtime-ref-$$ && printf 'bad\\n' > src/app.txt && touch -r /tmp/vh-mtime-ref-$$ src/app.txt; rm -f /tmp/vh-mtime-ref-$$`;
    await refusedOrPending(root, review(root, commit, stub(body, ok(commit))), "changed");
  });

  routed("a reviewer that detaches HEAD at the same commit leaves the review pending", async () => {
    const { root, commit } = repository();
    await refusedOrPending(root, review(root, commit, stub(`git -C "${root}" switch -q --detach HEAD`, ok(commit))), "changed");
  });

  routed("a chained committed symlink that escapes the export leaves the review pending", async () => {
    const { root, commit } = repository(dir => {
      mkdirSync(join(dir, "d"));
      symlinkSync("..", join(dir, "d", "back"));
      symlinkSync("d/back/../outside.txt", join(dir, "leak"));
    });
    pending(await review(root, commit, stub("", ok(commit)), { kind: "spec" }), "symlink");
  });
});

describe("review policy comes from the reviewed commit", () => {
  routed("an uncommitted loop.yaml edit that drops a lens and an instruction file does not change the review", () => {
    const stubDir = realpathSync(mkdtempSync(join(tmpdir(), "vh-review-policy-")));
    made.push(stubDir);
    const stubScript = join(stubDir, "reviewer.sh");
    // Echoes, as its records, whether the committed lens and instruction file reached the prompt.
    writeFileSync(stubScript, `#!/bin/bash\nprompt="$2"; commit=$(grep -o 'Commit: [0-9a-f]*' <<<"$prompt" | cut -d' ' -f2)\nprintf 'MODEL: %s\\nTARGET: %s\\n\\n' "$1" "$commit"\nif grep -q 'satellite (blocking)' <<<"$prompt" && grep -q 'AGENTS.md' <<<"$prompt"; then echo 'NO FINDINGS'; else echo 'POLICY CHANGED'; fi\n`);
    chmodSync(stubScript, 0o700);
    const committed = `schema_version: 1\ninstruction_files: [AGENTS.md]\nlenses:\n  - name: satellite\n    check: A new component names its satellite.\n    severity: blocking\nroles:\n  spec_reviewer:\n    route: command\n    model: gpt-6.1-sol\n    argv: [${stubScript}, "{model}", "{prompt}"]\n`;
    const { root, commit } = repository(dir => { mkdirSync(join(dir, ".vh-adlc")); writeFileSync(join(dir, ".vh-adlc/loop.yaml"), committed); });
    writeFileSync(join(root, ".vh-adlc/loop.yaml"), `schema_version: 1\nroles:\n  spec_reviewer:\n    route: command\n    model: gpt-6.1-sol\n    argv: [${stubScript}, "{model}", "{prompt}"]\n`);
    const cli = resolve(import.meta.dir, "../../../plugins/vh-adlc/scripts/loop/cli.ts"), pages = pagesStub();
    const run = Bun.spawnSync([process.execPath, cli, "review", "--repo", root, "--document", "docs/specs/feature.md", "--commit", commit, "--kind", "spec",
      "--docs-revision", "abc", "--binary", pages.binary, "--plugin-pin", "def"], { stdout: "pipe", stderr: "pipe", timeout: 60_000,
      env: { ...process.env, XDG_CONFIG_HOME: join(stubDir, "no-override"), ...pages.env } });
    const outcome = JSON.parse(run.stdout.toString() || "{}");
    expect(outcome).toMatchObject({ status: "ready", records: "NO FINDINGS\n" });
  });
});

describe("environment-clearing helpers", () => {
  routed("an implementation reviewer's detached helper that cleared its environment cannot write after the review", async () => {
    const { root, commit } = repository();
    const marker = join(root, "src/late.txt");
    const ready = join(realpathSync(mkdtempSync(join(tmpdir(), "vh-review-envclear-"))), "detached");
    made.push(dirname(ready));
    const body = `${SETSID} env -i /bin/bash -c 'echo $$ > ${ready}; sleep 1; echo late > ${marker}' </dev/null >/dev/null 2>&1 &\nwhile [ ! -s ${ready} ]; do sleep 0.05; done`;
    expect((await review(root, commit, stub(body, ok(commit)))).status).toBe("ready");
    await Bun.sleep(1_500);
    expect(existsSync(marker)).toBe(false);
  });

  routed("without a process boundary on the host the review stays pending", async () => {
    const { root, commit } = repository();
    const outcome = await runReviewRoute({ repo: root, commit, kind: "implementation", document: "docs/specs/feature.md",
      route: { model: "gpt-6.1-sol", argv: [stub("", ok(commit)), "{model}", "{prompt_file}"] }, prompt: "p", scratch: [], timeoutMs: 5_000, boundary: "unavailable" });
    pending(outcome, "process boundary");
  });
});

describe("pathnames Git quotes", () => {
  routed("a reviewer rewriting an already modified file whose name Git quotes leaves the review pending", async () => {
    const { root, commit } = repository(dir => writeFileSync(join(dir, "a b.txt"), "one\n"));
    writeFileSync(join(root, "a b.txt"), "two\n");
    await refusedOrPending(root, review(root, commit, stub("echo three > 'a b.txt'", ok(commit))), "changed");
  });
});

describe("private review clone", () => {
  for (const kind of ["implementation", "spec"] as const)
    routed(`another session's commit to a different branch during a ${kind} review does not leave it pending`, async () => {
      const { root, commit } = repository();
      const concurrent = setTimeout(() => { git(root, "branch", "other-session", commit); git(root, "tag", "other-tag", commit); }, 400);
      const outcome = await review(root, commit, stub("sleep 1.2", ok(commit)), { kind });
      clearTimeout(concurrent);
      expect(git(root, "branch", "--list", "other-session")).toContain("other-session");
      expect(outcome.status).toBe("ready");
    });

  routed("an implementation reviewer runs in its private clone, not the owning worktree", async () => {
    const { root, commit } = repository();
    const script = stub(`[ "$(pwd)" != "${root}" ] || exit 6\n[ "$(git rev-parse HEAD)" = "${commit}" ] || exit 7`, ok(commit));
    expect((await review(root, commit, script)).status).toBe("ready");
  });

  routed("a reviewer that edits the owning worktree from its private clone leaves the review pending", async () => {
    const { root, commit } = repository();
    await refusedOrPending(root, review(root, commit, stub(`echo changed > "${root}/src/app.txt"`, ok(commit))), "changed");
  });
});

describe("reply bytes", () => {
  test("records keep their bytes after the two header lines: trailing spaces and CRLF survive", async () => {
    const { parseReply } = await import("../../../plugins/vh-adlc/scripts/loop/review-route");
    expect(parseReply("MODEL: m\nTARGET: abcdef1\n\nNO FINDINGS   \n")).toEqual({ model: "m", target: "abcdef1", records: "NO FINDINGS   \n" });
    expect(parseReply("MODEL: m\r\nTARGET: abcdef1\r\n\r\nFINDING: F-01\r\nKIND: factual\r\n")).toEqual({ model: "m", target: "abcdef1", records: "FINDING: F-01\r\nKIND: factual\r\n" });
  });
  test("a reviewer that stops on a page outside the cache gives no records to store, with or without its header lines", async () => {
    const { parseReply } = await import("../../../plugins/vh-adlc/scripts/loop/review-route");
    for (const [reply, page] of [["MODEL: m\nTARGET: abcdef1\n\nPAGE NOT CACHED: README.md\n", "README.md"], ["PAGE NOT CACHED: conventions/go.md\r\n", "conventions/go.md"],
      ["MODEL: m\nPAGE NOT CACHED: README.md", "README.md"],
      // A model may format the stop line a little differently; each variant still stops the review.
      ["MODEL: m\nTARGET: abcdef1\n\n`PAGE NOT CACHED: README.md`\n", "README.md"], ["MODEL: m\nTARGET: abcdef1\n\nPAGE NOT CACHED: README.md (absent from the cache)\n", "README.md"],
      ["MODEL: m\nTARGET: abcdef1\n\nPAGE NOT CACHED: README.md.\n", "README.md"], ["MODEL: m\nTARGET: abcdef1\n\nPAGE NOT CACHED: `guides/a.md`\n", "guides/a.md"],
      ["MODEL: m\nTARGET: abcdef1\n\n- **PAGE NOT CACHED:** \"README.md\"\n", "README.md"], ["MODEL: m\nTARGET: abcdef1\n\n> PAGE NOT CACHED:\n", "unnamed"],
      ["MODEL: m\nTARGET: abcdef1\n\n```\nPAGE NOT CACHED: README.md\n```\n", "README.md"], ["I could not read the page from the cache.\nPAGE NOT CACHED: README.md", "README.md"],
      ["MODEL: m\nTARGET: abcdef1\n\nPage not cached: README.md\n", "README.md"], ["MODEL: m\nTARGET: abcdef1\n\n**PAGE NOT CACHED**: README.md\n", "README.md"],
      ["MODEL: m\nTARGET: abcdef1\n\nPAGE NOT CACHED - README.md\n", "README.md"], ["MODEL: m\nTARGET: abcdef1\n\nPAGE  NOT CACHED README.md\n", "README.md"]] as const)
      expect([reply, parseReply(reply)]).toEqual([reply, { error: `the reviewer stopped: page not cached: ${page}` }]);
    // Only the first line after the header lines can stop the review: a record that quotes the marker,
    // inside a line or on a continuation line of its own, is still a record.
    for (const reply of ["MODEL: m\nTARGET: abcdef1\n\nFINDING: F-01\nEVIDENCE: the reviewer prompt says PAGE NOT CACHED: README.md\n",
      "MODEL: m\nTARGET: abcdef1\n\nFINDING: F-01\nEVIDENCE: the agent file prints\n- `PAGE NOT CACHED: README.md` (backticked)\n",
      "MODEL: m\nTARGET: abcdef1\n\nFINDING: F-01\nEVIDENCE: quoted:\n  PAGE NOT CACHED: <page>\n"])
      expect([reply, parseReply(reply)]).toMatchObject([reply, { model: "m", target: "abcdef1" }]);
  });
});

// macOS has no PID namespace. The route keeps the same guarantee there by running every reviewer process
// under a sandbox-exec profile that refuses writes to the paths the before-and-after check judges.
const darwin = process.platform === "darwin" && ROUTE_BOUNDARY ? test : test.skip;

/**
 * A late writer: forks a process that leaves the session and clears its environment. It waits for the test
 * to create `release`, which the test does only after the route has returned, then runs `command` and
 * writes `done`. It gives up after ten seconds without a release.
 */
function lateWriter(command: string, release: string, done: string) {
  const wait = `n=0; while [ ! -e ${release} ] && [ $n -lt 200 ]; do sleep 0.05; n=$((n+1)); done; [ -e ${release} ] || exit 0`;
  // Double-quoted for the stub's bash, with `$`, `"`, `\` and backquotes escaped so only the writer's sh expands them.
  const script = `${wait}; ${command}; echo done > ${done}`.replace(/["\\$`]/g, "\\$&");
  return `perl -MPOSIX -e 'if (fork() == 0) { POSIX::setsid(); exec("/usr/bin/env", "-i", "/bin/sh", "-c", $ARGV[0]); }' "${script}"`;
}
/** Waits for a late writer's `done` record, up to a deadline. */
async function finished(done: string, deadlineMs = 10_000) {
  const until = Date.now() + deadlineMs;
  while (!existsSync(done) && Date.now() < until) await Bun.sleep(50);
  expect(existsSync(done)).toBe(true);
}

/**
 * A main checkout two levels below a fresh directory, with a linked worktree beside it that is the owning
 * worktree, so its Git directory and common Git directory lie outside it and no test renames the shared
 * temporary directory.
 */
function linkedWorktree() {
  const top = realpathSync(mkdtempSync(join(tmpdir(), "vh-review-linked-")));
  made.push(top);
  const main = join(top, "a/b/main"), wt = join(top, "a/b/wt");
  mkdirSync(join(main, "src"), { recursive: true });
  mkdirSync(join(main, "docs/specs"), { recursive: true });
  writeFileSync(join(main, "src/app.txt"), "app\n");
  writeFileSync(join(main, "docs/specs/feature.md"), "# Feature\n");
  git(main, "init", "-q", "-b", "main");
  git(main, "add", "-A");
  git(main, "commit", "-q", "-m", "fixture");
  git(main, "worktree", "add", "-q", "-b", "feature", wt);
  return { top, main, wt, gitDir: join(main, ".git/worktrees/wt"), commit: git(wt, "rev-parse", "HEAD") };
}
const contentDigest = (path: string) => existsSync(path) ? Bun.hash(readFileSync(path)).toString() : "absent";
function recordFile() {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "vh-review-record-")));
  made.push(dir);
  return join(dir, "record");
}

describe("the macOS write boundary", () => {
  darwin("a detached writer that cleared its environment cannot write into the owning worktree after the review", async () => {
    const { wt, commit } = linkedWorktree();
    const late = join(wt, "src/late.txt"), done = recordFile(), release = recordFile();
    expect((await review(wt, commit, stub(lateWriter(`echo late > ${late}`, release, done), ok(commit)))).status).toBe("ready");
    writeFileSync(release, "go\n");
    await finished(done);
    expect(existsSync(late)).toBe(false);
  });

  darwin("a late writer cannot rename the worktree's grandparent and write through the new path", async () => {
    const { top, wt, commit } = linkedWorktree();
    const rec = join(top, "rename-record"), late = join(wt, "src/late.txt"), done = join(top, "done"), release = join(top, "release");
    const body = lateWriter(`if mv ${top}/a ${top}/ax 2>/dev/null; then echo renamed > ${rec}; echo late > ${top}/ax/b/wt/src/late.txt; mv ${top}/ax ${top}/a; else echo refused > ${rec}; fi`, release, done);
    expect((await review(wt, commit, stub(body, ok(commit)))).status).toBe("ready");
    writeFileSync(release, "go\n");
    await finished(done);
    expect(readFileSync(rec, "utf8")).toBe("refused\n");
    expect(existsSync(late)).toBe(false);
  });

  darwin("a late writer cannot rename the main checkout and change the linked worktree's index through it", async () => {
    const { top, main, gitDir, wt, commit } = linkedWorktree();
    const rec = join(top, "rename-record"), index = join(gitDir, "index"), before = contentDigest(index), done = join(top, "done"), release = join(top, "release");
    const body = lateWriter(`if mv ${main} ${main}x 2>/dev/null; then echo renamed > ${rec}; echo junk >> ${main}x/.git/worktrees/wt/index; mv ${main}x ${main}; else echo refused > ${rec}; fi`, release, done);
    expect((await review(wt, commit, stub(body, ok(commit)))).status).toBe("ready");
    writeFileSync(release, "go\n");
    await finished(done);
    expect(readFileSync(rec, "utf8")).toBe("refused\n");
    expect(contentDigest(index)).toBe(before);
  });

  darwin("an implementation reviewer cannot write into its private clone during the review", async () => {
    const { wt, commit } = linkedWorktree();
    const rec = recordFile();
    const body = `if echo x > during.txt 2>/dev/null; then echo written > ${rec}; else echo refused > ${rec}; fi`;
    expect((await review(wt, commit, stub(body, ok(commit)))).status).toBe("ready");
    expect(readFileSync(rec, "utf8")).toBe("refused\n");
  });

  darwin("a spec reviewer cannot make the export writable and write into it during the review", async () => {
    const { wt, commit } = linkedWorktree();
    const rec = recordFile();
    const body = `chmod u+w "$3" 2>/dev/null; if echo x > "$3/during.txt" 2>/dev/null; then echo written > ${rec}; else echo refused > ${rec}; fi`;
    expect((await review(wt, commit, stub(body, ok(commit)), { kind: "spec" })).status).toBe("ready");
    expect(readFileSync(rec, "utf8")).toBe("refused\n");
  });

  darwin("writes into a declared scratch directory and the temporary directory still land", async () => {
    const { wt, commit } = linkedWorktree();
    const rec = recordFile();
    const body = `mkdir -p build && echo out > build/result.txt && echo scratch >> ${rec}; echo tmp >> ${rec}`;
    expect((await review(wt, commit, stub(body, ok(commit)), { scratch: ["build"] })).status).toBe("ready");
    expect(readFileSync(rec, "utf8")).toBe("scratch\ntmp\n");
  });

  darwin("refs and the linked worktree's index stay unchanged", async () => {
    const { main, gitDir, wt, commit } = linkedWorktree();
    const index = join(gitDir, "index"), before = contentDigest(index), refs = git(main, "for-each-ref");
    const body = `git -C ${wt} branch sneaky 2>/dev/null; git -C ${wt} tag -f t 2>/dev/null; echo junk >> ${index} 2>/dev/null; true`;
    expect((await review(wt, commit, stub(body, ok(commit)))).status).toBe("ready");
    expect(git(main, "for-each-ref")).toBe(refs);
    expect(contentDigest(index)).toBe(before);
  });

  darwin("a separate Git directory whose name ends in a space stays protected", async () => {
    const top = realpathSync(mkdtempSync(join(tmpdir(), "vh-review-sepgit-")));
    made.push(top);
    const root = join(top, "work"), meta = join(top, "meta ");
    mkdirSync(join(root, "docs/specs"), { recursive: true });
    writeFileSync(join(root, "docs/specs/feature.md"), "# Feature\n");
    git(top, "init", "-q", "-b", "main", `--separate-git-dir=${meta}`, root);
    git(root, "add", "-A");
    git(root, "commit", "-q", "-m", "fixture");
    const commit = git(root, "rev-parse", "HEAD"), index = join(meta, "index"), before = contentDigest(index);
    const body = `echo junk >> "${index}" 2>/dev/null; true`;
    expect((await review(root, commit, stub(body, ok(commit)))).status).toBe("ready");
    expect(contentDigest(index)).toBe(before);
  });

  darwin("a protected file that already has a second hard link leaves the review pending before the reviewer runs", async () => {
    const { root, commit } = repository();
    const outside = recordFile(), ran = recordFile();
    expect(Bun.spawnSync(["ln", join(root, "src/app.txt"), outside]).exitCode).toBe(0);
    pending(await review(root, commit, stub(`echo ran > ${ran}`, ok(commit))), "src/app.txt");
    expect(existsSync(ran)).toBe(false);
  });

  darwin("a route started inside another Seatbelt sandbox stays pending and names the missing boundary", () => {
    const { root, commit } = repository();
    const module = resolve(import.meta.dir, "../../../plugins/vh-adlc/scripts/loop/review-route.ts");
    const script = `const { runReviewRoute } = await import(${JSON.stringify(module)});
const outcome = await runReviewRoute({ repo: ${JSON.stringify(root)}, commit: ${JSON.stringify(commit)}, kind: "implementation", document: "docs/specs/feature.md",
  route: { model: "gpt-6.1-sol", argv: [${JSON.stringify(stub("", ok(commit)))}, "{prompt_file}"] }, prompt: "p", scratch: [], timeoutMs: 10000 });
console.log(JSON.stringify(outcome));`;
    const run = Bun.spawnSync(["/usr/bin/sandbox-exec", "-p", "(version 1)(allow default)", process.execPath, "-e", script], { stdout: "pipe", stderr: "pipe" });
    const outcome = JSON.parse(run.stdout.toString().trim().split("\n").at(-1) || "{}") as ReviewOutcome;
    pending(outcome, "sandbox-exec");
  });
});

describe("scratch directories that resolve onto protected paths", () => {
  for (const [name, target] of [
    ["the owning worktree's root", (root: string) => root],
    ["the common Git directory", (root: string) => join(root, ".git/objects")],
    ["a tracked directory of the worktree", (root: string) => join(root, "src")],
    ["the filesystem root", () => "/"],
  ] as const)
    darwin(`a scratch symlink to ${name} leaves the review pending before the reviewer runs`, async () => {
      const { root, commit } = repository();
      const ran = recordFile();
      symlinkSync(target(root), join(root, "alias"));
      // An empty reviewer HOME means no credential stores, so only the protected-path containment can refuse this.
      pending(await reviewWithHome(root, commit, "", `echo ran > ${ran}`, ["alias"]), "alias");
      expect(existsSync(ran)).toBe(false);
    });

  darwin("a real scratch directory and a scratch symlink to a disjoint directory stay writable", async () => {
    const { root, commit } = repository();
    const outside = realpathSync(mkdtempSync(join(tmpdir(), "vh-review-shared-")));
    made.push(outside);
    symlinkSync(outside, join(root, "shared"));
    const body = `echo out > "${root}/build/result.txt"; echo shared > "${root}/shared/result.txt"`;
    expect((await review(root, commit, stub(body, ok(commit)), { scratch: ["build", "shared"] })).status).toBe("ready");
    expect(readFileSync(join(root, "build/result.txt"), "utf8")).toBe("out\n");
    expect(readFileSync(join(outside, "result.txt"), "utf8")).toBe("shared\n");
  });
});

describe("the link check over the owning worktree", () => {
  test("a file that disappears between the listing and its lstat gives a retryable result, not an error", async () => {
    const { protectedLinkCheck } = await import("../../../plugins/vh-adlc/scripts/loop/review-route");
    const { root } = repository();
    const result = protectedLinkCheck(root, [], [], { afterList: dir => { if (dir === "src") rmSync(join(root, "src/app.txt")); } });
    expect(result).toEqual({ changed: "src/app.txt" });
  });

  test("an index that can't be read during the check gives a retryable result, not a pass", async () => {
    const { protectedLinkCheck } = await import("../../../plugins/vh-adlc/scripts/loop/review-route");
    const { root } = repository();
    const locked = realpathSync(mkdtempSync(join(tmpdir(), "vh-review-locked-")));
    made.push(locked);
    mkdirSync(join(locked, "git"));
    writeFileSync(join(locked, "git/index"), "index\n");
    chmodSync(join(locked, "git"), 0o000);
    try {
      expect(protectedLinkCheck(root, [], [join(locked, "git/index")])).toEqual({ changed: join(locked, "git/index") });
    } finally { chmodSync(join(locked, "git"), 0o700); }
  });

  test("a missing HEAD or index of a fresh repository is not a change", async () => {
    const { protectedLinkCheck } = await import("../../../plugins/vh-adlc/scripts/loop/review-route");
    const { root } = repository();
    expect(protectedLinkCheck(root, [], [join(root, ".git/no-such-index")])).toEqual({});
  });

  test("a file with a second hard link is reported by path", async () => {
    const { protectedLinkCheck } = await import("../../../plugins/vh-adlc/scripts/loop/review-route");
    const { root } = repository();
    const outside = recordFile();
    expect(Bun.spawnSync(["ln", join(root, "src/app.txt"), outside]).exitCode).toBe(0);
    expect(protectedLinkCheck(root, [], [])).toEqual({ linked: "src/app.txt" });
  });
});

describe("fixture Git calls", () => {
  test("a hook's GIT_DIR and GIT_INDEX_FILE never redirect a fixture's writes", () => {
    const outer = realpathSync(mkdtempSync(join(tmpdir(), "vh-review-outer-")));
    made.push(outer);
    git(outer, "init", "-q", "-b", "main");
    writeFileSync(join(outer, "f.txt"), "outer\n");
    git(outer, "add", "f.txt");
    git(outer, "commit", "-q", "-m", "outer");
    const head = git(outer, "rev-parse", "HEAD"), index = contentDigest(join(outer, ".git/index"));
    const saved = { GIT_DIR: process.env.GIT_DIR, GIT_INDEX_FILE: process.env.GIT_INDEX_FILE };
    process.env.GIT_DIR = join(outer, ".git");
    process.env.GIT_INDEX_FILE = join(outer, ".git/index");
    try { linkedWorktree(); } finally {
      for (const [name, value] of Object.entries(saved)) if (value === undefined) delete process.env[name]; else process.env[name] = value;
    }
    expect(git(outer, "rev-parse", "HEAD")).toBe(head);
    expect(git(outer, "branch", "--list", "feature")).toBe("");
    expect(contentDigest(join(outer, ".git/index"))).toBe(index);
  });
});

// AC-12: the reviewer runs the candidate's tests with network access, so it must not inherit the controller's
// environment, which holds the session's credentials.
const ENV_ALLOWED = new Set(["PATH", "HOME", "TMPDIR", "USER", "LOGNAME", "SHELL", "LANG", "TERM", "CODEX_HOME",
  "XDG_CONFIG_HOME", "XDG_CACHE_HOME", "XDG_DATA_HOME", "XDG_STATE_HOME", "XDG_RUNTIME_DIR"]);
/** What the route adds (the owned-process marker) and what the stub's own bash sets. */
const ENV_ADDED = new Set(["VH_ADLC_OWNED_PROCESS", "PWD", "OLDPWD", "SHLVL", "_"]);

describe("the reviewer's environment", () => {
  routed("only allowlisted variables and request.env reach the reviewer", async () => {
    const { root, commit } = repository();
    const rec = recordFile();
    const standIns = { VH_REVIEW_SENTINEL: "leak", GH_TOKEN: "ghp_standin", GIT_DIR: join(root, ".git"), SSH_AUTH_SOCK: "/tmp/vh-standin.sock" };
    const saved = Object.fromEntries(Object.keys(standIns).map(name => [name, process.env[name]]));
    Object.assign(process.env, standIns);
    let outcome: ReviewOutcome;
    try {
      outcome = await runReviewRoute({ repo: root, commit, kind: "implementation", document: "docs/specs/feature.md",
        route: { model: "gpt-6.1-sol", argv: [stub(`env > ${rec}`, ok(commit)), "{prompt_file}"] }, prompt: "p", scratch: [],
        timeoutMs: 10_000, env: { VH_PASSED: "yes" } });
    } finally {
      for (const [name, value] of Object.entries(saved)) if (value === undefined) delete process.env[name]; else process.env[name] = value;
    }
    expect(outcome.status).toBe("ready");
    const names = readFileSync(rec, "utf8").split("\n").filter(Boolean).map(line => line.slice(0, line.indexOf("=")));
    const unexpected = names.filter(name => !ENV_ALLOWED.has(name) && !name.startsWith("LC_") && !ENV_ADDED.has(name) && name !== "VH_PASSED");
    expect(unexpected).toEqual([]);
    expect(names).toContain("PATH");
    expect(names).toContain("HOME");
    expect(names).toContain("VH_PASSED");
  });
});

// AC-13: on macOS the profile refuses reads of a fixed list of credential stores under the reviewer's home.
const STORE_FILES = [".ssh/id_test", ".aws/credentials", ".kube/config", ".docker/config.json", ".config/gh/hosts.yml",
  ".config/gcloud/credentials.db", ".netrc", ".git-credentials"];
/** A fake home holding a secret in each of the eight stores and an unlisted notes.txt. */
function fakeHome(options: { withoutConfig?: boolean } = {}) {
  const top = realpathSync(mkdtempSync(join(tmpdir(), "vh-review-home-")));
  made.push(top);
  const home = join(top, "home");
  for (const path of STORE_FILES) {
    if (options.withoutConfig && path.startsWith(".config/")) continue;
    mkdirSync(dirname(join(home, path)), { recursive: true });
    writeFileSync(join(home, path), "SECRET\n");
  }
  writeFileSync(join(home, "notes.txt"), "notes\n");
  return { top, home };
}
async function reviewWithHome(root: string, commit: string, home: string, body: string, scratch: string[] = []) {
  return runReviewRoute({ repo: root, commit, kind: "implementation", document: "docs/specs/feature.md",
    route: { model: "gpt-6.1-sol", argv: [stub(body, ok(commit)), "{prompt_file}"] }, prompt: "p", scratch, timeoutMs: 10_000, env: { HOME: home } });
}

describe("credential stores under the reviewer's home", () => {
  darwin("a reviewer can read none of the eight stores but can read other files", async () => {
    const { root, commit } = repository();
    const { home } = fakeHome();
    const rec = recordFile();
    const body = [...STORE_FILES, "notes.txt"].map(path => `if cat "${home}/${path}" >/dev/null 2>&1; then echo "read ${path}"; else echo "refused ${path}"; fi >> ${rec}`).join("\n");
    expect((await reviewWithHome(root, commit, home, body)).status).toBe("ready");
    const lines = readFileSync(rec, "utf8").trim().split("\n");
    expect(lines).toEqual([...STORE_FILES.map(path => `refused ${path}`), "read notes.txt"]);
  });

  darwin("renaming a store, its parent or the home and reading through the new path is refused", async () => {
    const { root, commit } = repository();
    const { top, home } = fakeHome();
    const rec = recordFile();
    const attempts = [[`${home}/.ssh`, `${home}/moved-ssh`, "id_test"], [`${home}/.config`, `${home}/moved-config`, "gh/hosts.yml"],
      [`${home}/.netrc`, `${home}/moved-netrc`, ""], [home, `${top}/moved-home`, ".ssh/id_test"]];
    const body = attempts.map(([from, to, inside]) => {
      const through = inside ? `${to}/${inside}` : to;
      return `if mv "${from}" "${to}" 2>/dev/null && cat "${through}" >/dev/null 2>&1; then echo "read ${from}"; else echo "refused ${from}"; fi >> ${rec}`;
    }).join("\n");
    expect((await reviewWithHome(root, commit, home, body)).status).toBe("ready");
    expect(readFileSync(rec, "utf8").trim().split("\n")).toEqual(attempts.map(([from]) => `refused ${from}`));
    expect(existsSync(join(home, ".ssh/id_test"))).toBe(true);
  });

  for (const store of [".ssh", ".config"])
    darwin(`a scratch symlink into the reviewer's ${store} leaves the review pending before the reviewer runs`, async () => {
      const { root, commit } = repository();
      const { home } = fakeHome();
      const ran = recordFile();
      symlinkSync(join(home, store), join(root, "cache"));
      pending(await reviewWithHome(root, commit, home, `echo ran > ${ran}`, ["cache"]), "cache");
      expect(existsSync(ran)).toBe(false);
    });

  darwin("with no .config in the home, a reviewer can still create one while the stores stay unreadable", async () => {
    const { root, commit } = repository();
    const { home } = fakeHome({ withoutConfig: true });
    const rec = recordFile();
    const body = `mkdir -p "${home}/.config/other" && echo ok > "${home}/.config/other/file" && echo created >> ${rec}
if cat "${home}/.ssh/id_test" >/dev/null 2>&1; then echo "read ssh" >> ${rec}; else echo "refused ssh" >> ${rec}; fi`;
    expect((await reviewWithHome(root, commit, home, body)).status).toBe("ready");
    expect(readFileSync(rec, "utf8").trim().split("\n")).toEqual(["created", "refused ssh"]);
  });

  darwin("the credential rules win over a write allow that covers a store", async () => {
    const { runOwnedClient } = await import("../../../plugins/vh-adlc/scripts/triage/owned-process");
    const { top, home } = fakeHome();
    const out = join(top, "moved-key");
    const result = await runOwnedClient(["/bin/sh", "-c", `mv "${home}/.ssh/id_test" "${out}" && cat "${out}"`],
      { cwd: top, env: { PATH: process.env.PATH ?? "/usr/bin:/bin" }, stdout: join(top, "o"), stderr: join(top, "e"),
        writeDeny: { deny: [], allow: [join(home, ".ssh")], credentials: { directories: [join(home, ".ssh")], files: [] } } },
      { timeout_ms: 5_000, grace_ms: 200, reap_ms: 1_000 });
    expect(result.boundary).toBe("seatbelt");
    expect(result.exit_code).not.toBe(0);
    expect(existsSync(out)).toBe(false);
    expect(readFileSync(join(top, "o"), "utf8")).not.toContain("SECRET");
  });

  darwin("with HOME unset, the stores of the account's home are still protected", async () => {
    const { homedir } = await import("node:os");
    const { root, commit } = repository();
    const ran = recordFile();
    symlinkSync(join(homedir(), ".ssh"), join(root, "cache"));
    const saved = process.env.HOME;
    delete process.env.HOME;
    let outcome: ReviewOutcome;
    try {
      outcome = await runReviewRoute({ repo: root, commit, kind: "implementation", document: "docs/specs/feature.md",
        route: { model: "gpt-6.1-sol", argv: [stub(`echo ran > ${ran}`, ok(commit)), "{prompt_file}"] }, prompt: "p", scratch: ["cache"], timeoutMs: 10_000 });
    } finally { if (saved === undefined) delete process.env.HOME; else process.env.HOME = saved; }
    pending(outcome, "cache");
    expect(existsSync(ran)).toBe(false);
  });
});

test("the review protocol links to loop-settings.md for the boundary details", () => {
  const protocol = readFileSync(resolve(import.meta.dir, "../../../plugins/vh-adlc/references/review-protocol.md"), "utf8");
  expect(protocol).toMatch(/\]\(loop-settings\.md(#[^)]*)?\)/);
});
