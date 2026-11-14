# Candidate install of shared issue labels (AC-11)

Source: `feat/shared-issue-labels` at `661f5d0932e2723c0e5e8d3ccf28dd2ac3354ff1`, run on 2026-11-14.
This is a local candidate install, not the published marketplace.

## Procedure

1. Archive `plugins/vh-adlc` at the source commit with `git archive` into a new catalog directory and
   add a `.claude-plugin/marketplace.json` naming the catalog `labels-candidate`.
2. In a fresh profile with no credentials or copied configuration (`env -i`, new `HOME`,
   `CLAUDE_CONFIG_DIR` and `XDG_CACHE_HOME`), run with Claude Code 2.1.325:
   - `claude plugin marketplace add <catalog>`: exit 0
   - `claude plugin install vh-adlc@labels-candidate`: exit 0, "Successfully installed plugin:
     vh-adlc@labels-candidate (scope: user)"
3. The installed cache, `plugins/cache/labels-candidate/vh-adlc/0.19.0/`, contains
   `scripts/labels/` (`apply.ts`, `cli.ts`, `github.ts`, `issue.ts`, `plan.ts`, `vocabulary.json`,
   `tsconfig.json`, `typecheck.sh`) and `references/issues.md`. Its `vocabulary.json` is byte-identical
   to the source file.
4. Both installed manifests, `plugin.json` and `.claude-plugin/plugin.json`, read `"version": "0.19.0"`.
5. With two identical fake GitHub states (`tests/vh-adlc/labels/fake-gh.ts`; labels `bug`, a
   recolored `enhancement` and `dependencies`) and one checkout whose origin is
   `example/project`, run `cli.ts plan --repo <checkout> --output <new file>` once from the installed
   cache and once from the source tree. Both exit 0.

## Result

- The two plan files are byte-identical: SHA-256 `fb2418a7f8453c55ebd5175cdf3fbfb91b6e98917b70a84ae2614ed6855cee7b` for both.
- Each run made only GET requests to its fake GitHub (the account and one label page) and no write.

Limitation: no published marketplace, release or tag was checked; that publication follows merge
and needs its own authorization.
