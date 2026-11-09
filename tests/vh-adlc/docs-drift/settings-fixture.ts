/** Synthetic settings only. IDs, pins and distribution hashes identify no real deployment. */
export function settingsFixture() {
  const role = { client: "copilot-linux", model: "fixture-model", argv: ["--fixture-role"] };
  const entry = { worker: role, reviewer: role, publisher: { argv: ["bun", "publisher.ts"] } };
  return structuredClone({
    schema_version: 1,
    protocol_version: 1,
    repository: "fixture/docs",
    hostname: "github.com",
    default_branch: "main",
    roots: ["docs"],
    exclusions: ["docs/generated"],
    suffixes: [".md"],
    required_detectors: ["links", "claims"],
    detector_inputs: { links: { all_inventory: true }, claims: { roots: ["docs"], exclusions: [], suffixes: [".md"] } },
    detector_options: { links: { check_history: true }, claims: { max_age: 90, contexts: ["source"] } },
    feedback_files: ["docs/suppressions.yaml"],
    scanner: { argv: ["node", "scripts/scan.js"], script: "scripts/scan.js", adapter: null, timeout_seconds: 120 },
    project_procedure: "docs/docs-procedure.md",
    verification_commands: [["bun", "test", "tests/docs"]],
    generation_commands: [],
    read_set: { source_roots: null, reference_roots: null } as { source_roots: string[] | null; reference_roots: string[] | null },
    component_pin: null,
    pr_discovery: { repository: "fixture/docs", base: "main", authors: ["fixture-bot"], branch_prefixes: ["docs-drift/"] },
    publication: {
      repository: "fixture/docs", base: "main", actor: "fixture-bot", branch_prefix: "docs-drift/",
      mode: "staged", adoption_record: ".vh-adlc/docs-drift-adoptions/fixture.yaml",
      pr_state: { advisory: "ready", resolve: "ready" }, lease_ref: "refs/heads/docs-drift-lease", receipt_ref_prefix: "refs/heads/docs-drift-receipts/",
      resolution_root: ".vh-adlc/docs-drift/resolutions", closure: "after-merge", merge_methods: ["merge", "squash", "rebase"],
    },
    reports: {
      hosted: "actions", interactive: "none", workflow_path: ".github/workflows/docs-drift.yml", workflow_id: null,
      artifact_name_template: "docs-drift-{run_id}-{run_attempt}", max_age_seconds: 604800, max_runs: 30,
      max_archive_bytes: 1048576, max_entry_bytes: 524288, local_history_roots: [],
      schema_version: 1, attention_version: 1, history_reader_argv: ["bun", "report-history.ts"],
    },
    runtime_loader: {
      launcher: "scripts/docs-drift-entry.ts", provider: "copilot", argv: ["--plugin-dir", "{plugin_dir}"],
      plugin_directory_template: "{plugin_dir}", profile_root_template: "{profile_root}",
      automatic_updates: false, ambient_discovery: false, credential_references: ["COPILOT_GITHUB_TOKEN"],
    },
    clients: {
      "copilot-linux": {
        provider: "copilot", version: "fixture-1.0.0", platform: "linux-x64",
        distribution_url: "https://example.invalid/fixture-client.tgz", distribution_sha256: "a".repeat(64),
      },
    },
    execution: {
      worker_workflow: ".github/workflows/docs-drift-worker.yml", scheduled_workflow: ".github/workflows/docs-drift.yml",
      claude_command: ".claude/commands/docs-drift.md", runner: "ubuntu-latest",
      permissions: { contents: "write", "pull-requests": "write", actions: "read" },
      secret_mappings: { COPILOT_GITHUB_TOKEN: "COPILOT_GITHUB_TOKEN" },
      entries: { hosted: entry, copilot: entry, claude: entry },
    },
    legacy_proposals: { authors: ["legacy-bot"], branch_prefixes: ["docs-audit/"], ids: [] },
    knowledge_pages: [],
  });
}
