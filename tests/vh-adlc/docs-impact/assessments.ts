// Checks the synthetic trial's citations; semantic accuracy still needs independent review.
import { existsSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
function record(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}
const contractPrimary: Record<string, readonly string[]> = {
  'docs/contract.md':['Accurate'], 'docs/guide.md':['Incomplete','Stale'],
  'docs/history.md':['Accurate'], 'docs/injection.md':['Unknown'], 'docs/other-system.md':['Unknown'],
};
export function assessmentFailures(final: unknown, input: string, ids: string[], calls: Array<{case: string; op: string; stdout: string}>): string[] {
  if (typeof final !== 'string') return ['missing-native-report'];
  const failures: string[] = [];
  function citation(value: unknown, id: string, doc?: string): boolean {
    if (typeof value !== 'string') return false;
    const matched = value.match(/^(.*):([1-9][0-9]*)$/u); if (!matched) return false;
    const name = matched[1].startsWith(id + '/') ? matched[1].slice(id.length + 1) : matched[1];
    if (name.split('/').some(part => ['..', '.', '.git'].includes(part)) || (doc ? name !== doc : !name.startsWith('src/'))) return false;
    const root = join(input, id), path = resolve(root, name);
    return path.startsWith(root + '/') && existsSync(path) && statSync(path).isFile() && Number(matched[2]) <= readFileSync(path, 'utf8').split('\n').length;
  }
  try {
    const raw = final.split('BEGIN_ASSESSMENTS_JSON')[1]?.split('END_ASSESSMENTS_JSON')[0];
    const decoded = record(JSON.parse(raw ?? 'null'));
    if (!decoded || !Array.isArray(decoded.cases)) return ['missing-or-malformed-assessment-json'];
    const rows: unknown[] = decoded.cases;
    for (const id of ids) {
      const row = record(rows.find(value => record(value)?.id === id));
      if (!row || !Array.isArray(row.candidates)) { failures.push(id + ':missing-assessment-record'); continue; }
      if (['implement-gap', 'ship-gap'].includes(id) && row.decision !== 'blocked') failures.push(id + ':completion-not-blocked');
      if (id === 'ship-progress' && row.decision !== 'progress-pr-draft') failures.push(id + ':progress-boundary');
      const candidates = new Set<string>();
      if (['manual', 'fenced'].includes(id)) candidates.add('docs/guide.md');
      for (const call of calls.filter(call => call.case === id && ['check', 'verify'].includes(call.op))) {
        const result = record(JSON.parse(call.stdout));
        if (!result || !Array.isArray(result.candidates)) throw Error('invalid helper candidates');
        for (const value of result.candidates) { const candidate = record(value); if (typeof candidate?.path !== 'string') throw Error('invalid candidate path'); candidates.add(candidate.path); }
      }
      const answers: unknown[] = row.candidates;
      for (const path of candidates) {
        const result = record(answers.find(value => record(value)?.path === path));
        if (!result) { failures.push(id + ':unclassified-or-uncited:' + path); continue; }
        // This fixture deliberately has no implementation for its other system.
        const unavailable = id === 'contracts' && path === 'docs/other-system.md' && result.classification === 'Unknown';
        const docs = result.doc_citations, sources = result.source_citations;
        // The contract guide has both an omission and a port/contract conflict;
        // either applicable primary label is valid, and semantic review checks both issues.
        const primary = id === 'contracts' ? contractPrimary[path]
          : path === 'docs/guide.md' ? [(['update','feature-move'].includes(id) ? 'Accurate' : 'Stale')]
          : path === 'docs/specs/feature.md' ? ['Stale'] : path === 'docs/internal/plans/local.md' ? ['Accurate'] : path === 'docs/internal/plans/unknown.md' ? ['Unknown'] : undefined;
        const sourceEvidence = Array.isArray(sources) && (unavailable ? sources.length === 0 && typeof result.source_unavailable_reason === 'string' && !!result.source_unavailable_reason.trim() : sources.some(value => citation(value, id)));
        if (!primary?.includes(String(result.classification)) || !Array.isArray(docs) || !docs.some(value => citation(value, id, path)) || !sourceEvidence) failures.push(id + ':unclassified-or-uncited:' + path);
      }
    }
  } catch { failures.push('missing-or-malformed-assessment-json'); }
  return failures;
}
