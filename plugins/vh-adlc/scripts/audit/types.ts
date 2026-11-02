export type AuditMode = "status" | "reverify" | "full" | "fix";
export type Verdict = "STILL_PRESENT" | "FIXED" | "PARTIAL" | "REGRESSED" | "MOOT" | "UNKNOWN";
export type Profile = {
  name: "markdown-audit-v1";
  index_heading: string;
  finding_level: number;
};
export type Settings = {
  schema_version: 1;
  root: string;
  repository: string;
  hostname: string;
  settings_path: string;
  ledger_path: string;
  project_procedure: string;
  id_prefix: string;
  profile: Profile;
};
