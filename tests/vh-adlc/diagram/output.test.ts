import { afterEach, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createHash } from "node:crypto";

const tool = resolve(import.meta.dir, "../../../plugins/vh-adlc/skills/vh-adlc-diagram/scripts/export.ts");
const roots: string[] = [];

afterEach(() => {
  for (const dir of roots.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function fixture() {
  const dir = mkdtempSync(join(tmpdir(), "vh-diagram-test-"));
  roots.push(dir);
  const source = join(dir, "source.drawio");
  const brief = join(dir, "source.md");
  const asset = join(dir, "shapes");
  const schema = join(dir, "schema.xsd");
  const renderer = join(dir, "drawio");
  const rendered = join(dir, "rendered");
  const target = join(dir, "diagram");
  writeFileSync(source, '<mxfile><diagram><mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/><mxCell id="a" parent="1" vertex="1"/><mxCell id="b" parent="1" vertex="1"/><mxCell id="link" parent="1" edge="1" source="a" target="b"><mxGeometry relative="1" as="geometry"/></mxCell></root></mxGraphModel></diagram></mxfile>');
  writeFileSync(brief, "# Evidence\n");
  writeFileSync(asset, "shape input");
  writeFileSync(schema, '<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema"><xs:element name="mxfile" type="xs:anyType"/></xs:schema>');
  const digest = (p: string) => createHash("sha256").update(readFileSync(p)).digest("hex");
  writeFileSync(renderer, `#!/bin/sh
set -eu
printf ran >> "${rendered}"
[ "${"$"}{VH_TEST_EXPORT_FAIL:-}" != 1 ] || exit 7
while [ "$1" != --output ]; do shift; done
if [ "${"$"}{VH_TEST_MUTATE_SOURCE:-}" = 1 ]; then printf '\n' >> "$3"; fi
printf '%s' "${"$"}{VH_TEST_SVG:-<svg xmlns='http://www.w3.org/2000/svg' width='20' height='20'><rect width='20' height='20'/></svg>}" > "$2"
`, { mode: 0o700 });
  const args = (destination = target) => [
    "bun", tool, "--diagram", source, "--brief", brief, "--output", destination, "--drawio", renderer,
    "--schema", schema, "--schema-sha256", digest(schema), "--asset", asset, "--asset-sha256", digest(asset),
  ];
  return { dir, source, asset, renderer, rendered, target, args };
}

const run = (args: string[], env = process.env) => Bun.spawnSync(args, { env });

test("publishes the three files and refuses an occupied destination without altering it", () => {
  const f = fixture();
  mkdirSync(f.target);
  writeFileSync(join(f.target, "owner-file"), "keep");
  expect(run(f.args()).stderr.toString()).toContain("destination already exists");
  expect(readdirSync(f.target)).toEqual(["owner-file"]);
  expect(readFileSync(join(f.target, "owner-file"), "utf8")).toBe("keep");
  const retry = join(f.dir, "retry");
  const result = run(f.args(retry));
  expect(result.stderr.toString()).not.toContain("error");
  expect(result.exitCode).toBe(0);
  expect(readdirSync(retry).sort()).toEqual(["architecture.drawio", "architecture.svg", "brief.md"]);
});

test("rejects missing tools, invalid XML references and changed assets before export", () => {
  const f = fixture();
  const args = f.args();
  writeFileSync(f.asset, "changed");
  expect(run(args).stderr.toString()).toContain("SHA-256 mismatch");
  expect(readdirSync(f.dir)).not.toContain("rendered");
  writeFileSync(f.asset, "shape input");
  writeFileSync(f.source, readFileSync(f.source, "utf8").replace('target="b"', 'target="missing"'));
  expect(run(args).stderr.toString()).toContain("cell references");
  expect(readdirSync(f.dir)).not.toContain("rendered");
  rmSync(f.renderer);
  expect(run(args).stderr.toString()).toContain("draw.io executable");
  expect(readdirSync(f.dir)).not.toContain("diagram");
});

test("export failure leaves no final output and a new request can succeed", () => {
  const f = fixture();
  expect(run(f.args(), { ...process.env, VH_TEST_EXPORT_FAIL: "1" }).stderr.toString()).toContain("draw.io export failed");
  expect(readdirSync(f.dir)).not.toContain("diagram");
  expect(readdirSync(f.dir).some(name => name.startsWith(".vh-diagram-"))).toBe(false);
  expect(run(f.args()).exitCode).toBe(0);
});

test("exactly one of two staged exports can publish to the same free path", async () => {
  const f = fixture();
  const original = readFileSync(f.renderer, "utf8");
  const wait = `n=0
while [ "$(wc -c < "${f.rendered}")" -lt 6 ]; do
  n=$((n+1))
  [ "$n" -lt 100 ] || exit 9
  sleep .05
done
`;
  writeFileSync(f.renderer, original.replace("[ \"", wait + "[ \""));
  const children = [0, 1].map(() => Bun.spawn(f.args(), { stdout: "pipe", stderr: "pipe" }));
  const results = await Promise.all(children.map(async child => ({
    code: await child.exited, error: await new Response(child.stderr).text(),
  })));
  expect(results.map(result => result.code).sort()).toEqual([0, 1]);
  expect(results.find(result => result.code === 1)?.error).toContain("destination already exists");
  expect(readFileSync(f.rendered, "utf8")).toBe("ranran");
  expect(readFileSync(join(f.target, "architecture.drawio"), "utf8")).toEqual(readFileSync(f.source, "utf8"));
  expect(readFileSync(join(f.target, "architecture.svg"), "utf8")).toContain("<rect width=");
  expect(readFileSync(join(f.target, "brief.md"), "utf8")).toBe("# Evidence\n");
});

test("a successful renderer exit with only SVG definitions leaves no published diagram", () => {
  const f = fixture();
  const svg = '<svg xmlns="http://www.w3.org/2000/svg"><defs><rect width="20" height="20"/></defs><g/></svg>';
  const result = run(f.args(), { ...process.env, VH_TEST_SVG: svg });
  expect(result.exitCode).toBe(1);
  expect(result.stderr.toString()).toContain("returned an empty or invalid SVG");
  expect(readdirSync(f.dir)).not.toContain("diagram");
  expect(readdirSync(f.dir).some(name => name.startsWith(".vh-diagram-"))).toBe(false);
  expect(run(f.args()).exitCode).toBe(0);
});

test("a renderer that modifies the staged drawing leaves no published diagram", () => {
  const f = fixture();
  const source = readFileSync(f.source, "utf8");
  const result = run(f.args(), { ...process.env, VH_TEST_MUTATE_SOURCE: "1" });
  expect(result.exitCode).toBe(1);
  expect(result.stderr.toString()).toContain("changed the staged drawing");
  expect(readFileSync(f.source, "utf8")).toBe(source);
  expect(readdirSync(f.dir)).not.toContain("diagram");
});
