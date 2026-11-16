package runtime_test

import (
	"context"
	"path/filepath"
	"slices"
	"strings"
	"testing"

	"github.com/michielvha/vh-adlc/plugins/paseo-hosts/internal/report"
	"github.com/michielvha/vh-adlc/plugins/paseo-hosts/internal/runtime"
	"github.com/michielvha/vh-adlc/plugins/paseo-hosts/internal/testenv"
)

func TestMain(m *testing.M) { testenv.Main(m) }

func TestInstallsThePinnedCLIOnce(t *testing.T) {
	e := testenv.New(t)
	cache := filepath.Join(e.Root, "cache")
	r, err := runtime.Ensure(context.Background(), cache, "0.14.0")
	if err != nil {
		t.Fatal(err)
	}
	dir := filepath.Join(cache, "runtime", "0.14.0")
	if r.Dir != dir || r.Paseo() != filepath.Join(dir, "node_modules", ".bin", "paseo") {
		t.Fatalf("runtime %+v", r)
	}
	if _, err := runtime.Ensure(context.Background(), cache, "0.14.0"); err != nil {
		t.Fatal(err)
	}
	calls := e.CallsTo("npm")
	if len(calls) != 1 {
		t.Fatalf("npm ran %d times, want once", len(calls))
	}
	args := calls[0].Args
	i := slices.Index(args, "--prefix")
	if args[0] != "install" || i < 0 || args[i+1] != dir || !slices.Contains(args, "@getpaseo/cli@0.14.0") {
		t.Fatalf("npm args %q", args)
	}
}

func TestMissingNodeOrNpmExits3(t *testing.T) {
	for _, tool := range []string{"node", "npm"} {
		t.Run(tool, func(t *testing.T) {
			e := testenv.New(t)
			e.RemoveTool(tool)
			_, err := runtime.Ensure(context.Background(), filepath.Join(e.Root, "cache"), "0.14.0")
			if report.Code(err) != report.ExitConfig || !strings.Contains(err.Error(), tool) {
				t.Fatalf("want exit 3 naming %s, got %v", tool, err)
			}
			if len(e.CallsTo("npm")) != 0 {
				t.Fatal("npm ran")
			}
		})
	}
}

func TestHashTakesThePasswordOnStdin(t *testing.T) {
	e := testenv.New(t)
	r, err := runtime.Ensure(context.Background(), filepath.Join(e.Root, "cache"), "0.14.0")
	if err != nil {
		t.Fatal(err)
	}
	const pw = "pw-on-stdin-7Qx"
	hash, err := r.Hash(context.Background(), pw)
	if err != nil {
		t.Fatal(err)
	}
	if hash != testenv.FakeHash(pw) {
		t.Fatalf("hash %q", hash)
	}
	for _, c := range e.Calls() {
		if strings.Contains(strings.Join(c.Args, " "), pw) {
			t.Fatalf("password in the arguments of %s", c.Name)
		}
	}
	if len(e.CallsTo("node")) == 0 {
		t.Fatal("node was not called")
	}
}
