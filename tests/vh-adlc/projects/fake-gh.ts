// Invoked as a subprocess named gh by the real coordinator transport.
import { appendFileSync, readFileSync, writeFileSync } from "node:fs";
import { list, object, string } from "../../../plugins/vh-adlc/scripts/projects/settings";
const path = process.env.PROJECTS_FIXTURE;
if (!path) throw new Error("fixture path missing");
const state = object(JSON.parse(readFileSync(path, "utf8")));
const steps = list(state.steps);
const request = object(JSON.parse(readFileSync(0, "utf8")));
const next = steps.shift();
const step = next === undefined ? null : object(next);
appendFileSync(path + ".calls", JSON.stringify({ args: process.argv.slice(2), ...request }) + "\n");
writeFileSync(path, JSON.stringify(state));
if (!step || !string(request.query).includes(string(step.operation))) {
  process.stderr.write("unexpected fixture request"); process.exit(1);
}
if (step.fail) { process.stderr.write("fixture API refusal"); process.exit(1); }
writeFileSync(1, JSON.stringify(step.response));
