/** Native gh transport for repository labels. No shell interprets label text or credentials. */
export type RepoLabel = { name: string; color: string; description: string };
export type Metadata = { color: string; description: string };

const PAGE = 100, MAX_PAGES = 50;

export class LabelsGitHub {
  constructor(readonly host: string, private readonly options: { executable?: string; env?: Record<string, string | undefined> } = {}) {}

  private call(args: string[], input?: unknown): unknown {
    const result = Bun.spawnSync([this.options.executable ?? "gh", "api", "--hostname", this.host, ...args, ...(input === undefined ? [] : ["--input", "-"])], {
      stdin: input === undefined ? "ignore" : Buffer.from(JSON.stringify(input)),
      stdout: "pipe", stderr: "pipe", env: this.options.env ?? process.env, timeout: 30000,
    });
    if (result.exitCode !== 0) throw new Error("GitHub request failed; verify access, network and rate limits");
    return JSON.parse(result.stdout.toString());
  }

  /** The authenticated account that would make the writes. */
  actor(): string {
    const value = this.call(["user"]) as { login?: unknown };
    if (typeof value?.login !== "string" || !value.login) throw new Error("GitHub returned no authenticated account");
    return value.login;
  }

  /** Every label in the repository; a short or failed page never passes as complete. */
  labels(repository: string): RepoLabel[] {
    const labels: RepoLabel[] = [];
    for (let page = 1; page <= MAX_PAGES; page++) {
      const batch = this.call([`repos/${repository}/labels?per_page=${PAGE}&page=${page}`]);
      if (!Array.isArray(batch)) throw new Error("GitHub returned an unexpected label page");
      for (const item of batch as { name?: unknown; color?: unknown; description?: unknown }[]) {
        if (typeof item.name !== "string" || typeof item.color !== "string") throw new Error("GitHub returned an unexpected label");
        labels.push({ name: item.name, color: item.color.toLowerCase(), description: typeof item.description === "string" ? item.description : "" });
      }
      if (batch.length < PAGE) return labels;
    }
    throw new Error("label collection exceeded its page limit");
  }

  create(repository: string, name: string, metadata: Metadata): void {
    this.call(["-X", "POST", `repos/${repository}/labels`], { name, color: metadata.color, description: metadata.description });
  }

  /** Changes color and description only; a label is never renamed. */
  update(repository: string, name: string, metadata: Metadata): void {
    this.call(["-X", "PATCH", `repos/${repository}/labels/${encodeURIComponent(name)}`], { color: metadata.color, description: metadata.description });
  }
}
