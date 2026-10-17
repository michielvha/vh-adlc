package main

import (
	"encoding/json"
	"os"
	"path/filepath"
	"slices"
	"testing"

	"github.com/michielvha/vh-adlc/internal/report"
)

type schemaFile struct {
	Required   []string `json:"required"`
	Properties struct {
		Result struct {
			Enum []string `json:"enum"`
		} `json:"result"`
		Findings struct {
			Items struct {
				Properties struct {
					Code struct {
						Enum []string `json:"enum"`
					} `json:"code"`
				} `json:"properties"`
			} `json:"items"`
		} `json:"findings"`
	} `json:"properties"`
}

// TestSchema checks the schema's required keys and enum lists against the
// binary's results and codes, and every golden output against the schema. It
// does not run a full JSON Schema validator.
func TestSchema(t *testing.T) {
	raw, err := os.ReadFile(filepath.Join("..", "..", "schema", "vh-adlc.schema.json"))
	if err != nil {
		t.Fatal(err)
	}
	var s schemaFile
	if err := json.Unmarshal(raw, &s); err != nil {
		t.Fatal(err)
	}
	var results []string
	for _, r := range report.Results {
		results = append(results, string(r))
	}
	if !sameSet(s.Properties.Result.Enum, results) {
		t.Errorf("schema results %q, binary results %q", s.Properties.Result.Enum, results)
	}
	codes := slices.Concat(report.Codes, report.Conditions)
	if !sameSet(s.Properties.Findings.Items.Properties.Code.Enum, codes) {
		t.Errorf("schema codes %q, binary codes %q", s.Properties.Findings.Items.Properties.Code.Enum, codes)
	}

	goldens, err := filepath.Glob(filepath.Join("testdata", "golden", "*.json"))
	if err != nil || len(goldens) == 0 {
		t.Fatalf("no golden files: %v", err)
	}
	for _, g := range goldens {
		b, err := os.ReadFile(g)
		if err != nil {
			t.Fatal(err)
		}
		var top map[string]json.RawMessage
		if err := json.Unmarshal(b, &top); err != nil {
			t.Fatalf("%s: %v", g, err)
		}
		var keys []string
		for k := range top {
			keys = append(keys, k)
		}
		if !sameSet(keys, s.Required) {
			t.Errorf("%s: keys %q, schema requires exactly %q", g, keys, s.Required)
		}
		var out struct {
			Findings []report.Finding `json:"findings"`
		}
		if err := json.Unmarshal(b, &out); err != nil {
			t.Fatalf("%s: %v", g, err)
		}
		for _, f := range out.Findings {
			if !slices.Contains(codes, f.Code) {
				t.Errorf("%s: code %q is not in the schema", g, f.Code)
			}
		}
	}
}

func sameSet(a, b []string) bool {
	a, b = slices.Clone(a), slices.Clone(b)
	slices.Sort(a)
	slices.Sort(b)
	return slices.Equal(slices.Compact(a), slices.Compact(b)) && len(a) == len(b)
}
