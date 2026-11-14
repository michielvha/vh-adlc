package main

import (
	"bytes"
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestHelpWithJSONPrintsOneObject(t *testing.T) {
	for _, tc := range []struct {
		args    []string
		command string
		want    string
	}{
		{[]string{"--help", "--json"}, "help", "Usage:"},
		{[]string{"help", "--json"}, "help", "Usage:"},
		{[]string{"link", "--help", "--json"}, "link", "paseo-hosts link"},
	} {
		var stdout, stderr bytes.Buffer
		if code := run(tc.args, strings.NewReader(""), &stdout, &stderr, false); code != 0 {
			t.Fatalf("%v: exit %d, stderr %q", tc.args, code, stderr.String())
		}
		var doc struct {
			SchemaVersion int    `json:"schema_version"`
			Command       string `json:"command"`
			Result        string `json:"result"`
			Data          struct {
				Usage string `json:"usage"`
			} `json:"data"`
		}
		dec := json.NewDecoder(&stdout)
		if err := dec.Decode(&doc); err != nil {
			t.Fatalf("%v: stdout is not one JSON object: %v", tc.args, err)
		}
		if dec.More() {
			t.Fatalf("%v: more than one JSON value on stdout", tc.args)
		}
		if doc.SchemaVersion != 1 || doc.Command != tc.command || doc.Result != "ok" || !strings.Contains(doc.Data.Usage, tc.want) {
			t.Fatalf("%v: unexpected result %+v", tc.args, doc)
		}
	}
}

func TestOnlyATerminalCountsAsATerminal(t *testing.T) {
	devNull, err := os.OpenFile(os.DevNull, os.O_WRONLY, 0)
	if err != nil {
		t.Fatal(err)
	}
	defer func() { _ = devNull.Close() }()
	if isTerminal(devNull) {
		t.Error("/dev/null counts as a terminal")
	}
	file, err := os.Create(filepath.Join(t.TempDir(), "log"))
	if err != nil {
		t.Fatal(err)
	}
	defer func() { _ = file.Close() }()
	if isTerminal(file) {
		t.Error("a regular file counts as a terminal")
	}
	r, w, err := os.Pipe()
	if err != nil {
		t.Fatal(err)
	}
	defer func() { _ = r.Close(); _ = w.Close() }()
	if isTerminal(w) {
		t.Error("a pipe counts as a terminal")
	}
	pty := openPTY(t)
	if !isTerminal(pty) {
		t.Error("a pseudo-terminal does not count as a terminal")
	}
}
