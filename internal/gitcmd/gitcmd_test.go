package gitcmd

import (
	"errors"
	"slices"
	"testing"
)

func TestSplitZ(t *testing.T) {
	got := SplitZ([]byte("a\x00b c\x00\x00"))
	if !slices.Equal(got, []string{"a", "b c"}) {
		t.Fatalf("SplitZ = %q", got)
	}
}

func TestRunAndExitCode(t *testing.T) {
	g := Git{Dir: t.TempDir()}
	if err := g.CheckVersion(t.Context()); err != nil {
		t.Fatalf("CheckVersion: %v", err)
	}
	_, err := g.Run(t.Context(), "rev-parse", "HEAD")
	var exit *ExitError
	if !errors.As(err, &exit) || ExitCode(err) != 128 {
		t.Fatalf("rev-parse outside a repository: err = %v", err)
	}
}
