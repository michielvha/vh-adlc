import { afterAll, expect, test } from "bun:test";
import { rmSync } from "node:fs";
import { ordinaryPublicationFixture } from "./ordinary-publication-fixture";
import { publishPublication } from "../../../plugins/vh-adlc/scripts/docs-drift/publication-controller";
import { createAdoptedPublicationVerifier } from "../../../plugins/vh-adlc/scripts/docs-drift/reviewed-publication";
import { readNativeContext } from "../../../plugins/vh-adlc/scripts/docs-drift/transport";
import { canonicalJSON, sha256 } from "../../../plugins/vh-adlc/scripts/docs-drift/protocol";

const roots: string[] = [];
afterAll(() => { for (const root of roots) rmSync(root, { recursive: true, force: true }); });

test("flat retained publication verifies its original policy for another configured reader account", async () => {
  const f = await ordinaryPublicationFixture(roots), published = await publishPublication(f.publication, f.run);
  expect(published.state, published.reason ?? undefined).toBe("complete");
  const plan = published.journal.plan, store = f.baseline.object_store;
  if (!store || plan.schema_version !== 2) throw Error("Original ordinary plan and source store required");
  const current = readNativeContext({ hostname: "github.com", repository: "fixture/docs", credential: f.options.credential, path: f.options.path });
  const proposals = current.repository.pulls("main"); expect(proposals.complete).toBe(true); expect(proposals.items).toHaveLength(1);
  const proposal = proposals.items[0], native = { repository: "fixture/docs", repository_id: 10, operation_id: plan.manifest.operation_id,
    actor: proposal.actor, actor_id: proposal.actor_id, head: proposal.head_sha, tree: plan.manifest.bindings.candidate_tree,
    body_sha256: sha256(Buffer.from(proposal.body)), ref: f.afterSettings.publication.receipt_ref_prefix + plan.manifest.operation_id,
    object: published.objects.receipt_object ?? published.objects.object };
  const verify = createAdoptedPublicationVerifier({ store, current_default: f.source,
    identity: { ...current.identity, actor: "fixture-bot", actor_id: 20 }, entry: "hosted", proposal });
  const bytes = canonicalJSON(plan), original = verify(bytes, native);
  expect(original.actor).toBe(plan.manifest.actor); expect(original.actor_id).toBe(plan.manifest.actor_id);
  expect(original.operation_id).toBe(plan.manifest.operation_id);
  expect(() => verify(bytes, { ...native, actor_id: native.actor_id + 1 })).toThrow();
  expect(() => verify(canonicalJSON({ ...plan, policy_sha256: "f".repeat(64) }), native)).toThrow();
  expect(canonicalJSON(plan)).toEqual(bytes);
}, 600000);
