package main

import (
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"
)

// fakeGH answers `gh pr list` from a fixture and applies the caller's --jq.
const fakeGH = `#!/bin/bash
set -euo pipefail
if [[ "$FAKE_GH_FAIL" == true ]]; then echo 'GitHub unavailable' >&2; exit 1; fi
printf '%s\n' "$*" > "$FAKE_GH_ARGS"
while (($#)); do case "$1" in --jq) query=$2; shift 2 ;; *) shift ;; esac; done
jq -r "$query" "$FAKE_GH_RESPONSE"
`

func TestReleaseGate(t *testing.T) {
	w, _ := readWorkflow(t, "ci.yml")
	steps := w.Jobs["release-gate"].Steps
	if len(steps) != 1 || steps[0].Shell != "bash" {
		t.Fatal("the release gate is one explicit-bash step")
	}
	sha := strings.Repeat("a", 40)
	for _, tc := range []struct {
		name, branch, prs, want string
		apiFail                 bool
	}{
		{"main always tags, without asking GitHub", "main", "[]", "tag=true", true},
		{"labelled open PR at this commit", "feat/x", `[{"headRefOid":"` + sha + `"}]`, "tag=true", false},
		{"labelled PR has moved on", "feat/x", `[{"headRefOid":"` + strings.Repeat("b", 40) + `"}]`, "tag=false", false},
		{"no labelled open PR", "feat/x", "[]", "tag=false", false},
		{"API failure fails the gate", "feat/x", "[]", "", true},
	} {
		t.Run(tc.name, func(t *testing.T) {
			dir := t.TempDir()
			write := func(name, body string, mode os.FileMode) string {
				path := filepath.Join(dir, name)
				if err := os.WriteFile(path, []byte(body), mode); err != nil {
					t.Fatal(err)
				}
				return path
			}
			write("gh", fakeGH, 0o700)
			cmd := exec.Command("bash", "--noprofile", "--norc", "-eo", "pipefail", "-c", steps[0].Run)
			cmd.Env = append(os.Environ(),
				"PATH="+dir+string(os.PathListSeparator)+os.Getenv("PATH"),
				"GITHUB_OUTPUT="+write("output", "", 0o600),
				"FAKE_GH_RESPONSE="+write("prs.json", tc.prs, 0o600),
				"FAKE_GH_ARGS="+filepath.Join(dir, "args"),
				"FAKE_GH_FAIL="+map[bool]string{true: "true", false: "false"}[tc.apiFail],
				"BRANCH="+tc.branch, "SHA="+sha)
			out, err := cmd.CombinedOutput()
			if tc.want == "" {
				if err == nil {
					t.Fatal("an API failure must not become tag=false")
				}
				return
			}
			if err != nil {
				t.Fatalf("gate failed: %v\n%s", err, out)
			}
			got, _ := os.ReadFile(filepath.Join(dir, "output"))
			if strings.TrimSpace(string(got)) != tc.want {
				t.Fatalf("got %q, want %q", got, tc.want)
			}
			if tc.branch != "main" {
				args, _ := os.ReadFile(filepath.Join(dir, "args"))
				for _, filter := range []string{"--head feat/x", "--state open", "--label release:preview"} {
					if !strings.Contains(string(args), filter) {
						t.Errorf("gh query lacks %q: %s", filter, args)
					}
				}
			}
		})
	}
}
