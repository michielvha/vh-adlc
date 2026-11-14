import { expect, test } from 'bun:test';
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const repo = resolve(import.meta.dir, '../..');
const plugin = join(repo, 'plugins/paseo-hosts');

test('an installed copy builds and runs --help from an empty module cache', () => {
 const root = mkdtempSync(join(tmpdir(), 'paseo-hosts-installed-'));
 const modcache = join(root, 'gomodcache');
 const env: Record<string, string | undefined> = {...process.env, GOMODCACHE: modcache, PASEO_HOSTS_CACHE: join(root, 'cache'), GOTOOLCHAIN: 'local'};
 for (const name of ['GOFLAGS', 'GOPROXY', 'GOSUMDB', 'GONOSUMDB', 'GONOSUMCHECK', 'GOPRIVATE', 'GONOPROXY', 'GOWORK']) delete env[name];
 try {
  const installed = join(root, 'plugin');
  cpSync(plugin, installed, {recursive: true});
  // Run the toolchain go.mod declares, as an operator host with that Go release would.
  const goroot = Bun.spawnSync(['go', 'env', 'GOROOT'], {cwd: plugin}).stdout.toString().trim();
  env.PATH = `${join(goroot, 'bin')}:${process.env.PATH}`;
  const result = Bun.spawnSync(['/usr/bin/env', 'bash', join(installed, 'scripts/paseo-hosts.sh'), '--help'], {cwd: root, env});
  expect(result.exitCode, result.stderr.toString()).toBe(0);
  expect(result.stdout.toString()).toContain('paseo-hosts');
  const required = [...readFileSync(join(plugin, 'go.mod'), 'utf8').matchAll(/^\s*(?:require\s+)?([a-z0-9.-]+\.[a-z]+\/\S+) (v\S+)/gm)];
  expect(required.length).toBeGreaterThan(0);
  for (const [, path, version] of required) {
   expect(existsSync(join(modcache, 'cache/download', path, '@v', `${version}.zip`)), `${path}@${version}`).toBe(true);
  }
 } finally {
  Bun.spawnSync(['go', 'clean', '-modcache'], {env});
  rmSync(root, {recursive: true, force: true});
 }
}, 300000);
