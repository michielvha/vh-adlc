// Collection example using only Node built-ins. Detector policy belongs to this consumer.
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, posix, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repo = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const hash = bytes => createHash("sha256").update(bytes).digest("hex");
const option = name => {
  const index = process.argv.indexOf(name);
  if (index < 0 || !process.argv[index + 1]) throw Error("Required scanner option " + name);
  return process.argv[index + 1];
};
const bindingsBytes = readFileSync(option("--protocol-bindings"));
const bindings = JSON.parse(bindingsBytes);
if (!/^[a-f0-9]{40}(?:[a-f0-9]{24})?$/u.test(bindings.source_commit)) throw Error("Immutable source required");
const source = bindings.source_commit;
const git = (...argv) => execFileSync("git", argv, { cwd: repo });
const blob = path => git("show", source + ":" + path);
const paths = git("ls-tree", "-r", "--name-only", "-z", source).toString("utf8").split("\0");
if (paths.pop() !== "") throw Error("Complete Git inventory required");
const tracked = new Set(paths);
const files = paths.filter(path => path.startsWith("docs/") && path.endsWith(".md"))
  .sort((left, right) => Buffer.compare(Buffer.from(left), Buffer.from(right)));
const documents = [], findings = [], failures = [];
for (const file of files) {
  try {
    const bytes = blob(file), text = bytes.toString("utf8");
    documents.push({ path: file, sha256: hash(bytes), status: "complete" });
    for (const match of text.matchAll(/\[[^\]]*\]\(([^\s)]+)\)/gu)) {
      const target = match[1].split(/[?#]/u)[0];
      if (!target || /^[A-Za-z][A-Za-z0-9+.-]*:/u.test(target) || target.startsWith("/")) continue;
      const relative = posix.normalize(posix.join(posix.dirname(file), decodeURIComponent(target)));
      if (tracked.has(relative) || paths.some(path => path.startsWith(relative + "/"))) continue;
      findings.push({ id: hash(Buffer.from(file + "\0" + match.index + "\0" + target)), detector: "local-links",
        severity: "warning", document: file, location: { line: text.slice(0, match.index).split("\n").length },
        explanation: "Relative link target is absent from the selected Git tree: " + relative });
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Document collection failed";
    // Preserve a read failure even when other documents were collected successfully.
    if (!documents.some(row => row.path === file)) documents.push({ path: file, sha256: null, status: "failed", error: message });
    failures.push({ path: file, message });
  }
}
const detector = bindings.detectors.find(unit => unit.id === "local-links");
if (!detector) throw Error("Configured local-links binding required");
const execution = { id: "local-links", options: {}, documents: documents.filter(row => row.status === "complete").map(row => [row.path, row.sha256]),
  input_count: documents.filter(row => row.status === "complete").length, input_sha256: detector.input_sha256,
  outcome: failures.length ? "failed" : "complete" };
if (failures.length) execution.error = "A local-links input could not be processed";
writeFileSync(option("--protocol-json"), JSON.stringify({ schema_version: 1, source_commit: source,
  settings_digest: bindings.settings_sha256, bindings_sha256: hash(bindingsBytes),
  scanner: { script_sha256: hash(blob("scripts/docs-scan.mjs")), argv: ["node", "scripts/docs-scan.mjs"] },
  scope: { ...bindings.scope, roots: ["docs"], exclusions: [], suffixes: [".md"], required_detectors: ["local-links"] },
  feedback: [], documents, detectors: [execution], collection_failures: failures,
  findings, suppressed_findings: [], stale_suppressions: [],
}));
