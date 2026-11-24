package registry_test

import (
	"os"
	"path/filepath"
	"slices"
	"testing"

	"github.com/michielvha/vh-adlc/plugins/paseo-hosts/internal/registry"
)

// localTool is a registry file in the format the local Bash tool wrote, with
// no PASEO_CLIENTS, PASEO_CLIENT_HOST or PASEO_CLIENT_PORT.
const localTool = `PASEO_SSH=build-1
PASEO_USER=dev
PASEO_DNS=build-1.example.ts.net
PASEO_LISTEN_PORT=6867
PASEO_SERVE_PORT=8956
PASEO_URL=ssh://build-1?daemonPort=6867
PASEO_VERSION=0.14.0
PASEO_AGENTS="codex claude"
PASEO_PASSWORD_FILE=/home/dev/.config/paseo-hosts/build-1.password
PASEO_UNIT=paseo.service
`

func TestParseLocalToolFormat(t *testing.T) {
	e, err := registry.Parse("build-1", []byte(localTool))
	if err != nil {
		t.Fatal(err)
	}
	if e.SSH != "build-1" || e.User != "dev" || e.ListenPort != 6867 || e.ServePort != 8956 || e.Agents != "codex claude" || e.URL != "ssh://build-1?daemonPort=6867" {
		t.Fatalf("parsed %+v", e)
	}
	if e.Published || len(e.Clients) != 0 {
		t.Fatalf("missing PASEO_PUBLISHED and PASEO_CLIENTS must mean no and none: %+v", e)
	}
	if e.ClientHost != "build-1.example.ts.net" || e.ClientPort != 22 {
		t.Fatalf("missing client host and port must mean PASEO_DNS and 22: %q %d", e.ClientHost, e.ClientPort)
	}
}

func TestRejectsNonAssignmentLines(t *testing.T) {
	dir := t.TempDir()
	marker := filepath.Join(dir, "ran")
	for _, line := range []string{
		"PASEO_SSH=$(touch " + marker + ")",
		"PASEO_SSH=\"$(touch " + marker + ")\"",
		"PASEO_SSH=`touch " + marker + "`",
		"touch " + marker,
		"export PASEO_SSH=x",
		"PASEO_SSH=x; touch " + marker,
		"paseo_ssh=x",
	} {
		t.Run(line, func(t *testing.T) {
			path := filepath.Join(dir, "bad.env")
			if err := os.WriteFile(path, []byte(localTool+line+"\n"), 0o600); err != nil {
				t.Fatal(err)
			}
			if _, err := registry.Load(dir, "bad"); err == nil {
				t.Fatal("accepted a line that is not KEY=value")
			}
			if _, err := os.Stat(marker); err == nil {
				t.Fatal("a registry line was executed")
			}
		})
	}
}

func TestSaveKeepsKeysAndModes(t *testing.T) {
	dir := filepath.Join(t.TempDir(), "paseo-hosts")
	e, err := registry.Parse("build-1", []byte(localTool))
	if err != nil {
		t.Fatal(err)
	}
	e.AddClient("mac")
	e.AddClient("win")
	e.AddClient("mac")
	if err := e.Save(dir); err != nil {
		t.Fatal(err)
	}
	assertMode(t, dir, 0o700)
	assertMode(t, filepath.Join(dir, "build-1.env"), 0o600)
	back, err := registry.Load(dir, "build-1")
	if err != nil {
		t.Fatal(err)
	}
	if !slices.Equal(back.Clients, []string{"mac", "win"}) || back.ListenPort != 6867 || back.Agents != "codex claude" || back.PasswordFile != e.PasswordFile {
		t.Fatalf("round trip: %+v", back)
	}
	back.RemoveClient("mac")
	if !slices.Equal(back.Clients, []string{"win"}) {
		t.Fatalf("remove: %v", back.Clients)
	}
}

func TestPasswordIsCreatedOnceWithMode600(t *testing.T) {
	dir := filepath.Join(t.TempDir(), "paseo-hosts")
	first, created, err := registry.EnsurePassword(dir, "build-1")
	if err != nil || !created || len(first) < 32 {
		t.Fatalf("create: %q %v %v", first, created, err)
	}
	assertMode(t, registry.PasswordPath(dir, "build-1"), 0o600)
	again, created, err := registry.EnsurePassword(dir, "build-1")
	if err != nil || created || again != first {
		t.Fatalf("reuse: created=%v err=%v changed=%v", created, err, again != first)
	}
}

func assertMode(t *testing.T, path string, want os.FileMode) {
	t.Helper()
	info, err := os.Stat(path)
	if err != nil {
		t.Fatal(err)
	}
	if got := info.Mode().Perm(); got != want {
		t.Fatalf("%s mode %o, want %o", path, got, want)
	}
}
