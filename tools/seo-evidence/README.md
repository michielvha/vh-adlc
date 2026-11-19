# SEO evidence toolkit

Turn saved public-site evidence into repeatable technical findings. This is the
evidence engine for the vh-adlc SEO workflow: it analyzes observed links,
duplicates and technical changes using local files. Skill integration remains
with the separate SEO features. No third-party agent or skill is vendored here.

Use Bun 1.4.3 or newer on Linux. CI selects Bun 1.4.4. Runtime dependencies are
locked locally in `bun.lock`; install them with `--frozen-lockfile`. Tests also
need Bash, bubblewrap and strace. The offline proof requires a host that permits
an unprivileged network namespace; run it outside a restrictive outer sandbox.
Missing isolation prerequisites fail that proof rather than skip it.

## Complete example

Run this from the repository root. The example's URLs identify saved documents;
the commands make no HTTP requests. Each output directory must be new, with an
existing parent.

<!-- verified-example -->
```bash
bun install --cwd tools/seo-evidence --frozen-lockfile
SEO_EXAMPLE_ROOT=$(mktemp -d -t seo-evidence-example.XXXXXXXX)
trap 'rm -rf "$SEO_EXAMPLE_ROOT"' EXIT
bun tools/seo-evidence/cli.ts snapshot --input tools/seo-evidence/examples/basic/bundle.yaml --output "$SEO_EXAMPLE_ROOT/snapshot" --json
bun tools/seo-evidence/cli.ts inspect --snapshot "$SEO_EXAMPLE_ROOT/snapshot/snapshot.json" --output "$SEO_EXAMPLE_ROOT/inspect" --json
bun tools/seo-evidence/cli.ts compare --baseline "$SEO_EXAMPLE_ROOT/snapshot/snapshot.json" --current "$SEO_EXAMPLE_ROOT/snapshot/snapshot.json" --output "$SEO_EXAMPLE_ROOT/compare" --json
```

`snapshot` verifies a bundle and extracts normalized facts. `inspect` produces
cross-page findings and an observed link graph. `compare` compares explicit
baseline/current snapshots. None chooses an implicit latest baseline. In a real
comparison, supply two separately collected bundles with compatible scope,
capture mode and extraction settings.

## Bundle contract

The complete [native example](examples/basic/bundle.yaml) and structural
[bundle schema](schema/bundle.schema.json) describe version 1. Runtime validation
also checks hashes, path containment, scope and semantic consistency; JSON Schema
alone cannot establish those facts.

| Field | Meaning |
| --- | --- |
| `schema_version` | Exactly `1`. |
| `captured_at` | Evidence collection timestamp, supplied by the collector. |
| `origins` | Exact HTTP(S) origins without a trailing slash or credentials. |
| `entry_urls` | Roots for observed discovery paths. |
| `pages` | Declared observations, unique by requested URL and capture mode. |
| `files` | Relative ordinary files and SHA-256 digests; every body must be listed. |
| `sitemap_urls` | Optional declared sitemap inventory, distinct from incoming anchors. |
| `groups` | Optional named template groups with explicit URL membership. |
| `extraction.main_selector` | Optional CSS root selector; default `main`. |

A captured observation has `requested_url`, known `final_url`, `outcome:
captured`, `mode: initial` or `rendered`, `observed_at`, HTTP `status`,
`content_type`, `headers` and `body_file`. Repeated headers use ordered string
arrays. Only Content-Type, X-Robots-Tag, Link and Location are accepted. Optional
`redirects` is an ordered array of `{from, to, status}` matching the requested and
final URLs. A final transition without saved intermediate hops stays explicitly
unknown in that respect.

Failed/not-collected observations contain requested URL, mode, timestamp,
outcome and a reason. They cannot supply captured facts. A captured 404 is an
observed HTTP error; a timeout has unknown status. Captured HTML must be UTF-8.
Limits are 10,000 observations, 5 MiB per referenced file and 250 MiB total
referenced bytes. Over-limit or invalid input is rejected without truncation.
Absolute evidence paths, traversal and symlinks are refused.

### Mapping an existing saved HTTP export

The historical Stackweaver export is input material, not this native format.
Create a new bundle directory and copy only the intended public evidence into
it; keep the original export unchanged. Map each record as follows:

| Saved export evidence | Native value |
| --- | --- |
| Original request URL and actual final response URL | `requested_url`, `final_url`; never infer a final URL from a canonical. |
| Matching request record, selected by URL and saved response file | Actual status, content type, allowed header arrays and recorded redirect hops. |
| Collection timestamp and actual raw/rendered method | `observed_at`, `mode`; do not infer browser rendering from HTML alone. |
| Raw saved HTML file and verified digest | Relative `body_file` and a matching `files` entry. |
| Request failure or deliberately uncollected URL | Explicit absent outcome and reason; never status zero. |
| Sitemap and selected entry URLs | Scope/root inventories, separate from extracted anchor edges. |

Do not map an old summary's title/link counts as extracted facts. `snapshot`
reparses actual HTML and rechecks every file hash. Keep diagnostic crawler-UA
requests separate rather than silently choosing one of several responses.
Native bundles are the supported input; general third-party export adapters are
deferred.

## Findings and coverage

Documents are keyed by final URL and capture mode. Anchors and recorded
redirect transitions retain distinct edge types. Redirects have zero anchor
depth; they are not silently counted as extra content links. Conflicting
observations of one final document suppress its content/status choices and make
the snapshot partial. Agreeing observations retain all source references.

Uncaptured targets remain unobserved. A page with no incoming discovery or no
path from the supplied roots is a candidate within this corpus, not a proven
whole-site orphan. Self-links and sitemap membership do not establish an
incoming content link. Fragment checks include empty/top targets, raw/decoded
IDs and named anchors; unsupported forms remain unverified. Static HTML
resolution does not attest live browser behavior or external browser policy.

Duplicate titles/descriptions/main text are exact, partitioned by language and
capture mode. Shared content outside the selected root does not produce a
main-content duplicate. Missing/multiple roots remain unavailable. Canonical
variants are retained for review, not automatically consolidated. There is no
thin-content or keyword-cannibalization verdict from a word count.

Coverage counts declared observations, including separate initial/rendered
observations of a URL. Groups list their supplied URLs, mode counts and URLs
absent from the declared inventory. No result from one page is propagated to
its uncollected template siblings. Complete means the declared inventory was
captured without unresolved conflicts, not that the entire site was crawled.

Generic controls combine unscoped header and HTML evidence; `none` and
`noindex,nofollow` are equivalent. Crawler-scoped controls stay separate.
Equivalent HTML/header canonicals do not cause a target-change regression.
Ambiguous controls remain unavailable, not an inferred provider index choice.

## Explicit enforcement

Findings are report-only by default. Supply a version-1 YAML policy to enforce
known rules. The [example policy](examples/policies/broken-links.yaml) selects
only broken links. A rule must apply to the command; unknown or repeated rule
IDs are errors. There are no scores, severity thresholds or wildcards.

| Inspect rule | Observed condition |
| --- | --- |
| `broken_link` | Captured target HTTP error. |
| `broken_fragment` | Supported target absent from captured successful HTML. |
| `duplicate_title` | Exact duplicate nonempty title values. |
| `duplicate_description` | Exact duplicate nonempty descriptions. |
| `duplicate_main` | Exact supported main-content hashes. |
| `unreachable` | No path in the observed graph from supplied roots. |

| Compare rule | Observed regression |
| --- | --- |
| `http_regression` | Captured 2xx becomes captured 4xx/5xx. |
| `title_removed` | Nonempty title becomes absent/empty. |
| `h1_removed` | Nonempty H1 becomes absent/empty. |
| `noindex_added` | Generic observed blocking changes from false to true. |
| `canonical_removed` | One observed valid target becomes unambiguously absent. |
| `canonical_changed` | One observed valid target changes to another. |

Other observations, such as inventory changes, unavailable comparisons,
JSON-LD changes and zero-incoming candidates, remain in reports. JSON-LD syntax
and presence do not establish rich-result eligibility.

## Outputs and exit codes

Snapshots contain `snapshot.json`; reports contain `findings.json`,
`findings.csv` and `report.md`. Every artifact has a hashed `manifest.json` and
`complete.json`, with no remaining `INCOMPLETE` marker. Readers verify all hashes
before accepting it. A completed partial-capture artifact is still partial.
Interrupted outputs are retained and refused on retry; use a fresh directory.

| Exit | Meaning |
| --- | --- |
| `0` | Analysis completed without an observed selected-rule violation; findings may exist. |
| `2` | Invalid/incompatible input, incomplete declared capture or execution failure. |
| `3` | Complete analysis with an observed selected-rule violation. |

Partial capture takes precedence over policy violations; both remain visible in
JSON. `policy_status` is `report_only`, `passed` or `failed`. Passed means no
selected observed violation, not that unavailable facts or actual search
visibility have been verified. Reports preserve unavailable observations.

`--json` writes one undecorated result object to stdout. Diagnostics and human
status use stderr. Non-TTY output is append-only ASCII; `--ascii` or `--plain`
also selects ASCII status. TTY status uses labelled text symbols. No mode emits
colour, so `NO_COLOR` is always respected. Input Unicode is preserved.

Reprocessing identical input/policy yields identical analytical bytes in a new
output directory. Outputs retain capture timestamps and relative evidence
references, not the current time or absolute local paths. The structural
[snapshot schema](schema/snapshot.schema.json) and
[policy schema](schema/policy.schema.json) complement runtime validation.

## Verify

From the repository root, run `bun install --cwd tools/seo-evidence
--frozen-lockfile`, `bun run --cwd tools/seo-evidence typecheck` and
`bun test --cwd tools/seo-evidence`. Tests execute the actual example and
network-denied commands. The dedicated workflow runs those checks independently
of the unfinished SEO features. Its hosted result is separate from a local pass.

The source-backed design and upstream references are in the
[accepted feature document](../../docs/specs/seo-evidence-workbench.md).
