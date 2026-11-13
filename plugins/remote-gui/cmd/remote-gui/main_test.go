package main

import (
	"bytes"
	"encoding/json"
	"io"
	"net"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/michielvha/vh-adlc/plugins/remote-gui/internal/app"
	"github.com/michielvha/vh-adlc/plugins/remote-gui/internal/config"
	"github.com/michielvha/vh-adlc/plugins/remote-gui/internal/profile"
	"github.com/michielvha/vh-adlc/plugins/remote-gui/internal/session"
	"github.com/michielvha/vh-adlc/plugins/remote-gui/internal/state"
)

func TestMain(m *testing.M) {
	if handled, code := session.Internal(os.Args[1:]); handled {
		os.Exit(code)
	}
	os.Exit(m.Run())
}

func TestPublicLifecycle(t *testing.T) {
	root, err := os.MkdirTemp("/tmp", "rg-cli-")
	if err != nil {
		t.Fatal(err)
	}
	defer func() { _ = os.RemoveAll(root) }()
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { _, _ = io.WriteString(w, "cli-app") }))
	defer upstream.Close()
	invoke := func(args ...string) (int, string) {
		t.Helper()
		var out bytes.Buffer
		code := app.RunWith(append(args, "--home", root, "--transport", "loopback"), &out, execute)
		return code, out.String()
	}
	code, raw := invoke("share", upstream.URL+"/app?private=cli-query-sentinel")
	if code != 0 {
		t.Fatal("share failed", raw)
	}
	var started session.View
	if json.Unmarshal([]byte(raw), &started) != nil || started.State != "ready" {
		t.Fatal("invalid share result")
	}
	defer func() { _, _ = session.Stop(root, started.ID) }()
	if strings.Contains(raw, "cli-query-sentinel") || strings.Contains(raw, "access_code") {
		t.Fatal("ordinary start leaked access material")
	}
	var fields map[string]any
	_ = json.Unmarshal([]byte(raw), &fields)
	if fields["result"] != "ready" || fields["local_target"] != upstream.URL+"/app" {
		t.Fatal("missing public result or redacted target")
	}
	code, raw = invoke("handoff", started.ID, "--browser-mode", "human")
	if code == 0 || !strings.Contains(raw, "handoff-requires-browser-session") {
		t.Fatal("handoff did not reject the service-sharing session", raw)
	}
	for _, cmd := range []string{"status", "access"} {
		code, raw = invoke(cmd, started.ID)
		if code != 0 || strings.Contains(raw, "access_code") || strings.Contains(raw, "cli-query-sentinel") {
			t.Fatal("ordinary output exposed private data")
		}
	}
	code, raw = invoke("access", started.ID, "--reveal")
	if code != 0 || !strings.Contains(raw, "access_code") || !strings.Contains(raw, "cli-query-sentinel") {
		t.Fatal("explicit reveal failed")
	}
	var revealed map[string]any
	if json.Unmarshal([]byte(raw), &revealed) != nil {
		t.Fatal("invalid reveal metadata")
	}
	expiry, _ := revealed["enrollment_expires_at"].(string)
	deadline, err := time.Parse(time.RFC3339, expiry)
	if err != nil || time.Until(deadline) <= 0 || time.Until(deadline) > 10*time.Minute {
		t.Fatal("missing or incorrect enrollment deadline")
	}
	code, raw = invoke("stop", started.ID)
	if code != 0 || !strings.Contains(raw, `"state":"stopped"`) {
		t.Fatal("stop failed", raw)
	}
	code, _ = invoke("stop", started.ID)
	if code != 0 {
		t.Fatal("repeat stop failed")
	}
	code, raw = invoke("stop", strings.Repeat("f", 32))
	if code != 0 || !strings.Contains(raw, `"state":"missing"`) {
		t.Fatal("missing stop contract changed")
	}
	code, _ = invoke("status", strings.Repeat("f", 32))
	if code == 0 {
		t.Fatal("missing status reported success")
	}
	code, _ = invoke("cleanup")
	if code != 0 {
		t.Fatal("cleanup failed")
	}
}

func TestProfileCommands(t *testing.T) {
	root, err := os.MkdirTemp("/tmp", "rg-cli-profile-")
	if err != nil {
		t.Fatal(err)
	}
	defer func() { _ = os.RemoveAll(root) }()
	home, profiles := filepath.Join(root, "sessions"), filepath.Join(root, "profiles")
	invoke := func(args ...string) (int, map[string]any, string) {
		t.Helper()
		var out bytes.Buffer
		code := app.RunWith(append(args, "--home", home), &out, execute)
		var fields map[string]any
		_ = json.Unmarshal(out.Bytes(), &fields)
		return code, fields, out.String()
	}
	code, _, raw := invoke("start", "--profile", "work", "--profile-home", profiles, "--transport", "loopback", "--browser-mode", "agent")
	if code != 2 || !strings.Contains(raw, "profile-requires-human-start") {
		t.Fatalf("unapproved agent start: %d %s", code, raw)
	}
	code, _, raw = invoke("profile", "list")
	if code != 2 || !strings.Contains(raw, "profile-home-required") {
		t.Fatalf("missing profile root: %d %s", code, raw)
	}
	code, fields, raw := invoke("profile", "list", "--profile-home", profiles)
	if code != 0 || fields["result"] != "observed" || !strings.Contains(raw, `"profiles":[]`) {
		t.Fatalf("empty list: %d %s", code, raw)
	}
	self, err := state.Inspect(os.Getpid())
	if err != nil {
		t.Fatal(err)
	}
	holder := strings.Repeat("a", 32)
	seed := func(name string, m profile.Meta) {
		held, e := profile.Acquire(profiles, name)
		if e != nil {
			t.Fatal(e)
		}
		defer held.Release()
		if e = held.SaveMeta(m); e != nil {
			t.Fatal(e)
		}
	}
	now := time.Now().UTC()
	seed("busy", profile.Meta{OwnerLogin: "owner@example.test", Transport: "tailscale", Created: now, LastUsed: now, HolderID: holder, HolderGuard: &self})
	seed("idle", profile.Meta{Transport: "loopback", Created: now, LastUsed: now})
	code, _, raw = invoke("profile", "list", "--profile-home", profiles)
	var listed struct {
		Profiles []map[string]any `json:"profiles"`
	}
	if code != 0 || json.Unmarshal([]byte(raw), &listed) != nil || len(listed.Profiles) != 2 {
		t.Fatalf("list: %d %s", code, raw)
	}
	for _, entry := range listed.Profiles {
		for _, key := range []string{"name", "transport", "created", "last_used", "in_use"} {
			if _, ok := entry[key]; !ok {
				t.Fatalf("list entry lacks %s: %v", key, entry)
			}
		}
		busy := entry["name"] == "busy"
		if entry["in_use"] != busy || (busy && (entry["holder_session"] != holder || entry["owner_login"] != "owner@example.test")) {
			t.Fatalf("list entry: %v", entry)
		}
	}
	held, err := profile.Acquire(profiles, "idle")
	if err != nil {
		t.Fatal(err)
	}
	code, _, raw = invoke("profile", "delete", "idle", "--profile-home", profiles)
	held.Release()
	if code == 0 || !strings.Contains(raw, "profile-in-use") {
		t.Fatalf("deleted a locked profile: %d %s", code, raw)
	}
	socketDir, err := os.MkdirTemp("/tmp", "rg-cli-singleton-")
	if err != nil {
		t.Fatal(err)
	}
	defer func() { _ = os.RemoveAll(socketDir) }()
	listener, err := net.Listen("unix", filepath.Join(socketDir, "socket"))
	if err != nil {
		t.Fatal(err)
	}
	go func() {
		for {
			conn, e := listener.Accept()
			if e != nil {
				return
			}
			_ = conn.Close()
		}
	}()
	chromium := filepath.Join(profiles, "idle", "chromium")
	for name, target := range map[string]string{"SingletonLock": "host-1", "SingletonCookie": "1", "SingletonSocket": filepath.Join(socketDir, "socket")} {
		if err = os.Symlink(target, filepath.Join(chromium, name)); err != nil {
			t.Fatal(err)
		}
	}
	code, _, raw = invoke("profile", "delete", "idle", "--profile-home", profiles)
	if code == 0 || !strings.Contains(raw, "profile-browser-still-running") {
		t.Fatalf("deleted a profile a browser still uses: %d %s", code, raw)
	}
	if _, err = os.Lstat(chromium); err != nil {
		t.Fatal("refused delete removed files")
	}
	_ = listener.Close()
	code, fields, raw = invoke("profile", "delete", "idle", "--profile-home", profiles)
	if code != 0 || fields["result"] != "deleted" {
		t.Fatalf("delete idle: %d %s", code, raw)
	}
	if _, err = os.Lstat(filepath.Join(profiles, "idle")); !os.IsNotExist(err) {
		t.Fatal("deleted profile remains")
	}
	code, fields, raw = invoke("profile", "delete", "idle", "--profile-home", profiles)
	if code != 0 || fields["result"] != "missing" {
		t.Fatalf("repeated delete: %d %s", code, raw)
	}
	id, err := state.New(home)
	if err != nil {
		t.Fatal(err)
	}
	c, err := config.Parse([]string{"start", "--home", home, "--profile-home", profiles, "--profile", "busy", "--transport", "loopback"})
	if err != nil {
		t.Fatal(err)
	}
	if err = state.Save(home, state.Record{Version: 1, ID: id, Kind: "browser", State: "stopped", Config: c}); err != nil {
		t.Fatal(err)
	}
	for _, cmd := range []string{"status", "access"} {
		code, fields, raw = invoke(cmd, id)
		if code != 0 || fields["profile"] != "busy" {
			t.Fatalf("%s lacks the profile: %s", cmd, raw)
		}
	}
}
