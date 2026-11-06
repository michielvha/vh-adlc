// Invoked as a subprocess named gh by the real coordinator transport.
import { appendFileSync, readFileSync, writeFileSync } from "node:fs";
const path = process.env.PROJECTS_FIXTURE;
if (!path) throw new Error("fixture path missing");
const state = JSON.parse(readFileSync(path, "utf8"));
const request = JSON.parse(readFileSync(0, "utf8"));
const step = state.steps.shift();
appendFileSync(path + ".calls", JSON.stringify({ args: process.argv.slice(2), ...request }) + "\n");
writeFileSync(path, JSON.stringify(state));
if (!step || !request.query.includes(step.operation)) {
  process.stderr.write("unexpected fixture request"); process.exit(1);
}
if (step.fail) { process.stderr.write("fixture API refusal"); process.exit(1); }
process.stdout.write(JSON.stringify(step.response));
