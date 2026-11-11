[Documentation](../README.md) / Maintainer releases

# Publishing releases

The [CI workflow](../../.github/workflows/ci.yml) calls the shared Go checks and
version workflow. The [release workflow](../../.github/workflows/release.yml)
publishes through the shared Go release workflow. Their pinned revisions and
[GoReleaser configuration](../../.goreleaser.yml) define the release behavior.

Every branch push runs **CI**: the Go CI action plus the Linux and macOS plugin
checks. A PR shows those checks on its head commit; there is no separate PR run.
When every check passes, CI calls the shared GitVersion workflow:

| Branch | GitVersion |
| --- | --- |
| `main` | Pushes the exact stable tag when the version is new |
| Feature branch with an open `release:preview` PR at this commit | Pushes the exact prerelease tag |
| Any other feature branch | Calculates the version only |

A writer adds `release:preview` once; every later push to that PR gets a
prerelease until the label is removed or the PR closes. Adding the label reruns
CI on the branch, so the current head gets a prerelease without a new push.
Fork PRs do not run this workflow.

CI runs on the branch rather than the PR merge ref, so GitVersion sees the real
branch and its configuration decides the version. Only the exact tag push starts
the shared Go CI and release workflow, which builds, signs and publishes.

Automated tagging uses the reusable `michielvha-repo-write` GitHub App, installed
on the owner's repositories. Each tagging job requests a short-lived token for
this repository only, with Contents: write. Its `RELEASE_APP_CLIENT_ID` repository
variable and `RELEASE_APP_PRIVATE_KEY` secret configure that identity;
`PGP_PRIVATE_KEY` signs artifacts. Check jobs receive none
of these credentials. Only eligible versioning receives a repository-scoped
tag token, and only tag-triggered publication receives the signing key.
Do not grant the App key to untrusted code.

No cleanup is enabled. Re-run the original tag workflow for a transient failure;
inspect a partial release before retrying. GoReleaser's configuration forbids
replacing existing drafts or artifacts. Source fixes need a new version, never a
moved tag.

Plugin versions live in their manifests. The binary release version has its own
sequence; changing a plugin manifest does not update the binary
[lock file](../../plugins/vh-adlc/vh-adlc.lock.json).

For downloads and signature checks, see [verifying releases](../security/verifying-releases.md).
