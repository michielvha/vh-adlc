// The external command route for reviews: which replies may be stored, and how the
// owning worktree is protected from a reviewer that can run commands.
import { afterAll, describe, expect, test } from "bun:test";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { runReviewRoute, type ReviewOutcome } from "../../../plugins/vh-adlc/scripts/loop/review-route";

const made: string[] = [];
afterAll(() => {
  for (const dir of made) { Bun.spawnSync(["chmod", "-R", "u+w", dir]); rmSync(dir, { recursive: true, force: true }); }
});

function git(root: string, ...args: string[]) {
  const run = Bun.spawnSync(["git", ...args], { cwd: root, stdout: "pipe", stderr: "pipe",
    env: { ...process.env, GIT_AUTHOR_NAME: "t", GIT_AUTHOR_EMAIL: "t@example.invalid", GIT_COMMITTER_NAME: "t", GIT_COMMITTER_EMAIL: "t@example.invalid" } });
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

const ok = (commit: string, model = "gpt-6.1-sol") => `MODEL: ${model}\nTARGET: ${commit}\n\nNO FINDINGS`;

async function review(root: string, commit: string, script: string, options: { kind?: "spec" | "implementation"; scratch?: string[]; timeoutMs?: number; model?: string } = {}): Promise<ReviewOutcome> {
  return runReviewRoute({ repo: root, commit, kind: options.kind ?? "implementation", document: "docs/specs/feature.md",
    route: { model: options.model ?? "gpt-6.1-sol", argv: [script, "{model}", "{prompt_file}", "{export_dir}"] },
    prompt: `Review docs/specs/feature.md at ${commit}.`, scratch: options.scratch ?? ["build"], timeoutMs: options.timeoutMs ?? 10_000 });
}
function pending(outcome: ReviewOutcome, reason: string) {
  expect(outcome.status).toBe("pending");
  if (outcome.status === "pending") expect(outcome.reason).toContain(reason);
}

describe("replies", () => {
  test("a matching reply is ready to store, with the records after both header lines", async () => {
    const { root, commit } = repository();
    const outcome = await review(root, commit, stub("", ok(commit)));
    expect(outcome).toMatchObject({ status: "ready", model: "gpt-6.1-sol", target: commit, records: "NO FINDINGS\n", isolation: "procedural" });
  });

  test("the placeholders carry the model, the prompt text in a file and the export directory", async () => {
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
  ] as const)
    test(`${name} leaves the review pending`, async () => {
      const { root, commit } = repository();
      pending(await review(root, commit, stub("", reply(commit))), reason);
    });

  test("a non-zero exit leaves the review pending", async () => {
    const { root, commit } = repository();
    pending(await review(root, commit, stub("exit 3", ok(commit))), "exit");
  });

  test("a reviewer that hangs is stopped and the review stays pending", async () => {
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
    test(`${name} leaves the review pending`, async () => {
      const { root, commit } = repository();
      before(root);
      pending(await review(root, commit, stub(body, ok(commit))), "changed");
    });

  test("writes inside a declared scratch directory are allowed", async () => {
    const { root, commit } = repository();
    expect((await review(root, commit, stub("echo out > build/result.txt", ok(commit)))).status).toBe("ready");
  });
});

describe("reviewer processes", () => {
  const late = (file: string) => `(sleep 1; echo late > ${file}) &`;
  test("a helper left running after success is stopped before the final check", async () => {
    const { root, commit } = repository();
    const marker = join(root, "src/late.txt");
    expect((await review(root, commit, stub(late(marker), ok(commit)))).status).toBe("ready");
    await Bun.sleep(1_500);
    expect(existsSync(marker)).toBe(false);
  });

  test("a helper left running after a timeout is stopped", async () => {
    const { root, commit } = repository();
    const marker = join(root, "src/late.txt");
    pending(await review(root, commit, stub(`${late(marker)}\nsleep 30`, ok(commit)), { timeoutMs: 500 }), "timed out");
    await Bun.sleep(1_500);
    expect(existsSync(marker)).toBe(false);
  });

  test("a helper that detached into its own session is stopped too", async () => {
    const { root, commit } = repository();
    const marker = join(root, "src/late.txt");
    // The stub exits only after the helper has left the process group, so a group kill alone misses it.
    const ready = join(realpathSync(mkdtempSync(join(tmpdir(), "vh-review-ready-"))), "detached");
    made.push(dirname(ready));
    const body = `setsid bash -c 'echo $$ > ${ready}; sleep 1; echo late > ${marker}' </dev/null >/dev/null 2>&1 &\nwhile [ ! -s ${ready} ]; do sleep 0.05; done`;
    expect((await review(root, commit, stub(body, ok(commit)))).status).toBe("ready");
    await Bun.sleep(1_500);
    expect(existsSync(marker)).toBe(false);
  });

  test("a cleanup that cannot confirm every process stopped leaves the review pending", async () => {
    const { root, commit } = repository();
    const outcome = await runReviewRoute({ repo: root, commit, kind: "implementation", document: "docs/specs/feature.md",
      route: { model: "gpt-6.1-sol", argv: [stub("", ok(commit)), "{prompt_file}"] }, prompt: "p", scratch: [], timeoutMs: 5_000,
      cleanup: async () => ({ confirmed: false, survivors: [4242] }) });
    pending(outcome, "cleanup");
  });
});

describe("file-only spec reviews read the committed export", () => {
  test("an uncommitted instruction edit never reaches the reviewer", async () => {
    const { root, commit } = repository();
    writeFileSync(join(root, "AGENTS.md"), "live uncommitted instructions\n");
    const script = stub(`[ "$(pwd)" = "$3" ] || exit 5\ngrep -q "committed instructions" AGENTS.md || exit 6\n! grep -q live AGENTS.md || exit 9`, ok(commit));
    expect((await review(root, commit, script, { kind: "spec" })).status).toBe("ready");
  });

  test("the export is read-only", async () => {
    const { root, commit } = repository();
    const script = stub(`if echo x > "$3/written.txt" 2>/dev/null; then exit 4; fi`, ok(commit));
    expect((await review(root, commit, script, { kind: "spec" })).status).toBe("ready");
  });

  test("a committed symlink that escapes the export leaves the review pending", async () => {
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

  test("a session log that records the requested model lets a MODEL: unknown reply be stored, recording the attested model", async () => {
    const { root, commit } = repository(), home = homeDir();
    const outcome = await attested(root, commit, codex(`MODEL: unknown\nTARGET: ${commit}\n\nNO FINDINGS`, "gpt-6.1-sol", home), home);
    // Since T55 records keep their exact bytes; this stub's reply has no final newline.
    expect(outcome).toMatchObject({ status: "ready", model: "gpt-6.1-sol", records: "NO FINDINGS" });
  });
  test("a session log that records another model leaves the review pending", async () => {
    const { root, commit } = repository(), home = homeDir();
    pending(await attested(root, commit, codex(`MODEL: unknown\nTARGET: ${commit}\n\nNO FINDINGS`, "gpt-5.3-codex", home), home), "attest");
  });
  test("a session log with no recorded model leaves the review pending", async () => {
    const { root, commit } = repository(), home = homeDir();
    pending(await attested(root, commit, codex(`MODEL: unknown\nTARGET: ${commit}\n\nNO FINDINGS`, null, home), home), "attest");
  });
  test("a missing session log leaves the review pending", async () => {
    const { root, commit } = repository(), home = homeDir();
    pending(await attested(root, commit, codex(`MODEL: unknown\nTARGET: ${commit}\n\nNO FINDINGS`, "gpt-6.1-sol", home, false), home), "attest");
  });
  test("a self-report naming a different model leaves the review pending even when the log attests the requested one", async () => {
    const { root, commit } = repository(), home = homeDir();
    pending(await attested(root, commit, codex(`MODEL: claude-opus-5-5\nTARGET: ${commit}\n\nNO FINDINGS`, "gpt-6.1-sol", home), home), "model");
  });
});

describe("preservation hardening", () => {
  test("a same-size replacement inside an ignored directory that keeps its modification time leaves the review pending", async () => {
    const { root, commit } = repository();
    writeFileSync(join(root, ".git/info/exclude"), "cache/\n");
    mkdirSync(join(root, "cache"));
    writeFileSync(join(root, "cache/data.bin"), "AAAA\n");
    // Since the private review clone (T49) the reviewer works in a fresh clone, so it reaches the owning worktree by path.
    const body = `cd "${root}" && cp -p cache/data.bin /tmp/vh-mtime-ref-$$ && printf 'BBBB\\n' > cache/data.bin && touch -r /tmp/vh-mtime-ref-$$ cache/data.bin; rm -f /tmp/vh-mtime-ref-$$`;
    pending(await review(root, commit, stub(body, ok(commit))), "changed");
  });

  test("a reviewer that detaches HEAD at the same commit leaves the review pending", async () => {
    const { root, commit } = repository();
    pending(await review(root, commit, stub(`git -C "${root}" switch -q --detach HEAD`, ok(commit))), "changed");
  });

  test("a chained committed symlink that escapes the export leaves the review pending", async () => {
    const { root, commit } = repository(dir => {
      mkdirSync(join(dir, "d"));
      symlinkSync("..", join(dir, "d", "back"));
      symlinkSync("d/back/../outside.txt", join(dir, "leak"));
    });
    pending(await review(root, commit, stub("", ok(commit)), { kind: "spec" }), "symlink");
  });
});

describe("review policy comes from the reviewed commit", () => {
  test("an uncommitted loop.yaml edit that drops a lens and an instruction file does not change the review", () => {
    const stubDir = realpathSync(mkdtempSync(join(tmpdir(), "vh-review-policy-")));
    made.push(stubDir);
    const stubScript = join(stubDir, "reviewer.sh");
    // Echoes, as its records, whether the committed lens and instruction file reached the prompt.
    writeFileSync(stubScript, `#!/bin/bash\nprompt="$2"; commit=$(grep -o 'Commit: [0-9a-f]*' <<<"$prompt" | cut -d' ' -f2)\nprintf 'MODEL: %s\\nTARGET: %s\\n\\n' "$1" "$commit"\nif grep -q 'satellite (blocking)' <<<"$prompt" && grep -q 'AGENTS.md' <<<"$prompt"; then echo 'NO FINDINGS'; else echo 'POLICY CHANGED'; fi\n`);
    chmodSync(stubScript, 0o700);
    const committed = `schema_version: 1\ninstruction_files: [AGENTS.md]\nlenses:\n  - name: satellite\n    check: A new component names its satellite.\n    severity: blocking\nroles:\n  spec_reviewer:\n    route: command\n    model: gpt-6.1-sol\n    argv: [${stubScript}, "{model}", "{prompt}"]\n`;
    const { root, commit } = repository(dir => { mkdirSync(join(dir, ".vh-adlc")); writeFileSync(join(dir, ".vh-adlc/loop.yaml"), committed); });
    writeFileSync(join(root, ".vh-adlc/loop.yaml"), `schema_version: 1\nroles:\n  spec_reviewer:\n    route: command\n    model: gpt-6.1-sol\n    argv: [${stubScript}, "{model}", "{prompt}"]\n`);
    const cli = resolve(import.meta.dir, "../../../plugins/vh-adlc/scripts/loop/cli.ts");
    const run = Bun.spawnSync([process.execPath, cli, "review", "--repo", root, "--document", "docs/specs/feature.md", "--commit", commit, "--kind", "spec",
      "--docs-revision", "abc", "--binary", "/bin/false", "--plugin-pin", "def"], { stdout: "pipe", stderr: "pipe", timeout: 60_000,
      env: { ...process.env, XDG_CONFIG_HOME: join(stubDir, "no-override") } });
    const outcome = JSON.parse(run.stdout.toString() || "{}");
    expect(outcome).toMatchObject({ status: "ready", records: "NO FINDINGS\n" });
  });
});

describe("environment-clearing helpers", () => {
  test("an implementation reviewer's detached helper that cleared its environment cannot write after the review", async () => {
    const { root, commit } = repository();
    const marker = join(root, "src/late.txt");
    const ready = join(realpathSync(mkdtempSync(join(tmpdir(), "vh-review-envclear-"))), "detached");
    made.push(dirname(ready));
    const body = `setsid env -i /bin/bash -c 'echo $$ > ${ready}; sleep 1; echo late > ${marker}' </dev/null >/dev/null 2>&1 &\nwhile [ ! -s ${ready} ]; do sleep 0.05; done`;
    expect((await review(root, commit, stub(body, ok(commit)))).status).toBe("ready");
    await Bun.sleep(1_500);
    expect(existsSync(marker)).toBe(false);
  });

  test("without a process boundary on the host the review stays pending", async () => {
    const { root, commit } = repository();
    const outcome = await runReviewRoute({ repo: root, commit, kind: "implementation", document: "docs/specs/feature.md",
      route: { model: "gpt-6.1-sol", argv: [stub("", ok(commit)), "{model}", "{prompt_file}"] }, prompt: "p", scratch: [], timeoutMs: 5_000, boundary: "unavailable" });
    pending(outcome, "process boundary");
  });
});

describe("pathnames Git quotes", () => {
  test("a reviewer rewriting an already modified file whose name Git quotes leaves the review pending", async () => {
    const { root, commit } = repository(dir => writeFileSync(join(dir, "a b.txt"), "one\n"));
    writeFileSync(join(root, "a b.txt"), "two\n");
    pending(await review(root, commit, stub("echo three > 'a b.txt'", ok(commit))), "changed");
  });
});

describe("private review clone", () => {
  for (const kind of ["implementation", "spec"] as const)
    test(`another session's commit to a different branch during a ${kind} review does not leave it pending`, async () => {
      const { root, commit } = repository();
      const concurrent = setTimeout(() => { git(root, "branch", "other-session", commit); git(root, "tag", "other-tag", commit); }, 400);
      const outcome = await review(root, commit, stub("sleep 1.2", ok(commit)), { kind });
      clearTimeout(concurrent);
      expect(git(root, "branch", "--list", "other-session")).toContain("other-session");
      expect(outcome.status).toBe("ready");
    });

  test("an implementation reviewer runs in its private clone, not the owning worktree", async () => {
    const { root, commit } = repository();
    const script = stub(`[ "$(pwd)" != "${root}" ] || exit 6\n[ "$(git rev-parse HEAD)" = "${commit}" ] || exit 7`, ok(commit));
    expect((await review(root, commit, script)).status).toBe("ready");
  });

  test("a reviewer that edits the owning worktree from its private clone leaves the review pending", async () => {
    const { root, commit } = repository();
    pending(await review(root, commit, stub(`echo changed > "${root}/src/app.txt"`, ok(commit))), "changed");
  });
});

describe("reply bytes", () => {
  test("records keep their bytes after the two header lines: trailing spaces and CRLF survive", async () => {
    const { parseReply } = await import("../../../plugins/vh-adlc/scripts/loop/review-route");
    expect(parseReply("MODEL: m\nTARGET: abcdef1\n\nNO FINDINGS   \n")).toEqual({ model: "m", target: "abcdef1", records: "NO FINDINGS   \n" });
    expect(parseReply("MODEL: m\r\nTARGET: abcdef1\r\n\r\nFINDING: F-01\r\nKIND: factual\r\n")).toEqual({ model: "m", target: "abcdef1", records: "FINDING: F-01\r\nKIND: factual\r\n" });
  });
});
