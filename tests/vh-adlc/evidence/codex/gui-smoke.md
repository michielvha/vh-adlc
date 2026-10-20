# Codex desktop: actual local GUI validation

Date: 2026-10-20

Result: native installation, all seven skills and the core GUI loop passed on plugin 0.2.0, through
independent implementation review and gated completion. A separate shipping safety test stopped on
unrelated repository history; successful GitHub publishing is not claimed.

| Field | Observed value |
| --- | --- |
| Surface | Native app bundle `com.openai.codex`, presenting as ChatGPT |
| Version | 26.1013.40934, build 20770, macOS arm64 |
| Environment | A new disposable project on This computer |
| Plugin | vh-adlc 0.2.0, installed from the local development repository through the actual marketplace GUI |
| Independent spec reviewer | Generic independent context using the shared reviewer contract; `MODEL: unknown` |
| Isolation | Procedural; model identity not attested |
| Conventions | vhco-pro/docs at `e4d58d2cd69bd42f1efacf91dfdd3f01a24e134a` |

## Native installation

A new thread preserved the existing session in history. The project picker created a separate project,
selected **This computer**, and selected and trusted only the disposable fixture folder.

In **Plugins**, **Add**, **Add a marketplace**, the **Source** field accepted the local development
repository. **Personal** then listed vh-adlc under vhco-tools. **Install vh-adlc** installed the package.
The real composer `@vh-adlc` picker offered the installed plugin.

A separate credential-free Codex CLI 0.163.0 profile also accepted the same marketplace and installed
version 0.2.0 through `codex plugin marketplace add` and `codex plugin add`. That is native package
validation, not a substitute for the GUI agent run.

The installed plugin's native detail page exposed all seven skill controls; **See Vh Adlc Spec,
Vh Adlc Tasks** expanded the last two. Its **More actions** menu offered **Uninstall**. The Plugins page
also exposed **Refresh**. These controls were inspected after the agent runs finished; the normal
installation was left available.

## Investigation and independent spec review

The actual plugin mention and explicit investigate operation reported version 0.2.0 and all seven
operation names. The checksum-verifying installer returned binary 0.1.0. `knowledge` and `find`
returned `answered`; `./test.sh` returned exit 1 and
`FAIL: got Hello, world., want Hello, Ada.`.

Independent snapshots after investigation matched the original unrelated file contents, modes and
index entries and the second worktree's HEAD, index, tracked and untracked contents and modes.

The subsequent GUI spec operation used scripted fixture-owner scope input. The sandbox initially
denied `.git/index.lock`. The app requested normal scoped approval for the exact onboarding commit;
the controller selected **Allow once**, without changing permission modes.

| Fixture commit | Observed outcome |
| --- | --- |
| `227879d` | Pinned onboarding instructions committed |
| `08d8b0c` | Revised fixture spec committed |
| `4581501` | Independent R-1 stored; returned `NO FINDINGS`, model `unknown` |
| `d8614bf` | Scripted fixture-owner acceptance recorded through the planned gate |
| `773f225` | Tasks committed |
| `1c4089b` | Feature claimed |
| `710dfe0` | Exact-output tests committed and observed failing before implementation |
| `37efd26` | Greeting implementation committed |
| `ae62f9c` | Independent R-2 stored; all five criteria returned `met` |
| `c20fb38` | Complete gate passed; status changed to complete |

The app displayed the independent **Greeting impl reviewer** subagent and its subagent controls.
Both spec and implementation reviews inherited the default, returned `MODEL: unknown`, and were
recorded with procedural isolation and identity not attested. The implementation reviewer ran a fresh
mixed-case name in addition to the committed tests.

An independent post-run check observed `./test.sh` passing Ada, Grace, missing input, Linus and empty
input. The completion commit `c20fb38be63eba111cf4bfb08233f4d4b62491ee` contains
`vh-adlc gate complete: pass (rules 1, docs e4d58d2)`. Neither the feature branch nor its implementation,
review or completion commits were pushed.

Before/after snapshots matched for the unrelated staged/unstaged/untracked bytes, modes and index
entries, and for the second worktree's HEAD, index, tracked and untracked bytes and modes. An independent
`fresh` check returned both reviews non-stale and the feature tree clean.

Claude-native compatibility was also checked without a model session or credential copy: an isolated
Claude Code CLI 2.1.283 macOS profile installed this same 0.2.0 tree from the local marketplace.
`claude plugin details` listed seven
skills, one reviewer agent and zero hooks, MCP servers or LSP servers. This is compatibility discovery,
not a new Claude GUI model-policy run.

## GUI shipping safety test

After the core-loop snapshots, the controller changed only fixture remote metadata so `origin` pointed
to the existing approved throwaway repository `michielvha/vh-adlc-ship-fixture`. The original local bare
remote was retained temporarily as `local-fixture`. This was test setup, not a GUI-executed core step.

The actual GUI `vh-adlc-ship` request verified the target and command-scoped personal identity, fetched
the default branch and ran the real preflight. `fresh` returned `error`, exit 4, because the independently
built fixture and the throwaway repository had no merge base. The PR-diff check also failed with
`no merge base`; the outgoing history contained documentation skip-CI markers that could not be
rewritten under the test authority.

The operation stopped. No issue, push, PR or CI run followed, and the pre-existing remote issue was
left alone. It did not reset remote history, invent freshness, bypass a gate or report successful
publishing. Local tests still passed.

The controller then restored the original local `origin`, fetched it and removed only the temporary
remote alias. `fresh` again reported both reviews current, with a clean feature tree and no findings.
The GitHub repository's default branch and branch inventory were unchanged.

## Boundaries

No credentials were copied, no billing controls were changed, and no emitter or host-specific reviewer
implementation was added. Native installation caches are the host's own package handling.
This does not establish the Codex VS Code extension, Copilot's Codex harness, remote/cloud sessions,
structural isolation or the full historical scenario matrix. Raw UI and conversation dumps are private.
