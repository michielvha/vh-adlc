import { describe, expect, test } from 'bun:test';
import { cpSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const repo = resolve(import.meta.dir, '../..');
const plugin = join(repo, 'plugins/remote-gui');
const read = (path: string) => readFileSync(join(repo, path), 'utf8');

describe('independent remote-gui package', () => {
 test('both catalogs install the same independent source and manifests agree', () => {
  const agents = JSON.parse(read('.agents/plugins/marketplace.json')).plugins.find((p: any) => p.name === 'remote-gui');
  const claude = JSON.parse(read('.claude-plugin/marketplace.json')).plugins.find((p: any) => p.name === 'remote-gui');
  expect(agents.source.path).toBe('./plugins/remote-gui');
  expect(claude.source).toBe(agents.source.path);
  expect(JSON.parse(read('plugins/remote-gui/plugin.json')).version).toBe(JSON.parse(read('plugins/remote-gui/.claude-plugin/plugin.json')).version);
 });
 test('builds and runs from an installed copy without vh-adlc or the repository', () => {
  const root=mkdtempSync(join(tmpdir(),'rg-installed-'));
  try {
   const installed=join(root,'plugin');
   const toolchain=Bun.spawnSync(['go','env','GOROOT'],{cwd:plugin}).stdout.toString().trim();
   cpSync(plugin,installed,{recursive:true,filter:(path)=>!/(?:^|\/)core(?:\.[0-9]+)?$/.test(path)});
   const result=Bun.spawnSync(['/usr/bin/bash',join(installed,'scripts/remote-gui.sh'),'help'],{cwd:root,env:{...process.env,REMOTE_GUI_BUILD_CACHE:join(root,'cache'),REMOTE_GUI_GO:join(toolchain,'bin/go'),GOTOOLCHAIN:'local'}});
   expect(result.exitCode,result.stderr.toString()).toBe(0);
   expect(result.stdout.toString()).toContain('share <local-http-url>');
   const missing=Bun.spawnSync(['/usr/bin/bash',join(installed,'scripts/remote-gui.sh'),'help'],{cwd:root,env:{PATH:root,HOME:root}});
   expect(missing.exitCode).not.toBe(0);
   expect(missing.stderr.toString()).toContain('Go');
  } finally {rmSync(root,{recursive:true,force:true})}
 },120000);
 test('version publication depends on the plugin checks', () => {
  const ci=read('.github/workflows/ci.yml');
  expect(ci).toContain('remote-gui:');
  expect(ci.match(/  version:\n\s+needs: \[([^\]]+)\]/)?.[1]).toContain('remote-gui');
  expect(ci).toContain('bun test tests/remote-gui');
 });
 test('documents persistent remote activation and authentication ownership', () => {
  const skill=read('plugins/remote-gui/skills/remote-gui/SKILL.md');
  const install=read('plugins/remote-gui/README.md');
  for(const text of [skill,install]){expect(text).toContain('auth-refresh');expect(text).toContain('compatibility-blocked')}
  expect(install).toContain('persistent');
  expect(skill).toContain('human-facing local');
  expect(skill).toContain('connectOverCDP');
 });
});
