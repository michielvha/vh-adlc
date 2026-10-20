package main

import (
	"bytes"
	"encoding/json"
	"os/exec"
	"strings"
	"testing"
)

func TestFeaturePushRouting(t *testing.T) {
	w, _ := readWorkflow(t, "ci.yml")
	script := ""
	for _, s := range w.Jobs["route"].Steps {
		if s.ID == "route" {
			script = s.With["script"]
		}
	}
	if script == "" {
		t.Fatal("CI has no executable event router")
	}
	for _, tc := range []struct {
		name, event, ref string
		openPR, apiFail  bool
		run              bool
	}{
		{"feature without PR gets CI", "push", "refs/heads/feat/example", false, false, true},
		{"PR owns the feature checks", "push", "refs/heads/feat/example", true, false, false},
		{"main is always checked", "push", "refs/heads/main", true, false, true},
		{"PR update is checked", "pull_request", "refs/pull/7/merge", true, false, true},
		{"lookup failure is not an empty PR list", "push", "refs/heads/feat/example", false, true, false},
	} {
		t.Run(tc.name, func(t *testing.T) {
			fixture := map[string]any{
				"script": script, "event": tc.event, "ref": tc.ref, "apiFail": tc.apiFail,
			}
			prs := []any{}
			if tc.openPR {
				prs = append(prs, map[string]any{"head": map[string]any{
					"sha": strings.Repeat("a", 40), "repo": map[string]string{"full_name": "example/app"},
				}})
			}
			fixture["prs"] = prs
			input, err := json.Marshal(fixture)
			if err != nil {
				t.Fatal(err)
			}
			cmd := exec.Command("node", "--input-type=module", "-e", `
import {readFileSync} from "node:fs";
const f = JSON.parse(readFileSync(0, "utf8"));
const outputs = {};
const context = {eventName: f.event, ref: f.ref, sha: "a".repeat(40),
  repo: {owner: "example", repo: "app"}, payload: {repository: {default_branch: "main"}}};
const github = {rest: {pulls: {list: async () => {
  if (f.apiFail) throw new Error("GitHub unavailable");
  return {data: f.prs};
}}}};
const core = {notice: () => {}, setOutput: (key, value) => {outputs[key] = value;}};
try {
  const AsyncFunction = Object.getPrototypeOf(async function(){}).constructor;
  await new AsyncFunction("github", "context", "core", f.script)(github, context, core);
  console.log(JSON.stringify({run: outputs.run}));
} catch (error) {
  console.log(JSON.stringify({error: error.message}));
}
`)
			cmd.Stdin = bytes.NewReader(input)
			raw, err := cmd.CombinedOutput()
			if err != nil {
				t.Fatalf("router execution: %v\n%s", err, raw)
			}
			var result struct {
				Run   string `json:"run"`
				Error string `json:"error"`
			}
			if err := json.Unmarshal(raw, &result); err != nil {
				t.Fatalf("router output: %v\n%s", err, raw)
			}
			if (result.Error != "") != tc.apiFail || (result.Run == "true") != tc.run {
				t.Fatalf("router result = %+v", result)
			}
		})
	}
}
