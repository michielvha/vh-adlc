package app

import (
	"bytes"
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
)

func TestHelpAndInvalidCommands(t *testing.T) {
	var out bytes.Buffer
	if code := Run([]string{"help"}, &out); code != 0 || !bytes.Contains(out.Bytes(), []byte("share")) {
		t.Fatalf("help: %d %s", code, out.String())
	}
	out.Reset()
	if code := Run([]string{"unknown", "secret-sentinel"}, &out); code == 0 || bytes.Contains(out.Bytes(), []byte("secret-sentinel")) {
		t.Fatalf("invalid command: %d %s", code, out.String())
	}
}

func TestServiceDoctorDoesNotNeedGUI(t *testing.T) {
	t.Setenv("PATH", t.TempDir())
	var out bytes.Buffer
	if code := Run([]string{"doctor", "--kind", "share", "--transport", "loopback"}, &out); code != 0 {
		t.Fatalf("service doctor needs no tools: %s", out.String())
	}
	var got map[string]any
	if err := json.Unmarshal(out.Bytes(), &got); err != nil || got["result"] != "ready" {
		t.Fatalf("doctor: %v %s", err, out.String())
	}
	out.Reset()
	if code := Run([]string{"doctor", "--kind", "browser", "--transport", "loopback"}, &out); code == 0 {
		t.Fatal("browser doctor accepted missing GUI tools")
	}
}

func TestTailnetDoctorRequiresConditionalAPI(t *testing.T) {
	tools := t.TempDir()
	if err := os.WriteFile(filepath.Join(tools, "tailscale"), []byte("#!/bin/sh\nexit 0\n"), 0o700); err != nil {
		t.Fatal(err)
	}
	t.Setenv("PATH", tools)
	t.Setenv("REMOTE_GUI_TAILSCALE_SOCKET", filepath.Join(tools, "absent.sock"))
	var out bytes.Buffer
	if code := Run([]string{"doctor", "--kind", "share", "--transport", "tailscale"}, &out); code == 0 {
		t.Fatal("doctor accepted unreachable LocalAPI")
	}
	if !bytes.Contains(out.Bytes(), []byte("capability-unavailable")) {
		t.Fatal("missing capability diagnostic", out.String())
	}
}
