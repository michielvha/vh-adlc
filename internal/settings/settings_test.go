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

// canary appears in every refused input and must never reach the report.
const canary = "SECRETCANARY"

func TestRefused(t *testing.T) {
	const (
		syntax    = "invalid YAML syntax"
		empty     = "empty input"
		documents = "more than one document"
		top       = "top level is not a mapping"
		key       = "mapping key is not a string"
		duplicate = "duplicate mapping key"
		anchor    = "anchors and aliases are not accepted"
		merge     = "merge keys are not accepted"
		tag       = "explicit tags are not accepted"
		number    = "number is not a safe decimal integer"
		spelling  = "boolean or null spelling is not accepted"
	)
	tests := []struct {
		name   string
		input  string
		reason string
	}{
		// Inputs that cannot hold a value carry the canary in a comment or after
		// the refused part; the rest carry it in a key or value.
		{"empty input", "", empty},
		{"only a comment", "# " + canary + "\n", empty},
		{"only whitespace", "  \n\n", empty},
		{"second document", "a: 1\n---\nb: " + canary + "\n", documents},
		{"second document of another kind", canary + ": 1\n---\n- b\n", documents},
		{"trailing document marker", canary + ": 1\n---\n", documents},
		{"broken second document", canary + ": 1\n---\n]\n", syntax},
		{"null document", "--- # " + canary + "\n", top},
		{"sequence at the top", "- " + canary + "\n", top},
		{"scalar at the top", canary + "\n", top},
		{"integer key", "1: " + canary + "\n", key},
		{"boolean key", "true: " + canary + "\n", key},
		{"null key", "~: " + canary + "\n", key},
		{"empty key", "? \n: " + canary + "\n", key},
		{"timestamp key", "2026-11-02: " + canary + "\n", key},
		{"float key", "1.5: " + canary + "\n", key},
		{"sequence key", "? [" + canary + "]\n: 1\n", key},
		{"mapping key", "? {" + canary + ": 1}\n: 1\n", key},
		{"nested bad key", "a:\n  1: " + canary + "\n", key},
		{"duplicate key", canary + ": 1\n" + canary + ": 2\n", duplicate},
		{"duplicate in another style", canary + ": 1\n\"" + canary + "\": 2\n", duplicate},
		{"nested duplicate key", "a:\n  " + canary + ": 1\n  " + canary + ": 2\n", duplicate},
		{"alias", "a: &" + canary + " 1\nb: *" + canary + "\n", anchor},
		{"anchor on a value", "a: &" + canary + " 1\n", anchor},
		{"anchor on a key", "&" + canary + " a: 1\n", anchor},
		{"anchor on the root mapping", "&" + canary + "\na: 1\n", anchor},
		{"anchor on a nested sequence", "a: &" + canary + " [1]\n", anchor},
		{"anchor on a nested mapping", "a: &" + canary + " {b: 1}\n", anchor},
		{"unknown anchor", "a: *" + canary + "\n", syntax},
		{"merge key", "<<: {" + canary + ": 1}\n", merge},
		{"nested merge key", "a:\n  <<: {" + canary + ": 1}\n", merge},
		{"merge value", canary + ": <<\n", merge},
		{"merge in a sequence", canary + ": [<<]\n", merge},
		{"tag on a value", "a: !!str " + canary + "\n", tag},
		{"custom tag", "a: !" + canary + " 1\n", tag},
		{"verbatim tag", "a: !<tag:yaml.org,2002:str> " + canary + "\n", tag},
		{"tag on a key", "!!str " + canary + ": 1\n", tag},
		{"tag on the root mapping", "!!map {" + canary + ": 1}\n", tag},
		{"tag on a nested sequence", "a: !!seq [" + canary + "]\n", tag},
		{"tag on a nested mapping", "a: !!map {" + canary + ": 1}\n", tag},
		{"binary tag", "a: !!binary " + canary + "\n", tag},
		{"float", canary + ": 1.5\n", number},
		{"exponent", canary + ": 1e3\n", number},
		{"infinity", canary + ": .inf\n", number},
		{"not a number", canary + ": .nan\n", number},
		{"above the safe range", canary + ": 9007199254740992\n", number},
		{"below the safe range", canary + ": -9007199254740992\n", number},
		{"past 64 bits", canary + ": 99999999999999999999\n", number},
		{"past 64 bits, negative", canary + ": -99999999999999999999\n", number},
		{"plus sign", canary + ": +1\n", number},
		{"leading zero", canary + ": 007\n", number},
		{"hexadecimal", canary + ": 0x10\n", number},
		{"octal", canary + ": 0o17\n", number},
		{"binary", canary + ": 0b101\n", number},
		{"underscores", canary + ": 1_000\n", number},
		{"bare tag on a leading zero", canary + ": ! 007\n", number},
		{"capital true", canary + ": True\n", spelling},
		{"upper true", canary + ": TRUE\n", spelling},
		{"capital false", canary + ": False\n", spelling},
		{"tilde", canary + ": ~\n", spelling},
		{"capital null", canary + ": Null\n", spelling},
		{"upper null", canary + ": NULL\n", spelling},
		{"unknown directive version", "# " + canary + "\n%YAML 1.3\n---\na: 1\n", syntax},
		{"YAML 1.2 directive", "# " + canary + "\n%YAML 1.2\n---\na: 1\n", syntax},
		{"syntax error", "a: [" + canary + "\n", syntax},
		{"tab indent", "a:\n\t- " + canary + "\n", syntax},
		{"bad escape", "a: \"\\q " + canary + "\"\n", syntax},
		{"invalid UTF-8", "a: " + canary + "\xff\n", syntax},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if tt.input != "" && tt.input != "  \n\n" && !strings.Contains(tt.input, canary) {
				t.Fatalf("the row carries no canary: %q", tt.input)
			}
			rep := Command(strings.NewReader(tt.input))
			var buf bytes.Buffer
			if err := rep.Write(&buf); err != nil {
				t.Fatal(err)
			}
			if rep.Result != report.Malformed || len(rep.Findings) != 1 {
				t.Fatalf("report = %s, want malformed with one finding", buf.String())
			}
			if f := rep.Findings[0]; f.Code != report.CodeSettingsInvalid || f.Message != tt.reason {
				t.Fatalf("finding = %+v, want %s: %q", f, report.CodeSettingsInvalid, tt.reason)
			}
			if strings.Contains(buf.String(), canary) {
				t.Fatalf("the report holds text from the file: %s", buf.String())
			}
		})
	}
}
