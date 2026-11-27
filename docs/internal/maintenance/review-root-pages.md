# Maintenance: cache root convention pages for command-route reviews

## Definition

Outcome: fix [michielvha/vh-adlc#142](https://github.com/michielvha/vh-adlc/issues/142). Before a command-route reviewer starts, the dispatch caches the root pages that the docs revision's `AGENTS.md` links, `README.md` included. A reviewer that cannot read a page from the cache stops with a fixed `PAGE NOT CACHED` reply, and the dispatcher reports that as a pending review, not as a stored record.

Preserved contract: `plugins/vh-adlc/references/review-protocol.md` (Routes) says the command route caches, before the CLI starts, every convention page the reviewer will read: the revision's own `AGENTS.md`, `conventions/feature-documents.md` and each page that `AGENTS.md` at the commit or at the revision routes to. A page that can't be cached leaves the review pending. The reviewer reads conventions from the binary's cache at the given revision (`agents/vh-adlc-reviewer.agent.md`). `pages.ts` broke this for root pages: its pattern only matches `conventions/`, `guides/` and `knowledge/` paths, but the docs `AGENTS.md` at the current plugin pin `e79eaa6` starts by routing to `README.md` and its task route. A reviewer that was missing that page then read it from a local clone of another repository and recorded a false missing-page finding.

Eligibility: this restores documented behavior and adds no new promise. The protocol already treats an uncached page as a pending review. The fixed `PAGE NOT CACHED` reply is the way the reviewer signals that existing state, and `parseReply` maps it to the `pending` outcome the route already returns. No public CLI flag, JSON field, stored-data format, permission boundary or release policy changes. The orchestrator agreed with this reading on 2026-11-27 and asked the independent review to check it. If the review judges it a new promise, the work moves to the feature route.

Task base: `4f17f9a0743a110ec1312b5cf7c9f77f3f0bd3c4`.

Affected paths:

- `plugins/vh-adlc/scripts/loop/pages.ts`
- `plugins/vh-adlc/scripts/loop/review-route.ts`
- `plugins/vh-adlc/agents/vh-adlc-reviewer.agent.md`
- `plugins/vh-adlc/references/review-protocol.md`
- `tests/vh-adlc/loop/pages.test.ts` (new)
- `tests/vh-adlc/loop/pages-stub.ts`
- `tests/vh-adlc/loop/cli.test.ts`
- `tests/vh-adlc/loop/review-route.test.ts`
- `docs/internal/maintenance/review-root-pages.md`

Verification inputs: the files above, `plugins/vh-adlc/scripts/loop/cli.ts` (unchanged, the review dispatch), `internal/knowledge/knowledge.go` (`cleanPages` accepts root and nested clean relative pages, so the binary needs no change), and the docs `AGENTS.md` and `README.md` at `e79eaa6`.

Proposed change:

1. `reviewPages` keeps the convention-path pattern for both `AGENTS.md` files. From the docs revision's `AGENTS.md` it also takes relative Markdown link targets ending in `.md`, anchor and query removed. A target with a scheme, an absolute path or a path that leaves the repository is skipped. For each root page that file links (no directory, other than `AGENTS.md`), it reads the cached page and adds the pages that page links, one level deep. Links in the reviewed repository's `AGENTS.md` name that repository's own files, so they are not requested.
2. `cacheReviewPages` fetches in up to three rounds: base pages, then pages from the docs `AGENTS.md`, then pages from the root pages it links.
3. The reviewer reads conventions only from the cache. On an unreadable page it replies with the single line `PAGE NOT CACHED: <page>` after any header lines the dispatch asks for.
4. `parseReply` turns a reply that contains that line on its own into an error, so `runReviewRoute` returns `pending` with reason `the reviewer stopped: page not cached: <page>`.
5. `review-protocol.md` Routes documents both rules.
6. Test support: the pages stub writes to the cache directory the CLI reads on the current platform, under `HOME/Library/Caches` on macOS. Before this change every stub-backed caching test failed on macOS because the stub wrote only under `XDG_CACHE_HOME`.

Trade-off, decided by the orchestrator: following `README.md` one level requests about 35 pages on a first fetch at `e79eaa6`. If any linked page is missing at a revision, `knowledge` answers `missing-page` and every command-route review at that revision stays pending until the docs link is fixed or the pin moves. The alternative was to cache only the pages `AGENTS.md` links and let a reviewer that follows `README.md` into another page stop pending on that page.

Required checks:

- `bun test tests/vh-adlc/loop/pages.test.ts`: both tests pass, after the README test was observed failing before the change.
- `bun test tests/vh-adlc/loop/review-route.test.ts -t "reply bytes"`: passes, after the new case was observed failing before the change.
- `bun test tests/vh-adlc/loop/`: no failure that also isn't failing on `origin/main` (macOS); new dispatch tests that need `unshare` are verified in Linux CI.
- `go vet ./...` and `go test ./...`: no new failures (no Go changes).
- The full plugin checker `bun test tests/vh-adlc --parallel --timeout 60000`, run on a turn the orchestrator grants; Linux CI is authoritative.

## Evidence

All runs on the macOS host with `PATH="/opt/homebrew/opt/coreutils/libexec/gnubin:$PATH"` and `--timeout 60000`.

Before the change, `tests/vh-adlc/loop/pages.test.ts` failed: the README case returned the base pages and `conventions/coding.md` and `conventions/testing.md`, without `README.md`, `conventions/go.md` or `examples/static/README.md`. The guard case for links that leave the repository already passed. After the change, both tests pass. Each guard was then watched failing against its defect. With the old `pages.ts` restored, the CLI README test fails on its first cache assertion. With the `../` and absolute-path filters removed, the guard case fails because `../other/README.md` and `/etc/x.md` get requested. With the scheme filter removed, the README case fails because `https:/example.com/x.md` gets requested. In each case the fixed file was restored afterwards.

Before the `parseReply` change, the new `reply bytes` case failed. A reply carrying `PAGE NOT CACHED: README.md` parsed as records. After the change, both `reply bytes` tests pass.

`bun test tests/vh-adlc/loop/`: 135 pass, 46 fail after the change. On a `git archive` export of `origin/main` at task base contents: 132 pass, 44 fail. Comparing failing test names shows exactly two additions. Both are the new end-to-end dispatch tests (`replies > a page the reviewer could not read from the cache leaves the review pending` and `review pages > a docs revision whose AGENTS.md routes through README.md ...`). They fail on `the reviewer command could not start: Executable not found in $PATH: "unshare"`, the Linux PID namespace the reviewer launch needs, like their existing siblings on main. In the CLI README test, the cache assertions run before the status check and pass on macOS.

`go vet ./...` passes. `go test ./...` fails only in `internal/clean` (Unix socket path length) and the `cmd/vh-adlc` clean and env tests (`TestEnvPointsGoTestAtTheRoot`, `TestEnvShFailurePrintsNothing`, `TestCleanAndEnvIgnorePin`, `TestGoldenCleanAndEnv`), the known macOS-only failures. No Go file changed.

Not yet run: the full plugin checker, and the Linux-only dispatch tests, which need Linux CI.

## Reviews

## State

Review pending. Local candidate.
