// Invoked as a subprocess named gh by the labels helper's transport.
// State: { host, repository, actor, labels: [{ name, color, description }] }; every call is logged.
import { appendFileSync, readFileSync, writeFileSync } from "node:fs";

type Label = { name: string; color: string; description: string | null };
const path = process.env.LABELS_FIXTURE;
if (!path) throw new Error("fixture path missing");
const state = JSON.parse(readFileSync(path, "utf8")) as { host: string; repository: string; actor: string; labels: Label[]; issues?: { number: number; title: string; body: string; labels: string[] }[] };
const args = process.argv.slice(2);
const flag = (name: string) => { const i = args.indexOf(name); return i < 0 ? undefined : args[i + 1]; };
const method = flag("-X") ?? "GET";
const input = args.includes("--input") ? readFileSync(0, "utf8") : "";
appendFileSync(path + ".calls", JSON.stringify({ method, args, input: input ? JSON.parse(input) : null }) + "\n");
const refuse = (message: string): never => { process.stderr.write(message); process.exit(1); };
if (args[0] !== "api" || flag("--hostname") !== state.host) refuse("unexpected host");
const endpoint = args.find((arg) => arg.startsWith("repos/") || arg === "user");
if (!endpoint) refuse("unexpected request");
const out = (value: unknown) => writeFileSync(1, JSON.stringify(value));
if (endpoint === "user") { out({ login: state.actor }); process.exit(0); }
const save = () => writeFileSync(path, JSON.stringify(state));
if (method === "POST" && endpoint === `repos/${state.repository}/issues`) {
  // GitHub would create a missing label implicitly; record the request exactly as sent.
  const body = JSON.parse(input) as { title: string; body: string; labels: string[] };
  const issues = state.issues ??= [];
  const number = issues.length + 1;
  issues.push({ number, title: body.title, body: body.body, labels: body.labels });
  save(); out({ number, html_url: `https://${state.host}/${state.repository}/issues/${number}` }); process.exit(0);
}
const prefix = `repos/${state.repository}/labels`;
if (!endpoint!.startsWith(prefix)) refuse("unexpected repository");
if (method === "GET") {
  const url = new URL(endpoint!, "https://fixture.invalid/");
  const size = Number(url.searchParams.get("per_page") ?? 30), page = Number(url.searchParams.get("page") ?? 1);
  out(state.labels.slice((page - 1) * size, page * size));
} else if (method === "POST" && endpoint === prefix) {
  const body = JSON.parse(input) as Label;
  if (state.labels.some((label) => label.name.toLowerCase() === body.name.toLowerCase())) refuse("already_exists");
  state.labels.push({ name: body.name, color: body.color, description: body.description }); save(); out(body);
} else if (method === "PATCH" && endpoint!.startsWith(prefix + "/")) {
  const name = decodeURIComponent(endpoint!.slice(prefix.length + 1));
  const label = state.labels.find((item) => item.name.toLowerCase() === name.toLowerCase());
  if (!label) refuse("not found");
  const body = JSON.parse(input) as Partial<Label>;
  if (body.name !== undefined) refuse("renames are not allowed");
  Object.assign(label!, body); save(); out(label);
} else refuse("unsupported method");
