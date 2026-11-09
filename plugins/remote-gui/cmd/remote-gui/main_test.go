package main

import (
	"bytes"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"testing"
	"time"

	"github.com/michielvha/vh-adlc/plugins/remote-gui/internal/app"
	"github.com/michielvha/vh-adlc/plugins/remote-gui/internal/session"
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
