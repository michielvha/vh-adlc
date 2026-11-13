package doc

import (
	"encoding/json"
	"os"
	"testing"
)

// Shared fixtures bind supported feature patterns to the gate. The conservative
// drift dialect can report gaps for patterns the current gate also supports.
func TestMatchCoversSharedDriftFixtures(t *testing.T) {
	data, err := os.ReadFile("../../tests/vh-adlc/docs-drift/feature-covers.json")
	if err != nil {
		t.Fatal(err)
	}
	var fixtures []struct {
		Name        string `json:"name"`
		Pattern     string `json:"pattern"`
		Path        string `json:"path"`
		Valid       bool   `json:"valid"`
		Matched     bool   `json:"matched"`
		GateMatched *bool  `json:"gate_matched"`
	}
	if err := json.Unmarshal(data, &fixtures); err != nil {
		t.Fatal(err)
	}
	if len(fixtures) == 0 {
		t.Fatal("shared coverage fixtures are empty")
	}
	for _, fixture := range fixtures {
		t.Run(fixture.Name, func(t *testing.T) {
			expected := fixture.Matched
			if fixture.GateMatched != nil {
				if fixture.Valid || fixture.Matched {
					t.Fatal("a supported feature pattern cannot override gate parity")
				}
				expected = *fixture.GateMatched
			}
			if actual := MatchCovers([]string{fixture.Pattern}, fixture.Path); actual != expected {
				t.Errorf("MatchCovers(%q, %q) = %v, want %v", fixture.Pattern, fixture.Path, actual, expected)
			}
		})
	}
}
