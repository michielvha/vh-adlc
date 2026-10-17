import assert from 'node:assert/strict'
import { describe, it } from 'bun:test'
import {
  buildManifest, createRegistrationHandler, registrationFormUrl, scopeDifferences, tailnetEndpoint, validateConfig,
  type Registration, type RegistrationConfig,
} from './register.ts'

const origin = 'http://127.0.0.1:8768'
const state = 'a'.repeat(64)
const launchKey = 'b'.repeat(48)
const code = 'code_0123456789'

const config: RegistrationConfig = validateConfig({
  owner: { type: 'user', login: 'octo-user' },
  manifest: {
    name: 'example-app',
    url: 'https://example.com',
    public: false,
    callback_urls: ['https://example.com/authorized'],
    setup_url: 'https://example.com/installed',
    hook_attributes: { url: 'https://example.com/webhook', active: true },
    default_permissions: { contents: 'read', metadata: 'read', statuses: 'write' },
    default_events: ['push', 'pull_request'],
  },
})

const secrets = { pem: '-----BEGIN RSA PRIVATE KEY-----\nsecret-key\n-----END RSA PRIVATE KEY-----', client_secret: 'client-secret-value', webhook_secret: 'webhook-secret-value' }

function registration(overrides: Partial<Registration> = {}): Registration {
  return {
    id: 123, slug: 'example-app', client_id: 'Iv1.client', owner: { login: 'octo-user' },
    permissions: { contents: 'read', metadata: 'read', statuses: 'write' }, events: ['push', 'pull_request'],
    ...secrets, ...overrides,
  }
}

function handlerWith(exchange: (code: string) => Promise<Registration>, save: (r: Registration) => void = () => {}) {
  let registered = 0
  const handler = createRegistrationHandler({ config, origin, state, launchKey, exchange, save, onRegistered: () => { registered++ } })
  return { handler, registered: () => registered }
}

const get = (path: string, base = origin) => new Request(`${base}${path}`)
const callback = (query: string) => get(`/callback?${query}`)

describe('validateConfig', () => {
  const valid = JSON.parse(JSON.stringify(config))
  const broken = (mutate: (c: any) => void) => { const c = JSON.parse(JSON.stringify(valid)); mutate(c); return c }

  it('accepts a complete config', () => { assert.doesNotThrow(() => validateConfig(valid)) })
  for (const [name, mutate] of [
    ['an unknown owner type', (c: any) => { c.owner.type = 'team' }],
    ['a login with a slash', (c: any) => { c.owner.login = 'a/b' }],
    ['a name over 34 characters', (c: any) => { c.manifest.name = 'x'.repeat(35) }],
    ['an access level that does not exist', (c: any) => { c.manifest.default_permissions.contents = 'owner' }],
    ['a callback URL that is not a URL', (c: any) => { c.manifest.callback_urls = ['javascript:alert(1)'] }],
    ['OAuth on install beside a setup URL', (c: any) => { c.manifest.request_oauth_on_install = true }],
    ['a relative credential path', (c: any) => { c.credentialPath = 'creds.json' }],
    ['no permissions', (c: any) => { c.manifest.default_permissions = {} }],
  ] as const) {
    it(`rejects ${name}`, () => { assert.throws(() => validateConfig(broken(mutate)), /^Error: config: /) })
  }
})

describe('tailnetEndpoint', () => {
  const status = {
    BackendState: 'Running',
    Self: { DNSName: 'host-1.tail1234.ts.net.', TailscaleIPs: ['100.64.0.7', 'fd7a:115c:a1e0::7'] },
    CurrentTailnet: { MagicDNSEnabled: true },
  }
  it('listens on the Tailscale IPv4 address under the MagicDNS name', () => {
    assert.deepEqual(tailnetEndpoint(status, 8768), { hostname: '100.64.0.7', origin: 'http://host-1.tail1234.ts.net:8768' })
  })
  it('uses the address itself when MagicDNS is off', () => {
    assert.deepEqual(tailnetEndpoint({ ...status, CurrentTailnet: { MagicDNSEnabled: false } }, 8768), { hostname: '100.64.0.7', origin: 'http://100.64.0.7:8768' })
  })
  it('refuses when Tailscale is not running or has no IPv4 address', () => {
    assert.throws(() => tailnetEndpoint({ ...status, BackendState: 'Stopped' }, 8768), /not Running/)
    assert.throws(() => tailnetEndpoint({ ...status, Self: { TailscaleIPs: ['fd7a::1'] } }, 8768), /no Tailscale IPv4/)
  })
  it('answers the tailnet origin and refuses the bare address behind it', async () => {
    const tailnetOrigin = 'http://host-1.tail1234.ts.net:8768'
    const handler = createRegistrationHandler({ config, origin: tailnetOrigin, state, launchKey, exchange: async () => registration(), save: () => {} })
    assert.equal((await handler(new Request(`${tailnetOrigin}/start/${launchKey}`))).status, 200)
    assert.equal((await handler(new Request(`http://100.64.0.7:8768/start/${launchKey}`))).status, 404)
  })
})

describe('registrationFormUrl', () => {
  it('posts a user-owned App to the user settings page', () => {
    assert.equal(registrationFormUrl({ type: 'user', login: 'octo-user' }, 's'), 'https://github.com/settings/apps/new?state=s')
  })
  it('posts an organization-owned App to the organization settings page', () => {
    assert.equal(registrationFormUrl({ type: 'organization', login: 'acme' }, 's'), 'https://github.com/organizations/acme/settings/apps/new?state=s')
  })
})

describe('buildManifest', () => {
  it('points redirect_url at this helper and keeps the configured URLs', () => {
    const manifest = buildManifest(config, origin)
    assert.equal(manifest.redirect_url, `${origin}/callback`)
    assert.equal(manifest.setup_url, 'https://example.com/installed')
    assert.deepEqual(manifest.callback_urls, ['https://example.com/authorized'])
  })
  it('turns webhooks off when none are configured', () => {
    const { hook_attributes: _, ...withoutHooks } = config.manifest
    const manifest = buildManifest({ ...config, manifest: withoutHooks }, origin)
    assert.deepEqual(manifest.hook_attributes, { url: 'https://github.com', active: false })
  })
})

describe('scopeDifferences', () => {
  it('finds none for the requested scope, ignoring login case', () => {
    assert.deepEqual(scopeDifferences(config, registration({ owner: 'Octo-User' })), [])
  })
  it('names a different owner, a widened permission, an extra permission and a missing event', () => {
    const diff = scopeDifferences(config, registration({
      owner: { login: 'someone-else' },
      permissions: { contents: 'write', metadata: 'read', statuses: 'write', administration: 'write' },
      events: ['push'],
    }))
    assert.deepEqual(diff, ['owner', 'permission contents', 'permission administration', 'event pull_request'])
  })
})

describe('createRegistrationHandler', () => {
  const never = async (): Promise<Registration> => { throw new Error('exchange must not be called') }

  it('answers only GET requests on its own origin', async () => {
    const { handler } = handlerWith(never)
    assert.equal((await handler(get(`/start/${launchKey}`, 'http://attacker.example:8768'))).status, 404)
    assert.equal((await handler(new Request(`${origin}/start/${launchKey}`, { method: 'POST' }))).status, 404)
    assert.equal((await handler(get('/start/wrong-key'))).status, 404)
  })

  it('serves a form posting the escaped manifest to the owner settings page', async () => {
    const { handler } = handlerWith(never)
    const response = await handler(get(`/start/${launchKey}`))
    const html = await response.text()
    assert.equal(response.status, 200)
    assert.match(response.headers.get('Content-Security-Policy') ?? '', /form-action https:\/\/github\.com/)
    assert.ok(html.includes(`action="https://github.com/settings/apps/new?state=${state}"`))
    assert.ok(html.includes('&quot;redirect_url&quot;:&quot;http://127.0.0.1:8768/callback&quot;'))
    assert.ok(!/value="[^"]*[<>'][^"]*"/.test(html), 'manifest attribute must be escaped')
  })

  it('refuses a callback with a wrong state or a malformed code without exchanging it', async () => {
    const { handler } = handlerWith(never)
    assert.equal((await handler(callback(`state=${'c'.repeat(64)}&code=${code}`))).status, 400)
    assert.equal((await handler(callback(`state=short&code=${code}`))).status, 400)
    assert.equal((await handler(callback(`state=${state}&code=bad%20code!`))).status, 400)
    assert.equal((await handler(callback(`state=${state}`))).status, 400)
  })

  it('exchanges once, stores the credentials and links the installation without echoing secrets', async () => {
    const saved: Registration[] = []
    const exchanged: string[] = []
    const { handler, registered } = handlerWith(async (c) => { exchanged.push(c); return registration() }, (r) => saved.push(r))
    const response = await handler(callback(`state=${state}&code=${code}`))
    const html = await response.text()
    assert.equal(response.status, 200)
    assert.deepEqual(exchanged, [code])
    assert.equal(saved.length, 1)
    assert.equal(registered(), 1)
    assert.ok(html.includes('https://github.com/apps/example-app/installations/new'))
    for (const value of [...Object.values(secrets), code]) assert.ok(!html.includes(value), 'a secret reached the page')
    assert.equal(await (await handler(get('/status'))).text(), 'registered')

    const again = await handler(callback(`state=${state}&code=${code}`))
    assert.equal(again.status, 409)
    assert.equal(saved.length, 1)
  })

  it('stores nothing when the exchange fails or returns no private key', async () => {
    for (const exchange of [async () => { throw new Error('boom') }, async () => registration({ pem: 'not a key' })]) {
      const saved: Registration[] = []
      const { handler } = handlerWith(exchange as () => Promise<Registration>, (r) => saved.push(r))
      const response = await handler(callback(`state=${state}&code=${code}`))
      assert.equal(response.status, 502)
      assert.equal(saved.length, 0)
      assert.equal(await (await handler(get('/status'))).text(), 'awaiting-registration')
    }
  })

  it('stores a registration whose scope differs, then refuses to offer installing it', async () => {
    const saved: Registration[] = []
    const { handler } = handlerWith(async () => registration({ permissions: { contents: 'write', metadata: 'read', statuses: 'write' } }), (r) => saved.push(r))
    const response = await handler(callback(`state=${state}&code=${code}`))
    const text = await response.text()
    assert.equal(response.status, 409)
    assert.equal(saved.length, 1, 'the key is returned once and must be kept')
    assert.match(text, /permission contents/)
    assert.ok(!text.includes('installations/new'))
  })

  it('says the App exists when local storage fails, so its keys can be regenerated', async () => {
    const { handler } = handlerWith(async () => registration(), () => { throw new Error('disk full') })
    const response = await handler(callback(`state=${state}&code=${code}`))
    assert.equal(response.status, 502)
    assert.match(await response.text(), /example-app exists on GitHub/)
  })
})
