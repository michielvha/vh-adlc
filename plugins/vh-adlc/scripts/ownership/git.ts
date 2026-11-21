import { randomUUID } from "node:crypto";
import { gitEnvironment, gitReadArguments } from "../git-read";

export const REF = "refs/heads/vh-adlc/work-ownership";
export const POLICY = ".vh-adlc/work-ownership.yaml";
export const STATE = "reservations.json";
export const OID = /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/;

export type Environment = Readonly<Record<string, string | undefined>>;
export type RemoteTip = { main: string; defaultBranch: string; reservation?: string };

export class OwnershipGit {
  readonly root: string;
  constructor(cwd: string, private readonly env: Environment = process.env) {
    this.root = cwd;
    this.root = this.text("rev-parse", "--show-toplevel");
  }

  private invoke(args: string[], input?: string) {
    const result = Bun.spawnSync(gitReadArguments(args), {
      cwd: this.root, env: gitEnvironment(this.env), stdin: input === undefined ? "ignore" : Buffer.from(input),
      stdout: "pipe", stderr: "pipe", timeout: 30_000,
    });
    // Git can include configured URLs or credential details on stderr.
    return { ok: result.exitCode === 0, status: result.exitCode, out: result.stdout.toString() };
  }

  run(args: string[], input?: string): string {
    const answer = this.invoke(args, input);
    if (!answer.ok) throw Error(`Git ${args[0]} could not verify reservation state`);
    return answer.out;
  }

  ok(...args: string[]): boolean { return this.invoke(args).ok; }
  text(...args: string[]): string { return this.run(args).trim(); }

  config(key: string): string | undefined {
    const answer = this.invoke(["config", "--local", "--get-all", key]);
    if (answer.status === 1 && !answer.out) return undefined;
    if (!answer.ok || lines(answer.out.trim()).length !== 1) throw Error("could not verify local reservation binding");
    return answer.out.trim();
  }

  remotes(): string[] { return lines(this.text("remote")); }
  urls(push: boolean): string[] { return lines(this.text("remote", "get-url", ...(push ? ["--push"] : []), "--all", "origin")); }

  remote(): RemoteTip {
    const response = this.run(["ls-remote", "--symref", "origin", "HEAD", REF]);
    const rows = response.trim().split("\n").map(row => row.split("\t"));
    const branch = rows.find(row => row[1] === "HEAD" && row[0]?.startsWith("ref: refs/heads/"))?.[0]?.slice(16);
    const main = rows.find(row => row[1] === "HEAD" && OID.test(row[0] ?? ""))?.[0];
    const reservation = rows.find(row => row[1] === REF)?.[0];
    if (!branch || !main || (reservation !== undefined && !OID.test(reservation))) throw Error("unable to verify the canonical remote's default branch and reservation");
    return { defaultBranch: branch, main, reservation };
  }

  objects(...oids: string[]) {
    const missing = [...new Set(oids)].filter(oid => !this.ok("cat-file", "-e", `${oid}^{commit}`));
    if (!missing.length) return;
    this.run(["fetch", "--no-tags", "--no-write-fetch-head", "--no-auto-maintenance", "--refmap=", "origin", ...missing]);
    if (missing.some(oid => !this.ok("cat-file", "-e", `${oid}^{commit}`))) throw Error("incomplete remote reservation history");
  }

  matchingFiles(commit: string, beneath: string, literal: string): string[] {
    const result = this.invoke(["grep", "--no-textconv", "-l", "-z", "-F", "-e", literal, commit, "--", beneath]);
    if (result.status === 1 && !result.out) return [];
    if (!result.ok) throw Error("Git could not resolve the feature association");
    const prefix = `${commit}:`;
    return result.out.split("\0").filter(Boolean).map(row => {
      if (!row.startsWith(prefix)) throw Error("unknown feature association response");
      return row.slice(prefix.length);
    });
  }

  lookup(ref: string): string | undefined {
    const answer = this.invoke(["rev-parse", "--verify", "-q", `${ref}^{commit}`]);
    if (answer.status === 1 && !answer.out) return undefined;
    const oid = answer.out.trim();
    if (!answer.ok || !OID.test(oid)) throw Error("unable to resolve the local repository state");
    return oid;
  }

  file(commit: string, path: string): string | undefined {
    const found = this.run(["ls-tree", "-z", "--full-tree", commit, "--", path]);
    if (!found) return undefined;
    if (!/^100(?:644|755) blob [a-f0-9]+\t/.test(found)) throw Error("reservation input must be a regular Git file");
    return this.run(["cat-file", "blob", `${commit}:${path}`]);
  }

  commit(data: string, parent?: string): string {
    const blob = this.run(["hash-object", "-w", "--stdin"], data).trim();
    const tree = this.run(["mktree"], `100644 blob ${blob}\t${STATE}\n`).trim();
    const commit = this.text("commit-tree", tree, ...(parent ? ["-p", parent] : []), "-m", "vh-adlc reservation [skip ci]", "-m", randomUUID());
    if (!OID.test(commit) || (parent && this.text("show", "-s", "--format=%P", commit) !== parent)) {
      throw Error("reservation update did not produce an append-only commit");
    }
    return commit;
  }

  install(expected: string, commit: string): boolean {
    return this.ok("push", "--quiet", "--no-follow-tags", `--force-with-lease=${REF}:${expected}`, "origin", `${commit}:${REF}`);
  }
}

function lines(text: string): string[] { return text ? text.split("\n") : []; }
