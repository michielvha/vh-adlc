export type Mode = "sweep" | "next" | "close" | "stale" | "ids";
export type Settings = {
  schema_version: 1;
  root: string;
  configured: boolean;
  repository: string;
  hostname: string;
  source_roots: string[];
  generated_mirrors: string[];
  plan_roots: string[];
  plan_fields: { issue: string; status: string; status_description: string; priority: string };
  report_dir: string;
  protected_ids: number[];
  index_ids: number[];
  index_rules: { labels: string[]; title_prefixes: string[] };
  bot_authors: string[];
  owned_labels: string[];
  label_map: Record<string, string>;
  priority_order: string[];
  milestone_order: string[];
  stale_days: number;
  page_budget: number | null;
};

export type Comment = { id: number; author: string; body: string; created_at: string };
export type Issue = {
  number: number; title: string; body: string; state: "open" | "closed";
  author: string; labels: string[]; milestone: string | null;
  created_at: string; updated_at: string; comments: Comment[];
};
export type Pull = { number: number; title: string; body: string; merged_at: string };
export type Coverage = { collection: string; scope: string; pages: number; complete: boolean; error?: string };
export type Plan = { path: string; issue: number | null; status: string | null; status_description: string | null; priority: string | null };
export type Inventory = {
  schema_version: 1; repository: string; hostname: string; source_commit: string;
  mode: Mode; requested_ids: number[]; collected_at: string;
  issues: Issue[]; closed_issues: Issue[]; pulls: Pull[]; plans: Plan[]; coverage: Coverage[];
};
