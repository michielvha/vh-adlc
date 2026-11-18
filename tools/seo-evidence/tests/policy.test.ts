import { expect, test } from "bun:test";
import { applyPolicy, parsePolicy } from "../src/policy";
import { inspect } from "../src/inspect";
import { compare } from "../src/compare";
import { RULES } from "../src/rules";
import { site } from "./helpers/site";

test("findings are report-only until a known applicable rule is selected", async () => {
  const f = await site([{ path: "/", html: '<main><a href="/bad">bad</a></main>' }, { path: "/bad", status: 404 }]);
  const report = inspect(f.snapshot);
  expect(applyPolicy(report)).toMatchObject({ exit_code: 0, policy_status: "report_only" });
  expect(applyPolicy(report, parsePolicy("schema_version: 1\nfail_rules: [broken_link]"))).toMatchObject({ exit_code: 3, policy_status: "failed" });
  expect(applyPolicy(report, parsePolicy("schema_version: 1\nfail_rules: []"))).toMatchObject({ exit_code: 0 });
  for (const text of ["schema_version: 2\nfail_rules: []", "schema_version: 1\nfail_rules: [unknown]", "schema_version: 1\nfail_rules: [broken_link, broken_link]", "schema_version: 1\nextra: true\nfail_rules: []"]) expect(() => parsePolicy(text)).toThrow();
  expect(() => applyPolicy(report, parsePolicy("schema_version: 1\nfail_rules: [noindex_added]"))).toThrow(/applicable/i);
});
test("partial capture overrides selected violations without dropping them", async () => {
  const f = await site([{ path: "/", html: '<main><a href="/bad">bad</a></main>' }, { path: "/bad", status: 404 }, { path: "/later", outcome: "not_collected" }]);
  const result = applyPolicy(inspect(f.snapshot), { schema_version: 1, fail_rules: ["broken_link"] });
  expect(result).toMatchObject({ exit_code: 2, analysis_status: "partial", policy_status: "failed" });
  expect(result.policy_failures).toHaveLength(1);
});
test("all rule selections are explicit and command-specific", async () => {
  const f = await site([{ path: "/" }]);
  for (const [id, rule] of Object.entries(RULES)) {
    const policy = parsePolicy(`schema_version: 1\nfail_rules: [${id}]`);
    const report = rule.command === "inspect" ? inspect(f.snapshot) : compare(f.snapshot, f.snapshot);
    expect(applyPolicy(report, policy).exit_code).toBe(0);
  }
});
test("equivalent and crawler-scoped controls never cause a generic policy failure", async () => {
  const a = await site([{ path: "/", html: '<main><a href="#">top</a><a name="old"></a><a href="#old">old</a></main>', headers: { "X-Robots-Tag": ["none"], Link: ['</>; rel="canonical"'] } }]);
  const b = await site([{ path: "/", html: '<head><link rel="canonical" href="/"><meta name="robots" content="noindex"></head><main></main>' }]);
  const policy = { schema_version: 1 as const, fail_rules: ["noindex_added", "canonical_changed", "canonical_removed"] as const };
  expect(applyPolicy(compare(a.snapshot, b.snapshot), { ...policy, fail_rules: [...policy.fail_rules] }).exit_code).toBe(0);
  expect(applyPolicy(inspect(a.snapshot), { schema_version: 1, fail_rules: ["broken_fragment"] }).exit_code).toBe(0);
});
