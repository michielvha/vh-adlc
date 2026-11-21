import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { enter, fixture, invoke, REF } from "./fixture";

test("keeps a consumer paused until it verifies protections, then accepts only appends", async () => {
  const f = fixture();
  try {
    const setup = await invoke(f.seed, f.env, "initialize", "--approved", "true", "--operation", "init");
    const view = f.clone("consumer");
    f.policy(setup.genesis!, false);
    expect(await enter(view, f.env, "--issue", "21")).toMatchObject({ status: "held" });
    expect(f.git(f.bare, "rev-parse", REF)).toBe(setup.genesis);
    f.git(f.bare, "config", "receive.denyDeletes", "true");
    f.git(f.bare, "config", "receive.denyNonFastForwards", "true");
    f.policy(setup.genesis!);
    expect((await enter(view, f.env, "--issue", "21")).status).toBe("entered");
    const tip = f.git(f.bare, "rev-parse", REF);
    expect(tip).not.toBe(setup.genesis);
    for (const refspec of [`:${REF}`, `+HEAD:${REF}`]) {
      const invalid = Bun.spawnSync(["git", "-C", view, "push", "origin", refspec], { env: f.env, stdout: "pipe", stderr: "pipe" });
      expect(invalid.exitCode).not.toBe(0);
      expect(f.git(f.bare, "rev-parse", REF)).toBe(tip);
    }
    f.policy(setup.genesis!, false);
    expect((await enter(view, f.env, "--issue", "21")).status).toBe("held");
    f.policy(setup.genesis!);
    expect((await enter(view, f.env, "--issue", "21")).status).toBe("entered");
    expect(f.git(f.bare, "rev-parse", REF)).toBe(tip);
  } finally {
    f.cleanup();
  }
});

test("CI and preview dispatch keep the reservation branch out of tag routing", () => {
  const workflows = resolve(import.meta.dir, "../../../.github/workflows");
  const ci = Bun.YAML.parse(readFileSync(`${workflows}/ci.yml`, "utf8")) as {
    on: { push: { branches: string[] }; workflow_dispatch: unknown }; jobs: { version: { if: string } };
  };
  const preview = Bun.YAML.parse(readFileSync(`${workflows}/preview.yml`, "utf8")) as { jobs: { request: { if: string } } };
  const release = Bun.YAML.parse(readFileSync(`${workflows}/release.yml`, "utf8")) as { on: { push: Record<string, unknown> } };
  const branch = REF.slice("refs/heads/".length);
  expect(ci.on.push.branches).toEqual(["**", `!${branch}`]);
  expect(Object.hasOwn(ci.on, "workflow_dispatch")).toBe(true);
  expect(ci.jobs.version.if).toBe(`github.ref != '${REF}'`);
  expect(preview.jobs.request.if).toContain(`github.event.pull_request.head.ref != '${branch}'`);
  expect(release.on.push).toEqual({ tags: ["v*.*.*"] });
});
