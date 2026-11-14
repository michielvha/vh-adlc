---
status: in-progress
status_description: "Implementing the shared skill and verifying native Codex and Claude runs."
issue: null
branch: feat/architecture-diagram-agent
goal: "From a design brief or repository sources, the shared vh-adlc plugin produces an evidence-backed architecture diagram that the owner can edit in draw.io and embed in documentation."
covers:
  - .agents/plugins/marketplace.json
  - .claude-plugin/marketplace.json
  - plugins/vh-adlc/skills/vh-adlc-diagram/
  - plugins/vh-adlc/references/diagram.md
  - plugins/vh-adlc/plugin.json
  - plugins/vh-adlc/.claude-plugin/plugin.json
  - docs/reference/marketplace.md
  - docs/user-guides/workflows.md
  - tests/vh-adlc/diagram/
  - tests/vh-adlc/check.test.ts
---

# Plan: Architecture diagram agent

A shared plugin skill turns a diagram request and its sources into one editable draw.io view, an SVG, and a brief that explains the visible components and relationships.

## Context

### Owner summary

VitePress has a Claude-specific agent for AWS architecture. It already uses a short flows-and-ports brief, native AWS shapes and a render-and-inspect pass. Engineers should be able to ask for the same kind of focused diagram from either Codex or Claude, using a design brief or repository files. The shared skill would choose the components that answer the question and deliver three files together. The Markdown brief makes the evidence reviewable, the draw.io file stays editable, and its SVG can go in the project documentation.

The agent decides which relationships to show and how to explain them. Each depicted relationship has a source or a visible label that identifies it as proposed. When the sources leave a link uncertain, the brief records the gap. Drawing and export use local tools. The project chooses the destination and controls any publication. Stackgraph stays a standalone deterministic tool. FlowStory playback and VitePress adoption can use the results of this first feature.

The first release covers an AWS request path grounded in repository sources and an OCI-to-local design from a written brief. The agent renders in the same request when the sources support a useful view. The host supplies draw.io Desktop and the selected local provider assets. In the prototype check, both drawings exported twice with networking disabled and produced identical files on the second export. Independent review found gaps in the proof and the local setup contract. The revised proof requires actual invocation from both marketplace installs, a comparison between the brief and the drawing, and a local export and editor check. R-3 reviewed the original scope. The revised coverage includes the existing shared plugin checker that registers allowed skills. Independent review R-4 identified a task ordering issue that the implementation plan will address. The native implementation checks are pending. Acceptance authorizes implementing and testing this scope under the feature lifecycle.

### Background

- The VitePress agent takes a discovered or supplied flows-and-ports brief, applies AWS visual conventions and exports a PNG for review. Its tool list names the Claude MCP tool directly. Its instructions place every cell on the default layer, so the shared workflow needs to prove that groups behave as editable containers. [VitePress agent at the observed main revision](https://github.com/michielvha/vitepress/blob/d26f848dfdcc26413cb785858a71940a1ffdf7ee/.claude/agents/aws-diagram-architect.md#L24-L43)
- On vh-adlc main at [`e2785fe`](https://github.com/michielvha/vh-adlc/commit/e2785fef4d5227068168e9595aa847b0fc45fc44), `vh-adlc find --slug architecture-diagram-agent` returned an empty document list. The blog reference uses visuals in articles. The marketplace catalogs already point both supported hosts at the same plugin source. [Blog reference](../../plugins/vh-adlc/references/blog.md#L51) · [Marketplace reference](../reference/marketplace.md#L19)
- The draw.io Desktop exporter provides local SVG export and layout options. Its XML reference describes parent-relative geometry and a schema for format checks. These upstream capabilities still need proof with the selected runtime and fixtures. [draw.io generation reference](https://www.drawio.com/docs/reference/diagram-generation/) · [Local export](https://github.com/jgraph/drawio-mcp/blob/310aa3c4826f86f401d11a23f0d691dca60be6d9/README.md#diagram-layouts)

- For both local prototypes, `unshare -cn` ran draw.io Desktop 32.6.10 with `--export --format svg --border 12` twice against the same native file, with each run writing to its own output directory. Both runs succeeded and the two SVGs for each input had identical SHA-256 digests. The AWS result was `8d418e323a2994c18df145ae39494873fa4822875976e158897d97b3c648749b` and the OCI-to-local result was `d2324b1a0572daa3787eccc1254997b022f31f3644cbf2d4618e0c27fe5b987b`. This measured the local rendering path for the manually authored prototypes.

## Scope

Deliver architecture diagram authoring on explicit request through the existing shared vh-adlc marketplace plugin. Cover current architecture from selected repository evidence and proposed architecture from an owner-supplied brief. Deliver one diagram view per request. Verify native AWS and OCI shapes with the two first-release fixtures. Use labeled generic shapes for local infrastructure and services without a verified local shape.

Consumer adoption, Stackgraph, Mermaid rendering, interactive playback, live cloud discovery, and importing or regenerating existing diagrams are outside this feature. Native Azure coverage is a later change.

## Design

### Request and evidence

Add `vh-adlc-diagram` as a skill in the existing package. Keep the procedure in the shared plugin so its Codex and Claude installs read the same rules. The request supplies a diagram question or subject, a brief or source scope, and an output destination. Follow the consuming repository's rules for paths and asset placement. Ask for the missing input when the agent cannot identify the intended architecture or write destination.

Read the selected sources and prepare a Markdown brief. Identify the view, source files or supplied notes, components, boundaries and directed flows. Give each depicted component, boundary and connector an ID in the brief and use that ID on its primary draw.io cell. Helper cells for icons, labels and styling may use their own IDs. Match each depicted component, boundary and connector to one brief entry in both directions. Unresolved entries have no corresponding connector. Cite a source location for each documented component, containment relationship and flow. Mark design proposals in the brief and on the diagram. Record unresolved links in the brief and omit their arrows. Preserve protocols, ports and route labels when the sources establish them. An infrastructure dependency supports a dependency or association and needs separate evidence to be drawn as request or data traffic.

| Term | Meaning |
| --- | --- |
| Brief | The Markdown record of the view, its sources and unresolved items. |
| Proposed | A component or connection described as intended in the design. |
| Unresolved | A detail for which the available material leaves the component, placement or relationship uncertain. |

Render in the same request when the sources support a useful view. For a partial view, record the gaps and draw the supported or explicitly proposed elements. Ask for the missing information before writing final output if the gap prevents answering the diagram question.

### Editable diagram and export

The agent authors one page of uncompressed draw.io XML using the pinned upstream format reference. It uses stable cell IDs, parent-relative geometry and actual parent cells for nested boundaries. Use verified AWS and OCI shapes from the configured local inputs for those fixtures. Use clear labels for local and unmapped components. Distinguish associations and proposed flows through labels or a legend that stays understandable without color. Arrange the diagram to emphasize the requested path and make labels readable at the intended documentation width.

Use a host-configured local draw.io Desktop executable with its graphical environment available for export. Read provider styles from a locally supplied shape index or provider library. Identify the files and expected hashes in the local setup and verify those inputs before rendering. Record the Desktop version, format-reference revision and asset hashes with the proof. The committed fixture setup declares Desktop 32.6.10 and the expected SHA-256 for the AWS shape index, OCI library and XML schema before native trials run. The selected OCI Library.xml has SHA-256 `e098244928cdd5257c1bc4696cf9f46fd289b4195208d699e5392bf79de69555`. It is extracted from the Oracle toolkit linked in Sources. The workflow reports a missing executable, unavailable graphical environment, missing asset or asset hash mismatch before publishing and leaves the final destination untouched. Compare the saved geometry with the exported SVG and use the same saved file for subsequent exports. Validate XML structure, unique IDs and resolvable group and connector references. Check the displayed results for missing shapes, overlapping labels, clipped text and misleading edges. Use the upstream renderer and format checks as tools for the agent's output. The agent owns the choice of view, meaning of relationships and layout adjustments.

Work in a separate staging directory for each request. Create the final files under a new output directory in the requested location after all three are ready. Publish the directory with a single no-replace operation on the same filesystem. A collision leaves the existing output intact. A failed or interrupted render leaves the final destination untouched and reports the failure. A retry uses a clean staging directory and a new or still-unused destination. Independent requests can run concurrently in their own staging directories. Local file formats remain readable after a plugin upgrade or rollback, and earlier artifacts stay in place. Rendering uses a local exporter and local shapes so repository content stays out of hosted draw.io requests. The plugin includes no hosted export fallback.

### Delivery

The existing vhco-tools Codex and Claude catalogs both source `plugins/vh-adlc`. Update the two manifest versions together, register the skill as a content operation in the shared plugin checker, and document the operation in the user workflow. Before feature merge, exercise the actual catalog install from the candidate checkout in isolated Codex and Claude profiles, then run the native-host proofs against those installs. Before claiming marketplace availability or adopting the skill in VitePress, verify discovery from the published marketplace source. The packaged change is a plugin skill and supporting files. It requires no Go binary changes. [Codex marketplace](../../.agents/plugins/marketplace.json) · [Claude marketplace](../../.claude-plugin/marketplace.json) · [Marketplace migration precedent](../reference/marketplace.md#L34)

## Acceptance Criteria

- [ ] AC-01: An explicit architecture diagram request reaches the same shared workflow in Codex and Claude when each installs the candidate from its vhco-tools marketplace catalog.
- [ ] AC-02: The AWS repository and OCI-to-local fixtures produce diagrams whose depicted scope, components, boundaries and arrows agree with their evidence or carry the proposed label, with unresolved relationships visible in the brief.
- [ ] AC-03: A successful request produces a brief, an editable native draw.io file with movable nested groups, and a matching local SVG with recognizable fixture icons, readable labels and legible routes.
- [ ] AC-04: An unavailable prerequisite, asset hash mismatch, failed export or existing destination leaves existing artifacts intact. Two successful renders competing for one unused destination yield one complete set of files and one collision. A retry can publish to a different unused destination.
- [ ] AC-05: A request with sufficient evidence renders in the same request. A useful partial view renders with the gaps documented. A request whose main relationship cannot be established gets a clarification before writing final output.

## Test Plan

| Criterion | Proof |
| --- | --- |
| AC-01 | Run `bun tests/vh-adlc/diagram/run.ts --host <codex-or-claude> --case fixtures` once per host. Install from the candidate catalog in an isolated profile, verify installed content against the candidate, then give the fresh native session an explicit request naming the installed skill and the fixture sources. Retain a native skill activation event or the observed tool read of the installed skill file, plus the package identity, prompt and output manifest. Discovery or a self-reported invocation alone fails. Use those same sessions for AC-02. Run `bun test tests/vh-adlc/check.test.ts` to verify the operation is registered and both manifests are versioned together. |
| AC-02 | Run the AC-01 runner against an AWS route fixture with a dependency-only decoy and a written OCI-to-local fixture with a proposed route and an unresolved restore link. Match semantic roles to the fixture expectations and verify the brief-to-cell ID mapping in both directions. Agent-chosen ID spelling may vary across runs. Check parents, endpoints, status, source locations and port labels. Fail on a depicted decoy traffic arrow, invented port, unrelated resource or unresolved arrow. Retain briefs, draw.io files, SVGs and redacted transcripts with the run manifest. |
| AC-03 | Use both hosts' AC-01 fixture outputs. Check against the pinned XSD and resolve every parent and connector reference. Open each draw.io file, move a boundary and confirm its children move with it. Verify the configured input hashes against the committed expectations before the run. Re-export each session’s delivered draw.io file with networking disabled and the recorded Desktop version and settings. Compare the delivered SVG with that reference export for equivalent rendered content and geometry. Inspect the delivered SVG at documentation width and open or zoom it on a phone viewport. Fail on missing fixture icons, overlapping or clipped labels, or misleading routes. Preserve captures, tool versions, asset hashes and results. |
| AC-04 | `bun test tests/vh-adlc/diagram` exercises a missing local prerequisite, a mismatched provider asset hash, a failed export, an occupied destination, a concurrent publish and a retry to an unused path. Synchronize two processes after successful staging, before publication to the same initially free destination. Require one complete winner and one collision. Compare the winner's files against its staged output and verify byte-for-byte preservation of the occupied destination. Failed requests expose no partial final directory. A hash mismatch identifies the affected asset and does not invoke the exporter. |
| AC-05 | Run `bun tests/vh-adlc/diagram/run.ts --host <codex-or-claude> --case intake` on both hosts. The complete AWS fixture renders immediately. The OCI-to-local fixture with the missing restore link renders without that arrow and includes the gap in the brief. A separate fixture without evidence for its main link requests the missing input and leaves no final directory. Keep the redacted transcripts and output inventory with the run manifest. |

## Tasks

- [x] T1 `tests/vh-adlc/diagram/output.test.ts` - the staging and export contract fails before the shared helper exists (AC-03, AC-04)
      Evidence: bun test tests/vh-adlc/diagram/output.test.ts returned four expected failures before the export helper existed.
- [x] T5 `tests/vh-adlc/diagram/` - fixture runner and committed scenarios reject the package when the skill is absent (AC-01, AC-02, AC-03, AC-05)
      Evidence: bun test tests/vh-adlc/diagram/discovery.test.ts rejected the candidate because the declared skill had no SKILL.md.
- [x] T6 `plugins/vh-adlc/skills/vh-adlc-diagram/`, `plugins/vh-adlc/references/diagram.md`, `plugins/vh-adlc/plugin.json`, `plugins/vh-adlc/.claude-plugin/plugin.json`, `tests/vh-adlc/check.test.ts`, `docs/reference/marketplace.md`, `docs/user-guides/workflows.md` - the package checker and export tests pass, followed by native fixture and intake runs on both hosts and rendered inspection (AC-01, AC-02, AC-03, AC-04, AC-05)
      Evidence: bun test tests/vh-adlc --timeout 20000 passed 1634 tests. Both native hosts produced the AWS and OCI outputs and requested clarification for the missing restore link. All four delivered SVGs matched offline re-exports, and all four editor boundary drags moved the child. Review R-5 recorded two follow-ups.

## Open Questions

None. The owner selected AWS and OCI-to-local fixtures, same-request rendering, and locally configured draw.io Desktop and provider assets.

## Review Log

| Date | Review | Kind | Commit | Model | Isolation | Outcome |
| --- | --- | --- | --- | --- | --- | --- |
| 2026-11-14 | R-1 | spec | `ed00017463b84fed13b97546271f7bda6dd299e1` | unknown | procedural | Six should-fix findings |
| 2026-11-14 | R-2 | spec | `7a0263ea494dd46d0145a2392e691df045558111` | unknown | procedural | Two should-fix findings and one nit |
| 2026-11-14 | R-3 | spec | `6593ed37147bd2bd6813e6e4d3e53066af7f8896` | unknown | procedural | No findings |
| 2026-11-14 | R-3 | spec | `6593ed37147bd2bd6813e6e4d3e53066af7f8896` | n/a | n/a | accepted by owner |
| 2026-11-14 | R-4 | spec | `211db5a7ceb0510e7107b160efe8ce30babda981` | unknown | procedural | One should-fix finding in the task order |
| 2026-11-14 | R-4 | spec | `211db5a7ceb0510e7107b160efe8ce30babda981` | n/a | n/a | accepted by owner |
| 2026-11-14 | R-5 | implementation | `6693aea802f641cf7833073141ec0d5f8824900a` | unknown | procedural | Five criteria met and two should-fix findings |

### R-1

FINDING: F-01
KIND: factual
SEVERITY: should-fix
WHERE: Context > Owner summary, Scope, Design > Request and evidence, Acceptance Criteria AC-01, Test Plan AC-01 and AC-02
EVIDENCE: The draft promises that an explicit architecture diagram request reaches the shared skill on both hosts. The AC-01 proof stops at installation and discovery. AC-02 starts the fixture runner without specifying how the host receives the request or how the runner establishes that it selected the installed skill. Both rows could pass with a discoverable skill that the host never uses.
PROPOSAL: Run an explicit architecture request from a fresh native session and retain evidence that the host loaded the installed candidate skill and followed its procedure. Let that same session supply the AC-02 artifacts.

FINDING: F-02
KIND: factual
SEVERITY: should-fix
WHERE: Design > Request and evidence and Editable diagram and export, Acceptance Criteria AC-02 and AC-03, Test Plan AC-02
EVIDENCE: The design requires each depicted item and cell to have a stable identifier but gives no mapping between the evidence brief and the diagram. AC-02 compares IDs with committed fixture expectations without defining which IDs must match. An exact comparison could reject a correct pair of outputs using different valid IDs. Independent checks of each artifact could also miss cases where the diagram and brief disagree.
PROPOSAL: Define how rendered objects and connectors map to entries in the brief, and whether the fixture supplies any required IDs. Compare structure and source references through that mapping, require completeness in both directions, and use the check to enforce the documented meaning of Proposed and Unresolved.

FINDING: F-03
KIND: judgement
SEVERITY: should-fix
WHERE: Context > Owner summary and Background, Design > Editable diagram and export and Delivery, Acceptance Criteria AC-03 and AC-04, Test Plan AC-03 and AC-04, Open Questions Q1
EVIDENCE: The design requires local verified provider shapes, a recorded Desktop version and a pinned reference. The proof assumes a pinned editor and exporter, but the spec leaves the supported runtime prerequisites, how the selected shapes are located and distributed, and what the user receives when those inputs are unavailable undefined. The pinned upstream README describes Desktop as a separate dependency and distinguishes its local and hosted paths. Candidate marketplace installation alone would not establish that the export is available.
PROPOSAL: Decide who supplies Desktop and the selected provider assets, define the supported setup and failure behavior, and pin and record the runtime, schema and shape inputs used by the proof. Verify that the selected fixture exports with external requests blocked and that missing prerequisites leave existing output intact.

FINDING: F-04
KIND: factual
SEVERITY: should-fix
WHERE: Design > Editable diagram and export, Acceptance Criteria AC-04, Test Plan AC-04
EVIDENCE: The design says two requests can run concurrently and a final directory is exposed in a single no-replace operation. The proof checks existing files and partial files but never states that the two-process case starts at a free destination and must produce exactly one complete winner and a reported collision. Both processes could decline the request, leave the destination absent and satisfy the stated checks.
PROPOSAL: Synchronize two requests targeting the same initially unused path. Require one valid complete directory, one collision result, and evidence that the losing request changed none of the winning files. Retain the existing-target and failed-export checks.

FINDING: F-05
KIND: judgement
SEVERITY: should-fix
WHERE: Context > Owner summary, Design > Request and evidence, Acceptance Criteria AC-05, Test Plan AC-05, Open Questions Q2
EVIDENCE: The pause option implies a second interaction, but the first response and later approval inputs are undefined. AC-05's sufficient case only says it follows Q2. If the owner chooses the pause, this permits implementations that resume a different draft or render after its cited sources have changed. The proof also lacks a case for a useful partial view, which the design explicitly allows.
PROPOSAL: After the owner answers Q2, specify and exercise the selected sufficient-input behavior and a useful partial view. If the pause is selected, say what identifies the reviewed brief and how the continuation handles a changed brief or stale source.

FINDING: F-06
KIND: factual
SEVERITY: should-fix
WHERE: Frontmatter covers, Design > Delivery, Acceptance Criteria AC-01, Test Plan AC-01
EVIDENCE: Both catalogs at the reviewed commit resolve the same package path. The draft makes both native catalog installs part of the feature and its proof, but `covers` omits `.agents/plugins/marketplace.json` and `.claude-plugin/marketplace.json`. Changing either source can invalidate the claimed discovery behavior without changing a listed path. The pinned standard requires `covers` to include every path whose change can affect the feature.
PROPOSAL: Include the two marketplace catalogs in `covers` and account for any separate runtime or asset paths introduced by the decision in F-03.

### R-2

FINDING: F-01
KIND: factual
SEVERITY: should-fix
WHERE: Context > Owner summary, Design > Editable diagram and export, Acceptance Criteria AC-03, Test Plan AC-03
EVIDENCE: AC-03 requires the SVG delivered to the user to match the editable file. The proof compares two offline re-exports of the original and inspects an SVG for visual defects. It never requires comparing the delivered SVG to either re-export. A skill can return a valid but stale SVG while both reference exports match each other and all three images pass visual inspection.
PROPOSAL: Compare the SVG delivered by each native session with a reference export of that session's delivered draw.io file using the recorded settings. Keep the second export if it serves a separate repeatability check.

FINDING: F-02
KIND: factual
SEVERITY: should-fix
WHERE: Design > Editable diagram and export, Test Plan AC-03 and AC-04, Sources
EVIDENCE: The revised setup requires expected hashes before use. The fixture setup specifies the Desktop version and a commit-pinned AWS index but identifies the OCI input only through a mutable Oracle toolkit landing page. The proof preserves observed hashes after rendering and never checks an incorrect hash. Two runs can use different OCI inputs while satisfying that description, and a hash check that accepts any present file can pass the missing-prerequisite scenario.
PROPOSAL: Require the committed fixture setup to declare the expected SHA-256 of the OCI archive or chosen library before either native run, and compare the installed input against it. Exercise a supplied asset with the wrong hash and require the same preservation behavior as for a missing asset.

FINDING: F-03
KIND: factual
SEVERITY: nit
WHERE: Context > Owner summary, Sources
EVIDENCE: The summary states that both prototypes exported with networking disabled. Sources links the Desktop release, which establishes the tool identity but cannot establish that execution. The resolved feature-document standard calls for a source or command and observed result for Context claims.
PROPOSAL: Cite the prototype export command and observed result in Background or link to the recorded evidence. Keep the claim limited to the prototypes.

### R-3

NO FINDINGS

### R-4

FINDING: F-01
KIND: factual
SEVERITY: should-fix
WHERE: Tasks T2 through T4
EVIDENCE: T2 first adds files under the new skill directory. The task verification command in AGENTS.md runs tests/vh-adlc/check.test.ts. Lines 224-232 require a version change whenever the plugin subtree changes, and lines 235-245 reject an undeclared skill directory and require its SKILL.md once declared. The current sequence defers both manifest changes and the skill definition to T4, and no task names the checker. T2 cannot pass the required package verification in that order.
PROPOSAL: Replan the unchecked tail after T1. Commit the failing fixture proof before introducing the skill, then land the helper, skill entry, checker declaration and both manifest changes together with the focused checker in the done condition.

### R-5

CRITERION: AC-01 An explicit architecture diagram request reaches the same shared workflow in Codex and Claude when each installs the candidate from its vhco-tools marketplace catalog.
VERDICT: met
EVIDENCE: At `6693aea802f641cf7833073141ec0d5f8824900a`, `bun test tests/vh-adlc/check.test.ts` passed all 64 tests. I compared both installed packages with the catalog copies and reviewed candidate, matching all 154 files on each host. I matched completed installed-skill tool reads in all six native transcripts. Native sessions ran at `4d64cd2` and used byte-identical plugin, catalog and fixture inputs.

CRITERION: AC-02 The AWS repository and OCI-to-local fixtures produce diagrams whose depicted scope, components, boundaries and arrows agree with their evidence or carry the proposed label, with unresolved relationships visible in the brief.
VERDICT: met
EVIDENCE: At `6693aea802f641cf7833073141ec0d5f8824900a`, I applied committed `gradeDiagram` to both hosts' four rendered fixtures and got no failures. I separately compared the delivered drawings and briefs with the source lines and visually inspected all four renderings. Both AWS drawings show the three documented hops without the deployment-only Log Bucket. Both OCI drawings show the proposed backup path and omit the unresolved restore arrow, with the gap recorded in each brief. Manual comparison was necessary for the reverse mapping limitation in F-01.

CRITERION: AC-03 A successful request produces a brief, an editable native draw.io file with movable nested groups, and a matching local SVG with recognizable fixture icons, readable labels and legible routes.
VERDICT: met
EVIDENCE: At `6693aea802f641cf7833073141ec0d5f8824900a`, I checked all four drawings with the pinned XSD, repeated the network-disabled Desktop 32.6.10 export and used `cmp` to match all four delivered SVGs byte for byte. In the Desktop editor I dragged each AWS Public Tier and each OCI-local Proxmox Host and observed the expected child move horizontally and vertically. The four standalone SVGs rendered at 390 by 844 in Chromium and Firefox, and I inspected the full-size screenshots for the fixture icons and connector legibility. The browser check exercised these fixture SVGs on a standalone page.

CRITERION: AC-04 An unavailable prerequisite, asset hash mismatch, failed export or existing destination leaves existing artifacts intact. Two successful renders competing for one unused destination yield one complete set of files and one collision. A retry can publish to a different unused destination.
VERDICT: met
EVIDENCE: At `6693aea802f641cf7833073141ec0d5f8824900a`, `bun test tests/vh-adlc/diagram` passed all six tests. The output tests exercised a missing executable, a changed asset with no renderer invocation, a deliberately failed export, an occupied destination preserved byte for byte, two staged subprocesses yielding one complete publication and one collision, and a successful retry at an unused path. The controlled renderer was used for fault and collision cases.

CRITERION: AC-05 A request with sufficient evidence renders in the same request. A useful partial view renders with the gaps documented. A request whose main relationship cannot be established gets a clarification before writing final output.
VERDICT: met
EVIDENCE: At `6693aea802f641cf7833073141ec0d5f8824900a`, I checked the six completed native session transcripts and their output inventories, matched transcript and artifact digests to the sanitized manifests, and applied committed `gradeDiagram` to all six outputs. Both hosts rendered AWS and the partial OCI-local view in their initial requests. Each asked how the restore connects, which component initiates it and which way traffic travels in the clarification case. Neither clarification directory contained final output.

FINDING: F-01
KIND: factual
SEVERITY: should-fix
WHERE: Test Plan AC-02 and tests/vh-adlc/diagram/grade.ts
EVIDENCE: The accepted proof requires bidirectional mapping and rejection of unrelated components. `grade.ts` lines 31-40 look up brief entries in the diagram, and line 56 counts connectors. In an isolated copy of the AWS fixture output, I added an unlisted visible Log Bucket vertex to the drawing without changing the brief. `gradeDiagram` still returned an empty failure list.
PROPOSAL: Check for unmapped semantic vertices or record an explicit manual reverse-mapping check in the proof. Add the unlisted Log Bucket as a negative control.

FINDING: F-02
KIND: factual
SEVERITY: should-fix
WHERE: Frontmatter covers and Test Plan AC-01
EVIDENCE: The feature changes `tests/vh-adlc/maintenance/discovery.test.ts` and `tests/vh-adlc/triage/discovery.test.ts` to account for the installed skill in shared plugin discovery. Neither path is in accepted `covers`. Both are exercised by the repository's `bun test tests/vh-adlc` verification command.
PROPOSAL: Include the two feature-dependent discovery tests in the reviewed coverage, or handle the test change with independently scoped maintenance before relying on it for this feature.

## Sources

- [VitePress AWS diagram agent](https://github.com/michielvha/vitepress/blob/d26f848dfdcc26413cb785858a71940a1ffdf7ee/.claude/agents/aws-diagram-architect.md) documents the existing brief, AWS icon lookup and export pass.
- [draw.io generation reference](https://www.drawio.com/docs/reference/diagram-generation/) documents the XML model and parent-relative geometry.
- [draw.io XML schema at the inspected revision](https://github.com/jgraph/drawio-mcp/blob/310aa3c4826f86f401d11a23f0d691dca60be6d9/shared/mxfile.xsd) defines the structural validation input.
- [draw.io MCP and plugin documentation at the inspected revision](https://github.com/jgraph/drawio-mcp/blob/310aa3c4826f86f401d11a23f0d691dca60be6d9/README.md) describes local Desktop export and layout support.
- [Oracle OCI drawing toolkit](https://docs.oracle.com/en-us/iaas/Content/General/Reference/graphicsfordiagrams.htm) supplies the OCI Library.xml used for the fixture. Verify the extracted file against the digest in Design.
- [draw.io Desktop 32.6.10](https://github.com/jgraph/drawio-desktop/releases/tag/v32.6.10) is the renderer used for the two design samples and the proposed fixture proof.
- [AWS shape index at the inspected revision](https://github.com/jgraph/drawio-mcp/blob/310aa3c4826f86f401d11a23f0d691dca60be6d9/shape-search/search-index.json) identifies the built-in AWS styles used by the sample.
