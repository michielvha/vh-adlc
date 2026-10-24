import {expect,test} from "bun:test";
import {readFileSync} from "node:fs";
import {join} from "node:path";
import {fixture,git} from "./fixtures";
import {loadSettings} from "../../../plugins/vh-adlc/scripts/triage/settings";
import {buildReport,saveReport,type Observation} from "../../../plugins/vh-adlc/scripts/triage/report";
import type {Inventory,Issue,Mode} from "../../../plugins/vh-adlc/scripts/triage/types";

// This deterministic matrix checks retained rules and explicit differences against
// the frozen legacy contract. It does not claim a native legacy-agent parity run.
test("the synthetic migration matrix retains scope across modes and records intentional differences",()=>{
  const f=fixture();
  try{
    f.settings({schema_version:1,source_roots:["src"],plan_roots:["plans"],protected_ids:[99],index_ids:[100],priority_order:["high","low"],report_dir:"history"});
    f.write("src/main.ts",'import {answer} from "./app";\nconsole.log(answer);\n');
    f.write("src/serializer.ts",'export const serialize=(value:number)=>JSON.stringify({value});\n');
    f.write("plans/false-complete.md","---\nissue: 2\nstatus: complete\n---\n");
    f.write("plans/reverse.md","---\nissue: 10\nstatus: planned\n---\n");
    f.write("plans/untracked.md","---\nissue: null\nstatus: planned\n---\n");
    f.write("history/.keep","");
    git(f.root,"add","src","plans","history/.keep");git(f.root,"commit","-qm","test: seed migration matrix");
    const config=loadSettings(f.root),head=git(f.root,"rev-parse","HEAD");
    const make=(number:number,title=`Scope ${number}`):Issue=>({number,title,body:"Synthetic requested scope",state:"open",author:"owner",labels:[],milestone:null,created_at:"2026-01-01T00:00:00Z",updated_at:"2026-01-01T00:00:00Z",comments:[]});
    const issues=[make(1),make(2),make(3),make(4),make(5),make(99),make(100,"Release umbrella"),make(101,"New unlisted umbrella")];
    const closed={...make(10),state:"closed" as const};
    const inventory:Inventory={schema_version:1,repository:config.repository,hostname:config.hostname,source_commit:head,mode:"sweep",requested_ids:[],collected_at:"2026-10-24T10:00:00Z",issues,closed_issues:[closed],pulls:[{number:50,title:"Partial helper",body:"Refs #2",merged_at:"2026-10-01T00:00:00Z"}],plans:[{path:"plans/false-complete.md",issue:2,issue_ref:"2",status:"complete",status_description:null,priority:"high"},{path:"plans/reverse.md",issue:10,issue_ref:"10",status:"planned",status_description:null,priority:null},{path:"plans/untracked.md",issue:null,issue_ref:null,status:"planned",status_description:null,priority:null}],plan_metadata:"available",coverage:["issues","pulls","plans",...issues.map(i=>`comments:${i.number}`)].map(collection=>({collection,scope:"synthetic-migration",pages:1,complete:true}))};
    const source={kind:"source",path:"src/app.ts",line:1,detail:git(f.root,"show",`${head}:src/app.ts`),verified:true};
    const wiring={kind:"wiring",path:"src/main.ts",detail:"Entry point imports and uses the exported answer",verified:true};
    const run=Bun.spawnSync(["bun","src/main.ts"],{cwd:f.root,stdout:"pipe",stderr:"pipe"});expect(run.exitCode).toBe(0);expect(run.stdout.toString()).toBe("42\n");
    const missing={kind:"search",scope:["src"],result:"empty",detail:"No /answer route in the complete canonical tree",verified:true};
    expect(Bun.spawnSync(["git","-C",f.root,"grep","-n","/answer",head,"--","src"],{stdout:"pipe",stderr:"pipe"}).exitCode).toBe(1);
    const done=(number:number):Observation=>({number,state:"resolved",remaining:"",evidence:[source,wiring],adversarial:[source,wiring]});
    const overlap={kind:"overlap",reference:"issue:2",detail:"Entire duplicate request belongs to unfinished canonical issue 2",verified:true};
    const observations:Observation[]=[done(1),{number:2,state:"open",remaining:"Implement the route",evidence:[missing]},
      {number:3,state:"partial",remaining:"Wire serializer into HTTP endpoint",evidence:[{...source,path:"src/serializer.ts"}]},
      {number:4,state:"duplicate",duplicate_of:2,total_overlap:true,remaining:"Canonical scope remains in issue 2",evidence:[overlap],adversarial:[overlap]},
      {number:5,state:"blocked",remaining:"Needs the HTTP endpoint",evidence:[missing],blockers:[{issue:3,missing:true,evidence:[missing]}]},done(99),done(100),done(101)];
    const first=buildReport(config,inventory,observations);
    expect(first.rows.filter(r=>r.disposition==="close-candidate").map(r=>r.number)).toEqual([1,4]);
    expect(first.rows.find(r=>r.number===3)?.remaining).toContain("HTTP");
    expect(first.rows.filter(r=>r.disposition==="excluded").map(r=>r.number)).toEqual([99,100,101]);
    expect(first.drift.map(r=>r.issue).sort((a,b)=>a-b)).toEqual([2,10]);
    expect(first.ranked.map(r=>r.number)).toEqual([2,3]);
    const leadOnly=buildReport(config,inventory,observations.map(o=>o.number===2?{...o,state:"resolved",remaining:"",evidence:[{kind:"merged-pr",pull_number:50,detail:"Refs-only merged helper",verified:true}],adversarial:[]}:o));
    expect(leadOnly.rows.find(r=>r.number===2)?.state).toBe("unverified");
    expect(leadOnly.rows.every(r=>!r.close_executable)).toBe(true);
    const requested=buildReport(config,inventory,observations,{indexRequests:[99,100,101]});
    expect(requested.rows.filter(r=>r.close_executable).map(r=>r.number)).toEqual([1,4,100,101]);
    const before=git(f.root,"status","--porcelain"),index=readFileSync(join(f.root,".git/index"));
    for(const mode of ["sweep","next","close","stale","ids"] as Mode[]){
      const selected={...inventory,mode,requested_ids:mode==="ids"?issues.map(i=>i.number):[]};
      const report=buildReport(config,selected,observations,{runId:`matrix-${mode}`});
      expect(report.rows.map(r=>r.number)).toEqual(issues.map(i=>i.number));
      expect(report.counts.observed_open).toBe(8);expect(report.counts.closure_candidates).toBe(2);
      if(!["sweep","next"].includes(mode))expect(report.ranked).toEqual([]);
      expect(saveReport(config,report)).toContain("history/");
    }
    const after=git(f.root,"status","--porcelain");
    expect(after.split("\n").filter(line=>!line.includes("history/")&&!line.includes("history/README.md"))).toEqual(before.split("\n").filter(line=>!line.includes("history/")));
    expect(git(f.root,"diff","--cached","--name-only")).toBe("");
    expect(readFileSync(join(f.root,".git/index"))).toEqual(index);
    const repeated=buildReport(config,inventory,observations);expect(repeated.comparison.status).toBe("comparable");expect(repeated.comparison.added).toEqual([]);expect(repeated.comparison.removed).toEqual([]);
  }finally{f.dispose();}
});
