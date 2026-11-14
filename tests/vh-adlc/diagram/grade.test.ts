import { expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gradeDiagram } from "./grade";

test("legend samples do not count as traffic and extra arrows between depicted components still fail", () => {
  const output = mkdtempSync(join(tmpdir(), "vh-diagram-grade-"));
  try {
    const fixture = {
      name: "aws",
      source: "Client sends HTTPS 443 to the API.\n",
      question: "Show the request",
      shapes: [{ label: "Client" }, { label: "API" }],
      links: [{ from: "Client", to: "API", port: "443" }],
    };
    const drawing = join(output, "architecture.drawio");
    const page = (extra: string) => `<mxfile><diagram><mxGraphModel><root>
      <mxCell id="0"/><mxCell id="1" parent="0"/>
      <mxCell id="client" parent="1" vertex="1" value="Client"/>
      <mxCell id="api" parent="1" vertex="1" value="API"/>
      <mxCell id="call" parent="1" edge="1" source="client" target="api" value="HTTPS 443"/>
      <mxCell id="legend-a" parent="1" vertex="1"/>
      <mxCell id="legend-b" parent="1" vertex="1"/>
      <mxCell id="legend-example" parent="1" edge="1" source="legend-a" target="legend-b"/>
      ${extra}
    </root></mxGraphModel></diagram></mxfile>`;
    writeFileSync(join(output, "brief.md"), `
| client | Client | 1 | documented | sources.md:1 |
| api | API | 1 | documented | sources.md:1 |
| call | client | api | HTTPS 443 | documented | sources.md:1 |
`);
    writeFileSync(join(output, "architecture.svg"), '<svg xmlns="http://www.w3.org/2000/svg"/>');
    writeFileSync(drawing, page('<mxCell id="scope-note" parent="1" vertex="1" style="html=1;text;strokeColor=none" value="Log Bucket excluded"/>'));
    expect(gradeDiagram(fixture, output, "")).toEqual([]);

    writeFileSync(drawing, page('<mxCell id="unexpected" parent="1" edge="1" source="api" target="client"/>'));
    expect(gradeDiagram(fixture, output, "")).toContain("Unmapped connector in the drawing");

    writeFileSync(drawing, page('<mxCell id="unmapped" parent="1" vertex="1" style="rounded=1" value="Log Bucket"/>'));
    expect(gradeDiagram(fixture, output, "")).toContain("The deployment-only Log Bucket appears as a component");

    writeFileSync(join(output, "brief.md"), "# Missing evidence rows\n");
    expect(gradeDiagram(fixture, output, "")).toContain("Brief has the wrong number of components, boundaries or connectors");
  } finally {
    rmSync(output, { recursive: true, force: true });
  }
});
