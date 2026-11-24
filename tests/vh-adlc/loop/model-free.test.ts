// Agent and skill files never name a model: routes come from loop settings at dispatch.
import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";

const PLUGIN = resolve(import.meta.dir, "../../../plugins/vh-adlc");
const MODEL = /\b(opus|sonnet|fable|haiku)\b|\bgpt-\d|\bclaude-[a-z]+-\d|\bgemini-\d|\bgrok-\d|^\s*model\s*:/im;

function files(dir: string): string[] {
  return readdirSync(dir).flatMap(name => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? files(path) : path.endsWith(".md") ? [path] : [];
  });
}

export function modelNames(texts: Record<string, string>): string[] {
  return Object.entries(texts).filter(([, text]) => MODEL.test(text)).map(([path]) => path);
}

describe("agent and skill files", () => {
  test("name no model", () => {
    const texts = Object.fromEntries([...files(join(PLUGIN, "agents")), ...files(join(PLUGIN, "skills"))]
      .map(path => [relative(PLUGIN, path), readFileSync(path, "utf8")]));
    expect(Object.keys(texts).length).toBeGreaterThan(10);
    expect(modelNames(texts)).toEqual([]);
  });

  test("the guard catches a planted model name or frontmatter field", () => {
    expect(modelNames({ "agents/x.md": "---\nname: x\nmodel: opus\n---\n" })).toEqual(["agents/x.md"]);
    expect(modelNames({ "skills/y/SKILL.md": "Dispatch the reviewer on gpt-6.1-sol." })).toEqual(["skills/y/SKILL.md"]);
    expect(modelNames({ "skills/z/SKILL.md": "Ask the reviewer for its model identity." })).toEqual([]);
  });
});
