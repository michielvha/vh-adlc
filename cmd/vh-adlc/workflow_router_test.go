package main

import (
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"
)

func runWorkflowGate(t *testing.T, file, id string, values map[string]string, prs string, fail bool) (string, error) {
	t.Helper()
	w, _ := readWorkflow(t, file)
	script := ""
	for _, job := range w.Jobs {
		for _, s := range job.Steps {
			if s.ID == id {
				if s.Shell != "bash" {
					t.Fatal("CLI pipelines require explicit Bash so runner pipefail matches the test")
				}
				script = s.Run
			}
		}
	}
	if script == "" {
		t.Fatalf("%s has no shell gate %s", file, id)
	}
	dir := t.TempDir()
	fixture := filepath.Join(dir, "prs.json")
	if err := os.WriteFile(fixture, []byte(prs), 0o600); err != nil {
		t.Fatal(err)
	}
	gh := "#!/bin/bash\nset -euo pipefail\nif [[ \"$FAKE_GH_FAIL\" == true ]]; then echo 'GitHub unavailable' >&2; exit 1; fi\ncat \"$FAKE_GH_RESPONSE\"\n"
	if err := os.WriteFile(filepath.Join(dir, "gh"), []byte(gh), 0o700); err != nil {
		t.Fatal(err)
	}
	output := filepath.Join(dir, "output")
	env := map[string]string{
		"PATH":          dir + string(os.PathListSeparator) + os.Getenv("PATH"),
		"GITHUB_OUTPUT": output, "FAKE_GH_RESPONSE": fixture,
		"FAKE_GH_FAIL": "false", "EVENT_NAME": "push", "BRANCH": "feat/example",
		"DEFAULT_BRANCH": "main", "DRY_RUN": "false", "EXPECTED_SHA": strings.Repeat("a", 40),
	}
	if fail {
		env["FAKE_GH_FAIL"] = "true"
	}
	for key, value := range values {
		env[key] = value
	}
	cmd := exec.Command("bash", "--noprofile", "--norc", "-eo", "pipefail", "-c", script)
	cmd.Env = os.Environ()
	for key, value := range env {
		cmd.Env = append(cmd.Env, key+"="+value)
	}
	log, err := cmd.CombinedOutput()
	if err != nil {
		t.Logf("gate failed explicitly: %s", log)
		return "", err
	}
	raw, err := os.ReadFile(output)
	if err != nil {
		t.Fatal(err)
	}
	return strings.TrimSpace(string(raw)), nil
}

func TestFeaturePushRouting(t *testing.T) {
	for _, tc := range []struct {
		name, prs, want string
		values          map[string]string
		fail            bool
	}{
		{"no PR", "[]", "run=true", nil, false},
		{"PR owns checks", `[{"isCrossRepository":false}]`, "run=false", nil, false},
		{"fork does not own branch checks", `[{"isCrossRepository":true}]`, "run=true", nil, false},
		{"main needs no PR query", "[]", "run=true", map[string]string{"BRANCH": "main"}, true},
		{"PR event needs no query", "[]", "run=true", map[string]string{"EVENT_NAME": "pull_request"}, true},
		{"API error is not an empty list", "[]", "", nil, true},
	} {
		t.Run(tc.name, func(t *testing.T) {
			got, err := runWorkflowGate(t, "ci.yml", "route", tc.values, tc.prs, tc.fail)
			if tc.want == "" {
				if err == nil {
					t.Fatal("API failure was hidden")
				}
			} else if err != nil || got != tc.want {
				t.Fatalf("got %q, %v; want %q", got, err, tc.want)
			}
		})
	}
}

func TestPreviewLabelGate(t *testing.T) {
	labeled := `[{"headRefOid":"` + strings.Repeat("a", 40) + `","isCrossRepository":false,"labels":[{"name":"release:preview"}]}]`
	for _, tc := range []struct {
		name, prs, want string
		values          map[string]string
		fail            bool
	}{
		{"label stays enabled", labeled, "allowed=true", nil, false},
		{"no PR", "[]", "allowed=false", nil, false},
		{"label removed", strings.Replace(labeled, "release:preview", "other", 1), "allowed=false", nil, false},
		{"head changed", labeled, "allowed=false", map[string]string{"EXPECTED_SHA": strings.Repeat("b", 40)}, false},
		{"fork", strings.Replace(labeled, `"isCrossRepository":false`, `"isCrossRepository":true`, 1), "allowed=false", nil, false},
		{"main", "[]", "allowed=true", map[string]string{"BRANCH": "main"}, true},
		{"read-only calculation", "[]", "allowed=true", map[string]string{"DRY_RUN": "true"}, true},
		{"API error is explicit", "[]", "", nil, true},
	} {
		t.Run(tc.name, func(t *testing.T) {
			got, err := runWorkflowGate(t, "version.yml", "preview", tc.values, tc.prs, tc.fail)
			if tc.want == "" {
				if err == nil {
					t.Fatal("API failure was hidden")
				}
			} else if err != nil || got != tc.want {
				t.Fatalf("got %q, %v; want %q", got, err, tc.want)
			}
		})
	}
}
