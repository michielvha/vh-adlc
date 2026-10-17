// Registers a GitHub App through GitHub's manifest flow and stores what GitHub returns (App id,
// slug, client id and secret, webhook secret, private key) in a local file with mode 0600, never
// in the terminal, the chat or Git.
//
//   bun register.ts <config.json>
//
// It serves two pages, on 127.0.0.1 or on the tailnet (see reach): /start/<launch key>, a form the user posts to GitHub to
// review and confirm the registration, and /callback, where GitHub returns a one-time code that
// is exchanged for the credentials. The manifest flow can only create an App; it cannot change one
// that exists. Runs on Bun, with no dependencies.

import { randomBytes, timingSafeEqual } from 'node:crypto'
import { chmodSync, existsSync, lstatSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import path from 'node:path'

export type Access = 'read' | 'write' | 'admin'

export type RegistrationConfig = {
  owner: { type: 'user' | 'organization'; login: string; targetId?: number }
  port?: number
  // loopback (the default) serves on 127.0.0.1 for a browser on this machine. tailnet serves on
  // this machine's Tailscale address under its MagicDNS name, for a browser on another of the
  // person's devices; nothing outside the tailnet can reach it.
  reach?: 'loopback' | 'tailnet'
  credentialPath?: string
  afterRegistration?: { note?: string; installLink?: boolean }
  manifest: {
    name: string
    url: string
    description?: string
    public: boolean
    callback_urls?: string[]
    setup_url?: string
    setup_on_update?: boolean
    hook_attributes?: { url: string; active?: boolean }
    default_permissions: Record<string, Access>
    default_events?: string[]
    request_oauth_on_install?: boolean
  }
}

export type Registration = {
  id: number
  slug: string
  pem: string
  client_id?: string
  client_secret?: string
  webhook_secret?: string | null
  owner: string | { login: string }
  permissions: Record<string, string>
  events?: string[]
}

const accessLevels = new Set(['read', 'write', 'admin'])

function isHttpUrl(value: unknown): value is string {
  if (typeof value !== 'string') return false
  try {
    const url = new URL(value)
    return url.protocol === 'https:' || url.protocol === 'http:'
  } catch {
    return false
  }
}

// validateConfig checks a parsed config file and returns it typed, or throws naming what is wrong.
export function validateConfig(raw: unknown): RegistrationConfig {
  const fail = (message: string): never => { throw new Error(`config: ${message}`) }
  if (typeof raw !== 'object' || raw === null) fail('must be a JSON object')
  const config = raw as RegistrationConfig
  const owner = config.owner
  if (!owner || (owner.type !== 'user' && owner.type !== 'organization')) fail('owner.type must be "user" or "organization"')
  if (typeof owner.login !== 'string' || !/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/.test(owner.login)) fail('owner.login is not a GitHub login')
  if (owner.targetId !== undefined && !Number.isSafeInteger(owner.targetId)) fail('owner.targetId must be an integer')
  if (config.port !== undefined && (!Number.isInteger(config.port) || config.port < 1024 || config.port > 65535)) fail('port must be between 1024 and 65535')
  if (config.reach !== undefined && config.reach !== 'loopback' && config.reach !== 'tailnet') fail('reach must be "loopback" or "tailnet"')
  if (config.credentialPath !== undefined && (typeof config.credentialPath !== 'string' || !path.isAbsolute(config.credentialPath))) fail('credentialPath must be an absolute path')

  const m = config.manifest
  if (!m || typeof m !== 'object') fail('manifest is required')
  if (typeof m.name !== 'string' || m.name.length < 1 || m.name.length > 34) fail('manifest.name must be 1 to 34 characters')
  if (!isHttpUrl(m.url)) fail('manifest.url must be an http(s) URL')
  if (typeof m.public !== 'boolean') fail('manifest.public must be true or false')
  if (m.callback_urls !== undefined && (!Array.isArray(m.callback_urls) || m.callback_urls.length > 10 || !m.callback_urls.every(isHttpUrl))) fail('manifest.callback_urls must be up to 10 http(s) URLs')
  if (m.setup_url !== undefined && !isHttpUrl(m.setup_url)) fail('manifest.setup_url must be an http(s) URL')
  if (m.hook_attributes !== undefined && !isHttpUrl(m.hook_attributes.url)) fail('manifest.hook_attributes.url must be an http(s) URL')
  if (m.request_oauth_on_install && m.setup_url) fail('request_oauth_on_install replaces setup_url on GitHub; set one of them')
  const permissions = m.default_permissions
  if (!permissions || typeof permissions !== 'object' || Object.keys(permissions).length === 0) fail('manifest.default_permissions must name at least one permission')
  for (const [name, access] of Object.entries(permissions)) {
    if (!/^[a-z_]+$/.test(name) || !accessLevels.has(access)) fail(`permission ${name}: ${String(access)} is not read, write or admin`)
  }
  if (m.default_events !== undefined && (!Array.isArray(m.default_events) || !m.default_events.every((e) => typeof e === 'string' && /^[a-z_]+$/.test(e)))) fail('manifest.default_events must be event names')
  return config
}

// tailnetEndpoint reads `tailscale status --json` and returns the address to listen on (this
// machine's Tailscale IPv4) and the origin a browser on another tailnet device uses: the MagicDNS
// name when MagicDNS is on, the address otherwise.
export function tailnetEndpoint(status: unknown, port: number): { hostname: string; origin: string } {
  const s = status as { BackendState?: string; Self?: { DNSName?: string; TailscaleIPs?: string[] }; CurrentTailnet?: { MagicDNSEnabled?: boolean } }
  if (s?.BackendState !== undefined && s.BackendState !== 'Running') throw new Error(`Tailscale is ${s.BackendState}, not Running`)
  const ipv4 = s?.Self?.TailscaleIPs?.find((ip) => /^\d+\.\d+\.\d+\.\d+$/.test(ip))
  if (!ipv4) throw new Error('this machine has no Tailscale IPv4 address')
  const name = s.Self?.DNSName?.replace(/\.$/, '')
  const host = s.CurrentTailnet?.MagicDNSEnabled && name ? name : ipv4
  return { hostname: ipv4, origin: `http://${host}:${port}` }
}

// registrationFormUrl is where the manifest is posted: a user's or an organization's new-App page.
export function registrationFormUrl(owner: RegistrationConfig['owner'], state: string): string {
  const base = owner.type === 'organization'
    ? `https://github.com/organizations/${encodeURIComponent(owner.login)}/settings/apps/new`
    : 'https://github.com/settings/apps/new'
  return `${base}?state=${encodeURIComponent(state)}`
}

// buildManifest is the configured manifest with redirect_url pointed at this helper's callback,
// and webhooks off unless the config asks for them.
export function buildManifest(config: RegistrationConfig, origin: string): Record<string, unknown> {
  return {
    hook_attributes: { url: 'https://github.com', active: false },
    default_events: [],
    request_oauth_on_install: false,
    ...config.manifest,
    redirect_url: `${origin}/callback`,
  }
}

export function ownerLogin(registration: Registration): string | undefined {
  return typeof registration.owner === 'string' ? registration.owner : registration.owner?.login
}

// scopeDifferences lists, by name only, where a registration differs from what was requested.
export function scopeDifferences(config: RegistrationConfig, registration: Registration): string[] {
  const differences: string[] = []
  if (ownerLogin(registration)?.toLowerCase() !== config.owner.login.toLowerCase()) differences.push('owner')
  const wanted = config.manifest.default_permissions
  const got = registration.permissions ?? {}
  for (const name of new Set([...Object.keys(wanted), ...Object.keys(got)])) {
    if (wanted[name] !== got[name]) differences.push(`permission ${name}`)
  }
  if (registration.events !== undefined) {
    const wantedEvents = new Set(config.manifest.default_events ?? [])
    const gotEvents = new Set(registration.events)
    for (const event of new Set([...wantedEvents, ...gotEvents])) {
      if (wantedEvents.has(event) !== gotEvents.has(event)) differences.push(`event ${event}`)
    }
  }
  return differences
}

const escapeHtml = (value: string) => value
  .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;').replaceAll("'", '&#39;')

function sameSecret(a: string, b: string): boolean {
  const left = Buffer.from(a)
  const right = Buffer.from(b)
  return left.length === right.length && timingSafeEqual(left, right)
}

export function createRegistrationHandler(options: {
  config: RegistrationConfig
  origin: string
  state: string
  launchKey: string
  exchange: (code: string) => Promise<Registration>
  save: (registration: Registration) => void
  onRegistered?: () => void
}) {
  const { config, origin } = options
  let consumed = false
  let registeredSlug: string | undefined
  const respond = (body: string, status = 200, html = false) => new Response(body, {
    status,
    headers: {
      'Content-Type': html ? 'text/html; charset=utf-8' : 'text/plain; charset=utf-8',
      'Cache-Control': 'no-store',
      'Referrer-Policy': 'no-referrer',
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'none'; form-action https://github.com; base-uri 'none'; frame-ancestors 'none'",
    },
  })
  const page = (title: string, body: string, status = 200) => respond(
    `<!doctype html><html lang="en"><meta charset="utf-8"><title>${escapeHtml(title)}</title><h1>${escapeHtml(title)}</h1>${body}</html>`, status, true)

  return async (request: Request): Promise<Response> => {
    const url = new URL(request.url)
    if (url.origin !== origin || request.method !== 'GET') return respond('Not found', 404)

    if (url.pathname === `/start/${options.launchKey}`) {
      const manifest = buildManifest(config, origin)
      const scope = Object.entries(config.manifest.default_permissions).map(([name, access]) => `${name}: ${access}`).join(', ')
      const events = (config.manifest.default_events ?? []).join(', ') || 'none'
      return page(config.manifest.name,
        `<p>${config.manifest.public ? 'Public' : 'Private'} GitHub App owned by ${escapeHtml(config.owner.login)}.</p>` +
        `<p>Permissions: ${escapeHtml(scope)}. Webhook events: ${escapeHtml(events)}.</p>` +
        `<form method="post" action="${escapeHtml(registrationFormUrl(config.owner, options.state))}">` +
        `<input type="hidden" name="manifest" value="${escapeHtml(JSON.stringify(manifest))}">` +
        '<button type="submit">Review registration on GitHub</button></form>')
    }

    if (url.pathname === '/callback') {
      const code = url.searchParams.get('code')
      const state = url.searchParams.get('state') ?? ''
      if (!sameSecret(state, options.state) || !code || !/^[a-zA-Z0-9_-]{10,200}$/.test(code)) return respond('Invalid registration callback.', 400)
      if (consumed) return respond('Registration callback already consumed.', 409)
      consumed = true
      let registration: Registration
      try {
        registration = await options.exchange(code)
        if (!Number.isSafeInteger(registration.id) || !/^[a-z0-9-]+$/.test(registration.slug) || !registration.pem?.includes('PRIVATE KEY')) throw new Error('invalid registration')
      } catch {
        return respond('The registration code could not be exchanged for credentials. Nothing was stored and no credential value was logged. Check the App in GitHub settings before registering again.', 502)
      }
      try {
        options.save(registration)
      } catch {
        return respond(`The App ${registration.slug} exists on GitHub, but its credentials could not be stored locally. Generate a new private key and client secret in its GitHub settings.`, 502)
      }
      registeredSlug = registration.slug
      options.onRegistered?.()
      const differences = scopeDifferences(config, registration)
      if (differences.length > 0) {
        return respond(`App saved locally, but it differs from the requested scope (${differences.join(', ')}). Do not install it; inspect its GitHub settings.`, 409)
      }
      const note = config.afterRegistration?.note ? `<p>${escapeHtml(config.afterRegistration.note)}</p>` : ''
      const target = config.owner.targetId ? `?target_id=${config.owner.targetId}` : ''
      const link = config.afterRegistration?.installLink === false
        ? ''
        : `<p><a href="https://github.com/apps/${registeredSlug}/installations/new${target}">Install on GitHub</a></p>`
      return page('App registered', `<p>${escapeHtml(registeredSlug)} is registered. Its credentials are stored locally, outside Git.</p>${note}${link}`)
    }

    if (url.pathname === '/status') return respond(registeredSlug ? 'registered' : 'awaiting-registration')
    return respond('Not found', 404)
  }
}

export async function exchangeCode(code: string): Promise<Registration> {
  const response = await fetch(`https://api.github.com/app-manifests/${encodeURIComponent(code)}/conversions`, {
    method: 'POST',
    headers: { Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' },
    redirect: 'error',
    signal: AbortSignal.timeout(30_000),
  })
  if (!response.ok) throw new Error('conversion failed')
  return await response.json() as Registration
}

export function saveRegistration(credentialPath: string, registration: Registration): void {
  writeFileSync(credentialPath, JSON.stringify({
    id: registration.id,
    slug: registration.slug,
    owner: ownerLogin(registration),
    client_id: registration.client_id,
    client_secret: registration.client_secret,
    webhook_secret: registration.webhook_secret ?? null,
    pem: registration.pem,
    permissions: registration.permissions,
    events: registration.events ?? [],
    registered_at: new Date().toISOString(),
  }, null, 2), { mode: 0o600, flag: 'wx' })
}

function main(): void {
  const configPath = process.argv[2]
  if (!configPath) throw new Error('usage: register.ts <config.json>')
  const config = validateConfig(JSON.parse(readFileSync(configPath, 'utf8')))
  const port = config.port ?? 8768
  let hostname = '127.0.0.1'
  let origin = `http://127.0.0.1:${port}`
  if (config.reach === 'tailnet') {
    const status = Bun.spawnSync(['tailscale', 'status', '--json'])
    if (status.exitCode !== 0) throw new Error('`tailscale status --json` failed; is Tailscale installed and up?')
    ;({ hostname, origin } = tailnetEndpoint(JSON.parse(status.stdout.toString()), port))
  }
  const credentialPath = config.credentialPath ?? path.join(homedir(), '.local/share/github-apps', `${config.manifest.name}.json`)
  const directory = path.dirname(credentialPath)
  mkdirSync(directory, { recursive: true, mode: 0o700 })
  if (lstatSync(directory).isSymbolicLink()) throw new Error('credential directory must not be a symlink')
  chmodSync(directory, 0o700)
  if (existsSync(credentialPath)) throw new Error(`${credentialPath} already exists; refusing to overwrite`)

  const state = randomBytes(32).toString('hex')
  const launchKey = randomBytes(24).toString('hex')
  let timeout: ReturnType<typeof setTimeout> | undefined
  // Bun builds request.url from the Host header, so a page reached under another name (DNS
  // rebinding) fails the handler's origin check.
  const server = Bun.serve({
    hostname,
    port,
    fetch: createRegistrationHandler({
      config, origin, state, launchKey,
      exchange: exchangeCode,
      save: (registration) => saveRegistration(credentialPath, registration),
      onRegistered: () => setTimeout(() => stop(`Registered. Credentials stored in ${credentialPath} (mode 0600). Stopped listening.`), 3_000),
    }),
  })
  const stop = (message: string) => {
    console.log(message)
    clearTimeout(timeout)
    server.stop(true)
  }
  timeout = setTimeout(() => stop('No registration within 30 minutes. Stopped listening; nothing was stored.'), 30 * 60_000)
  console.log(`Registration link: ${origin}/start/${launchKey}`)
  console.log(`Listening on ${config.reach === 'tailnet' ? 'the tailnet only' : 'loopback only'}. Credential values and callback codes are never logged.`)
}

if (import.meta.main) main()
