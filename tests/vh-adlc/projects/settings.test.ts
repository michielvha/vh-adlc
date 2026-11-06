import { expect, test } from "bun:test";
import { parseSettings, resolveFields } from "../../../plugins/vh-adlc/scripts/projects/settings";

const valid = () => ({ schema_version: 1, project: "https://github.com/orgs/example/projects/1", repositories: ["example/one", "other/two"], fields: [{ name: "Status", options: ["todo", "done"] }] });
test("user and organization Projects URLs identify one board", () => {
  expect(parseSettings(valid())).toMatchObject({ owner: "example", ownerType: "organization", number: 1 });
  expect(parseSettings({ ...valid(), project: "https://github.com/users/person/projects/2" })).toMatchObject({ ownerType: "user", number: 2 });
});
test("settings refuse unknown keys, invalid identities and duplicate repositories", () => {
  for (const patch of [{ token: "not-a-token" }, { schema_version: 2 }, { project: "https://github.com.evil/orgs/example/projects/1" }, { project: "https://name@github.com/orgs/example/projects/1" }, { repositories: [] }, { repositories: ["example/one", "EXAMPLE/ONE"] }, { repositories: ["example/../bad"] }, { fields: [{ id: "f", name: "Status", options: ["todo"] }] }, { fields: [{ name: "Status", options: [] }] }, { page_budget: 0 }]) expect(() => parseSettings({ ...valid(), ...patch })).toThrow();
});
test("field resolution rejects missing, ambiguous and unsupported options", () => {
  const settings = parseSettings(valid());
  const field = { id: "field-1", name: "Status", options: ["todo", "done"] };
  expect(resolveFields(settings, [field])).toEqual([{ id: "field-1", name: "Status", options: ["todo", "done"] }]);
  for (const fields of [[], [field, { ...field, id: "field-2" }], [{ ...field, options: ["todo"] }]]) expect(() => resolveFields(settings, fields)).toThrow();
});
