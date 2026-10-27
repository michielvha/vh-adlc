// Acceptance shim: runtime isolation and host policy are the shipped implementation.
import{resolve}from"node:path";
import{controllerMain}from"../../../plugins/vh-adlc/scripts/triage/controller";
export*from"../../../plugins/vh-adlc/scripts/triage/controller";
if(import.meta.main)await controllerMain({repo:resolve(import.meta.dir,"../../.."),driver:import.meta.path});
