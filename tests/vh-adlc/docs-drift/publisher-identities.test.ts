import { afterAll, expect, test } from 'bun:test';
import { rmSync } from 'node:fs';
import { parseSettings, settingsProjections } from '../../../plugins/vh-adlc/scripts/docs-drift/settings';
import { collectTrialBindings, verifyRuntimeAdoption } from '../../../plugins/vh-adlc/scripts/docs-drift/adoption';
import { canonicalJSON, canonicalDigest } from '../../../plugins/vh-adlc/scripts/docs-drift/protocol';
import { settingsFixture } from './settings-fixture';
import { compatibleTrialUpgrade, trialUpgradeFixture, trialAdoptionDelivery } from './adoption-trial-fixture';
import { trialDefinitionFixture } from './trial-definition-fixture';
import { source, write, commit, portableRecord, deliverRecord, runtimeIdentity } from './adoption-fixture';
const roots: string[] = [];
afterAll(() => { for (const root of roots) rmSync(root, { recursive: true, force: true }); });
const entries = { hosted: 'fixture-bot', copilot: 'fixture-owner', claude: 'fixture-owner' };
function mapped() {
  const value = settingsFixture();
  return { ...value, publication: { ...value.publication, entry_actors: { ...entries } },
    pr_discovery: { ...value.pr_discovery, authors: ['fixture-bot', 'fixture-owner'] } };
}
test('legacy scalar settings retain an absent entry map', () => {
  expect(Object.hasOwn(parseSettings(settingsFixture()).publication, 'entry_actors')).toBe(false);
});
test('explicit hosted bot and interactive owner map is protected settings', () => {
  const value = parseSettings(mapped());
  expect(value.publication).toHaveProperty('entry_actors', entries);
  expect(settingsProjections(value).protected.publication).toHaveProperty('entry_actors', entries);
});
test('mapped publishers require explicit discovery authors', () => {
  const value = mapped(); value.pr_discovery.authors = ['fixture-bot'];
  expect(() => parseSettings(value)).toThrow();
});
test('an adopted interactive owner selects its own recorded native identity', () => {
  const base = source(roots), settings = { ...base.configured, publication: { ...base.configured.publication, entry_actors: entries },
    pr_discovery: { ...base.configured.pr_discovery, authors: ['fixture-bot', 'fixture-owner'] } };
  write(base.repo, '.vh-adlc/docs-drift.yaml', canonicalJSON(settings));
  const f = { ...base, configured: settings, candidate: commit(base.repo, 'synthetic mapped source') };
  const identities = { hosted: { actor: 'fixture-bot', actor_id: 20 }, copilot: { actor: 'Fixture-Owner', actor_id: 30 },
    claude: { actor: 'fixture-owner', actor_id: 30 } };
  const record = portableRecord(f, identities), current = deliverRecord(f, record);
  expect(verifyRuntimeAdoption({ repo: f.repo, current_default: current, entry: 'copilot',
    identity: { ...runtimeIdentity, actor: 'FIXTURE-OWNER', actor_id: 30 } }).identity.actor).toBe('Fixture-Owner');
});

test.each([
  { name: 'missing entry', value: { hosted: 'fixture-bot', copilot: 'fixture-owner' } },
  { name: 'unknown entry', value: { ...entries, other: 'fixture-owner' } },
  { name: 'null map', value: null },
  { name: 'invalid value', value: { ...entries, copilot: 20 } },
  { name: 'whitespace login', value: { ...entries, copilot: 'two words' } },
  { name: 'changed hosted selector', value: { ...entries, hosted: 'foreign-bot' } },
])('entry mapping rejects $name', ({ value }) => {
  const settings = mapped();
  expect(() => parseSettings({ ...settings, publication: { ...settings.publication, entry_actors: value } })).toThrow();
});

test('mapped discovery requires the PR branch namespace while scalar validation retains its old scope', () => {
  const scalar = settingsFixture(); scalar.pr_discovery.branch_prefixes = ['unrelated/'];
  expect(parseSettings(scalar).pr_discovery.branch_prefixes).toEqual(['unrelated/']);
  const settings = mapped(); settings.pr_discovery.branch_prefixes = ['unrelated/'];
  expect(() => parseSettings(settings)).toThrow('publication docs-drift/');
  settings.publication.branch_prefix = 'docs/drift/'; settings.pr_discovery.branch_prefixes = ['docs/'];
  expect(parseSettings(settings).publication.branch_prefix).toBe('docs/drift/');
});

test('configured casing remains a protected byte change and discovery accepts native casing', () => {
  const original = mapped(), changed = mapped();
  changed.publication.entry_actors.copilot = 'FIXTURE-OWNER';
  const first = settingsProjections(parseSettings(original)).protected;
  const next = settingsProjections(parseSettings(changed)).protected;
  expect(canonicalJSON(first).equals(canonicalJSON(next))).toBe(false);
  expect(parseSettings(changed).publication.entry_actors?.copilot).toBe('FIXTURE-OWNER');
});

test('mapped adoption requires the selected entry and its exact native numeric account', () => {
  const base = source(roots), settings = { ...base.configured, publication: { ...base.configured.publication, entry_actors: entries },
    pr_discovery: { ...base.configured.pr_discovery, authors: ['fixture-bot', 'fixture-owner'] } };
  write(base.repo, '.vh-adlc/docs-drift.yaml', canonicalJSON(settings));
  const f = { ...base, configured: settings, candidate: commit(base.repo, 'synthetic per-entry source') };
  const identities = { hosted: { actor: 'fixture-bot', actor_id: 20 }, copilot: { actor: 'Fixture-Owner', actor_id: 30 },
    claude: { actor: 'fixture-owner', actor_id: 30 } };
  const current = deliverRecord(f, portableRecord(f, identities));
  const owner = { ...runtimeIdentity, actor: 'FIXTURE-OWNER', actor_id: 30 };
  expect(() => verifyRuntimeAdoption({ repo: f.repo, current_default: current, identity: owner })).toThrow('publisher entry required');
  expect(() => verifyRuntimeAdoption({ repo: f.repo, current_default: current, entry: 'hosted', identity: owner })).toThrow('current native adoption identity');
  expect(() => verifyRuntimeAdoption({ repo: f.repo, current_default: current, entry: 'copilot', identity: { ...owner, actor_id: 31 } })).toThrow('current native adoption identity');
  expect(verifyRuntimeAdoption({ repo: f.repo, current_default: current, entry: 'hosted', identity: runtimeIdentity }).identity).toEqual(runtimeIdentity);
  expect(verifyRuntimeAdoption({ repo: f.repo, current_default: current, entry: 'claude', identity: owner }).identity.actor).toBe('fixture-owner');
});

test.each(['scalar-record', 'missing-native-entry', 'missing-receipt-identity', 'changed-receipt-identity'] as const)(
  'mapped adoption refuses incomplete native evidence %s', failure => {
    const base = source(roots), settings = { ...base.configured, publication: { ...base.configured.publication, entry_actors: entries },
      pr_discovery: { ...base.configured.pr_discovery, authors: ['fixture-bot', 'fixture-owner'] } };
    write(base.repo, '.vh-adlc/docs-drift.yaml', canonicalJSON(settings));
    const f = { ...base, configured: settings, candidate: commit(base.repo, 'synthetic incomplete map source') };
    const identities = { hosted: { actor: 'fixture-bot', actor_id: 20 }, copilot: { actor: 'fixture-owner', actor_id: 30 },
      claude: { actor: 'fixture-owner', actor_id: 30 } };
    const record = failure === 'scalar-record' ? portableRecord(f) : portableRecord(f, identities);
    if (failure === 'missing-native-entry') Reflect.deleteProperty(record.entry_identities!, 'claude');
    if (failure === 'missing-receipt-identity') Reflect.deleteProperty(record.receipts.copilot_entry!, 'publisher_identity');
    if (failure === 'changed-receipt-identity') Object.assign(record.receipts.copilot_entry!, { publisher_identity: { actor: 'fixture-owner', actor_id: 31 } });
    const current = deliverRecord(f, record);
    expect(() => verifyRuntimeAdoption({ repo: f.repo, current_default: current, entry: 'copilot',
      identity: { ...runtimeIdentity, actor: 'fixture-owner', actor_id: 30 } })).toThrow();
  });

test('mapped selectors preserve native managed-user underscores', () => {
  const value = mapped();
  value.publication.entry_actors.copilot = 'fixture-owner_enterprise';
  value.publication.entry_actors.claude = 'fixture-owner_enterprise';
  value.pr_discovery.authors.push('fixture-owner_enterprise');
  expect(parseSettings(value).publication.entry_actors?.copilot).toBe('fixture-owner_enterprise');
});


test('an original hosted entry must retain the exact root identity spelling', () => {
  const base = source(roots), settings = { ...base.configured, publication: { ...base.configured.publication, entry_actors: entries },
    pr_discovery: { ...base.configured.pr_discovery, authors: [...new Set(Object.values(entries))] } };
  write(base.repo, '.vh-adlc/docs-drift.yaml', canonicalJSON(settings));
  const f = { ...base, configured: settings, candidate: commit(base.repo, 'synthetic hosted identity spelling') };
  const identities = { hosted: { actor: 'FIXTURE-BOT', actor_id: 20 }, copilot: { actor: 'fixture-owner', actor_id: 30 },
    claude: { actor: 'fixture-owner', actor_id: 30 } };
  const current = deliverRecord(f, portableRecord(f, identities));
  expect(() => verifyRuntimeAdoption({ repo: f.repo, current_default: current, entry: 'hosted', identity: runtimeIdentity })).toThrow('hosted entry identity');
});

test('mapped interactive trial bindings require an observed native identity', () => {
  const f = trialDefinitionFixture(roots, { entry_actors: entries });
  expect(() => collectTrialBindings({ repo: f.repo, current_default: f.staged, entry: 'claude' })).toThrow('current native trial identity');
  expect(collectTrialBindings({ repo: f.repo, current_default: f.staged, entry: 'claude',
    identity: { ...runtimeIdentity, actor: 'Fixture-Owner', actor_id: 30 } }).identity.actor).toBe('Fixture-Owner');
});

test.each(['compatible', 'trial'] as const)('a %s successor cannot recase a carried native identity', route => {
  const base = source(roots), settings = { ...base.configured, publication: { ...base.configured.publication, entry_actors: entries },
    pr_discovery: { ...base.configured.pr_discovery, authors: [...new Set(Object.values(entries))] } };
  write(base.repo, '.vh-adlc/docs-drift.yaml', canonicalJSON(settings));
  write(base.repo, settings.execution.scheduled_workflow, canonicalJSON({ on: { schedule: [{ cron: '0 6 * * *' }], workflow_dispatch: null },
    permissions: settings.execution.permissions, jobs: { worker: { uses: './' + settings.execution.worker_workflow,
      with: { component_pin: settings.component_pin, pr_draft: settings.publication.pr_state.advisory === 'draft' },
      secrets: { COPILOT_GITHUB_TOKEN: '${{ secrets.COPILOT_GITHUB_TOKEN }}' } } } }));
  const f = { ...base, configured: settings, candidate: commit(base.repo, 'synthetic mapped predecessor') };
  const identities = { hosted: { actor: 'fixture-bot', actor_id: 20 }, copilot: { actor: 'fixture-owner', actor_id: 30 },
    claude: { actor: 'fixture-owner', actor_id: 30 } };
  const original = { source: f.repo, configured: settings, candidate: f.candidate, record: portableRecord(f, identities),
    manifest: { fixture_id: '00000000-0000-0000-0000-000000000001' } };
  const successor = route === 'compatible' ? compatibleTrialUpgrade(original) : trialUpgradeFixture(original, { surface: 'hosted', change_definition: definition => {
    definition.classification = 'execution'; definition.affected_entries = ['hosted']; definition.component_entries = ['hosted']; definition.changed_rules = [];
  } });
  const record = successor.record;
  // Convert only synthetic receipt metadata into the production parser's observed-shaped fixture.
  // These controls establish no native or hosted acceptance.
  function observedShape(value: unknown): void {
    if (!value || typeof value !== 'object') return;
    Reflect.deleteProperty(value, 'fixture_id');
    if ('evidence_kind' in value) Reflect.set(value, 'evidence_kind', 'observed');
    for (const child of Object.values(value)) observedShape(child);
  }
  observedShape(record);
  const selected = { ...original, configured: successor.configured, candidate: successor.candidate, record };
  const valid = trialAdoptionDelivery(selected);
  expect(verifyRuntimeAdoption({ repo: f.repo, current_default: valid, entry: 'hosted', identity: runtimeIdentity }).evidence).toBe('owner-attestation');
  record.entry_identities!.copilot.actor = 'Fixture-Owner';
  // Fresh successor receipts can bind the new target while carried entry receipts retain their old bytes.
  const target = canonicalDigest({ schema_version: 2, repository: successor.configured.repository,
    source_candidate: record.source_candidate, protected_sha256: record.protected_sha256,
    component_pin_sha256: record.component_pin_sha256, identity: record.identity, entry_identities: record.entry_identities });
  for (const [name, receipt] of Object.entries(record.receipts))
    if (!record.predecessor.carry_receipts.includes(name)) receipt.bindings_sha256 = target;
  const changed = trialAdoptionDelivery(selected);
  expect(() => verifyRuntimeAdoption({ repo: f.repo, current_default: changed, entry: 'hosted', identity: runtimeIdentity })).toThrow(
    route === 'compatible' ? 'compatible upgrade changes execution bindings' : 'upgrade affected surface inventory');
});
