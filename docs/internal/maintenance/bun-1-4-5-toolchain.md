# Maintenance: complete the Bun 1.4.5 update

## Definition

Outcome: complete the Bun update proposed in PR #125 without changing docs-drift runtime behavior.

Preserved contract: the docs-drift bundle and typecheck use the exact Bun version declared in the package manifest. Frozen dependencies still reproduce the committed ZIP reader byte for byte.

Task base: `d610618457df6bca8ca203d2d9ba52566bf20056`, the existing Renovate PR head.

Affected paths: docs-drift `typecheck.sh` and `build-zip.ts`, the archive package test, and the docs-drift example and SEO evidence setup documentation.

Verification inputs: the docs-drift manifest, frozen lockfile, TypeScript config, vendor bundle, and PR #125's CI and Bun changes.

Proposed change: read the manifest's package manager in both guards. Bring the package assertion and setup documentation in line with the PR's declared version.

Required checks: reproduce the 1.4.4 guard failure with the verified 1.4.5 binary, pass typecheck and byte-for-byte bundle verification, and pass the archive tests. Confirm Linux and macOS CI on the updated PR before merge.

## Evidence

Both hosted checker jobs in [the PR run](https://github.com/michielvha/vh-adlc/actions/runs/44809263387) failed at the docs-drift 1.4.4 guard. The official Linux Bun 1.4.5 archive matched its release asset SHA-256. The original guard returned the same error locally.

On the candidate, docs-drift typecheck passed, the frozen ZIP reader rebuild was byte-identical, and all 25 archive tests passed. Hosted CI for the candidate is pending.

## State

Independent review pending. Local candidate.

## Independent review

### R-1

Target: `ba429d72f0863b3df34a950a707ab1a39394533a`.
Model: gpt-6.2-sol. Isolation: procedural.

```text
NO FINDINGS
```

Local verification and independent review are complete. Applying the repair to PR #125 and its hosted Linux and macOS CI are pending.
