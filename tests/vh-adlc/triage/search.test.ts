import{test}from"./boundary-test";
import{expect}from"bun:test";
import{fixture,git}from"./fixtures";
import{loadSettings}from"../../../plugins/vh-adlc/scripts/triage/settings";
import{inspectSearch,inspectSources,verificationRecord}from"../../../plugins/vh-adlc/scripts/triage/verification";
import{buildReport,publicationVerified}from"../../../plugins/vh-adlc/scripts/triage/report";

test("actual search proof binds query, complete canonical scope, scanned bytes and both passes",()=>{
 const f=fixture();try{
  f.settings({schema_version:1,source_roots:["src"]});const config=loadSettings(f.root),now=new Date().toISOString(),inventory:any={schema_version:1,repository:config.repository,hostname:config.hostname,source_commit:git(f.root,"rev-parse","HEAD"),mode:"sweep",requested_ids:[],collected_at:now,issues:[{number:1,title:"Missing route",body:"Implement /answer",state:"open",author:"owner",labels:[],milestone:null,created_at:now,updated_at:now,comments:[]}],closed_issues:[],pulls:[],plans:[],plan_metadata:"not-configured",coverage:["issues","pulls","plans","comments:1"].map(collection=>({collection,scope:"fixture",pages:1,complete:true}))};
  const proof=(pass:"primary"|"adversarial")=>{const scan=inspectSearch(config,"/answer",["src"],pass);expect(scan.complete).toBe(true);expect(scan.result).toBe("empty");expect(scan.scanned.map(file=>file.path)).toEqual(["src/app.ts"]);expect(verificationRecord(config,inventory.source_commit,scan.receipt)?.search?.query).toBe("/answer");return[{kind:"source",path:"src/app.ts",line:1,detail:"Observed current module",verified:true,receipt:inspectSources(config,["src/app.ts"],pass).receipt},{kind:"search",query:scan.query,scope:scan.scope,result:scan.result,receipt:scan.receipt,detail:"Literal /answer is absent in complete canonical src scope",verified:true}];};
  const observation={number:1,state:"partial",remaining:"Implement the route",evidence:proof("primary"),adversarial:proof("adversarial")},report=buildReport(config,inventory,[observation]);expect(publicationVerified(config,inventory,report)).toBe(true);
  for(const change of [{query:"different"},{scope:["src/app.ts"]},{result:"found"}]){
   const forged={...observation,evidence:observation.evidence.map(item=>item.kind==="search"?{...item,...change}:item)},rejected=buildReport(config,inventory,[forged]);expect(rejected.rows[0].state).toBe("unverified");expect(publicationVerified(config,inventory,rejected)).toBe(false);
  }
  expect(publicationVerified(config,inventory,buildReport(config,inventory,[{...observation,adversarial:observation.evidence}]))).toBe(false);
  const found=inspectSearch(config,"answer",["src/app.ts"],"primary");expect(found.result).toBe("found");expect(found.matches.map(({path,line})=>({path,line}))).toEqual([{path:"src/app.ts",line:1}]);
  expect(()=>inspectSearch(config,"answer",["../outside"],"primary")).toThrow();
 }finally{f.dispose();}
});

test("unreadable text scope remains incomplete and cannot mint a successful absence receipt",()=>{
 const f=fixture();try{
  f.settings({schema_version:1,source_roots:["src"]});f.write("src/binary.dat","binary\0data");git(f.root,"add","src/binary.dat");git(f.root,"commit","-qm","test: binary scope");const config=loadSettings(f.root),scan=inspectSearch(config,"absent",["src"],"primary");expect(scan.complete).toBe(false);expect(scan.skipped).toEqual(["src/binary.dat"]);expect(verificationRecord(config,git(f.root,"rev-parse","HEAD"),scan.receipt)).toBeNull();
 }finally{f.dispose();}
});
