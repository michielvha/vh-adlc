import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { stringify } from "yaml";

export const origin = "https://example.test";
export const capturedAt = "2026-11-18T10:00:00Z";
export const sha = (value: string | Uint8Array) => createHash("sha256").update(value).digest("hex");
export function captured(path = "/", body_file = "page.html") {
  return { requested_url: origin + path, final_url: origin + path, outcome: "captured", mode: "initial", observed_at: capturedAt, status: 200, content_type: "text/html", headers: {}, body_file };
}
export async function fixture(html = "<html lang='en'><title>Example</title><main><h1>Hello</h1></main></html>") {
  const dir = await mkdtemp(join(tmpdir(), "seo-evidence-test-"));
  const body = Buffer.from(html);
  const data: Record<string, unknown> = { schema_version: 1, captured_at: capturedAt, origins: [origin], entry_urls: [origin + "/"], pages: [captured()], files: [{ path: "page.html", sha256: sha(body) }] };
  const input = join(dir, "bundle.yaml");
  await writeFile(join(dir, "page.html"), body);
  const save = async () => writeFile(input, stringify(data));
  await save();
  return { dir, input, data, save };
}
