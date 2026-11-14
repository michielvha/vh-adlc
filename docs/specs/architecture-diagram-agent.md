---
status: draft
status_description: "Awaiting decisions on the first provider fixtures and the brief approval step after the first independent spec review."
issue: null
goal: "From a design brief or repository sources, the shared vh-adlc plugin produces an evidence-backed architecture diagram that the owner can edit in draw.io and embed in documentation."
covers:
  - plugins/vh-adlc/skills/vh-adlc-diagram/
  - plugins/vh-adlc/references/diagram.md
  - plugins/vh-adlc/plugin.json
  - plugins/vh-adlc/.claude-plugin/plugin.json
  - docs/reference/marketplace.md
  - docs/user-guides/workflows.md
  - tests/vh-adlc/diagram/
---

# Plan: Architecture diagram agent

A shared plugin skill turns a diagram request and its sources into one editable draw.io view, an SVG, and a brief that explains the visible components and relationships.

## Context

### Owner summary

VitePress has a Claude-specific agent for AWS architecture. It already uses a short flows-and-ports brief, native AWS shapes and a render-and-inspect pass. Engineers should be able to ask for the same kind of focused diagram from either Codex or Claude, using a design brief or repository files. The shared skill would choose the components that answer the question and deliver three files together. The Markdown brief makes the evidence reviewable, the draw.io file stays editable, and its SVG can go in the project documentation.

The agent decides which relationships to show and how to explain them. Each depicted relationship has a source or a visible label that identifies it as proposed. When the sources leave a link uncertain, the brief records the gap. Drawing and export use local tools. The project chooses the destination and controls any publication. Stackgraph stays a standalone deterministic tool. FlowStory playback and VitePress adoption can use the results of this first feature.

The proposed proof uses an AWS request path grounded in fixture source and an OCI-to-local design grounded in a written fixture brief. The owner can add an Azure fixture to prove that provider in the first release. The other decision is whether to render in the same request when sources are sufficient or wait for the owner to approve the brief. Verification will exercise real marketplace installs of the candidate in Codex and Claude, compare the diagram with the fixture, and open and export the saved file in draw.io. Those checks and an independent spec review are pending. Acceptance approves implementing and testing the agreed scope under the feature lifecycle. Shipping and merging retain their separate approvals.

### Background

- The VitePress agent takes a discovered or supplied flows-and-ports brief, applies AWS visual conventions and exports a PNG for review. Its tool list names the Claude MCP tool directly. Its instructions place every cell on the default layer, so the shared workflow needs to prove that groups behave as editable containers. [VitePress agent at the observed main revision](https://github.com/michielvha/vitepress/blob/d26f848dfdcc26413cb785858a71940a1ffdf7ee/.claude/agents/aws-diagram-architect.md#L24-L43)
- On vh-adlc main at [`e2785fe`](https://github.com/michielvha/vh-adlc/commit/e2785fef4d5227068168e9595aa847b0fc45fc44), `vh-adlc find --slug architecture-diagram-agent` returned an empty document list. The blog reference uses visuals in articles. The marketplace catalogs already point both supported hosts at the same plugin source. [Blog reference](../../plugins/vh-adlc/references/blog.md#L51) · [Marketplace reference](../reference/marketplace.md#L19)
- The draw.io Desktop exporter provides local SVG export and layout options. Its XML reference describes parent-relative geometry and a schema for format checks. These upstream capabilities still need proof with the selected runtime and fixtures. [draw.io generation reference](https://www.drawio.com/docs/reference/diagram-generation/) · [Local export](https://github.com/jgraph/drawio-mcp/blob/310aa3c4826f86f401d11a23f0d691dca60be6d9/README.md#diagram-layouts)

## Scope

Deliver architecture diagram authoring on explicit request through the existing shared vh-adlc marketplace plugin. Cover current architecture from selected repository evidence and proposed architecture from an owner-supplied brief. Deliver one diagram view per request. The first verified provider scope is Q1.

Consumer adoption, Stackgraph, Mermaid rendering, interactive playback, live cloud discovery, and importing or regenerating existing diagrams are outside this feature. The drawable scope of an unmapped provider or local component is a labeled generic shape.

## Design

### Request and evidence

Add `vh-adlc-diagram` as a skill in the existing package. Keep the procedure in the shared plugin so its Codex and Claude installs read the same rules. The request supplies a diagram question or subject, a brief or source scope, and an output destination. Follow the consuming repository's rules for paths and asset placement. Ask for the missing input when the agent cannot identify the intended architecture or write destination.

Read the selected sources and prepare a Markdown brief. Identify the view, source files or supplied notes, components, boundaries and directed flows. Give each depicted item a stable identifier within the view. Cite a source location for each documented component, containment relationship and flow. Mark design proposals in the brief and on the diagram. Record unresolved links in the brief and omit their arrows. Preserve protocols, ports and route labels when the sources establish them. An infrastructure dependency supports a dependency or association and needs separate evidence to be drawn as request or data traffic.

| Term | Meaning |
| --- | --- |
| Brief | The Markdown record of the view, its sources and unresolved items. |
| Proposed | A component or connection described as intended in the design. |
| Unresolved | A detail for which the available material leaves the component, placement or relationship uncertain. |

Apply the chosen brief approval behavior in Q2. If the selected sources support a useful partial view, document the gaps and show only the supported or explicitly proposed elements. Ask for clarification if the missing information prevents answering the diagram question.

### Editable diagram and export

The agent authors one page of uncompressed draw.io XML using the pinned upstream format reference. It uses stable cell IDs, parent-relative geometry and actual parent cells for nested boundaries. Use verified provider shapes for the fixtures chosen in Q1. Use clear labels for local and unmapped components. Distinguish associations and proposed flows through labels or a legend that stays understandable without color. Arrange the diagram to emphasize the requested path and make labels readable at the intended documentation width.

Use the local draw.io Desktop export path with a recorded version. Compare the saved geometry with the exported SVG and use the same saved file for subsequent exports. Validate XML structure, unique IDs and resolvable group and connector references. Check the displayed results for missing shapes, overlapping labels, clipped text and misleading edges. Use the upstream renderer and format checks as tools for the agent's output. The agent owns the choice of view, meaning of relationships and layout adjustments.

Work in a separate staging directory for each request. Create the final files under a new output directory in the requested location after all three are ready. Publish the directory with a single no-replace operation on the same filesystem. A collision leaves the existing output intact. A failed or interrupted render leaves the final destination untouched and reports the failure. A retry uses a clean staging directory and a new or still-unused destination. Independent requests can run concurrently in their own staging directories. Local file formats remain readable after a plugin upgrade or rollback, and earlier artifacts stay in place. Rendering uses a local exporter and local shapes so repository content stays out of hosted draw.io requests. The plugin includes no hosted export fallback.

### Delivery

The existing vhco-tools Codex and Claude catalogs both source `plugins/vh-adlc`. Update the two manifest versions together and document the operation in the user workflow. Before feature merge, exercise the actual catalog install from the candidate checkout in isolated Codex and Claude profiles, then run the native-host proofs against those installs. Before claiming marketplace availability or adopting the skill in VitePress, verify discovery from the published marketplace source. The packaged change is a plugin skill and supporting files. It requires no Go binary changes. [Codex marketplace](../../.agents/plugins/marketplace.json) · [Claude marketplace](../../.claude-plugin/marketplace.json) · [Marketplace migration precedent](../reference/marketplace.md#L34)

## Acceptance Criteria

- [ ] AC-01: An explicit architecture diagram request reaches the same shared workflow in Codex and Claude when each installs the candidate from its vhco-tools marketplace catalog.
- [ ] AC-02: The first-release fixtures in Q1 produce diagrams whose depicted scope, components, boundaries and arrows agree with their evidence or carry the proposed label, with unresolved relationships visible in the brief.
- [ ] AC-03: A successful request produces a brief, an editable native draw.io file with movable nested groups, and a matching local SVG with recognizable fixture icons, readable labels and legible routes.
- [ ] AC-04: A failed export, colliding destination or concurrent request leaves any existing final artifacts intact. Retrying can produce a complete output at an unused destination.
- [ ] AC-05: A request with sufficient evidence follows the brief approval behavior in Q2, and a request with insufficient evidence to answer the user's question identifies what is needed before writing a final output.

## Test Plan

| Criterion | Proof |
| --- | --- |
| AC-01 | `bun tests/vh-adlc/diagram/run.ts --host codex --case install` and the same with `--host claude`. Use isolated profiles pointing at the candidate marketplace catalogs. Verify the installed plugin revision and shared skill discovery in a fresh native session. Keep redacted transcripts and the install manifest under the runner's temporary evidence directory. |
| AC-02 | Run `bun tests/vh-adlc/diagram/run.ts --host <codex-or-claude> --case fixtures` on each host. Use an AWS repository fixture with an ingress rule, application, datastore, unrelated resource and dependency-only decoy. Use a written OCI-to-local fixture naming a proposed route and an unresolved connection. Include the Azure fixture if selected in Q1. Compare IDs, endpoints, roles, status, source spans and depicted hierarchy to the committed fixture expectations. An unrelated node, asserted decoy traffic arrow, invented port or unresolved arrow fails. Retain redacted transcripts, brief, draw.io, SVG and command manifest in the runner's evidence directory. |
| AC-03 | From both hosts' fixture outputs, check the upstream XSD and resolve every edge and parent ID. Open each file in the pinned draw.io editor, move a boundary and confirm its children move with it. Export the original file twice with the pinned Desktop path and compare visible structure and geometry. Inspect each SVG at documentation width for missing shapes, overlap, clipping and ambiguous edge labels, and at a phone viewport to check that the preview remains readable when opened or zoomed. Retain export settings, captures and findings. |
| AC-04 | `bun test tests/vh-adlc/diagram` exercises the output finalization with a deliberately failing export, an existing output directory, two processes targeting the same destination and a retry at an unused destination. Verify the original files byte for byte, inventory the completed output, and assert that failed jobs expose no partial final directory. |
| AC-05 | `bun tests/vh-adlc/diagram/run.ts --host <codex-or-claude> --case intake` runs one sufficient fixture and one fixture missing the information needed to determine the main link. The sufficient case follows Q2. The insufficient case identifies the missing link and leaves no final diagram. Save each redacted transcript and the output file inventory. |

## Tasks

None yet; written once the document is planned.

## Open Questions

### Q1: Which providers should the first release verify with fixtures?

**Recommendation:** A. AWS and OCI-to-local demonstrate source-driven authoring and a hybrid design in two fixtures.

| Option | You get | It costs |
| --- | --- | --- |
| **A. AWS and OCI-to-local** | Native AWS and OCI shapes plus generic local components, with two distinct input modes. | Azure stays unverified until a subsequent fixture. |
| **B. Add Azure** | A third fixture verifies native Azure shapes and a documented Azure dependency or flow. | A third source fixture, two more native agent trials and another editor review. |

**Why this is yours:** This sets the provider support claims for the first release.

### Q2: Should the agent wait for the owner to approve the brief when the sources already support the requested view?

**Recommendation:** A. Complete an on-demand request in the same session and leave the brief available for review.

| Option | You get | It costs |
| --- | --- | --- |
| **A. Render in the same request** | One request produces the brief, editable file and SVG. | The owner reviews the selection of components and relationships after rendering. |
| **B. Wait for brief approval** | The owner can correct the view before the agent lays it out. | Every new diagram requires a second interaction, even when the sources are clear. |

**Why this is yours:** This sets how much control the owner has before an on-demand render.

## Review Log

| Date | Review | Kind | Commit | Model | Isolation | Outcome |
| --- | --- | --- | --- | --- | --- | --- |

| 2026-11-14 | R-1 | spec | `ed00017463b84fed13b97546271f7bda6dd299e1` | unknown | procedural | Six should-fix findings |

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

## Sources

- [VitePress AWS diagram agent](https://github.com/michielvha/vitepress/blob/d26f848dfdcc26413cb785858a71940a1ffdf7ee/.claude/agents/aws-diagram-architect.md) documents the existing brief, AWS icon lookup and export pass.
- [draw.io generation reference](https://www.drawio.com/docs/reference/diagram-generation/) documents the XML model and parent-relative geometry.
- [draw.io XML schema at the inspected revision](https://github.com/jgraph/drawio-mcp/blob/310aa3c4826f86f401d11a23f0d691dca60be6d9/shared/mxfile.xsd) defines the structural validation input.
- [draw.io MCP and plugin documentation at the inspected revision](https://github.com/jgraph/drawio-mcp/blob/310aa3c4826f86f401d11a23f0d691dca60be6d9/README.md) describes local Desktop export and layout support.
