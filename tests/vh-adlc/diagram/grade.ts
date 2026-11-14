import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import type { Fixture } from "./fixtures";

export function gradeDiagram(fixture: Fixture, output: string, response: string): string[] {
  if (fixture.shapes.length === 0) {
    const failures = [];
    if (existsSync(output)) failures.push("Clarification case wrote a final directory");
    if (!/restore/i.test(response) || !/\?|need|confirm|provide|clarif/i.test(response)) failures.push("Response did not ask about the missing restore information");
    return failures;
  }
  if (!existsSync(output)) return ["Missing final diagram directory"];
  const files = readdirSync(output).sort().join(",");
  if (files !== "architecture.drawio,architecture.svg,brief.md") return ["Incomplete diagram directory"];
  const brief = readFileSync(join(output, "brief.md"), "utf8");
  const diagram = join(output, "architecture.drawio");
  const failures: string[] = [];
  const xml = readFileSync(diagram, "utf8");
  const rows = brief.split("\n").filter(line => /^\s*\|/.test(line)).map(line =>
    line.trim().replace(/^\||\|$/g, "").split("|").map(value => value.trim().replaceAll("`", "")));
  const depicted = rows.filter(row => [5, 6].includes(row.length) && /^(documented|proposed)$/i.test(row.at(-2) ?? ""));
  const shapes = depicted.filter(row => row.length === 5);
  const links = depicted.filter(row => row.length === 6);
  const ids = new Set<string>();
  if (shapes.length !== fixture.shapes.length || links.length !== fixture.links.length) failures.push("Brief has the wrong number of components, boundaries or connectors");
  const xpath = (query: string) => {
    const result = Bun.spawnSync(["xmllint", "--nonet", "--xpath", query, diagram], { stdout: "pipe", stderr: "pipe" });
    if (result.exitCode) throw Error("Unable to inspect delivered draw.io XML");
    return result.stdout.toString().trim();
  };
  const cell = (id: string) => "(/mxfile/diagram/mxGraphModel/root/*[@id='" + id + "'][self::mxCell] | /mxfile/diagram/mxGraphModel/root/*[@id='" + id + "'][self::object or self::UserObject]/mxCell)";
  for (const row of depicted) {
    const id = row[0];
    if (!/^[A-Za-z0-9_.:-]+$/.test(id) || ids.has(id)) return ["Invalid or duplicate brief ID"];
    ids.add(id);
    const evidence = [...row.at(-1)!.matchAll(/sources\.md(?:[: #]+L?)(\d+)/gi)];
    if (evidence.length === 0 || evidence.some(match => Number(match[1]) < 1 || Number(match[1]) > fixture.source.trimEnd().split("\n").length)) {
      failures.push("Missing or invalid citation for " + id);
    }
    if (xpath("count(" + cell(id) + ")") !== "1") failures.push("Missing primary cell " + id);
  }
  const role = (label: string) => {
    const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();
    const expected = norm(label);
    return shapes.find(row => norm(row[1]) === expected || norm(row[1]).startsWith(expected + " "));
  };
  for (const shape of fixture.shapes) {
    const row = role(shape.label);
    if (!row) {
      failures.push("Missing role " + shape.label);
      continue;
    }
    const parent = shape.parent ? role(shape.parent)?.[0] : "1";
    if (xpath("string(" + cell(row[0]) + "/@parent)") !== parent) failures.push("Wrong parent for " + shape.label);
    if ((shape.parent && row[2].split(/\s+/)[0] !== parent) || (!shape.parent && ids.has(row[2]))) failures.push("Brief parent differs for " + shape.label);
    if (shape.icon) {
      const pending = [row[0]];
      const seen = new Set<string>();
      let found = false;
      while (pending.length && !found) {
        const id = pending.pop();
        if (!id || seen.has(id) || !/^[A-Za-z0-9_.:-]+$/.test(id)) continue;
        seen.add(id);
        const style = xpath("string(" + cell(id) + "/@style)");
        found = style.includes(shape.icon);
        if (!found) {
          const children = "/mxfile/diagram/mxGraphModel/root/*[@parent='" + id + "' or mxCell/@parent='" + id + "']/@id";
          const attributes = xpath("count(" + children + ")") === "0" ? "" : xpath(children);
          pending.push(...[...attributes.matchAll(/id="([^"]+)"/g)].map(match => match[1]));
        }
      }
      if (!found) failures.push("Missing expected icon for " + shape.label);
    }
  }
  if (xpath("count(//mxCell[@edge='1'])") !== String(links.length)) failures.push("Unmapped connector in the drawing");
  for (const link of fixture.links) {
    const from = role(link.from)?.[0];
    const to = role(link.to)?.[0];
    const row = links.find(entry => entry[1] === from && entry[2] === to);
    if (!row) {
      failures.push("Missing connector " + link.from + " to " + link.to);
      continue;
    }
    const edge = cell(row[0]);
    const label = xpath("string(" + edge + "/@value)");
    if (xpath("string(" + edge + "/@source)") !== from || xpath("string(" + edge + "/@target)") !== to) failures.push("Connector endpoints differ from the brief");
    const visiblePorts = label.match(/\b\d{2,5}\b/g) ?? [];
    if (link.port ? !visiblePorts.includes(link.port) || visiblePorts.some(port => port !== link.port) : visiblePorts.length > 0) failures.push("Wrong or unsupported port on " + row[0]);
    if (link.proposed) {
      if (row[4].toLowerCase() !== "proposed" || !/proposed/i.test(xml)) failures.push("Missing proposed flow marking");
    } else if (row[4].toLowerCase() !== "documented") failures.push("Documented flow has the wrong status");
  }
  // The fixture names the excluded dependency explicitly. Catch it even if it
  // has no brief row, then inspect all remaining unlisted helper cells visually.
  if (fixture.name === "aws" && xpath("count(//mxCell[@vertex='1' and contains(translate(@value, 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz'), 'log bucket') and not(starts-with(@style, 'text;'))])") !== "0") {
    failures.push("The deployment-only Log Bucket appears as a component");
  }
  if (fixture.gap && !brief.toLowerCase().includes(fixture.gap)) failures.push("Missing unresolved detail in the brief");
  return failures;
}
