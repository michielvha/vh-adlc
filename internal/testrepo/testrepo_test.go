package testrepo

import (
	"strings"
	"testing"
)

func build(t *testing.T) []string {
	r := New(t)
	r.Write("README.md", "hello\n")
	a := r.Commit("first")
	r.Write("docs/a.md", "a\n")
	b := r.Commit("second")
	r.AddRemote()
	return []string{a, b, r.Git("symbolic-ref", "refs/remotes/origin/HEAD")}
}

func TestStableSHAs(t *testing.T) {
	first, second := build(t), build(t)
	for i := range first {
		if first[i] != second[i] {
			t.Fatalf("build %d differs: %q vs %q", i, first[i], second[i])
		}
	}
	if first[2] != "refs/remotes/origin/main" {
		t.Fatalf("origin HEAD = %q", first[2])
	}
}

func TestStandard(t *testing.T) {
	if !strings.Contains(Standard(), "```yaml vh-adlc-rules\n") {
		t.Fatal("standard has no rules block")
	}
}
