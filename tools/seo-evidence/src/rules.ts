/** Only these explicit IDs can enforce policy; other findings remain observations. */
export const RULES = {
  broken_link: { command: "inspect", description: "A link resolves to a captured HTTP error" },
  broken_fragment: { command: "inspect", description: "A supported fragment is absent from captured HTML" },
  duplicate_title: { command: "inspect", description: "Exact duplicate title values in one language/mode" },
  duplicate_description: { command: "inspect", description: "Exact duplicate descriptions in one language/mode" },
  duplicate_main: { command: "inspect", description: "Exact duplicate supported main-content hashes" },
  unreachable: { command: "inspect", description: "A captured document has no observed path from the supplied roots" },
  http_regression: { command: "compare", description: "A captured successful response became a captured 4xx/5xx" },
  title_removed: { command: "compare", description: "A previously nonempty title is now absent/empty" },
  h1_removed: { command: "compare", description: "Previously nonempty H1 content is now absent/empty" },
  noindex_added: { command: "compare", description: "Observed generic index blocking changed from false to true" },
  canonical_removed: { command: "compare", description: "A single observed canonical became unambiguously absent" },
  canonical_changed: { command: "compare", description: "A single observed canonical changed to another single target" },
} as const;
export type RuleId = keyof typeof RULES;
