import assert from 'node:assert/strict'
import { mkdtempSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, it } from 'bun:test'
import { parseArgs, runExport, setEnvValues } from './export.ts'

const pem = '-----BEGIN RSA PRIVATE KEY-----\nsecret-key\n-----END RSA PRIVATE KEY-----'

function workspace() {
  const dir = mkdtempSync(path.join(tmpdir(), 'gh-app-export-'))
  const credentials = path.join(dir, 'app.json')
  writeFileSync(credentials, JSON.stringify({ id: 42, slug: 'example-app', client_id: 'Iv1.client', client_secret: 'sec$ret', webhook_secret: 'hook', pem }), { mode: 0o600 })
  return { dir, credentials }
}

describe('setEnvValues', () => {
  it('replaces assigned keys in place, keeps everything else and appends new keys', () => {
    const before = '# comment\nA=1\nexport B=old\n\nC=3\n'
    const after = setEnvValues(before, new Map([['B', 'new'], ['D', '4']]))
    assert.equal(after, '# comment\nA=1\nB=new\n\nC=3\nD=4\n')
  })
  it('writes into an empty file', () => {
    assert.equal(setEnvValues('', new Map([['A', '1']])), 'A=1\n')
  })
})

describe('parseArgs', () => {
  it('refuses a field that is not exportable, such as the private key', () => {
    assert.throws(() => parseArgs(['--credentials', 'c', '--env-file', 'e', 'KEY=pem']), /not one of/)
  })
  it('refuses assignments without an env file and an env file without assignments', () => {
    assert.throws(() => parseArgs(['--credentials', 'c', 'KEY=id']), /needs --env-file/)
    assert.throws(() => parseArgs(['--credentials', 'c', '--env-file', 'e']), /at least one/)
  })
})

describe('runExport', () => {
  it('sets env values with Compose escaping and keeps the file mode', () => {
    const { dir, credentials } = workspace()
    const env = path.join(dir, 'vcs.env')
    writeFileSync(env, 'OTHER=keep\nGITHUB_APP_CLIENT_SECRET=old\n', { mode: 0o640 })
    const done = runExport(parseArgs(['--credentials', credentials, '--env-file', env, '--compose-escape', 'GITHUB_APP_CLIENT_SECRET=client_secret', 'GITHUB_APP_ID=id']))
    assert.equal(readFileSync(env, 'utf8'), 'OTHER=keep\nGITHUB_APP_CLIENT_SECRET=sec$$ret\nGITHUB_APP_ID=42\n')
    assert.equal(statSync(env).mode & 0o777, 0o640)
    assert.ok(done.every((line) => !line.includes('sec$ret') && !line.includes('sec$$ret')), 'a secret was reported')
  })

  it('writes the private key with mode 0600 and refuses to overwrite one without --replace', () => {
    const { dir, credentials } = workspace()
    const key = path.join(dir, 'app.pem')
    runExport(parseArgs(['--credentials', credentials, '--pem-file', key]))
    assert.equal(readFileSync(key, 'utf8'), `${pem}\n`)
    assert.equal(statSync(key).mode & 0o777, 0o600)
    assert.throws(() => runExport(parseArgs(['--credentials', credentials, '--pem-file', key])), /pass --replace/)

    // The replaced key leaves the target's directory (a repository, typically) for the
    // credentials file's directory.
    const repo = mkdtempSync(path.join(tmpdir(), 'gh-app-repo-'))
    const target = path.join(repo, 'app.pem')
    writeFileSync(target, 'old key', { mode: 0o644 })
    const done = runExport(parseArgs(['--credentials', credentials, '--pem-file', target, '--replace']))
    assert.deepEqual(readdirSync(repo), ['app.pem'])
    const previous = readdirSync(dir).filter((name) => /^app\.pem\..+\.previous$/.test(name))
    assert.equal(previous.length, 1)
    assert.equal(readFileSync(path.join(dir, previous[0]), 'utf8'), 'old key')
    assert.equal(statSync(path.join(dir, previous[0])).mode & 0o777, 0o600)
    assert.equal(readFileSync(target, 'utf8'), `${pem}\n`)
    assert.match(done[0], /moved the replaced key/)
  })

  it('writes the key with a requested read-only mode for a container user, and refuses writable ones', () => {
    const { dir, credentials } = workspace()
    const key = path.join(dir, 'shared.pem')
    const done = runExport(parseArgs(['--credentials', credentials, '--pem-file', key, '--pem-mode', '0644']))
    assert.equal(statSync(key).mode & 0o777, 0o644)
    assert.match(done[0], /mode 0644/)
    for (const mode of ['0664', '0666', '0755', '9999', 'rw']) {
      assert.throws(() => parseArgs(['--credentials', credentials, '--pem-file', key, '--pem-mode', mode]), /pem-mode/)
    }
  })

  it('refuses a missing field instead of writing an empty value', () => {
    const { dir } = workspace()
    const credentials = path.join(dir, 'partial.json')
    writeFileSync(credentials, JSON.stringify({ id: 1, pem }))
    assert.throws(() => runExport(parseArgs(['--credentials', credentials, '--env-file', path.join(dir, 'e.env'), 'X=client_secret'])), /no client_secret/)
  })
})
