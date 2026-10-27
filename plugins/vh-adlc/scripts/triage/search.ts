import{createHash}from"node:crypto";
export type SearchFile={path:string;sha256:string;bytes:Buffer|null};
export type SearchProof={query:string;scope:string[];scanned:{path:string;sha256:string}[];skipped:string[];matches:{path:string;line:number}[];complete:boolean};
export function searchScope(scope:string[]){return[...new Set(scope.map(path=>path==="."?path:path.replace(/\/+$/,"")))].sort();}
export function inSearchScope(path:string,scope:string[]){return scope.some(root=>root==="."||path===root||path.startsWith(root+"/"));}
export function scanSearch(query:string,scope:string[],files:SearchFile[]){
 if(typeof query!=="string"||!query||query.length>2000||query.includes("\0"))throw Error("invalid source search query");
 const scanned:{path:string;sha256:string}[]=[],skipped:string[]=[],matches:{path:string;line:number;text:string}[]=[];
 for(const file of [...files].sort((a,b)=>a.path<b.path?-1:a.path>b.path?1:0)){
  scanned.push({path:file.path,sha256:file.sha256});
  if(!file.bytes||file.bytes.includes(0)||createHash("sha256").update(file.bytes).digest("hex")!==file.sha256){skipped.push(file.path);continue;}
  for(const[index,text]of file.bytes.toString().split("\n").entries())if(text.includes(query))matches.push({path:file.path,line:index+1,text:text.slice(0,1500)});
 }
 return{query,scope:searchScope(scope),scanned,skipped,matches,complete:skipped.length===0};
}
export function searchProof(scan:ReturnType<typeof scanSearch>):SearchProof{return{...scan,matches:scan.matches.map(({path,line})=>({path,line}))};}
