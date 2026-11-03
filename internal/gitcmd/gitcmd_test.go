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

func TestCheckVersionOutput(t *testing.T) {
	cases := []struct {
		out          string
		major, minor int
		ok           bool
		message      string
	}{
		{"git version 2.45.0", 2, 45, true, ""},
		{"git version 2.55.0.windows.1", 2, 45, true, ""},
		{"git version 3.0.0", 2, 45, true, ""},
		{"git version 2.44.2", 2, 45, false, "git 2.44.2 is older than the required 2.45"},
		{"git version 2.35.1", 2, 35, true, ""},
		{"git version 2.34.9", 2, 35, false, "git 2.34.9 is older than the required 2.35"},
		{"not git", 2, 45, false, "git not git is older than the required 2.45"},
	}
	for _, c := range cases {
		err := checkVersionOutput(c.out, c.major, c.minor)
		if c.ok {
			if err != nil {
				t.Errorf("%q at %d.%d: %v", c.out, c.major, c.minor, err)
			}
			continue
		}
		var old *TooOldError
		if !errors.As(err, &old) || err.Error() != c.message {
			t.Errorf("%q at %d.%d: err = %v, want %q", c.out, c.major, c.minor, err, c.message)
		}
	}
}

func TestCheckMinVersion(t *testing.T) {
	g := Git{Dir: t.TempDir()}
	if err := g.CheckMinVersion(t.Context(), 2, 0); err != nil {
		t.Fatalf("CheckMinVersion 2.0: %v", err)
	}
	var old *TooOldError
	if err := g.CheckMinVersion(t.Context(), 99, 0); !errors.As(err, &old) {
		t.Fatalf("CheckMinVersion 99.0: err = %v", err)
	}
}
