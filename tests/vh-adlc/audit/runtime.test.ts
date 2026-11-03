import {expect,test} from 'bun:test';
import {requireAuditRuntime} from '../../../plugins/vh-adlc/scripts/audit/runtime';
test('older or renderer-less Bun gives an actionable prerequisite error',()=>{
 expect(()=>requireAuditRuntime({version:'1.3.99',markdown:{render:()=>''}})).toThrow('audit requires Bun 1.4+');
 expect(()=>requireAuditRuntime({version:'1.4.0'})).toThrow('Bun.markdown.render');
 expect(()=>requireAuditRuntime({version:'1.4.0',markdown:{render:()=>''}})).not.toThrow();
 expect(()=>requireAuditRuntime()).not.toThrow();
});
