import { createHash } from "node:crypto";
import { constants, accessSync, copyFileSync, lstatSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { parseArgs } from "node:util";

function command(args: string[], description: string): string {
  const result = Bun.spawnSync(args, { stdout: "pipe", stderr: "pipe", timeout: 60_000 });
  if (result.exitCode !== 0) {
    const detail = result.exitedDueToTimeout
      ? "command timed out after 60 seconds"
      : result.stderr.toString().trim().slice(0, 1600) || (result.signalCode ?? "exit " + result.exitCode);
    throw new Error(description + ": " + detail);
  }
  return result.stdout.toString().trim();
}

function present(path: string): boolean {
  try {
    lstatSync(path);
    return true;
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return false;
    throw error;
  }
}

function digestFile(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function verifyHash(path: string, expected: string): void {
  if (!/^[0-9a-f]{64}$/.test(expected)) throw new Error("Expected a lowercase SHA-256 for " + path);
  if (!present(path)) throw new Error("Missing configured asset: " + path);
  const actual = digestFile(path);
  if (actual !== expected) throw new Error("SHA-256 mismatch: " + path);
}

function validateFile(path: string, kind: "diagram" | "svg", schema?: string): void {
  const source = readFileSync(path, "utf8");
  // Desktop emits the standard SVG 1.1 public identifier. The parser does not load it.
  const checked = kind === "svg" ? source.replace('<!DOCTYPE svg PUBLIC "-//W3C//DTD SVG 1.1//EN" "http://www.w3.org/Graphics/SVG/1.1/DTD/svg11.dtd">', "") : source;
  if (/<!DOCTYPE|<!ENTITY/i.test(checked)) throw new Error("Document type and entity declarations are unsupported: " + path);
  if (kind === "svg") {
    const root = "/*[local-name()='svg' and namespace-uri()='http://www.w3.org/2000/svg']";
    const graphic = "contains('|path|rect|circle|ellipse|line|polyline|polygon|text|image|use|foreignObject|', concat('|', local-name(), '|'))";
    const definition = "ancestor::*[contains('|defs|clipPath|mask|marker|pattern|symbol|', concat('|', local-name(), '|'))]";
    const count = command(["xmllint", "--nonet", "--xpath", "count(" + root + "//*[namespace-uri()='http://www.w3.org/2000/svg' and " + graphic + " and not(" + definition + ")])", path], "SVG validation failed");
    if (!(Number(count) > 0)) throw new Error("draw.io export returned an empty or invalid SVG");
    return;
  }

  if (!schema) throw new Error("Missing diagram schema");
  command(["xmllint", "--nonet", "--noout", "--schema", schema, path], "draw.io XML validation failed");
  const root = "/mxfile/diagram/mxGraphModel/root";
  const xpath = (query: string) => command(["xmllint", "--nonet", "--xpath", query, path], "draw.io cell references could not be validated");
  if (xpath("count(/mxfile/diagram)") !== "1" || xpath("count(" + root + ")") !== "1") {
    throw new Error("Expected one uncompressed draw.io page");
  }

  // Normalize only for querying IDs. Wrapped UserObject cells own the outer ID.
  const cells = root + "/mxCell | " + root + "/*[self::object or self::UserObject]/mxCell";
  const ids = root + "/*[self::mxCell or self::object or self::UserObject]/@id";
  const structure = "count(" + root + "/mxCell[@id='0' and not(@parent)]) = 1 and count(" + root + "/mxCell[@id='1' and @parent='0']) = 1";
  const bad = "(" + cells + ")[(@parent and not(@parent = " + ids + ")) or (@source and not(@source = " + ids + ")) or (@target and not(@target = " + ids + ")) or (@edge='1' and not(@source and @target))]";
  const duplicate = root + "/*[@id = preceding-sibling::*/@id]";
  if (xpath("boolean(" + structure + " and count(" + bad + ") = 0 and count(" + duplicate + ") = 0)") !== "true") {
    throw new Error("Invalid draw.io cell references or duplicate IDs");
  }
}

function main() {
  const { values } = parseArgs({
    options: {
      diagram: { type: "string" },
      brief: { type: "string" },
      output: { type: "string" },
      drawio: { type: "string" },
      schema: { type: "string" },
      "schema-sha256": { type: "string" },
      asset: { type: "string", multiple: true },
      "asset-sha256": { type: "string", multiple: true },
    },
  });
  const { diagram, brief, output, drawio, schema, asset = [] } = values;
  const schemaHash = values["schema-sha256"];
  const assetHashes = values["asset-sha256"] ?? [];
  if (!diagram || !brief || !output || !drawio || !schema || !schemaHash || asset.length !== assetHashes.length) {
    throw new Error("Provide --diagram, --brief, --output, --drawio, --schema and --schema-sha256, with one --asset-sha256 per --asset");
  }
  if (!isAbsolute(drawio)) throw new Error("The draw.io executable path must be absolute");
  try {
    accessSync(drawio, constants.X_OK);
  } catch {
    throw new Error("Missing or inaccessible draw.io executable: " + drawio);
  }
  const destination = resolve(output);
  if (present(destination)) throw new Error("destination already exists: " + destination);
  const schemaPath = resolve(schema);
  verifyHash(schemaPath, schemaHash);
  for (const [index, assetPath] of asset.entries()) verifyHash(resolve(assetPath), assetHashes[index]);

  const staging = mkdtempSync(join(dirname(destination), ".vh-diagram-"));
  try {
    const saved = join(staging, "architecture.drawio");
    const svg = join(staging, "architecture.svg");
    copyFileSync(diagram, saved);
    const savedBrief = join(staging, "brief.md");
    copyFileSync(brief, savedBrief);
    if (!readFileSync(savedBrief, "utf8").trim()) throw new Error("The brief is empty");
    validateFile(saved, "diagram", schemaPath);
    const validatedDrawing = digestFile(saved);
    command([drawio, "--export", "--format", "svg", "--border", "12", "--output", svg, saved], "draw.io export failed (check the local graphical environment)");
    if (digestFile(saved) !== validatedDrawing) throw new Error("draw.io export changed the staged drawing");
    if (!present(svg)) throw new Error("draw.io export failed to produce an SVG");
    validateFile(svg, "svg");
    try {
      command(["mv", "--no-target-directory", "--update=none-fail", "--no-copy", "--", staging, destination], "Publishing requires GNU mv with atomic no-replace support");
    } catch (error) {
      if (present(destination)) throw new Error("destination already exists: " + destination);
      throw error;
    }
    console.log(destination);
  } finally {
    rmSync(staging, { recursive: true, force: true });
  }
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
