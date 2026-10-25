import { mkdirSync, mkdtempSync, rmSync, writeFileSync,readdirSync,existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
process.env.VH_ADLC_TRIAGE_LOCK_ROOT??=join(tmpdir(),`vh-triage-locks-${process.pid}`);
process.env.VH_ADLC_TRIAGE_VERIFICATION_CACHE??=join(tmpdir(),`vh-triage-verification-${process.pid}`);

export function git(root: string, ...args: string[]): string {
  const result = Bun.spawnSync(["git", "-C", root, ...args], {
    env: { ...process.env, GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: "/dev/null" },
    stdout: "pipe", stderr: "pipe",
  });
  if (result.exitCode !== 0) throw new Error(`fixture git ${args[0]} failed: ${result.stderr}`);
  return result.stdout.toString().trim();
}

const activeFixtures=new Set<string>();
export function fixture() {
  const root = mkdtempSync(join(tmpdir(), "vh-triage-"));
  activeFixtures.add(root);
  const write = (path: string, content: string) => {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), content);
  };
  git(root, "init", "-q", "-b", "main");
  git(root, "config", "user.name", "Fixture");
  git(root, "config", "user.email", "fixture@example.com");
  git(root, "config", "commit.gpgsign", "false");
  git(root, "config", "core.hooksPath", "/dev/null");
  git(root, "remote", "add", "origin", "https://github.com/example/project.git");
  write("src/app.ts", "export const answer = 42;\n");
  git(root, "add", "src/app.ts");
  git(root, "commit", "-qm", "test: seed project");
  return { root, write, settings: (value: unknown) => write(".vh-adlc/triage.json", JSON.stringify(value)), dispose: () => {
    activeFixtures.delete(root);
    // Reset only this process's quiescent test namespace. Child fixtures inherit
    // the parent's lock root and cannot remove its controller history.
    const locks=process.env.VH_ADLC_TRIAGE_LOCK_ROOT;
    if(!activeFixtures.size&&locks===join(tmpdir(),`vh-triage-locks-${process.pid}`)&&existsSync(locks)){
      for(const name of readdirSync(locks)){
        const path=join(locks,name);
        if(name.endsWith(".lock"))writeFileSync(path,"");
        else rmSync(path,{force:true});
      }
    }
    rmSync(root, { recursive: true, force: true });
  } };
}

/** Native control-plane profile. Its auth never enters the exported analysis input or MCP process. */
export{nativeClient}from"../../../plugins/vh-adlc/scripts/triage/controller-clients";
