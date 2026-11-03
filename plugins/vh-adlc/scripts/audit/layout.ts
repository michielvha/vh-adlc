import { requireAuditRuntime } from "./runtime";
import { markdownSections, markdownVisibility, maskInlineCode, escapeInlineHtml } from "./inventory";
import { validArtifact } from "./assessment";
import type { Settings } from "./types";
import type { Snapshot } from "./snapshot";
export type NewFinding = { id: string; severity: string; title: string; body: string; delta_paths?: string[]; index_cells?: Record<string,string>; workstream?: string };
export type SectionNote = { heading: string; ids: string[]; text: string; evidence: {path:string;sha256:string}[] };
const fail = (): never => { throw Error("audit ledger: invalid declared layout, section update or current evidence"); };
export function boundedBody(text:string,level:number) {
  requireAuditRuntime();
  const visible=markdownVisibility(text);
  if (!visible.balanced || visible.comments || visible.lines.some(line=>/<[A-Za-z][^>]*|<\//.test(maskInlineCode(line).replace(/<(?:https?:\/\/[^ <>]+|[^ <>]+@[^ <>]+)>/g,"")))) fail();
  let escaped=false;Bun.markdown.render(text,{heading(children,attributes){if(attributes.level<=level)escaped=true;return children;}});
  if(escaped)fail();
}
function section(lines:string[],title:string) {
  const sections=[...markdownSections(lines.join("\n")).headings.values()],matches=sections.filter(row=>row.title===title);
  if(matches.length!==1)fail();const head=matches[0],next=sections.find(row=>row.at>head.at&&row.level<=head.level);
  return {...head,end:next?.at??lines.length,body:head.at+(/^ {0,3}(?:=+|-+)[ \t]*$/.test(lines[head.at+1]??"")?2:1)};
}
export function indexMetadata(config:Settings,finding:NewFinding,columns:string[]) {
  const cells=finding.index_cells??{};if(!cells||typeof cells!=="object"||Array.isArray(cells))fail();
  const reserved=/^(ID|Sev|Severity|Status|State|Title|Finding|Description)$/i,result=new Map<string,string>();
  for(const [key,value]of Object.entries(cells)){
    const matches=columns.filter(column=>column.toLowerCase()===key.toLowerCase());
    if(matches.length!==1||reserved.test(matches[0])||typeof value!=="string"||!value.trim()||/[\x00-\x1f\x7f|]/.test(value)||result.has(matches[0].toLowerCase()))fail();
    result.set(matches[0].toLowerCase(),escapeInlineHtml(value));
  }
  for(const required of config.profile.required_index_columns??[])if(!columns.some(column=>column.toLowerCase()===required.toLowerCase())||!result.has(required.toLowerCase()))fail();
  return result;
}
export function insertEntries(config:Settings,lines:string[],findings:NewFinding[]) {
  const groups=new Map<string,NewFinding[]>();
  for(const finding of findings){
    const mapping=config.profile.severity_sections;
    if(mapping&&!Object.hasOwn(mapping,finding.severity))fail();
    const target=mapping?.[finding.severity]??"";groups.set(target,[...groups.get(target)??[],finding]);
    if(config.profile.workstream_heading?!finding.workstream||!/^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/.test(finding.workstream):finding.workstream!==undefined)fail();
  }
  const groupsAt=[...groups].map(([target,rows])=>{
    if(target){const place=section(lines,target);if(place.level>=config.profile.finding_level)fail();return {at:place.end,rows};}
    const heads=[...markdownSections(lines.join("\n")).headings.values()],id=new RegExp("^"+config.id_prefix+"-[0-9]+(?=\\s|$|:)");
    const last=heads.filter(head=>head.level===config.profile.finding_level&&id.test(head.title)).at(-1);
    return {at:last?heads.find(head=>head.at>last.at&&head.level<=config.profile.finding_level)?.at??lines.length:lines.length,rows};
  }).sort((a,b)=>b.at-a.at);
  for(const group of groupsAt)lines.splice(group.at,0,...group.rows.flatMap(finding=>["","#".repeat(config.profile.finding_level)+" "+finding.id+" - "+escapeInlineHtml(finding.title),finding.body,""]));
  if(config.profile.workstream_heading){
    const target=section(lines,config.profile.workstream_heading),members=new Map<string,NewFinding[]>();
    for(const finding of findings)members.set(finding.workstream!,[...members.get(finding.workstream!)??[],finding]);
    lines.splice(target.body,0,"",...Array.from(members,([key,rows])=>`**${key} (audit additions):** `+rows.map(row=>row.id+" - "+escapeInlineHtml(row.title)).join("; ")+"."),"");
  }
  return lines.join("\n");
}
export function addSectionNotes(config:Settings,snap:Snapshot,bytes:string,notes:SectionNote[],options:{at:string;run_id:string;ids:string[]}) {
  if(!Array.isArray(notes))fail();const lines=bytes.split("\n"),seen=new Set<string>();
  const updates=notes.map(note=>{
    if(!note||Object.keys(note).some(key=>!["heading","ids","text","evidence"].includes(key))||!(config.profile.section_note_headings??[]).includes(note.heading)||seen.has(note.heading)||!Array.isArray(note.ids)||new Set(note.ids).size!==note.ids.length||note.ids.some(id=>!options.ids.includes(id))||snap.mode==="fix"&&!note.ids.length||typeof note.text!=="string"||!note.text.trim()||note.text.includes("\0")||!Array.isArray(note.evidence)||!note.evidence.length||note.evidence.some(artifact=>!validArtifact(snap.artifact_root,artifact)))fail();
    seen.add(note.heading);const place=section(lines,note.heading);boundedBody(note.text,place.level);
    return {at:place.body,body:["",`**Audit update (${options.at}):**`,"",note.text,"",`Source: ${snap.source.commit}; run: ${options.run_id}; selected IDs: ${note.ids.join(", ")||"coverage observation"}.`,"Prior section observations remain historical unless reaffirmed by this pass.",""]};
  }).sort((a,b)=>b.at-a.at);
  for(const update of updates)lines.splice(update.at,0,...update.body);return lines.join("\n");
}
