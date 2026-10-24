import{createHash}from"node:crypto";
import{readFileSync,realpathSync}from"node:fs";
export function captureFakeExecutable(path:string){
 const resolved=Bun.which("gh",{PATH:path});if(!resolved)throw Error("fake gh resolution unavailable");
 return{path:realpathSync(resolved),sha256:createHash("sha256").update(readFileSync(resolved)).digest("hex")};
}
export function fakeTrackerProof(expected:string,before:ReturnType<typeof captureFakeExecutable>,after:ReturnType<typeof captureFakeExecutable>,trace:{executable?:string;sha256?:string}[]){
 const failures:string[]=[],physical=realpathSync(expected);
 if(before.path!==physical||after.path!==physical||before.sha256!==after.sha256)failures.push("fake-executable-resolution");
 if(!trace.length)failures.push("no-recorded-fake-invocations");
 if(trace.some(entry=>entry.executable!==physical||entry.sha256!==before.sha256))failures.push("fake-invocation-bytes");
 return{pass:failures.length===0,before,after,recorded_invocations:trace.length,failures,scope:"Observed controller GH adapter resolution and fake-executable invocations; not a host-wide network measurement"};
}
