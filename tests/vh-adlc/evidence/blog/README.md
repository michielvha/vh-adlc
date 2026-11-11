# Article and promotion trials, 2026-10-29

Nine native Codex CLI 0.163.0 scenarios pass against the installed 0.5.0 candidate.
The plugin payload fingerprint is `8360c2ee12e6f3d8681e7928b0b39a4c197527f326fbbceb744c5a96f3db6332`;
the engineering pin is `e4d58d2cd69bd42f1efacf91dfdd3f01a24e134a`.
The independent implementation review in `docs/specs/blog-authoring.md` verifies
the raw sessions, separate editor contexts and source/package correspondence.

| Scenario | Raw event SHA-256 | Private run directory |
| --- | --- | --- |
| new | `bc1574c51433737fd6cb783a4696dad146ef9f7f156fb1e5b14fe3509d99747b` | `/tmp/vh-blog-native-20261029` |
| keep | `6f3165b50f3bc2dc1875d976b4d4c94a09c396675a723f374bfbee8f15e3fd5d` | `/tmp/vh-blog-native-keep-20261029` |
| repair | `ecc8b1c7bca76463834eb0fd8af989e396082119ee1ae729fd62765e8454dafa` | `/tmp/vh-blog-native-20261029` |
| promotion | `3768b4592e15a6e13e1b174875b4d65239d833cebe385e89a732f195c55d4a35` | `/tmp/vh-blog-native-final-20261029` |
| denied-site | `caba79da763cfce99e97277a7ca4e74786fe7f994f4c5b9df40c883ff7c3b934` | `/tmp/vh-blog-native-final-20261029` |
| fallback | `c5bf2de96320e1069eddc999efdab5ed10ebf3df40f3d303a5324795b100c778` | `/tmp/vh-blog-native-fallback-20261029` |
| editor | `ef044e4ab30f9ce114a18f71ea4f16e03535495473b473ac89b4074a17a5e1ca` | `/tmp/vh-blog-native-final-20261029` |
| ship-public | `67bd892c26be3e508fac52f4f2cec23f1b0526700ac2e836187432f0110dc586` | `/tmp/vh-blog-native-final-20261029` |
| ship-internal | `53ea0fcc45fa56da133fc153a6f497622e3e4bce72f2fe4b991f1b725455f09c` | `/tmp/vh-blog-native-final-20261029` |

The raw runs and isolated auth profiles remain outside Git. The retained driver
is `tests/vh-adlc/blog/run.ts`. It installs the actual local marketplace in a
disposable profile, uses the inherited model, creates synthetic repositories,
and checks output, authorized destinations, refs, index and package fingerprints.
Its later authorized-path guard was also checked against the completed tracked,
untracked and unchanged fixtures. No runtime proof is inferred from a prompt alone.

Independent app-host trials additionally check an incomplete product comparison,
source drift after review, exact copy, destination authority and ship suggestions.
Their receipts are retained at `/tmp/vh-blog-independent-app-20261029/`.
These are separate agent-context checks, not desktop/plugin GUI evidence.

The initial keep fixture omitted mandatory metadata; its failed result is
retained under `/tmp/vh-blog-native-20261029/` and is not preservation proof.
The corrected valid keep fixture passes unchanged. Two promotion attempts ended
with a model-capacity error before completion; retain those failures under the
initial run and `/tmp/vh-blog-native-rest-20261029/`. A later completed run passes.

Live write-like-me retrieval combined with the humanizer tool is unavailable
and remains unverified (AC-03). The tested fallback reads supplied local voice
references and the pinned prose guide; it does not claim retrieved style evidence.
The public/internal ship cases exercise only the handoff section, not a live
shipment. The declared canonical URL is intentionally unpublished; no live article,
named-platform constraints or separate outdated-destination runtime is claimed.
