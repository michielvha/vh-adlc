import {expect, test} from 'bun:test';
import {mkdtempSync, mkdirSync, writeFileSync, rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {assessmentFailures} from './assessments';
test('native citation checks accept both real path bases and reject nonexistent lines or traversal', () => {
  const input=mkdtempSync(join(tmpdir(),'docs-assessment-'));
  try {
    mkdirSync(join(input,'report/docs'),{recursive:true});mkdirSync(join(input,'report/src'));
    writeFileSync(join(input,'report/docs/guide.md'),'Guide.\n');writeFileSync(join(input,'report/src/app.ts'),'Source.\n');
    const answer={path:'docs/guide.md',classification:'Stale',doc_citations:['report/docs/guide.md:1'],source_citations:['src/app.ts:1']};
    const report=()=>`BEGIN_ASSESSMENTS_JSON\n${JSON.stringify({cases:[{id:'report',decision:'report',candidates:[answer]}]})}\nEND_ASSESSMENTS_JSON`;
    const calls=[{case:'report',op:'check',stdout:JSON.stringify({candidates:[{path:answer.path}]})}];
    expect(assessmentFailures(report(),input,['report'],calls)).toEqual([]);
    answer.source_citations=['report/src/app.ts:99'];expect(assessmentFailures(report(),input,['report'],calls).length).toBeGreaterThan(0);
    answer.source_citations=['src/../docs/guide.md:1'];expect(assessmentFailures(report(),input,['report'],calls).length).toBeGreaterThan(0);
  } finally {rmSync(input,{recursive:true,force:true});}
});
test('the explicit unavailable-system fixture needs a real doc citation and Unknown, without fabricated code evidence', () => {
  const input=mkdtempSync(join(tmpdir(),'docs-assessment-'));
  try {
    mkdirSync(join(input,'contracts/docs'),{recursive:true});writeFileSync(join(input,'contracts/docs/other-system.md'),'Different unavailable system.\n');
    const answer={path:'docs/other-system.md',classification:'Unknown',doc_citations:['contracts/docs/other-system.md:1'],source_citations:[]};
    const report=()=>`BEGIN_ASSESSMENTS_JSON\n${JSON.stringify({cases:[{id:'contracts',candidates:[answer]}]})}\nEND_ASSESSMENTS_JSON`;
    const calls=[{case:'contracts',op:'check',stdout:JSON.stringify({candidates:[{path:answer.path}]})}];
    expect(assessmentFailures(report(),input,['contracts'],calls)).toEqual([]);
    answer.classification='Accurate';expect(assessmentFailures(report(),input,['contracts'],calls).length).toBeGreaterThan(0);
  } finally {rmSync(input,{recursive:true,force:true});}
});
