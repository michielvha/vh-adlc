import { describe, expect, test } from 'bun:test';
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
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
   expect(result.stdout.toString()).toContain('--browser-mode human|agent');
   expect(result.stdout.toString()).toContain('handoff <id>');
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

test('installed authentication guidance selects human control and verifies the provider outcome', () => {
 const skill = read('plugins/remote-gui/skills/remote-gui/SKILL.md');
 for (const instruction of ['--browser-mode human', '--browser-mode agent', 'handoff <id>', 'host-transport-only', 'ERR_NETWORK_CHANGED', 'two retries', 'provider rejection', 'owner confirms']) {
  expect(skill).toContain(instruction);
 }
 const version = JSON.parse(read('plugins/remote-gui/plugin.json')).version;
 const [major, minor] = version.split('.').map(Number);
 expect(major > 0 || minor >= 2).toBe(true);
});

test('real browser phase and session continuity checks run in CI', () => {
 const ci = read('.github/workflows/ci.yml');
 expect(ci).toContain('REMOTE_GUI_BROWSER_E2E');
 expect(ci).toContain('REMOTE_GUI_VIEWER_E2E');
 expect(ci).toContain('tests/remote-gui/browser.e2e.test.ts');
});

test('browser test dependency is locked in its managed package', () => {
 const manifest = JSON.parse(read('tests/remote-gui/package.json'));
 expect(manifest.private).toBe(true);
 expect(manifest.devDependencies['playwright-core']).toMatch(/^\d+\.\d+\.\d+$/);
 expect(read('tests/remote-gui/bun.lock')).toContain('playwright-core@' + manifest.devDependencies['playwright-core']);
 const ci = read('.github/workflows/ci.yml');
 expect(ci).toContain('bun install --cwd tests/remote-gui --frozen-lockfile --ignore-scripts');
 expect(ci).not.toContain('npm install --prefix');
});

test('viewer failures retain runtime diagnostics without access material', () => {
 const root = mkdtempSync(join(tmpdir(), 'rg-diagnostic-'));
 try {
  const binary = join(root, 'runtime');
  const browserModule = join(root, 'browser.cjs');
  writeFileSync(binary, '#!/bin/sh\nprintf \'%s\\n\' \'{"result":"failed","diagnostic":"synthetic-runtime-diagnostic","access_code":"private-code-sentinel","url":"https://private-url-sentinel/?secret=query-sentinel"}\'\nexit 1\n', {mode: 0o700});
  writeFileSync(browserModule, 'module.exports = {chromium: {}};\n');
  const result = Bun.spawnSync([process.execPath, 'test', join(repo, 'tests/remote-gui/browser.e2e.test.ts'), '-t', 'real noVNC keyboard input'], {
   cwd: root,
   env: {...process.env, REMOTE_GUI_VIEWER_E2E: '1', REMOTE_GUI_TEST_BINARY: binary, REMOTE_GUI_PLAYWRIGHT_MODULE: browserModule},
  });
  const output = result.stdout.toString() + result.stderr.toString();
  expect(result.exitCode).not.toBe(0);
  expect(output).toContain('synthetic-runtime-diagnostic');
  for (const sentinel of ['private-code-sentinel', 'private-url-sentinel', 'query-sentinel']) expect(output).not.toContain(sentinel);
 } finally {
  rmSync(root, {recursive: true, force: true});
 }
});

test('unsupported source-build hosts get a platform diagnostic before compiling',()=>{
 const root=mkdtempSync(join(tmpdir(),'rg-platform-'));
 try{
  writeFileSync(join(root,'go'),'#!/bin/sh\nexit 99\n',{mode:0o700});
  writeFileSync(join(root,'uname'),'#!/bin/sh\necho Darwin\n',{mode:0o700});
  const result=Bun.spawnSync(['/usr/bin/bash',join(plugin,'scripts/remote-gui.sh'),'doctor'],{env:{PATH:root,HOME:root}});
  expect(result.exitCode).toBe(1);
  expect(result.stdout.toString()).toContain('unsupported-platform');
 }finally{rmSync(root,{recursive:true,force:true})}
});

test('installed guidance makes Tailscale owner access passwordless',()=>{
 const skill=read('plugins/remote-gui/skills/remote-gui/SKILL.md');
 const setup=read('plugins/remote-gui/README.md');
 expect(skill).toContain('tailscale-identity');
 expect(skill).toContain('--owner-login');
 expect(setup).toContain('no viewer password');
 expect(skill).not.toContain('After successful app checks, issue a new one-time code');
 expect(read('plugins/remote-gui/scripts/remote-gui.sh')).toContain('-buildvcs=false');
});
