import{lstatSync,readdirSync,readFileSync,readlinkSync}from"node:fs";
import{createHash}from"node:crypto";
import{join}from"node:path";
type Entry={mode:number;size:number;kind:"directory"|"file"|"symlink";sha256?:string};
export function checkSnapshot(root:string,expected?:Map<string,Entry>){
 const entries=new Map<string,Entry>();
 function walk(path:string){
  const absolute=join(root,path),stat=lstatSync(absolute),kind=stat.isDirectory()?"directory":stat.isSymbolicLink()?"symlink":stat.isFile()?"file":null;
  if(!kind)throw Error("unsupported check output");
  const entry:Entry={mode:stat.mode,size:kind==="directory"?0:stat.size,kind},before=expected?.get(path);
  // Reject new paths, changed types and enlarged files before reading content.
  if(expected&&(!before||before.mode!==entry.mode||before.kind!==kind||before.size!==entry.size))throw Error("changed check output");
  if(kind!=="directory")entry.sha256=createHash("sha256").update(kind==="symlink"?readlinkSync(absolute):readFileSync(absolute)).digest("hex");
  if(expected&&entry.sha256!==before?.sha256)throw Error("changed check output");
  entries.set(path,entry);
  if(kind==="directory")for(const name of readdirSync(absolute).sort())if(path||name!==".git")walk(path?path+"/"+name:name);
 }
 walk("");if(expected&&entries.size!==expected.size)throw Error("changed check output");return entries;
}
export function checkUnchanged(root:string,expected:Map<string,Entry>){try{checkSnapshot(root,expected);return true;}catch{return false;}}
