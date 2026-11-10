package testenv_test

import (
	"os"
	"os/exec"
	"path/filepath"
	"slices"
	"strings"
	"testing"

	"github.com/michielvha/vh-adlc/plugins/paseo-hosts/internal/testenv"
)

func TestMain(m *testing.M) { testenv.Main(m) }

func TestSnippetRunsUnderTheHostHomeAndIsRecorded(t *testing.T) {
	e := testenv.New(t)
	srv := e.Server("srv", testenv.ServerOptions{DNS: "srv.tail.test"})
	cmd := exec.Command("ssh", "-o", "BatchMode=yes", "srv", "bash", "-s")
	cmd.Stdin = strings.NewReader(`set -e
printf %s "$HOME" > "$HOME/where"
npm install --silent --prefix "$HOME/rt" --save-exact @getpaseo/cli@0.14.0
systemctl --user daemon-reload
tailscale status --json
`)
	out, err := cmd.CombinedOutput()
	if err != nil {
		t.Fatalf("%v: %s", err, out)
	}
	if got := srv.Read("where"); got != srv.Home {
		t.Fatalf("snippet ran with HOME %q, want %q", got, srv.Home)
	}
	if _, err := os.Stat(filepath.Join(e.Home, "where")); err == nil {
		t.Fatal("snippet wrote to the operator home")
	}
	if _, err := os.Stat(srv.Path("rt/node_modules/.bin/paseo")); err != nil {
		t.Fatalf("stand-in npm did not install the runtime: %v", err)
	}
	if !strings.Contains(string(out), `"DNSName":"srv.tail.test."`) {
		t.Fatalf("tailscale status: %s", out)
	}
	var got []string
	for _, c := range e.Calls() {
		got = append(got, c.Host+":"+c.Name+" "+strings.Join(c.Args, " "))
	}
	want := []string{
		":ssh -o BatchMode=yes srv bash -s",
		"srv:npm install --silent --prefix " + srv.Path("rt") + " --save-exact @getpaseo/cli@0.14.0",
		"srv:systemctl --user daemon-reload",
		"srv:tailscale status --json",
	}
	if !slices.Equal(got, want) {
		t.Fatalf("recorded calls\n%s\nwant\n%s", strings.Join(got, "\n"), strings.Join(want, "\n"))
	}
}

func TestPowerShellSnippetRecordsTheACLStep(t *testing.T) {
	testenv.RequirePwsh(t)
	e := testenv.New(t)
	pc := e.Client("pc", testenv.Windows)
	cmd := exec.Command("ssh", "pc", testenv.Bootstrap)
	cmd.Stdin = strings.NewReader(`$ErrorActionPreference = 'Stop'
$k = Join-Path $env:USERPROFILE 'key'
[IO.File]::WriteAllText($k, 'x', (New-Object System.Text.UTF8Encoding($false)))
icacls $k /inheritance:r /grant:r "$($env:USERNAME):F" | Out-Null
Write-Output 'DONE=1'
`)
	out, err := cmd.CombinedOutput()
	if err != nil {
		t.Fatalf("%v: %s", err, out)
	}
	if pc.Read("key") != "x" || !strings.Contains(string(out), "DONE=1") {
		t.Fatalf("snippet output %s", out)
	}
	acl, err := os.ReadFile(filepath.Join(pc.Dir, "icacls.log"))
	if err != nil || !strings.Contains(string(acl), pc.Path("key")+" /inheritance:r /grant:r me:F") {
		t.Fatalf("icacls.log %q %v", acl, err)
	}
}
