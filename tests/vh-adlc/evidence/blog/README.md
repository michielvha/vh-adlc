# Visual reading trials, 2026-11-27

Native Codex CLI 0.172.0 scenarios on macOS 26.6.2 (arm64) against the installed
0.34.0 package from `feat/blog-visual-reading` at `7b892f74`. The plugin payload
fingerprint is `54d08e7bf77819259ec73d4f9e11a651f9ad372a00d6cdc5f53ec9dd3c30a8fc`; the engineering pin is
`e4d58d2cd69bd42f1efacf91dfdd3f01a24e134a`. The driver is `tests/vh-adlc/blog/run.ts`.

Nine of the ten visual scenarios pass. `visual-rendered` has not run: inside Codex's
macOS sandbox Chromium cannot register its Mach port (`bootstrap_check_in ...
Permission denied (1100)`), so the scenario's preflight stops it here, and it needs
a Linux host with Codex signed in.

| Scenario | Result | Raw event SHA-256 |
| --- | --- | --- |
| visual-new | pass | `dbdfc0944684b0d3423fa24fd06415c09f61f1b069b4a45b00254f24f62c21e1` |
| visual-short | pass | `5e3242da8c220f4aba4034bbf8c560a6dc6cf11417bccbb9a1623bec0ae4c3af` |
| visual-illustration | pass | `a3a995b13270488ecba822c2410044577f1105fbec9b22d1125b6ad8782b0629` |
| visual-presentation | pass | `0318e1273b11f417e6971643796156e654fcd5ec3d6f79b0ffe9e7c79f345a14` |
| visual-backport | pass | `8ece314737e0090cef44e2820ff9743f1496f80aebb8df0610f15068732b1664` |
| visual-revision | pass | `f4cf332b1c2b5724af7e6ab9fa212140b0dd15e7a3d54645bd3127afb30e86de` |
| visual-review | pass | `dd4c38f8deffed5de12391563e8e44dbf7efe6dcf34ac4f05bcdef00957e45f6` |
| visual-editor | pass | `3f8debb823e9a59113bcfc366b37afd86ae59307238eb9e935b5dc093776f155` |
| visual-editor-pass | pass | `315dc0d38b4d9694065d3fd3f767814b0614187c92dca38fc2e3682969ada154` |

`visual-backport` failed once in the same sequence, run directory
`/tmp/bvr-t10run.4eOy/final3-visual`, raw events `cde44c352e95fb614d08075da0abf9f90f19271fb8011f64ef02541378c8b37f`: its handoff
wrote `Rendered checks: unverified on desktop and phone ...` without the comma the
fixed line requires. The rerun above, in `/tmp/bvr-t10run.4eOy/final3-backport`, passed
against the same package.

The nine existing blog scenarios rerun against the same package and all pass,
run directory `/tmp/bvr-t10run.4eOy/final3-classic`:

| Scenario | Result | Raw event SHA-256 |
| --- | --- | --- |
| new | pass | `acbf841c63182bbf3d0cc4958c3631dfdedcfa6abf7f8a43526393678beeef37` |
| keep | pass | `994a51da8de6b9242e3bb99bde325d2f41048cb021a3ccaafd89e298486d4020` |
| repair | pass | `8c96b555b3597b1924641ce99f4f4dc3622908652a81082f7958da204932ec85` |
| promotion | pass | `b0d0f35bb0bbcfb1749addd2c66ae1017ddc8e335133df59e97e07001f83843c` |
| denied-site | pass | `87d3cb5a3340e9cad5a203e8c588be478150b5ee3bcc039489c057e51e6fb2f9` |
| fallback | pass | `852b199b2e533e11573f45f182eba2a4e622caf7fca6e9ea5ddc0edd9fbb782a` |
| editor | pass | `fb3651e2e58c7b63d690df5048d7ec2e9ca9d8c78e26d16eeee09a84bb27f2e1` |
| ship-public | pass | `c5f463733568beecf6f270761ebcc5afb0220aa6f5fdf0b18e24fdb9cf6e50f3` |
| ship-internal | pass | `4763147e4e9dd46ad67def66ce82c4c07aa0fc02bd525acd48b254a621ec3242` |

Earlier runs on 2026-11-27 at `ee7b7e3` to `cda5a837` found the defects those
commits fixed: handoffs that did not quote the editor's entries or name gaps by
their opening words, a parent that interrupted an editor, editors and a writer
listing directories outside the project to find convention pages, a split paragraph
in a presentation revision, and fixture prose the notes did not support. The raw
runs and isolated auth profiles remain outside Git.

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
