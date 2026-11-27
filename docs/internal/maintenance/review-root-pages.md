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
- `plugins/vh-adlc/plugin.json` and `plugins/vh-adlc/.claude-plugin/plugin.json` (version 0.33.0 to 0.33.1, which the plugin checker requires for any package change)

Verification inputs: the files above, `plugins/vh-adlc/scripts/loop/cli.ts` (unchanged, the review dispatch), `internal/knowledge/knowledge.go` (`cleanPages` accepts root and nested clean relative pages, so the binary needs no change), and the docs `AGENTS.md` and `README.md` at `e79eaa6`.

Proposed change:

1. `reviewPages` keeps the convention-path pattern for both `AGENTS.md` files. From the docs revision's `AGENTS.md` it also takes relative Markdown link targets ending in `.md`, anchor and query removed. A target with a scheme, an absolute path or a path that leaves the repository is skipped. For each root page that file links (no directory, other than `AGENTS.md`), it reads the cached page and adds the pages that page links, one level deep. Links in the reviewed repository's `AGENTS.md` name that repository's own files, so they are not requested.
2. `cacheReviewPages` fetches in up to three rounds: base pages, then pages from the docs `AGENTS.md`, then pages from the root pages it links.
3. The reviewer reads conventions only from the cache. It may fill the cache with its own `knowledge --page <page>` call when the result names the given revision, as the agent file already allows it to run `knowledge`. If the page is still unreadable, it replies with the single line `PAGE NOT CACHED: <page>` after any header lines the dispatch asks for.
4. `parseReply` keeps a reply whose records, after the header lines present, open with `FINDING:`, `CRITERION:` or `NO FINDINGS` as records, even when a record quotes the marker (R-2 F-01). In any other reply, a line that starts with the words `PAGE NOT CACHED` in any case and spacing, followed by a colon, a dash or nothing, becomes an error, so `runReviewRoute` returns `pending` with reason `the reviewer stopped: page not cached: <page>`. The line may carry leading list or quote markers, emphasis, backticks and quotes, including around the words themselves, sit inside a code fence or after a line of prose, and have trailing text (R-1 F-01, R-3 F-01, R-4 F-01). The page is the first path-like token without trailing dots, or `unnamed` when there is none. No other reply format gets a new check; a malformed reply that names no stop behaves as before.
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

After R-1:

- F-01: the `reply bytes` case gained the backticked, trailing-text, trailing-dot, backticked-page, list-and-emphasis and page-less variants. It failed on the exact-line parser, where the backticked form parsed as records, and passes with the lenient one. The case where a record only mentions the marker inside an `EVIDENCE` line still parses as records.
- F-02: the README fixture now gives `conventions/go.md` (linked from `README.md`) and `conventions/coding.md` (a nested page linked from `AGENTS.md`) a further link each, and asserts that neither `conventions/deep.md` nor `guides/nested.md` gets requested. Two mutations made the test fail as expected: following links from every page `AGENTS.md` links requested `guides/nested.md`, and following a second level requested `conventions/deep.md`. Both mutations were reverted and the test passes.
- F-03: the agent file and the protocol now say the reviewer may fill the cache with its own `knowledge` call for the given revision before it stops.

After R-2:

- F-01: two new `reply bytes` cases put the marker inside a record on a continuation line of its own: a list line with the backticked marker and trailing text, and an indented `PAGE NOT CACHED: <page>`. They failed on the every-line scan with a stop and pass now that only the first line after the header lines counts. All the stop variants from R-1 still stop.
- F-02: open. The two end-to-end dispatch tests need Linux, and the homelab Linux hosts are unreachable from this workstream. They can run only in the full checker on a Linux runner, which means CI after an owner-requested ship, or on a Linux host when one is available. Until one of those passes, the task is not complete.
- F-03: the protocol sentence now names exactly what the matcher allows and where it looks.

After R-3:

- F-01: the `reply bytes` stop cases gained a fenced stop, a stop after a line of prose and a lowercase stop. They failed on the first-line rule and pass with the new one. Every record case, including both continuation-line quotes, still parses as records. I chose the stop-only alternative over a general record-format check on every reply, which would add a new gate beyond this task.

After R-4:

- F-01: the stop cases gained a bolded label (`**PAGE NOT CACHED**: README.md`), a dash instead of the colon and no separator with double spacing. They failed on the colon-only matcher and pass with the widened one. Every record case still parses as records. Whether to add the general check (pending when records do not open with `FINDING:`, `CRITERION:` or `NO FINDINGS`) was put to the orchestrator as a scope decision. The answer on 2026-11-27 keeps it out of this change, with the owner able to raise it as a separate follow-up issue.

Residual risk, accepted: the stop matcher closes only the stop forms it recognizes. A stop reply formatted in some other way, in a reply that does not open with records, can still come back `ready` and be stored. `vh-adlc lint` then flags the stored text as `review-records-malformed`, so the next gate fails closed. The operator sees a malformed review instead of the page-not-cached reason.

Ship: the owner asked for a PR so Linux CI runs the two dispatch tests ([owner answer on #142](https://github.com/michielvha/vh-adlc/issues/142#issuecomment-7215556697)), and skipped the Mac full-suite run.

Not yet run: the full plugin checker, and the Linux-only dispatch tests, which need Linux CI.

After the first CI run on [PR #182](https://github.com/michielvha/vh-adlc/pull/182) (run 45980312542 at `0887fee9`):

- `checker-macos` failed two package checks that this change caused. `a package change comes with a version change` needs a new plugin version, so both `plugin.json` files move to 0.33.1. `no em dash or en dash` found the literal en and em dash in the stop matcher's separator class in `review-route.ts`. They are now written as the escapes `\u2013` and `\u2014`, which matches the same characters. Both checks and the `reply bytes` tests pass locally after the change.
- `verify` failed in `TestBoundary` (`cmd/vh-adlc`, `golden_test.go:338`). Its first error is `open .../.git/objects/maintenance.lock: no such file or directory` inside the test's fixture repository. No Go file changed here, and the last `main` run at the task base passed this job.
- The Linux `checker` job (bun 1.4.5, `bun test tests/vh-adlc --parallel --timeout 60000`) ran 4427 passing and 2 failing tests. The two failures were the same package checks as on macOS, fixed above. Both new end-to-end dispatch tests passed: `review pages > a docs revision whose AGENTS.md routes through README.md has README.md and the pages it links cached before the reviewer starts` and `replies > a page the reviewer could not read from the cache leaves the review pending`. The two existing review-pages tests and `pages.test.ts` passed as well. This closes R-2 F-02 for the source at `0887fee9`, which differs from the fixed head only in the version and the escaped regex characters.
- `remote-gui` failed `two inline taps edit a URL and a field through stock Chromium and noVNC` (`tests/remote-gui/mobile.e2e.test.js:553`). A typed combining accent (U+0301) did not arrive in the field. This change touches no remote-gui file, and the last `main` run at the task base passed this job.

## Reviews

### R-1

Target: `5f4d93993732df5fbdf6d1c899c830c0a743ccee`
Model: claude-opus-5-5
Isolation: procedural

```text
FINDING: F-01
KIND: factual
SEVERITY: should-fix
WHERE: plugins/vh-adlc/scripts/loop/review-route.ts parseReply (line 244); plugins/vh-adlc/agents/vh-adlc-reviewer.agent.md (Rules, cache paragraph); plugins/vh-adlc/references/review-protocol.md (Routes); docs/internal/maintenance/review-root-pages.md (Proposed change step 4)
EVIDENCE: The stop is only detected when a line matches exactly `/^PAGE NOT CACHED: (\S+)\r?$/m`, and runReviewRoute returns `ready` with whatever follows the header lines without checking the record format (review-route.ts lines 350 to 360). I ran parseReply on four close variants of the reply. "`PAGE NOT CACHED: README.md`" (the backticked form the agent file prints) parsed as records: {"model":"m","target":"abcdef1","records":"`PAGE NOT CACHED: README.md`\n"}. "PAGE NOT CACHED: README.md (absent from the cache)" also parsed as records. "PAGE NOT CACHED: README.md." and "PAGE NOT CACHED: `README.md`" were caught, but the reason then carries the punctuation. A model reviewer that formats the stop line a little differently gets a `ready` result, and the protocol tells the dispatcher to store `records` under `### R-<n>` before it runs `review check`. That stores a non-record in the Review Log, the same kind of false stored result issue #142 describes. The marker fails open, not closed.
PROPOSAL: Detect the marker leniently (for example, a line whose text after stripping backticks, quotes and leading list markers starts with `PAGE NOT CACHED:`, page taken as the first path-like token), or have runReviewRoute return pending when the records do not start with `FINDING:`, `CRITERION:` or `NO FINDINGS`. Add the backticked and trailing-text variants to the `reply bytes` test.

FINDING: F-02
KIND: judgement
SEVERITY: nit
WHERE: tests/vh-adlc/loop/pages.test.ts; tests/vh-adlc/loop/cli.test.ts ("a docs revision whose AGENTS.md routes through README.md ..."); plugins/vh-adlc/scripts/loop/pages.ts reviewPages; plugins/vh-adlc/references/review-protocol.md (Routes, "one level deep")
EVIDENCE: Both tests pass at the target (`bun test tests/vh-adlc/loop/pages.test.ts`: 2 pass; `-t "reply bytes"` in review-route.test.ts: 2 pass). Run against the task base pages.ts in a scratch copy, the README case fails because README.md, conventions/go.md and examples/static/README.md are missing, so the regression proof holds. No fixture checks the documented depth bound or the root-only rule, though. None of the linked pages (conventions/go.md, examples/static/README.md, guides/a.md) links further, so an implementation that recursed without limit, or followed links from nested pages, would pass every test. The protocol now promises "one level deep", and the bound matters because every extra link is one more page that can break every review at the revision.
PROPOSAL: In the README fixture, give conventions/go.md a link to a further page (for example `[x](conventions/deep.md)`), and give a nested page linked from AGENTS.md a link too, then assert that neither is requested.

FINDING: F-03
KIND: judgement
SEVERITY: nit
WHERE: plugins/vh-adlc/agents/vh-adlc-reviewer.agent.md (Rules, "Read only that cache ... If a page cannot be read there, stop"); plugins/vh-adlc/references/review-protocol.md (Routes, "a host dispatch stores nothing either")
EVIDENCE: The new rule now covers host-route reviews too. Before this change, a host reviewer that could not read a page returned a stored finding; now the review stays pending. A host dispatch pre-caches only the pages its skill names (vh-adlc-review SKILL.md Start step 1: feature-documents.md, delivery.md, humanize-prose.md). Nothing caches README.md or the pages routed from it. The same agent file lets the reviewer run `vh-adlc knowledge`, which writes into that cache, but the new text does not say whether the reviewer may fetch a missing page that way before it stops. Two reviewers could read the rule differently: one fetches the page and continues, the other stops pending. Both outcomes are safe. This is clarity, not eligibility: issue #142's done-when asks for the stop rule without limiting it to the command route, and I judge the change an eligible restoration of the existing "uncached page leaves the review pending" contract.
PROPOSAL: State in one clause whether a reviewer may run `vh-adlc knowledge --page <page>` to fill the cache before it replies `PAGE NOT CACHED`, or say that only the dispatcher caches.
```

### R-2

Target: `4354943b279e456dbaacd6510c584e317c1e482d`
Model: claude-opus-5-5
Isolation: procedural

```text
FINDING: F-01
KIND: factual
SEVERITY: should-fix
WHERE: plugins/vh-adlc/scripts/loop/review-route.ts parseReply (lines 245 to 250); plugins/vh-adlc/references/review-protocol.md (Routes, "detects that line in any light formatting"); docs/internal/maintenance/review-root-pages.md (Proposed change step 4, Evidence "After R-1" F-01); tests/vh-adlc/loop/review-route.test.ts ("reply bytes", the record that only mentions the marker)
EVIDENCE: The R-1 F-01 fix scans every line of the reply. After it strips leading whitespace, list markers, digits, dots, backticks, quotes and underscores, any line that starts with `PAGE NOT CACHED:` turns the whole reply into a stop, including lines inside a record. Records have no one-line-per-field rule: `review check` (internal/review/review.go Check) compares stored lines byte for byte and accepts multi-line fields. I ran parseReply from a scratch script on a valid finding whose EVIDENCE continues with the list line "- `PAGE NOT CACHED: README.md` (backticked)". It returned {"error":"the reviewer stopped: page not cached: README.md"}. A finding whose EVIDENCE quotes the agent file on an indented line "  PAGE NOT CACHED: <page>" returned {"error":"the reviewer stopped: page not cached: page"}. The test only covers a marker in the middle of an EVIDENCE line, so it misses this. The result fails closed, so nothing false gets stored. But a legitimate review of any vh-adlc document or code that discusses this rule, which is the kind of review R-1 itself was, comes back pending with a misleading "page not cached" reason, and comes back the same way on every rerun that formats the evidence the same way. This defect arrived with the R-1 F-01 fix.
PROPOSAL: Look for the stop only on the first non-blank line after the header lines that are present (or the first line when they are missing), keeping the lenient stripping there. Add a reply-bytes case where a record's continuation line starts with `- PAGE NOT CACHED:` and parses as records.

FINDING: F-02
KIND: factual
SEVERITY: should-fix
WHERE: docs/internal/maintenance/review-root-pages.md (Required checks, Evidence "Not yet run"); tests/vh-adlc/loop/cli.test.ts ("a docs revision whose AGENTS.md routes through README.md ..."); tests/vh-adlc/loop/review-route.test.ts ("replies", "a page the reviewer could not read from the cache leaves the review pending")
EVIDENCE: I ran `bun test tests/vh-adlc/loop/pages.test.ts` (2 pass, 13 expect calls) and `bun test tests/vh-adlc/loop/review-route.test.ts -t "reply bytes"` (2 pass) at the target on macOS. Both match the record. The two new end-to-end dispatch tests have not passed on any host. The record says they fail on macOS because `unshare` is missing, and that the full plugin checker and Linux CI are "Not yet run". Those are the only tests that check the dispatched route returns `pending` for a stop reply, and `ready` with README.md and the pages it links cached before the reviewer starts. Both full checks are listed under Required checks. Under maintenance-review.md, an unmet check cannot pass the task, and the record's claim is not execution evidence.
PROPOSAL: Run `bun test tests/vh-adlc --parallel --timeout 60000` on Linux, or in CI on the local candidate, and record the two new dispatch tests passing before the task is treated as complete.

FINDING: F-03
KIND: judgement
SEVERITY: nit
WHERE: plugins/vh-adlc/references/review-protocol.md (Routes, lines 27 to 31)
EVIDENCE: "The command route detects that line in any light formatting; the command route returns that as `pending`, and a host dispatch stores nothing either and reports `review pending` with that page." The subject repeats, "either" has nothing to refer back to, and "any light formatting" promises more than the matcher does. For example, a lowercase "Page not cached:" is not detected. This goes against guides/humanize-prose.md and leaves "light" undefined for whoever maintains the matcher.
PROPOSAL: Rewrite it as, for example, "The command route detects that line, allowing list or quote markers, emphasis, backticks and trailing text, and returns `pending`. A host dispatch also stores nothing and reports `review pending` with that page."
```

### R-3

Target: `f12fe6f79fd2afe7d011935df281b2b1a9c2521a`
Model: claude-opus-5-5
Isolation: procedural

```text
FINDING: F-01
KIND: factual
SEVERITY: nit
WHERE: plugins/vh-adlc/scripts/loop/review-route.ts parseReply (lines 242 to 251) and runReviewRoute (ready return, line 365); plugins/vh-adlc/references/review-protocol.md (Routes, "looks for that line as the first line after the header lines"); docs/internal/maintenance/review-root-pages.md (Definition Outcome, Proposed change step 4); tests/vh-adlc/loop/review-route.test.ts ("reply bytes")
EVIDENCE: R-2 F-01 is resolved. A record that quotes the marker on a continuation line now parses as records. R-2 F-03 is resolved too: the protocol sentence now says what the matcher allows. Both targeted runs pass at the target on macOS: `bun test tests/vh-adlc/loop/pages.test.ts` (2 pass, 13 expect calls) and `-t "reply bytes"` (2 pass, 14 expect calls). The first-line rule still lets two plausible stop replies through as `ready` records, though. I ran parseReply from a scratch `bun -e` on three replies. A stop wrapped in a code fence, "MODEL: m\nTARGET: abcdef1\n\n```\nPAGE NOT CACHED: README.md\n```\n", returned {"model":"m","target":"abcdef1","records":"```\nPAGE NOT CACHED: README.md\n```\n"}, because after stripping the backticks the first line is empty. A stop with one line of prose before it, "I could not read the page from the cache.\nPAGE NOT CACHED: README.md", also returned records. So did "Page not cached: README.md". runReviewRoute does not check the record format before it returns `ready`, and `review check` (internal/review/review.go Check) only compares bytes. The protocol therefore has the dispatcher store this text under `### R-<n>`, which the Definition says must never happen. The harm is limited because `vh-adlc lint` flags the stored text as `review-records-malformed` (internal/doc/lint.go line 146), so it fails closed at the next gate. But the operator gets a stored malformed review instead of a "page not cached" pending reason. This is the remaining part of the R-1 F-01 fail-open class. The fence and preamble forms are not in the test.
PROPOSAL: Use the alternative R-1 F-01 offered. Have runReviewRoute return `pending` when the records after the header lines do not start with `FINDING:`, `CRITERION:` or `NO FINDINGS`, and give the reason "page not cached" when the text contains a `PAGE NOT CACHED:` line. Or skip a fence-only line before taking the first line. Add the fenced and preamble replies to the `reply bytes` stop cases.
```

### R-4

Target: `24f0072abeae47ad5d3fbfc4f04e2e9b27ec6e10`
Model: claude-opus-5-5
Isolation: procedural

```text
FINDING: F-01
KIND: factual
SEVERITY: nit
WHERE: plugins/vh-adlc/scripts/loop/review-route.ts parseReply (lines 242 to 255) and runReviewRoute (ready return); plugins/vh-adlc/references/review-protocol.md (Routes, "allowing list or quote markers, emphasis, backticks, code fences, a line of prose before it and trailing text after it"); docs/internal/maintenance/review-root-pages.md (Definition Outcome, Proposed change step 4, Evidence "After R-3" F-01); tests/vh-adlc/loop/review-route.test.ts ("reply bytes")
EVIDENCE: R-3 F-01 is resolved for the forms it named. I ran parseReply from a scratch `bun -e` at the target. "```text\nPAGE NOT CACHED: README.md\n```", a stop after a line of prose, and "Page not cached: `README.md`" each return {"error":"the reviewer stopped: page not cached: README.md"}. Records that quote the marker on a continuation line still parse as records. Both targeted runs pass on macOS: `bun test tests/vh-adlc/loop/pages.test.ts` (2 pass, 13 expect calls) and `-t "reply bytes"` (2 pass, 17 expect calls). The matcher still needs the literal `PAGE NOT CACHED:` with the colon directly after the words, and the protocol promises more than that. "MODEL: m\nTARGET: abcdef1\n\n**PAGE NOT CACHED**: README.md\n" returned {"model":"m","target":"abcdef1","records":"**PAGE NOT CACHED**: README.md\n"}. So did "PAGE NOT CACHED - README.md" and "PAGE NOT CACHED README.md". runReviewRoute returns `ready` with those records, and the protocol tells the dispatcher to store them under `### R-<n>`. The Outcome says this must never happen, and the protocol says emphasis is allowed. Bolding only the label is ordinary model Markdown. This is the fourth round of the same fail-open class (R-1 F-01, R-3 F-01, R-4 F-01). On the author's choice: the stop-only matcher cannot give the Outcome's "never as a record" guarantee, because every pass only closes the forms it lists. The harm stays small. `vh-adlc lint` flags the stored text as `review-records-malformed` (internal/doc/lint.go line 146), so the failure surfaces at the next gate, and the profile is a few developers on alpha. I don't judge the missing general record-format check a separate defect. Its absence only matters through this stop class.
PROPOSAL: Allow emphasis, backticks and quotes between the words and the colon, and make the colon optional (for example `/^PAGE\s+NOT\s+CACHED[*_`'"]*\s*[:\-]?/i`). Add the bold-label form to the `reply bytes` stop cases. Or narrow the protocol sentence to what the matcher actually allows. A check limited to "pending when the records don't open with FINDING:, CRITERION: or NO FINDINGS" would close the class for good, if the orchestrator accepts that as inside the task.
```

### R-5

Target: `2639a6ad7f4834b8ce3e6ac9590f26d5a90b9def`
Model: claude-opus-5-5
Isolation: procedural

```text
NO FINDINGS
```

### R-6

Target: `f23fafc18144fd6489abfa01155a6afe266a9a79`
Model: claude-opus-5-5
Isolation: procedural

```text
FINDING: F-01
KIND: factual
SEVERITY: nit
WHERE: docs/internal/maintenance/review-root-pages.md:87 (the `checker-macos` bullet under "After the first CI run on PR #182")
EVIDENCE: The record says the dashes "are now written as `–` and `—`". `sed -n 87p docs/internal/maintenance/review-root-pages.md | od -c` shows bytes 342 200 223 and 342 200 224, so the record contains the literal U+2013 and U+2014 characters. The source at f23fafc1, plugins/vh-adlc/scripts/loop/review-route.ts:251, uses the escapes `[:\-–—]`. Read literally, the record says the fix left the characters unchanged, which is false. It was probably meant to read `–` and `—`. The prose rule (guides/humanize-prose.md section 8) allows dashes inside inline code, so this is only an accuracy slip and not a prose violation. Nothing else in the delta is wrong. I checked: `git diff 0887fee9 f23fafc1` touches only the record, both plugin.json files (0.33.0 to 0.33.1) and the one regex line. The escaped class matches the same characters. `git diff 2639a6ad 0887fee9` differs only by the main-side docs/specs/instruction-freshness.md and the R-5 record. `git diff 4f17f9a0 2f12dfa0` is only that spec file, and origin/main (4f465f03) has gained only docs since then, with the plugin still at 0.33.0. A patch bump fits conventions/delivery.md ("`fix` ... are patch"), and it matches earlier bumps that changed both plugin.json files (00752fea, bba11ee4). No other 0.33.0 reference has to move, because the others are historical evidence rows, and the v0.33.x git tags belong to the binary. My local runs passed: pages.test.ts 2 pass, review-route `reply bytes` 2 pass, check.test.ts `package text|version change` 7 pass, which includes "no em dash or en dash" and "a package change comes with a version change". Run 45980312542 is at 0887fee9 with checker-macos, verify and remote-gui failed. The 2f12dfa0..f23fafc1 change touches no Go and no remote-gui file. TestBoundary fails at golden_test.go:338, the `snapshot(t, f.Dir)` walk, on a transient .git/objects/maintenance.lock in the fixture repo, which looks like a git background-maintenance race. Main CI at 4f17f9a0 passed. Both unrelated-failure claims hold up against the code.
PROPOSAL: Change the record to say the dashes are now written as the escapes `–` and `—` (or "as \u escapes") so that it matches review-route.ts:251.
```

After R-6: F-01 is fixed in the evidence text. The sentence now names the escapes `–` and `—` written with a literal backslash, and the record holds no literal en or em dash outside the stored R-6 text. R-6 found nothing else in the source delta. The fix touches only this record's evidence, not its Definition or any source path.

### R-7

Target: `fc6b45f9b286bfb02517f124e774fb9f879d2b1b`
Model: claude-opus-5-5
Isolation: procedural

```text
NO FINDINGS
```

## State

The independent review is current with no open findings (R-7 at `fc6b45f9`). The two end-to-end dispatch tests passed in Linux CI (run 45980312542). On the pushed head `718e0cd4` ([run 45984815583](https://github.com/michielvha/vh-adlc/actions/runs/45984815583)), `checker`, `checker-macos`, `verify` and `paseo-hosts` pass. `remote-gui` fails again with the same first error: the mobile test's typed U+0301 never reaches the field. Both failing runs used the runner's preinstalled Google Chrome 158.0.8127.36. The last `main` run that executed that test ([run 45898546605](https://github.com/michielvha/vh-adlc/actions/runs/45898546605)) passed on Chrome 157.0.8103.78, with the same runner image version (ubuntu-26.04, 20261111.635). This change touches no remote-gui file, so the failure follows the Chrome update, not this change. Merging waits for the owner.
