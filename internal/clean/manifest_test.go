package clean

import (
	"os"
	"path"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

const validManifest = `schema_version: 1
project: example
temp_root: {max_age: 24h}
tmp:
  - {glob: "example-run-*", max_age: 12h}
compose:
  - {project: "example-*", volumes: true}
kind:
  - {cluster: example-e2e, liveness: {kind: pid, label: example.kind-run}}
`

func TestParseManifest(t *testing.T) {
	m, err := ParseManifest([]byte(validManifest))
	if err != nil {
		t.Fatalf("ParseManifest: %v", err)
	}
	if m.Project != "example" || m.TempRoot == nil || m.TempRoot.MaxAge != 24*time.Hour {
		t.Fatalf("project and temp root: %+v", m)
	}
	if len(m.Tmp) != 1 || m.Tmp[0].Glob != "example-run-*" || m.Tmp[0].MaxAge != 12*time.Hour {
		t.Fatalf("tmp: %+v", m.Tmp)
	}
	if len(m.Compose) != 1 || m.Compose[0].Project != "example-*" || !m.Compose[0].Volumes {
		t.Fatalf("compose: %+v", m.Compose)
	}
	if len(m.Kind) != 1 || m.Kind[0].Cluster != "example-e2e" || m.Kind[0].Liveness.Kind != LivenessPID || m.Kind[0].Liveness.Label != "example.kind-run" {
		t.Fatalf("kind: %+v", m.Kind)
	}

	minimal, err := ParseManifest([]byte("schema_version: 1\nproject: example\n"))
	if err != nil || minimal.TempRoot != nil || len(minimal.Tmp) != 0 {
		t.Fatalf("a manifest with no temp_root and no rules: %+v, %v", minimal, err)
	}
	path, err := ParseManifest([]byte("schema_version: 1\nproject: example\nkind:\n  - {cluster: example-e2e, liveness: {kind: path, label: example.dir}}\n"))
	if err != nil || path.Kind[0].Liveness.Kind != LivenessPath {
		t.Fatalf("a path liveness: %+v, %v", path, err)
	}
}

// TestManifestRefusals covers each refusal Design lists, the strict reader's
// forms (R-8 F-01) and the extra forms of R-7 F-07.
func TestManifestRefusals(t *testing.T) {
	base := "schema_version: 1\nproject: example\n"
	cases := map[string]string{
		"empty":                       "",
		"not a mapping":               "- a\n",
		"unknown top-level key":       base + "extra: 1\n",
		"unknown nested key":          base + "tmp:\n  - {glob: example-*, max_age: 2h, extra: 1}\n",
		"unknown liveness key":        base + "kind:\n  - {cluster: example-e2e, liveness: {kind: pid, label: a.b, extra: 1}}\n",
		"schema version 2":            "schema_version: 2\nproject: example\n",
		"schema version missing":      "project: example\n",
		"schema version as a string":  "schema_version: \"1\"\nproject: example\n",
		"schema version 1.0":          "schema_version: 1.0\nproject: example\n",
		"glob with three literals":    base + "tmp:\n  - {glob: \"exa*\", max_age: 2h}\n",
		"glob starting with a star":   base + "tmp:\n  - {glob: \"*example\", max_age: 2h}\n",
		"glob with a question mark":   base + "tmp:\n  - {glob: \"ex?mple\", max_age: 2h}\n",
		"glob with a class":           base + "tmp:\n  - {glob: \"exa[m]ple\", max_age: 2h}\n",
		"glob with a path separator":  base + "tmp:\n  - {glob: \"../home/m/x*\", max_age: 2h}\n",
		"glob with a slash after":     base + "tmp:\n  - {glob: \"example/*\", max_age: 2h}\n",
		"glob syntax error":           base + "tmp:\n  - {glob: \"abcd[\", max_age: 2h}\n",
		"glob missing":                base + "tmp:\n  - {max_age: 2h}\n",
		"age under an hour":           base + "tmp:\n  - {glob: example-*, max_age: 59m}\n",
		"age missing":                 base + "tmp:\n  - {glob: example-*}\n",
		"age unparseable":             base + "tmp:\n  - {glob: example-*, max_age: soon}\n",
		"age in days":                 base + "tmp:\n  - {glob: example-*, max_age: 2d}\n",
		"age negative":                base + "tmp:\n  - {glob: example-*, max_age: -2h}\n",
		"temp root age under an hour": base + "temp_root: {max_age: 30m}\n",
		"temp root age missing":       base + "temp_root: {}\n",
		"project missing":             "schema_version: 1\n",
		"project with a slash":        "schema_version: 1\nproject: a/b\n",
		"project dot dot":             "schema_version: 1\nproject: ..\n",
		"project dot":                 "schema_version: 1\nproject: .\n",
		"project empty":               "schema_version: 1\nproject: \"\"\n",
		"project with a space":        "schema_version: 1\nproject: \"a b\"\n",
		"unknown liveness kind":       base + "kind:\n  - {cluster: example-e2e, liveness: {kind: age, label: a.b}}\n",
		"kind rule without liveness":  base + "kind:\n  - {cluster: example-e2e}\n",
		"empty liveness label":        base + "kind:\n  - {cluster: example-e2e, liveness: {kind: pid, label: \"\"}}\n",
		"liveness label missing":      base + "kind:\n  - {cluster: example-e2e, liveness: {kind: pid}}\n",
		"compose project floor":       base + "compose:\n  - {project: \"*\", volumes: true}\n",
		"compose project short":       base + "compose:\n  - {project: \"sw-*\"}\n",
		"compose project missing":     base + "compose:\n  - {volumes: true}\n",
		"kind cluster floor":          base + "kind:\n  - {cluster: \"*\", liveness: {kind: pid, label: a.b}}\n",
		"kind cluster short literal":  base + "kind:\n  - {cluster: abc, liveness: {kind: pid, label: a.b}}\n",
		"anchor and alias":            base + "tmp:\n  - &r {glob: example-*, max_age: 2h}\n  - *r\n",
		"second document":             base + "---\ncompose:\n  - {project: example-*, volumes: true}\n",
		"merge key":                   base + "temp_root:\n  <<: {max_age: 2h}\n",
		"explicit tag":                base + "tmp:\n  - {glob: !!str example-*, max_age: 2h}\n",
		"boolean spelling":            base + "compose:\n  - {project: example-*, volumes: yes}\n",
		"boolean as a string":         base + "compose:\n  - {project: example-*, volumes: \"true\"}\n",
		"boolean as a number":         base + "compose:\n  - {project: example-*, volumes: 1}\n",
		"duplicate key":               base + "project: other\n",
		"syntax error":                base + "tmp: [\n",
		"tmp is not a list":           base + "tmp: example-*\n",
	}
	for name, text := range cases {
		t.Run(name, func(t *testing.T) {
			m, err := ParseManifest([]byte(text))
			if err == nil {
				t.Fatalf("accepted: %+v", m)
			}
			if !strings.HasPrefix(err.Error(), "manifest: ") {
				t.Fatalf("error %q does not name the manifest", err)
			}
		})
	}
}

// testPrefixes are the mkdtemp prefixes this repository's tests use, found
// with a search of tests/, plugins/, cmd/ and internal/ for tmpdir() and
// os.MkdirTemp calls. A scenario directory is vh-adlc-<scenario id>-.
var testPrefixes = []string{
	"vh-triage-", "vh-triage-locks-", "vh-triage-verify-", "vh-triage-verification-", "vh-triage-controller-",
	"vh-maintenance-", "vh-maintenance-outside-", "vh-maintenance-variant-", "vh-maintenance-resume-",
	"vh-maintenance-packet-", "vh-maintenance-linked-",
	"vh-lifecycle-test-", "vh-lifecycle-context-", "vh-lifecycle-boundary-", "vh-lifecycle-final-",
	"vh-feature-review-", "vh-feature-lifecycle-", "vh-domain-lifecycle-", "vh-delivery-lifecycle-",
	"vh-issue-batch-", "vh-issue-authority-", "vh-native-review-", "vh-settings-file-", "vh-worktree-handoff-",
	"vh-adlc-golden-", "vh-adlc-fixtures-", "vh-adlc-claude-", "vh-adlc-real-", "vh-adlc-ensure-", "vh-adlc-at-",
	"vh-adlc-s1-home-", "vh-adlc-s14-home-", "vh-adlc-S1-", "vh-adlc-S12.10-",
	"triage-controller-e2e-", "triage-controller-hostile-", "triage-controller-negative-",
	"triage-verification-denial-", "triage-strip-hash-", "triage-replace-hash-", "triage-managed-recovery-",
	"triage-fake-proof-", "triage-bound-selection-", "stack-triage-rehearsal-",
	"maintenance-report-ref-grade-", "maintenance-render-receipt-", "maintenance-related-",
	"maintenance-publication-test-", "maintenance-publication-grade-", "maintenance-paired-worker-",
	"maintenance-install-test-", "maintenance-go-bot-", "maintenance-delivery-transport-",
	"maintenance-client-start-", "maintenance-builder-", "maintenance-authored-case-", "maintenance-action-",
	"quiet-tag-", "quiet-shout-", "copilot-real-reads-", "copilot-page-reads-",
	"auth-refresh-integrity-", "auth-refresh-contract-", "auth-refresh-claude-",
	"gh-app-repo-", "gh-app-export-",
}

// TestOwnManifest decodes this repository's manifest: every glob matches a
// prefix the tests use, every prefix is matched, and no glob matches the temp
// base of any uid.
func TestOwnManifest(t *testing.T) {
	b, err := os.ReadFile(filepath.Join("..", "..", ManifestPath))
	if err != nil {
		t.Fatal(err)
	}
	m, err := ParseManifest(b)
	if err != nil {
		t.Fatal(err)
	}
	if m.Project != "vh-adlc" || m.TempRoot != nil || len(m.Compose) != 0 || len(m.Kind) != 0 {
		t.Fatalf("manifest %+v: want only tmp rules", m)
	}
	for _, r := range m.Tmp {
		used := false
		for _, p := range testPrefixes {
			if ok, _ := path.Match(r.Glob, p+"Ab12Cd"); ok {
				used = true
			}
		}
		if !used {
			t.Errorf("%s matches no prefix the tests use", r.Glob)
		}
		for _, base := range []string{"vh-adlc-0", "vh-adlc-1000", "vh-adlc-65534"} {
			if ok, _ := path.Match(r.Glob, base); ok {
				t.Errorf("%s matches the temp base %s", r.Glob, base)
			}
		}
	}
	for _, p := range testPrefixes {
		if _, ok := matchRule(fileRulesOf(m), p+"Ab12Cd"); !ok {
			t.Errorf("no glob matches the test prefix %s", p)
		}
	}
}

func fileRulesOf(m *Manifest) []fileRule {
	var out []fileRule
	for _, r := range m.Tmp {
		out = append(out, fileRule(r))
	}
	return out
}
