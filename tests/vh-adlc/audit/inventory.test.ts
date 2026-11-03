import { afterEach, expect, test } from "bun:test";
import { cpSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { inventory, tableCells } from "../../../plugins/vh-adlc/scripts/audit/inventory";
import { loadSettings } from "../../../plugins/vh-adlc/scripts/audit/settings";
import { baseSettings, fixture, git, ledger } from "./fixtures";

const projects: ReturnType<typeof fixture>[] = [];
function project(content = ledger) {
  const f = fixture(); projects.push(f); f.write("docs/audit.md", content); return f;
}
afterEach(() => { for (const f of projects.splice(0)) f.dispose(); });

test("inventory reports recorded states without claiming current verification or mutating the ledger", () => {
  const f = project(), before = git(f.root, "status", "--porcelain"), result = inventory(loadSettings(f.root));
  expect(result.findings.map(row => row.id)).toEqual(["AUD-001", "AUD-002"]);
  expect(result.recorded_counts.OPEN).toBe(1);
  expect(result.recorded_counts.FIXED).toBe(1);
  expect(result.verification).toBe("not-performed");
  expect(result.findings.every(row => row.identity_valid)).toBe(true);
  expect(result.complete).toBe(true);
  expect(result.next_id).toBe("AUD-003");
  expect(readFileSync(join(f.root, "docs/audit.md"), "utf8")).toBe(ledger);
  expect(git(f.root, "status", "--porcelain")).toBe(before);
});

test("secondary heading/prose/code references reserve IDs without creating finding entries", () => {
  const content = ledger.replace("### AUD-001 - Incorrect result", "### AUD-001 - Incorrect result (related to AUD-050)") +
    "\nReference AUD-159.\n\n~~~markdown\n### AUD-200 - A sample, not a real entry\n~~~\n" +
    "\n<!--\n### AUD-300 - A comment, not an entry\n-->\n";
  const result = inventory(loadSettings(project(content).root));
  expect(result.findings.map(row => row.id)).toEqual(["AUD-001", "AUD-002"]);
  expect(result.highest_id).toBe(300);
  expect(result.next_id).toBe("AUD-301");
  expect(result.complete).toBe(true);
});

test("an alternate prefix and the complete standalone example use the same actual inventory", () => {
  const f = project(ledger.replaceAll("AUD-", "SEC-") + "\nUnrelated AUD-999 reference.\n");
  f.settings(baseSettings({ id_prefix: "SEC" }));
  expect(inventory(loadSettings(f.root)).next_id).toBe("SEC-003");
  cpSync(resolve(import.meta.dir, "../../../plugins/vh-adlc/examples/audit/basic"), f.root, { recursive: true });
  const example = inventory(loadSettings(f.root));
  expect(example.findings.map(row => row.id)).toEqual(["AUD-001"]);
  expect(example.complete).toBe(true);
});

test("duplicate index rows and finding sections invalidate only their affected identities", () => {
  const content = ledger.replace("| AUD-002 |", "| AUD-001 | High | Duplicate | OPEN |\n| AUD-002 |") +
    "\n### AUD-001 - Duplicate body\n";
  const result = inventory(loadSettings(project(content).root));
  expect(result.complete).toBe(false);
  expect(result.findings.find(row => row.id === "AUD-001")?.identity_valid).toBe(false);
  expect(result.findings.find(row => row.id === "AUD-002")?.identity_valid).toBe(true);
  expect(result.diagnostics.map(row => row.code)).toContain("duplicate-index");
  expect(result.diagnostics.map(row => row.code)).toContain("duplicate-entry");
});

test("index-only and entry-only IDs remain visible and cannot acquire valid terminal identity", () => {
  const content = ledger.slice(0, ledger.indexOf("### AUD-002")) + "\n### AUD-003 - Unindexed finding\n";
  const result = inventory(loadSettings(project(content).root));
  expect(result.findings.find(row => row.id === "AUD-002")?.identity_valid).toBe(false);
  expect(result.findings.find(row => row.id === "AUD-003")?.identity_valid).toBe(false);
  expect(result.diagnostics.map(row => row.code)).toEqual(expect.arrayContaining(["index-only", "entry-only"]));
  expect(result.next_id).toBe("AUD-004");
});

test("missing or repeated designated index sections are incomplete rather than an empty success", () => {
  for (const content of [ledger.replace("## Severity index", "## Other index"), ledger + "\n## Severity index\n"]) {
    const result = inventory(loadSettings(project(content).root));
    expect(result.complete).toBe(false);
    expect(result.findings.length).toBe(2);
    expect(result.findings.every(row => !row.identity_valid)).toBe(true);
  }
});

test("escaped table pipes preserve the status column and appended states remain historical", () => {
  const content = ledger.replace("Incorrect result | OPEN", "A \\| B result | **OPEN**") +
    "\n"; const f = project(content.replace("Historical observation | FIXED", "Historical observation | ✅ FIXED (old); ⚠️ PARTIAL (new)"));
  const result = inventory(loadSettings(f.root));
  expect(result.findings[0].recorded_status).toBe("OPEN");
  expect(result.findings[1].recorded_status).toBe("PARTIAL");
  expect(result.verification).toBe("not-performed");
});

test("ambiguous status, unsafe numeric IDs and equivalent numeric identities never yield a safe allocation", () => {
  const f = project(ledger.replace("Historical observation | FIXED", "Historical observation | not FIXED") +
    "\n### AUD-1 - Duplicate numeric identity\n\nReference AUD-99999999999999999999999.\n");
  const result = inventory(loadSettings(f.root));
  expect(result.findings.find(row => row.id === "AUD-002")?.recorded_status).toBe("UNKNOWN");
  expect(result.findings.find(row => row.id === "AUD-001")?.identity_valid).toBe(false);
  expect(result.next_id).toBeNull();
  expect(result.complete).toBe(false);
});

test("an escaped final pipe stays inside the final cell when the closing delimiter is omitted", () => {
  expect(tableCells("| AUD-001 | High | Finding | OPEN\\|")).toEqual(["AUD-001", "High", "Finding", "OPEN|"]);
});

test("an overlong numeric finding spelling is not a valid identity even when its numeric value is small", () => {
  const id = "AUD-00000000000000001";
  const result = inventory(loadSettings(project(ledger.replaceAll("AUD-001", id)).root));
  expect(result.findings.find(row => row.id === id)?.identity_valid).toBe(false);
  expect(result.next_id).toBeNull();
});

test("legacy title-column annotations preserve historical status without matching ordinary title words", () => {
  const text = ledger.replace("| ID | Sev | Finding | Status |", "| ID | Sev | Area | Title |")
    .replace("| AUD-001 | High | Incorrect result | OPEN |", "| AUD-001 | High | Example | A result is not fixed-width - ✅ **FIXED (old)** - ⚠️ **PARTIAL (new)** |")
    .replace("| AUD-002 | Low | Historical observation | FIXED |", "| AUD-002 | Low | Example | A fixed-width issue awaits assessment |");
  const result = inventory(loadSettings(project(text).root));
  expect(result.findings[0].recorded_status).toBe("PARTIAL");
  expect(result.findings[0].recorded_status_text).not.toContain("fixed-width");
  expect(result.findings[1].recorded_status).toBe("OPEN");
  expect(result.complete).toBe(true);
});

test("compressed ranges expose every reserved ID without inventing per-member verification", () => {
  const text = ledger.replace("| AUD-002 |", "| AUD-003..AUD-005 | Low | Historical group | FIXED |\n| AUD-002 |");
  const result = inventory(loadSettings(project(text).root));
  for (const id of ["AUD-003", "AUD-004", "AUD-005"]) {
    expect(result.findings.find(row => row.id === id)?.aggregate).toBe(true);
    expect(result.findings.find(row => row.id === id)?.identity_valid).toBe(false);
  }
  expect(result.next_id).toBe("AUD-006");
  expect(result.complete).toBe(false);
  expect(result.range_summaries).toHaveLength(1);
});


test("an inline comment opener cannot hide a subsequent rendered finding heading", () => {
  const text=ledger.replace("### AUD-002", "Context <!-- note\n### AUD-002")+"\n-->\n";
  expect(Bun.markdown.html(text)).toContain("<h3>AUD-002");
  const result=inventory(loadSettings(project(text).root));
  expect(result.findings.find(row=>row.id==="AUD-002")?.identity_valid).toBe(true);
});


test("an invalid backtick fence does not hide an actual rendered finding", () => {
  const text=ledger.replace("### AUD-002","```example`invalid\n### AUD-002")+"\n```\n";
  expect(Bun.markdown.html(text)).toContain("<h3>AUD-002");
  expect(inventory(loadSettings(project(text).root)).findings.find(row=>row.id==="AUD-002")?.identity_valid).toBe(true);
});
