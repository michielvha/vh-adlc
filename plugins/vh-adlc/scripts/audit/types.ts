export type AuditMode = "status" | "reverify" | "full" | "fix";
export type Verdict = "STILL_PRESENT" | "FIXED" | "PARTIAL" | "REGRESSED" | "MOOT" | "UNKNOWN";
export type Profile = {
  name: "markdown-audit-v1";
  index_heading: string;
  finding_level: number;
  severity_sections?: Record<string,string>;
  required_index_columns?: string[];
  workstream_heading?: string;
  section_note_headings?: string[];
};
export type Settings = {
  schema_version: 1;
  root: string;
  repository: string;
  hostname: string;
  settings_path: string;
  knowledge_pages: string[];
  ledger_path: string;
  project_procedure: string;
  id_prefix: string;
  profile: Profile;
};
