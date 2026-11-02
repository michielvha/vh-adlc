package settings

import (
	"bytes"
	"encoding/json"
	"reflect"
	"strings"
	"testing"

	"github.com/michielvha/vh-adlc/internal/report"
)

// decoded runs the command on input and returns data.value from the printed
// report, so the table sees what a caller of the binary sees.
func decoded(t *testing.T, input string) any {
	t.Helper()
	var buf bytes.Buffer
	if err := Command(strings.NewReader(input)).Write(&buf); err != nil {
		t.Fatal(err)
	}
	var got struct {
		Result report.Result `json:"result"`
		Data   struct {
			Value any `json:"value"`
		} `json:"data"`
	}
	if err := json.Unmarshal(buf.Bytes(), &got); err != nil {
		t.Fatalf("%v: %s", err, buf.String())
	}
	if got.Result != report.Answered {
		t.Fatalf("result = %q, want answered: %s", got.Result, buf.String())
	}
	return got.Data.Value
}

type object = map[string]any

const (
	maxSafe    = 9007199254740991.0
	prettyJSON = `{
  "labels": [],
  "label_map": {
    "bug": "defect",
    "enhancement": "feature"
  },
  "limit": 25,
  "archived": false,
  "owner": null
}
`
)

func TestAccepted(t *testing.T) {
	tests := []struct {
		name  string
		input string
		want  any
	}{
		{"string", "a: text\n", object{"a": "text"}},
		{"quoted number is a string", "a: \"1\"\n", object{"a": "1"}},
		{"yes is a string", "a: yes\n", object{"a": "yes"}},
		{"no is a string", "a: no\n", object{"a": "no"}},
		{"true", "a: true\n", object{"a": true}},
		{"false", "a: false\n", object{"a": false}},
		{"null", "a: null\n", object{"a": nil}},
		{"empty value", "a:\n", object{"a": nil}},
		{"zero", "a: 0\n", object{"a": 0.0}},
		{"integer", "a: 25\n", object{"a": 25.0}},
		{"negative integer", "a: -25\n", object{"a": -25.0}},
		{"highest safe integer", "a: 9007199254740991\n", object{"a": maxSafe}},
		{"lowest safe integer", "a: -9007199254740991\n", object{"a": -maxSafe}},
		{"negative zero", "a: -0\n", object{"a": 0.0}},
		{"unquoted date", "a: 2026-11-02\n", object{"a": "2026-11-02"}},
		{"timestamp as written", "a: 2026-11-02 10:00:00\n", object{"a": "2026-11-02 10:00:00"}},
		{"timestamp with zone", "a: 2026-11-02T10:00:00Z\n", object{"a": "2026-11-02T10:00:00Z"}},
		{"unpadded date as written", "a: 2026-1-2\n", object{"a": "2026-1-2"}},
		{"empty sequence", "a: []\n", object{"a": []any{}}},
		{"empty mapping", "a: {}\n", object{"a": object{}}},
		{"empty top level", "{}\n", object{}},
		{"sequence", "a:\n  - b\n  - 1\n", object{"a": []any{"b", 1.0}}},
		{"nested", "z:\n  y: [{x: 1}]\na: {b: {c: true}}\n", object{"a": object{"b": object{"c": true}}, "z": object{"y": []any{object{"x": 1.0}}}}},
		{"yes as a key", "yes: 1\n", object{"yes": 1.0}},
		{"quoted merge spelling", "\"<<\": 1\n", object{"<<": 1.0}},
		{"block mapping with a comment", "# owned by the team\na: 1 # limit\nb: text\n", object{"a": 1.0, "b": "text"}},
		{"pretty-printed JSON", prettyJSON, object{
			"labels":    []any{},
			"label_map": object{"bug": "defect", "enhancement": "feature"},
			"limit":     25.0,
			"archived":  false,
			"owner":     nil,
		}},
		{"explicit document start", "---\na: 1\n", object{"a": 1.0}},
		{"document end marker", "a: 1\n...\n", object{"a": 1.0}},
		{"bare tag on an integer", "a: ! 1\n", object{"a": 1.0}},
		{"bare tag on a string", "a: ! text\n", object{"a": "text"}},
		{"YAML 1.1 directive", "%YAML 1.1\n---\na: 1\n", object{"a": 1.0}},
		{"byte order mark", "\ufeffa: 1\n", object{"a": 1.0}},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := decoded(t, tt.input); !reflect.DeepEqual(got, tt.want) {
				t.Fatalf("value = %#v, want %#v", got, tt.want)
			}
		})
	}
}

// TestSortedKeys reads the raw report, because a decoded map has no order.
func TestSortedKeys(t *testing.T) {
	var buf bytes.Buffer
	if err := Command(strings.NewReader("z: 1\na: {y: 2, b: 3}\n")).Write(&buf); err != nil {
		t.Fatal(err)
	}
	if want := `"data":{"value":{"a":{"b":3,"y":2},"z":1}}`; !strings.Contains(buf.String(), want) {
		t.Fatalf("report %s does not hold %s", buf.String(), want)
	}
}
