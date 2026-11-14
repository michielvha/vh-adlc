package doc

import (
	"encoding/json"
	"os"
	"testing"
)

// Shared fixtures bind the feature dialect and gate to the same expected matches.
func TestMatchCoversSharedDriftFixtures(t *testing.T) {
	data, err := os.ReadFile("../../tests/vh-adlc/docs-drift/feature-covers.json")
	if err != nil {
		t.Fatal(err)
	}
	var fixtures []struct {
		Name    string `json:"name"`
		Pattern string `json:"pattern"`
		Path    string `json:"path"`
		Matched bool   `json:"matched"`
	}
	if err := json.Unmarshal(data, &fixtures); err != nil {
		t.Fatal(err)
	}
	if len(fixtures) == 0 {
		t.Fatal("shared coverage fixtures are empty")
	}
	for _, fixture := range fixtures {
		t.Run(fixture.Name, func(t *testing.T) {
			if actual := MatchCovers([]string{fixture.Pattern}, fixture.Path); actual != fixture.Matched {
				t.Errorf("MatchCovers(%q, %q) = %v, want %v", fixture.Pattern, fixture.Path, actual, fixture.Matched)
			}
		})
	}
}
