import{test,expect}from'bun:test';import{mkdtempSync,readFileSync,writeFileSync,rmSync}from'node:fs';import{tmpdir}from'node:os';import{join}from'node:path';import{buildDiagnostic,snapshot,grade}from'./lifecycle/fixtures';
function run(project:string,command:string){const r=Bun.spawnSync(['bash','-c',command],{cwd:project,stdout:'pipe',stderr:'pipe'});return{command,exitCode:r.exitCode,output:r.stdout.toString()+r.stderr.toString()};}
test('quiet unchanged tag assertion proves a README correction without displayed tag output',()=>{
 const root=mkdtempSync(join(tmpdir(),'quiet-tag-'));try{const f=buildDiagnostic(root,'L02'),before=snapshot(f);writeFileSync(join(f.project,'README.md'),'Prints v1.2.3.\n');const command=run(f.project,'bash test.sh && echo ok'),check=(c:any)=>grade(f,before,snapshot(f),'Corrected.',[c]).checks.find(c=>c.name==='README correction checked against actual tag output')!.pass;
 expect(command.output.trim()).toBe('ok');expect(check(command)).toBe(true);expect(check({...command,command:'false; echo ok'})).toBe(false);expect(check({...command,command:'bash test.sh || echo ok'})).toBe(false);
 writeFileSync(join(f.project,'test.sh'),'exit 0\n');expect(check(command)).toBe(false);
 }finally{rmSync(root,{recursive:true,force:true});}
});
test('quiet new shout assertion needs its exact added test, observed failure and later pass',()=>{
 const root=mkdtempSync(join(tmpdir(),'quiet-shout-'));try{const f=buildDiagnostic(root,'L15'),before=snapshot(f),append='[[ "$(bash greet.sh)" == \'Hello, world.\' ]]\n[[ "$(bash greet.sh --shout)" == \'HELLO, WORLD.\' ]]\n',red=run(f.project,"cat >> test.sh <<'EOF'\n"+append+'EOF\nbash test.sh; echo "exit=$?"');
 expect(red.output.trim()).toBe('exit=1');writeFileSync(join(f.project,'greet.sh'),'#!/usr/bin/env bash\nif [[ "${1:-}" == --shout ]]; then printf "HELLO, WORLD.\\n"; else printf "Hello, world.\\n"; fi\n');const green=run(f.project,'bash test.sh; echo "exit=$?"; bash greet.sh --shout; bash greet.sh'),check=(commands:any[])=>grade(f,before,snapshot(f),'Implemented.',commands).checks.find(c=>c.name==='feature regression observed failing then passing')!.pass;
 expect(check([red,green])).toBe(true);expect(check([{command:'bash test.sh',exitCode:1,output:'unrelated syntax failure'},green])).toBe(false);expect(check([{...red,output:'exit=0\n'},green])).toBe(false);
 writeFileSync(join(f.project,'test.sh'),readFileSync(join(f.project,'test.sh'),'utf8')+'false\n');expect(check([red,green])).toBe(false);
 }finally{rmSync(root,{recursive:true,force:true});}
});
