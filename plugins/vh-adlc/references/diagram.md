# Architecture diagram authoring

## Choose the view

Read the consuming repository instructions and the selected sources. Identify the audience, question and output directory. Ask for missing input when the question or destination cannot be determined. When enough evidence supports a partial view, render it and document the unresolved details.

Use a Markdown brief to record components, boundaries and directed relationships. Cite source paths and line numbers or named passages in supplied notes. Use these tables so reviewers can compare the brief with the editable cells.

| ID | Label | Parent ID | Status | Evidence |
| --- | --- | --- | --- | --- |

| ID | Source ID | Target ID | Label | Status | Evidence |
| --- | --- | --- | --- | --- | --- |

Use `documented` or `proposed` for depicted entries. Use an Unresolved section for missing information and leave those connections undrawn. A dependency can establish an association or order of operations. A traffic arrow needs evidence for the flow and its direction. Include ports and protocols that the source establishes. Limit the diagram to the subject the owner asked about.

## Draw and inspect

Author one uncompressed `mxfile` with a single `diagram` and `mxGraphModel`. Use the configured local copy of the [draw.io XML reference](https://github.com/jgraph/drawio-mcp/blob/310aa3c4826f86f401d11a23f0d691dca60be6d9/shared/xml-reference.md) when available. Use the brief IDs on primary cells. Place nested shapes under actual container cells with parent-relative coordinates. Use separate IDs for decorative shapes and labels. Connect edges to the primary component cells and put the connector label on the edge so it follows edits. Use the normal root layer cells with IDs `0` and `1`.

Plan a reading order and give connectors room for their labels at documentation width. Use a visible legend or explicit text for proposed flows. Keep staged drafts in a separate working directory. Use AWS styles selected from the configured local shape index. For OCI, use the matching licensed shape from the configured draw.io library and embed its cells so the result opens locally. A compressed OCI library entry decodes from Base64 through raw deflate and URL decoding into an XML graph model. Bring over its visual cells with unique IDs and valid parent references. Keep its icon descendants under the corresponding component. Use labeled generic shapes for local or unmapped components. Keep asset references local and self-contained for export.

## Verify and deliver locally

The host supplies Bun, `xmllint`, GNU coreutils `mv` with `--no-copy` and `--update=none-fail`, draw.io Desktop with a working graphical environment, a local XSD, and the selected provider assets. Use the installed skill's `skills/vh-adlc-diagram/scripts/export.ts` from the command line with these arguments.

```sh
bun <installed-skill>/scripts/export.ts \
  --diagram <working.drawio> --brief <working.md> --output <new-directory> \
  --drawio <absolute-local-drawio-executable> \
  --schema <local-xsd> --schema-sha256 <expected-sha256> \
  --asset <local-provider-input> --asset-sha256 <expected-sha256>
```

Supply each provider asset and its configured expected hash. Validate the local inputs before export. Render to an unused preview destination first and inspect the SVG for routed edges, clipped text, missing icons and overlap. Iterate in the working directory as needed. After review, run the same helper against the final new directory. Each destination must have an existing parent directory. The helper delivers `brief.md`, `architecture.drawio` and `architecture.svg` together. It reports a missing prerequisite, an export failure or an occupied destination. Use a different unused destination when retrying. Record the Desktop version and asset hashes if collecting verification evidence. Keep rendering local and report the three output paths and any unresolved aspects of the view.
