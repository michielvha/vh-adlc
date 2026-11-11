import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const source = resolve(import.meta.dir,"../.."), baseline = "129581f6dbe4df71200af8f67d7bc017d35e89ad";
const runtime = ["AGENTS.md","agents/issue-triage.md",".claude/commands/triage.md",".vh-adlc/triage.json"];
function run(args: string[], cwd = source) {
  const result = Bun.spawnSync(args,{cwd,stdout:"pipe",stderr:"pipe"});
  if(result.exitCode !== 0) throw Error(`rehearsal command failed: ${args[0]} ${args[1]}`);
  return result.stdout.toString();
}
function git(cwd: string,...args: string[]) { return run(["git","-C",cwd,...args]).trim(); }
function digest(value: string | Buffer) { return createHash("sha256").update(value).digest("hex"); }
function assert(value: boolean, description: string) { if(!value) throw Error(description); }
const pluginPath = process.env.VH_ADLC_TRIAGE_PLUGIN;
if(!pluginPath) throw Error("Set VH_ADLC_TRIAGE_PLUGIN to the exact installed/local candidate plugin directory");
const plugin = resolve(pluginPath), adapter = git(source,"rev-parse","HEAD");
assert(git(source,"status","--porcelain","--",...runtime,"tests/agent-triage") === "", "Commit the migration paths before rehearsal");
const output = mkdtempSync(join(tmpdir(),"stack-triage-rehearsal-")), checkout = join(output,"checkout");
run(["git","clone","--no-hardlinks","--no-checkout",source,checkout]);
git(checkout,"switch","--detach",adapter);
git(checkout,"remote","set-url","origin","https://github.com/michielvha/stackweaver.git");
writeFileSync(join(checkout,"triage-unrelated-staged.txt"),"Preserve staged work\n");
writeFileSync(join(checkout,"triage-unrelated-untracked.txt"),"Preserve untracked work\n");
git(checkout,"add","triage-unrelated-staged.txt");
const indexPath = join(checkout,git(checkout,"rev-parse","--git-path","index"));
const indexBefore = digest(readFileSync(indexPath));
const entriesBefore = git(checkout,"ls-files","--stage","-z");
const before = Object.fromEntries(runtime.map((path)=>[path,digest(readFileSync(join(checkout,path)))]));
git(checkout,"restore",`--source=${baseline}`,"--worktree","--",...runtime.slice(0,3));
assert(digest(readFileSync(join(checkout,runtime[3]))) === before[runtime[3]],"Settings drift blocks rollback");
unlinkSync(join(checkout,runtime[3]));
for(const path of runtime.slice(0,3)) {
  const expected = run(["git","-C",checkout,"show",`${baseline}:${path}`]);
  assert(readFileSync(join(checkout,path),"utf8") === expected,`Rollback failed: ${path}`);
}
assert(!existsSync(join(checkout,runtime[3])),"Rollback must remove only the migration-owned settings");
assert(digest(readFileSync(indexPath)) === indexBefore,"Rollback changed the Git index");
git(checkout,"restore",`--source=${adapter}`,"--worktree","--",...runtime);
for(const path of runtime) assert(digest(readFileSync(join(checkout,path))) === before[path],`Reapplication failed: ${path}`);
assert(digest(readFileSync(indexPath)) === indexBefore,"Reapplication changed the Git index");
assert(readFileSync(join(checkout,"triage-unrelated-untracked.txt"),"utf8") === "Preserve untracked work\n","Untracked work changed");
assert(git(checkout,"diff","--name-only") === "","Reapplication changed unrelated tracked files");
const {loadSettings} = await import(pathToFileURL(join(plugin,"scripts/triage/settings.ts")).href);
const {buildReport,saveReport} = await import(pathToFileURL(join(plugin,"scripts/triage/report.ts")).href);
const config = loadSettings(checkout);
const inventory = {schema_version:1,repository:config.repository,hostname:config.hostname,source_commit:adapter,mode:"ids",requested_ids:[],
  collected_at:new Date().toISOString(),issues:[],closed_issues:[],pulls:[],plans:[],plan_metadata:"available",
  coverage:["issues","pulls","plans"].map(collection=>({collection,scope:"empty fixture",pages:1,complete:true}))};
const report = buildReport(config,inventory,[],{runId:"placement-fixture"}), path = saveReport(config,report);
const frontmatter = 'description: "Triage report placement fixture"\nstatus: in-progress\nstatus_description: "Read-only fixture; no business issue verification"\nauthor: "Michiel VH"\ngoal: "Verify report placement and generated index metadata"\ncovers: ["agents/**", ".claude/commands/**"]\n';
writeFileSync(path,readFileSync(path,"utf8").replace(/^---\n/,"---\n"+frontmatter));
const trackedBefore = new Map(git(checkout,"ls-files","-z").split("\0").filter(Boolean).map(path=>[path,readFileSync(join(checkout,path))]));
run(["node","scripts/build-docs-index.js"],checkout);
const index = "docs/internal/status/README.md";
assert(readFileSync(join(checkout,index),"utf8").includes("Triage report placement fixture"),"Normal report was omitted from generated index");
const generated = git(checkout,"diff","--name-only").split("\n").filter(Boolean);
for(const changed of generated) if(changed !== index) {
  const original = trackedBefore.get(changed); assert(!!original,`Unexpected generated path: ${changed}`);
  writeFileSync(join(checkout,changed),original!);
}
assert(git(checkout,"ls-files","--stage","-z") === entriesBefore,"Report/index generation changed staged modes, blobs or paths");
const evidence = {schema_version:1,baseline,adapter,checkout,plugin,rollback:true,reapply:true,index_preserved:true,normal_report:path,
  rollback_index_bytes_preserved:true, report_index:index,history_comparison:report.comparison,generated_paths:generated,only_allowed_runtime_paths:runtime};
writeFileSync(join(output,"result.json"),JSON.stringify(evidence,null,2)+"\n");
process.stdout.write(JSON.stringify({output,...evidence},null,2)+"\n");
