// Copies values from a credentials file written by register.ts into the places a project reads
// them, without printing any of them.
//
//   bun export.ts --credentials <file> [--env-file <path> KEY=field ...] [--compose-escape]
//                 [--pem-file <path> [--pem-mode 0644] [--replace]]
//
// KEY=field sets KEY in the env file to the credential's field: id, slug, owner, client_id,
// client_secret or webhook_secret. A KEY already in the file is replaced in place; a new one is
// appended. --compose-escape doubles every `$`, as Docker Compose needs in an env_file value.
// --pem-file writes the private key with mode 0600, or --pem-mode when a container running as
// another user must read it (0644 at most: never group or world writable). An existing key file
// is refused unless --replace is given, and then moved beside the credentials file (outside any
// repository) as <name>.<timestamp>.previous, mode 0600.

import { chmodSync, constants as fsConstants, copyFileSync, existsSync, readFileSync, renameSync, statSync, unlinkSync, writeFileSync } from 'node:fs'
import path from 'node:path'

export const exportableFields = ['id', 'slug', 'owner', 'client_id', 'client_secret', 'webhook_secret'] as const
type Field = typeof exportableFields[number]

export type Credentials = Partial<Record<Field, string | number | null>> & { pem?: string }

export type ExportPlan = {
  credentials: string
  envFile?: string
  assignments: Array<{ key: string; field: Field }>
  composeEscape: boolean
  pemFile?: string
  replace: boolean
  pemMode: number
}

export function parseArgs(argv: string[]): ExportPlan {
  const plan: ExportPlan = { credentials: '', assignments: [], composeEscape: false, replace: false, pemMode: 0o600 }
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    const next = () => {
      const value = argv[++i]
      if (value === undefined) throw new Error(`${arg} needs a value`)
      return value
    }
    if (arg === '--credentials') plan.credentials = next()
    else if (arg === '--env-file') plan.envFile = next()
    else if (arg === '--pem-file') plan.pemFile = next()
    else if (arg === '--compose-escape') plan.composeEscape = true
    else if (arg === '--replace') plan.replace = true
    else if (arg === '--pem-mode') {
      const mode = next()
      if (!/^0?[0-7]{3}$/.test(mode)) throw new Error('--pem-mode takes an octal mode such as 0600')
      plan.pemMode = Number.parseInt(mode, 8)
      if ((plan.pemMode & 0o133) !== 0) throw new Error('--pem-mode must not let anyone but the owner write, nor anyone execute (0644 at most)')
    }
    else {
      const match = /^([A-Z_][A-Z0-9_]*)=([a-z_]+)$/.exec(arg)
      if (!match) throw new Error(`unexpected argument ${arg}`)
      const field = match[2] as Field
      if (!exportableFields.includes(field)) throw new Error(`${match[2]} is not one of ${exportableFields.join(', ')}`)
      plan.assignments.push({ key: match[1], field })
    }
  }
  if (!plan.credentials) throw new Error('--credentials is required')
  if (plan.assignments.length > 0 && !plan.envFile) throw new Error('KEY=field needs --env-file')
  if (plan.envFile && plan.assignments.length === 0) throw new Error('--env-file needs at least one KEY=field')
  if (!plan.envFile && !plan.pemFile) throw new Error('nothing to do: give --env-file or --pem-file')
  return plan
}

// setEnvValues returns the env file's text with each key set: replaced where it is assigned,
// appended where it is not. Comments, blank lines and other keys are kept as they are.
export function setEnvValues(text: string, values: Map<string, string>): string {
  const pending = new Map(values)
  const lines = text.length > 0 ? text.replace(/\n$/, '').split('\n') : []
  const out = lines.map((line) => {
    const key = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=/.exec(line)?.[1]
    if (key === undefined || !pending.has(key)) return line
    const value = pending.get(key) as string
    pending.delete(key)
    return `${key}=${value}`
  })
  for (const [key, value] of pending) out.push(`${key}=${value}`)
  return `${out.join('\n')}\n`
}

// writeAtomically replaces a file through a temporary file beside it, keeping its mode (0600 for
// a new file), so a reader never sees half a file.
function writeAtomically(file: string, content: string, defaultMode: number): void {
  const mode = existsSync(file) ? statSync(file).mode & 0o777 : defaultMode
  const temporary = path.join(path.dirname(file), `.${path.basename(file)}.${process.pid}.tmp`)
  writeFileSync(temporary, content, { mode, flag: 'wx' })
  chmodSync(temporary, mode)
  renameSync(temporary, file)
}

export function runExport(plan: ExportPlan): string[] {
  const credentials = JSON.parse(readFileSync(plan.credentials, 'utf8')) as Credentials
  const done: string[] = []
  if (plan.envFile) {
    const values = new Map<string, string>()
    for (const { key, field } of plan.assignments) {
      const raw = credentials[field]
      if (raw === undefined || raw === null || raw === '') throw new Error(`the credentials have no ${field}`)
      const value = String(raw)
      if (/[\r\n]/.test(value)) throw new Error(`${field} spans lines and cannot go in an env file`)
      values.set(key, plan.composeEscape ? value.replaceAll('$', '$$$$') : value)
    }
    const current = existsSync(plan.envFile) ? readFileSync(plan.envFile, 'utf8') : ''
    writeAtomically(plan.envFile, setEnvValues(current, values), 0o600)
    done.push(`set ${[...values.keys()].join(', ')} in ${plan.envFile}`)
  }
  if (plan.pemFile) {
    if (!credentials.pem?.includes('PRIVATE KEY')) throw new Error('the credentials hold no private key')
    if (existsSync(plan.pemFile)) {
      if (!plan.replace) throw new Error(`${plan.pemFile} exists; pass --replace to move it beside the credentials file and write the new key`)
      if (statSync(plan.pemFile).isDirectory()) throw new Error(`${plan.pemFile} is a directory`)
      // The replaced key goes beside the credentials file, outside any repository: kept next to
      // the target it would be a stray key file that a .gitignore entry for the target misses.
      const stamp = new Date().toISOString().replace(/[:.]/g, '-')
      const previous = path.join(path.dirname(path.resolve(plan.credentials)), `${path.basename(plan.pemFile)}.${stamp}.previous`)
      copyFileSync(plan.pemFile, previous, fsConstants.COPYFILE_EXCL)
      chmodSync(previous, 0o600)
      unlinkSync(plan.pemFile)
      done.push(`moved the replaced key to ${previous} (mode 0600)`)
    }
    writeFileSync(plan.pemFile, credentials.pem.endsWith('\n') ? credentials.pem : `${credentials.pem}\n`, { mode: plan.pemMode, flag: 'wx' })
    chmodSync(plan.pemFile, plan.pemMode)
    done.push(`wrote the private key to ${plan.pemFile} (mode ${plan.pemMode.toString(8).padStart(4, '0')})`)
  }
  return done
}

if (import.meta.main) {
  for (const line of runExport(parseArgs(process.argv.slice(2)))) console.log(line)
}
