package main

import (
	"bytes"
	"encoding/json"
	"flag"
	"io"
	"slices"
	"testing"
)

func TestVersion(t *testing.T) {
	var out bytes.Buffer
	code := run(t.Context(), []string{"--version"}, &out)
	if code != 0 {
		t.Fatalf("exit = %d, want 0", code)
	}
	if got, want := out.String(), "vh-adlc dev\n"; got != want {
		t.Fatalf("output = %q, want %q", got, want)
	}
}

func TestUsage(t *testing.T) {
	tests := []struct {
		name string
		args []string
	}{
		{"no arguments", nil},
		{"unknown command", []string{"frobnicate"}},
		{"review without check", []string{"review"}},
		{"gate without arguments", []string{"gate", "--plugin-pin", "0123456789abcdef0123456789abcdef01234567"}},
		{"missing plugin pin", []string{"lint", "doc.md"}},
		{"short plugin pin", []string{"lint", "doc.md", "--plugin-pin", "0123abc"}},
		{"unknown flag", []string{"lint", "--frob", "doc.md"}},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			var out bytes.Buffer
			code := run(t.Context(), tt.args, &out)
			if code != 2 {
				t.Fatalf("exit = %d, want 2; output %s", code, out.String())
			}
			var got struct {
				SchemaVersion int    `json:"schema_version"`
				Result        string `json:"result"`
				Findings      []struct {
					Code string `json:"code"`
				} `json:"findings"`
			}
			if err := json.Unmarshal(out.Bytes(), &got); err != nil {
				t.Fatalf("output is not one JSON object: %v: %s", err, out.String())
			}
			if got.SchemaVersion != 1 || got.Result != "usage" {
				t.Fatalf("schema_version = %d, result = %q", got.SchemaVersion, got.Result)
			}
			if len(got.Findings) != 1 || got.Findings[0].Code != "usage" {
				t.Fatalf("findings = %+v, want one usage finding", got.Findings)
			}
		})
	}
}

func TestInterleavedFlags(t *testing.T) {
	tests := []struct {
		name string
		args []string
		want []string
	}{
		{"flags first", []string{"--review", "R-1", "--returned", "f", "doc.md"}, []string{"doc.md"}},
		{"flags after", []string{"doc.md", "--review", "R-1", "--returned", "f"}, []string{"doc.md"}},
		{"mixed", []string{"--review", "R-1", "doc.md", "--returned", "f", "other"}, []string{"doc.md", "other"}},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			fs, review, returned := newTestFlagSet()
			got, err := parseInterleaved(fs, tt.args)
			if err != nil {
				t.Fatal(err)
			}
			if *review != "R-1" || *returned != "f" {
				t.Fatalf("review = %q, returned = %q", *review, *returned)
			}
			if !slices.Equal(got, tt.want) {
				t.Fatalf("positionals = %q, want %q", got, tt.want)
			}
		})
	}
}

func newTestFlagSet() (fs *flag.FlagSet, review, returned *string) {
	fs = flag.NewFlagSet("test", flag.ContinueOnError)
	fs.SetOutput(io.Discard)
	return fs, fs.String("review", "", ""), fs.String("returned", "", "")
}
