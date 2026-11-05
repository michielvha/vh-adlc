import { createGitHubReader, ghRead, parsePage, GitHubReadError, type ReadOptions, type ReadObservation, type PageResult } from "../github-read";

/** Dependabot accepts cursor pagination and rejects even an initial page=1 parameter. */
export function createMaintenanceReader(hostname:string,options:Omit<ReadOptions,"projection"> & {max_pages?:number}={}){
  const base=createGitHubReader(hostname,options),trace:ReadObservation[]=[];
  function tracked<T>(read:()=>T):T{const start=base.trace().length;try{return read();}finally{trace.push(...base.trace().slice(start));}}
  return {
    trace(){return trace.map(row=>({...row}));},
    get(endpoint:string){return tracked(()=>base.get(endpoint));},
    pages(endpoint:string,expected:{repositoryId?:number;key?:string;sha?:string}={}):PageResult{
      if(!/^repos\/[^/]+\/[^/]+\/dependabot\/alerts(?:\?|$)/.test(endpoint))return tracked(()=>base.pages(endpoint,expected));
      const items:unknown[]=[],seen=new Set<string>();let target:string|null=endpoint,pages=0;
      try{
        while(target){
          if(seen.has(target)||pages>=(options.max_pages??10000))throw Error("cursor pagination repeated or bounded");seen.add(target);pages++;
          const started_at=new Date().toISOString(),response=ghRead(hostname,target,options),raw=response.stdout.toString(),status=Number(raw.match(/^HTTP\/[\d.]+ (\d{3})(?:\s|$)/)?.[1])||null;
          trace.push({method:"GET",hostname,endpoint:target,started_at,observed_at:new Date().toISOString(),status});
          if(response.exitCode!==0||status!==200){
            const split=raw.search(/\r?\n\r?\n/);let message="Cursor request unavailable";
            try{const body:unknown=JSON.parse(raw.slice(split).replace(/^\r?\n\r?\n/,""));if(body&&typeof body==="object"&&"message" in body&&typeof body.message==="string")message=body.message.slice(0,4096);}catch{}
            throw new GitHubReadError(status,message);
          }
          let next:string|null=null;
          const parsed=parsePage(raw,{hostname,endpoint,page:pages,repositoryId:expected.repositoryId,onNext:url=>{next=url;}});
          items.push(...parsed.items);target=next;
        }
        return{items,pages,complete:true};
      }catch(error){return{items,pages,complete:false,error:error instanceof GitHubReadError?{status:error.status,message:error.apiMessage}:{status:null,message:error instanceof Error?error.message:"Cursor collection failed"}};}
    },
  };
}
