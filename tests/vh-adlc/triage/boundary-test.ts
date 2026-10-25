import{test as nativeTest,mock}from"bun:test";
import{AsyncLocalStorage}from"node:async_hooks";
import{hasManagedProofAuthority,hasManagedControllerAuthority}from"../../../plugins/vh-adlc/scripts/triage/controller";
const fixtureAuthority=new AsyncLocalStorage<boolean>();
// Capture function values before mocking their re-export module. Bun can update
// re-export bindings, which must not turn the fallback into recursive mock calls.
const nativeProofAuthority=hasManagedProofAuthority,nativeEffectAuthority=hasManagedControllerAuthority;
// Unit fixtures stand in for an already validated controller. This test-only
// module replacement is outside the shipped plugin; child CLIs inherit none of it.
mock.module("../../../plugins/vh-adlc/scripts/triage/controller-authority",()=>({hasManagedProofAuthority:()=>fixtureAuthority.getStore()===true||nativeProofAuthority(),hasManagedControllerAuthority:()=>fixtureAuthority.getStore()===true||nativeEffectAuthority()}));
import{withVerificationBoundary}from"../../../plugins/vh-adlc/scripts/triage/verification";
// Positive fixtures are trusted controller invocations. Ordinary CLI children do
// not inherit this process-local authority and are tested separately.
export function test(name:string,operation:()=>any,timeout?:number){
 const run=()=>fixtureAuthority.run(true,()=>withVerificationBoundary(operation));
 // These fixtures launch isolated checkouts and kernel namespaces. Retain a
 // bounded test cap that accommodates several serial real checks.
 return nativeTest(name,run,timeout??15_000);
}
