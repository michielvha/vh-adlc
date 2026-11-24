# Antigravity installation smoke test

On 2026-10-26, Antigravity CLI 1.4.7 installed the public default-branch package with:

```sh
agy plugin install https://github.com/michielvha/vh-adlc/tree/main/plugins/vh-adlc
```

The tested source was `michielvha/vh-adlc` at
`6ea0ce5c7f8b37bd2dd2c862b9005131a9ed9f34`, plugin version 0.3.1. This is distinct from the
local `feat/portable-auth-refresh` checkout's plugin 0.2.0.

## Observed results

- The native command exited 0 and reported seven skills processed.
- `agy plugin list --json` reported vh-adlc 0.3.1 enabled at
  `~/.gemini/config/plugins/vh-adlc`, with all seven operations.
- SHA-256 comparisons confirmed that all 19 installed package files matched a fresh default-branch
  checkout, including the original manifests, scripts, references, reviewer and binary lock file.
- The language server bundled in standalone IDE 2.5.5 was started directly in headless mode with
  temporary configuration. Its real `GetAllPlugins` API returned vh-adlc with `isGlobal: true`,
  seven skills and zero agents. `GetAllSkills` returned all seven operation names.
- The same IDE loader also discovered unchanged project copies and a project symlink under
  `.agents/plugins/vh-adlc`.

The CLI binary came from Google's official release manifest and passed its SHA-512 checksum. The
current IDE language server came from Google's standalone IDE 2.5.5 archive. The native install was
repeated successfully with Bubblewrap binding a temporary directory over the home directory.
The CLI's `ANTIGRAVITY_GEMINI_DIR` override did not redirect its plugin installer; files created by
that initial test were moved into the temporary profile, restoring the original profile.

## Limits

`agy plugin validate` exited 1: `agents/vh-adlc-reviewer.agent.md` declares `tools` as a comma-separated
string, but Antigravity expects a YAML list. Validation reported that the loader skips this agent.
It recognized the existing Agent Plugins 1.0.0 manifest; no manifest rewrite was needed.

The older installed IDE 1.23.2 discovered a control skill but returned no plugins from the tested
project or global directories. Its result does not establish a manifest incompatibility.

No authenticated model session, skill execution or independent review was run. Loading seven skills
does not establish full workflow support or prove that the host can use a generic reviewer fallback.
