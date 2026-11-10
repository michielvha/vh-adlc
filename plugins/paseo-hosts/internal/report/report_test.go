package report_test

import (
	"bytes"
	"encoding/json"
	"errors"
	"os"
	"strings"
	"testing"

	"github.com/michielvha/vh-adlc/plugins/paseo-hosts/internal/report"
)

func emitAll(r *report.Reporter) {
	r.Step("Installing Paseo %s", "0.14.0")
	r.Pass("password required")
	r.Fail("tunnel refused")
	r.Skip("no Serve route")
	r.Empty("registry entries")
	r.Partial("unlinked 1 of 2 clients")
}

func TestHumanOutput(t *testing.T) {
	cases := []struct {
		name     string
		terminal bool
		noColor  *string
		plain    bool
		colour   bool
	}{
		{"terminal, NO_COLOR absent", true, nil, false, true},
		{"terminal, NO_COLOR empty", true, ptr(""), false, true},
		{"terminal, NO_COLOR=0", true, ptr("0"), false, false},
		{"terminal, NO_COLOR=1", true, ptr("1"), false, false},
		{"pipe, NO_COLOR absent", false, nil, false, false},
		{"pipe, NO_COLOR empty", false, ptr(""), false, false},
		{"pipe, NO_COLOR=0", false, ptr("0"), false, false},
		{"terminal, plain", true, nil, true, false},
		{"pipe, plain, NO_COLOR=1", false, ptr("1"), true, false},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if tc.noColor == nil {
				t.Setenv("NO_COLOR", "")
				if err := os.Unsetenv("NO_COLOR"); err != nil {
					t.Fatal(err)
				}
			} else {
				t.Setenv("NO_COLOR", *tc.noColor)
			}
			var out, errw bytes.Buffer
			r := report.New(report.Options{Command: "onboard", Stdout: &out, Stderr: &errw, Terminal: tc.terminal, Plain: tc.plain})
			emitAll(r)
			code := r.Finish(nil, nil)
			if code != 0 {
				t.Fatalf("exit %d", code)
			}
			if out.Len() != 0 {
				t.Fatalf("status leaked to stdout: %q", out.String())
			}
			got := errw.String()
			if hasANSI := strings.Contains(got, "\x1b"); hasANSI != tc.colour {
				t.Fatalf("ANSI bytes present=%v, want %v: %q", hasANSI, tc.colour, got)
			}
			plain := stripANSI(got)
			want := []string{"› Installing Paseo 0.14.0", "✓ Passed: password required", "✗ Failed: tunnel refused", "∅ Skipped: no Serve route", "∅ No results: registry entries", "✗ Partial: unlinked 1 of 2 clients"}
			if tc.plain {
				want = []string{"> Installing Paseo 0.14.0", "OK Passed: password required", "FAIL Failed: tunnel refused", "SKIP Skipped: no Serve route", "NONE No results: registry entries", "FAIL Partial: unlinked 1 of 2 clients"}
				for _, b := range []byte(got) {
					if b > 0x7e {
						t.Fatalf("plain output has a non-ASCII byte: %q", got)
					}
				}
			}
			if lines := strings.Split(strings.TrimSpace(plain), "\n"); strings.Join(lines, "\n") != strings.Join(want, "\n") {
				t.Fatalf("lines:\n%s\nwant:\n%s", plain, strings.Join(want, "\n"))
			}
		})
	}
}

func TestJSONOutputAndExitCodes(t *testing.T) {
	cases := []struct {
		err    error
		code   int
		result string
	}{
		{nil, 0, "ok"},
		{errors.New("remote step failed"), 1, "failed"},
		{report.Errorf(report.ExitFailed, "tunnel refused"), 1, "failed"},
		{report.Errorf(report.ExitUsage, "unknown flag"), 2, "usage"},
		{report.Errorf(report.ExitConfig, "PASEO_HOSTS_CLIENT is not set"), 3, "config"},
		{report.Errorf(report.ExitUnsupported, "client is not macOS or Windows"), 4, "unsupported"},
	}
	for _, tc := range cases {
		t.Run(tc.result, func(t *testing.T) {
			var out, errw bytes.Buffer
			r := report.New(report.Options{Command: "link", Stdout: &out, Stderr: &errw, JSON: true, Terminal: true})
			emitAll(r)
			code := r.Finish(tc.err, map[string]any{"alias": "srv"})
			if code != tc.code {
				t.Fatalf("exit %d, want %d", code, tc.code)
			}
			var doc map[string]any
			dec := json.NewDecoder(&out)
			if err := dec.Decode(&doc); err != nil {
				t.Fatalf("stdout is not one JSON object: %v", err)
			}
			if dec.More() {
				t.Fatal("stdout holds more than one JSON value")
			}
			if strings.Contains(out.String(), "\x1b") {
				t.Fatal("ANSI bytes in JSON output")
			}
			if doc["schema_version"] != float64(1) || doc["command"] != "link" || doc["result"] != tc.result {
				t.Fatalf("fields: %v", doc)
			}
			data, ok := doc["data"].(map[string]any)
			if !ok {
				t.Fatalf("data: %v", doc["data"])
			}
			if tc.err != nil && data["error"] != tc.err.Error() {
				t.Fatalf("error not reported: %v", data)
			}
			if tc.err == nil && data["alias"] != "srv" {
				t.Fatalf("data lost: %v", data)
			}
			if tc.err != nil && !strings.Contains(errw.String(), tc.err.Error()) {
				t.Fatalf("human failure line missing on stderr: %q", errw.String())
			}
		})
	}
}

func ptr(s string) *string { return &s }

func stripANSI(s string) string {
	var b strings.Builder
	for i := 0; i < len(s); i++ {
		if s[i] == 0x1b {
			for i < len(s) && s[i] != 'm' {
				i++
			}
			continue
		}
		b.WriteByte(s[i])
	}
	return b.String()
}
