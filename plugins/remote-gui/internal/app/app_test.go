package app

import (
	"bytes"
	"encoding/json"
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
