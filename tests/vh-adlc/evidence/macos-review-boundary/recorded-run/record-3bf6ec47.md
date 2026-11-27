# Recorded unsandboxed run

code commit: 3bf6ec4769c7e3da858b283ad5d94034a93c0c1b
date: 2026-11-27T16:02:00Z
host: Darwin Mac 25.6.0 Darwin Kernel Version 25.6.0: Fri Jul 31 19:19:08 PDT 2026; root:xnu-12377.161.14~5/RELEASE_ARM64_T6050 arm64 arm Darwin
bun: 1.4.5
sandboxed: no

## Boundary test files, outside any sandbox

command: bun test --timeout 60000 tests/vh-adlc/loop/review-route.test.ts tests/vh-adlc/loop/owned-process.test.ts

```text
bun test v1.4.5 (a7733435c)

tests/vh-adlc/loop/owned-process.test.ts:
owned-process: this host forbids probing process groups or hides its children's environments, so confirmed-cleanup fixtures are skipped; cleanup reports unconfirmed here.

 65 pass
 5 skip
 0 fail
 140 expect() calls
Ran 70 tests across 2 files. [99.20s]
```

exit code: 0

## AC-10: the route tests inside a Seatbelt sandbox

command: /usr/bin/sandbox-exec -p (version 1)(allow default) bun test --timeout 60000 tests/vh-adlc/loop/review-route.test.ts

```text
bun test v1.4.5 (a7733435c)

tests/vh-adlc/loop/review-route.test.ts:
15 | const ROUTE_BOUNDARY = pidNamespaceAvailable() || seatbeltAvailable();
16 | const routed = ROUTE_BOUNDARY ? test : test.skip;
17 | if (!ROUTE_BOUNDARY)
18 |   test("the route tests need an unsandboxed run", () => {
19 |     throw Error("The route tests need an unsandboxed run: this process is inside a Seatbelt sandbox, which cannot nest, "
20 |       + "or the host has no PID namespace. Run them outside any sandbox; a command-route reviewer judges them from a recorded run.");
                                                                                                                                        ^
error: The route tests need an unsandboxed run: this process is inside a Seatbelt sandbox, which cannot nest, or the host has no PID namespace. Run them outside any sandbox; a command-route reviewer judges them from a recorded run.
      at <anonymous> (/private/var/folders/sm/8hfqw9_97pgfmhlfs2t7k66c0000gn/T/vh-recorded-run.5dYroF/clone/tests/vh-adlc/loop/review-route.test.ts:20:132)
(fail) the route tests need an unsandboxed run [0.18ms]

 6 pass
 56 skip
 1 fail
 28 expect() calls
Ran 63 tests across 1 file. [2.28s]
```

exit code: 1

## Mutant script

command: python3 tests/vh-adlc/evidence/macos-review-boundary/mutants.py

```text
## no denied paths: 6 fail (exit 1, ran 15)
   - a detached writer that cleared its environment cannot write into the owning worktree after the review
   - a late writer cannot rename the worktree's grandparent and write through the new path
   - a late writer cannot rename the main checkout and change the linked worktree's index through it
   - an implementation reviewer cannot write into its private clone during the review
   - a spec reviewer cannot make the export writable and write into it during the review
   - refs and the linked worktree's index stay unchanged
## no parent literal denies: 2 fail (exit 1, ran 15)
   - a late writer cannot rename the worktree's grandparent and write through the new path
   - a late writer cannot rename the main checkout and change the linked worktree's index through it
## no Git-directory denies: 2 fail (exit 1, ran 15)
   - a late writer cannot rename the main checkout and change the linked worktree's index through it
   - refs and the linked worktree's index stay unchanged
## no clone deny: 1 fail (exit 1, ran 15)
   - an implementation reviewer cannot write into its private clone during the review
## no export deny: 1 fail (exit 1, ran 15)
   - a spec reviewer cannot make the export writable and write into it during the review
## no allow rules: 2 fail (exit 1, ran 15)
   - writes into a declared scratch directory and the temporary directory still land
   - a real scratch directory and a scratch symlink to a disjoint directory stay writable
## no link-count check: 1 fail (exit 1, ran 15)
   - a protected file that already has a second hard link leaves the review pending before the reviewer runs
## no disappearing-file guard: 1 fail (exit 1, ran 15)
   - a file that disappears between the listing and its lstat gives a retryable result, not an error
## no scratch overlap check: 3 fail (exit 1, ran 15)
   - a scratch symlink to the owning worktree's root leaves the review pending before the reviewer runs
   - a scratch symlink to the common Git directory leaves the review pending before the reviewer runs
   - a scratch symlink to a tracked directory of the worktree leaves the review pending before the reviewer runs
## no boundary precheck: 1 fail (exit 1, ran 15)
   - a route started inside another Seatbelt sandbox stays pending and names the missing boundary
```

exit code: 0

clone status after the run:
