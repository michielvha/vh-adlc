import{test as nativeTest}from"bun:test";
import{withVerificationBoundary}from"../../../plugins/vh-adlc/scripts/triage/verification";
// Positive fixtures are trusted controller invocations. Ordinary CLI children do
// not inherit this process-local authority and are tested separately.
export function test(name:string,operation:()=>any,timeout?:number){
 const run=()=>withVerificationBoundary(operation);
 // These fixtures launch isolated checkouts and kernel namespaces. Retain a
 // bounded test cap that accommodates several serial real checks.
 return nativeTest(name,run,timeout??15_000);
}
