# Empty binary cache, each file alone

Host: fedora-43 (Linux 7.1.8, x86_64), Bun 1.4.3, 2026-11-28. On Linux the installer caches under
`$XDG_CACHE_HOME`, so each file ran alone with its own new, empty `XDG_CACHE_HOME`:

```sh
XDG_CACHE_HOME="$(mktemp -d)" bun test --timeout 60000 <file>
```

`base` is the task base `d0deac94`. `fixed` is the reviewed head `cfe3f7d9` plus the R-1 fix for
`settings-file.test.ts` and `docs-impact/collection.test.ts`.

| File | base | fixed |
| --- | --- | --- |
| `review-convergence.test.ts` | 0 pass, 1 fail (load-time throw) | 10 pass |
| `owner-summary.test.ts` | 0 pass, 1 fail (load-time throw) | 2 pass |
| `settings-file.test.ts` | 20 pass, 3 fail | 22 pass, 1 fail (fails the same with a warm cache on this host) |
| `proportional-review.test.ts` | 20 pass, exit 1 (unhandled error outside a test) | 29 pass |
| `audit/entry.test.ts` | 5 pass | 5 pass |
| `docs-impact/collection.test.ts` | 12 pass, 18 fail | 30 pass |

The one remaining `settings-file` failure, "later readers in one process reuse the verified binary until
its bytes change", also fails on this host with a warm cache. Its child process runs with a narrow
`PATH`, and the host runs Bun 1.4.3. The test passes on macOS and on CI with Bun 1.4.5, so this is a host
difference, not the cache-order dependence. `audit/entry.test.ts` passed at the base too, so this run shows no
dependence there; its change only keeps it consistent with the other callers.

## Failure lines

```text
== base-collection.log
 12 pass
 18 fail
(fail) a missing selected overlay is a gap, while a real tracked-doc deletion remains explicit [52.04ms]
(fail) an ordinary covered doc repair still makes the actual feature review stale [50.90ms]
(fail) an unreadable HEAD blob retains the other known candidates [59.65ms]
(fail) feature classification follows the existing first-declaration resolver, including exact local-format syntax [51.55ms]
(fail) frontmatter delimiters accept trailing spaces and tabs without losing declared candidates [50.75ms]
(fail) Git filenames retain a literal leading BOM and cannot alias another document [51.35ms]
== base-entry.log
 0 fail
 5 pass
== base-owner-summary.log
 0 pass
 1 fail
9 | if (setup.exitCode !== 0) throw new Error("verified cached binary required for Owner summary compatibility tests");
error: verified cached binary required for Owner summary compatibility tests
== base-proportional-review.log
 0 fail
 20 pass
36 |   if (setup.exitCode !== 0) throw new Error("verified cached binary required for proportional review checks");
error: verified cached binary required for proportional review checks
== base-review-convergence.log
 0 pass
12 | if (setup.exitCode !== 0) throw new Error("verified cached binary required for review convergence checks");
 1 fail
error: verified cached binary required for review convergence checks
== base-settings-file.log
 20 pass
 3 fail
error: invalid settings: binary unavailable: the verified vh-adlc binary could not be obtained
(fail) an offline reader session > a refused document exposes no YAML values and does not poison the next read [29.59ms]
(fail) an offline reader session > later readers in one process reuse the verified binary until its bytes change [100.85ms]
(fail) an offline reader session > verifies once and uses the real strict reader for several documents [258.07ms]
== fixed-collection.log
 0 fail
 30 pass
== fixed-entry.log
 0 fail
 5 pass
== fixed-owner-summary.log
 0 fail
 2 pass
== fixed-proportional-review.log
 0 fail
 29 pass
== fixed-review-convergence.log
 0 fail
 10 pass
== fixed-settings-file.log
 1 fail
 22 pass
(fail) an offline reader session > later readers in one process reuse the verified binary until its bytes change [147.28ms]
```
