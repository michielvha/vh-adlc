# Documentation impact example

Copy this entire directory into a disposable Git repository. Commit its files
before checking; the default document view is committed HEAD. Install Bun, Git
and Bash, then explicitly prepare the locked binary:

```sh
export BUN_RUNTIME_TRANSPILER_CACHE_PATH=0
bash <installed-plugin>/scripts/ensure-vh-adlc.sh
bun <installed-plugin>/scripts/docs-impact/cli.ts roots --repo <example>
bun <installed-plugin>/scripts/docs-impact/cli.ts check --repo <example> --path deploy/values.yaml
bun <installed-plugin>/scripts/docs-impact/cli.ts check --repo <example> --path unrelated.txt
```

The first check exits 0 with `candidates` and `docs/deployment.md`; the second
exits 0 with `none`. Neither establishes documentation accuracy. Remove the
committed coverage or select a malformed metadata overlay to get `incomplete`
and exit 2. Pass current metadata edits with `--metadata-path docs/deployment.md`.
No index generator, harness or active agent session is required.
