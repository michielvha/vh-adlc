// Package settings is the strict reader behind `vh-adlc settings read`: it
// turns one YAML settings file into a value the TypeScript operations can use,
// or refuses the file.
package settings

import (
	"bytes"
	"errors"
	"fmt"
	"io"
	"regexp"
	"strconv"
	"strings"

	"github.com/michielvha/vh-adlc/internal/report"
	"go.yaml.in/yaml/v4"
)

const commandName = "settings read"

// maxSafeInteger is JavaScript's Number.MAX_SAFE_INTEGER.
const maxSafeInteger = 1<<53 - 1

// A refusal's reason is fixed text. It never holds text from the file or from
// the library's error, because a settings file can hold anything.
const (
	reasonSyntax    = "invalid YAML syntax"
	reasonEmpty     = "empty input"
	reasonDocuments = "more than one document"
	reasonTop       = "top level is not a mapping"
	reasonKey       = "mapping key is not a string"
	reasonDuplicate = "duplicate mapping key"
	reasonAnchor    = "anchors and aliases are not accepted"
	reasonMerge     = "merge keys are not accepted"
	reasonTag       = "explicit tags are not accepted"
	reasonNumber    = "number is not a safe decimal integer"
	reasonSpelling  = "boolean or null spelling is not accepted"
)

// decimal is the one integer spelling the reader accepts.
var decimal = regexp.MustCompile(`^-?(0|[1-9][0-9]*)$`)

// numberSpelling is what the library's resolver reads as a number, once
// numberShaped has removed any underscores.
var numberSpelling = regexp.MustCompile(`^[-+]?(0[xX][0-9a-fA-F]+|0[oO][0-7]+|0[bB][01]+|(\.[0-9]+|[0-9]+(\.[0-9]*)?)([eE][-+]?[0-9]+)?)$`)

// A library error names its line only as `yaml: line N: ...`.
var libraryLine = regexp.MustCompile(`^yaml: line ([0-9]+):`)

// refusal is why a file was refused. Line is 0 when no line is known.
type refusal struct {
	reason string
	line   int
}

// answer is the report's data on success.
type answer struct {
	Value any `json:"value"`
}

// Command reads one file's bytes from r and reports its value or refuses it.
func Command(r io.Reader) *report.Report {
	input, err := io.ReadAll(r)
	if err != nil {
		return report.New(commandName, report.Error, report.Finding{Code: report.CodeError, Message: fmt.Sprintf("reading stdin: %v", err)})
	}
	v, ref := parse(input)
	if ref != nil {
		return report.New(commandName, report.Malformed, report.Finding{Code: report.CodeSettingsInvalid, Message: ref.reason, Line: ref.line})
	}
	rep := report.New(commandName, report.Answered)
	rep.Data = answer{Value: v}
	return rep
}

// parse decodes to the end of the input, because one Decode call stops at the
// first document and would never see a second one, then walks the nodes.
func parse(input []byte) (any, *refusal) {
	dec := yaml.NewDecoder(bytes.NewReader(input))
	var doc yaml.Node
	switch err := dec.Decode(&doc); {
	case errors.Is(err, io.EOF):
		return nil, &refusal{reason: reasonEmpty}
	case err != nil:
		return nil, syntax(err)
	}
	var extra yaml.Node
	switch err := dec.Decode(&extra); {
	case err == nil:
		return nil, &refusal{reasonDocuments, extra.Line}
	case !errors.Is(err, io.EOF):
		return nil, syntax(err)
	}
	top := doc.Content[0]
	if top.Kind != yaml.MappingNode {
		return nil, &refusal{reasonTop, doc.Line}
	}
	return value(top)
}

// syntax keeps only the digits of a library error: the rest can echo the file.
func syntax(err error) *refusal {
	ref := &refusal{reason: reasonSyntax}
	if m := libraryLine.FindStringSubmatch(err.Error()); m != nil {
		if line, err := strconv.Atoi(m[1]); err == nil {
			ref.line = line
		}
	}
	return ref
}

// value converts a node to its JSON value. Collections are never nil, so an
// empty one prints as [] or {}. JSON encoding sorts the mapping keys.
func value(n *yaml.Node) (any, *refusal) {
	if ref := marked(n); ref != nil {
		return nil, ref
	}
	resolved := *n
	resolved.Tag = compatibleTag(n)
	n = &resolved
	switch n.Kind {
	case yaml.MappingNode:
		return mapping(n)
	case yaml.SequenceNode:
		out := make([]any, 0, len(n.Content))
		for _, item := range n.Content {
			v, ref := value(item)
			if ref != nil {
				return nil, ref
			}
			out = append(out, v)
		}
		return out, nil
	default:
		return scalar(n)
	}
}

// marked refuses what any node can carry, keys included. An alias always
// follows its anchor, so a walk in document order meets the anchor first.
// A bare `!` sets no TaggedStyle and remains accepted.
func marked(n *yaml.Node) *refusal {
	switch {
	case n.Anchor != "" || n.Kind == yaml.AliasNode:
		return &refusal{reasonAnchor, n.Line}
	case n.Style&yaml.TaggedStyle != 0:
		return &refusal{reasonTag, n.Line}
	}
	return nil
}

func mapping(n *yaml.Node) (any, *refusal) {
	out := make(map[string]any, len(n.Content)/2)
	for i := 0; i+1 < len(n.Content); i += 2 {
		k := n.Content[i]
		if ref := key(k); ref != nil {
			return nil, ref
		}
		if _, ok := out[k.Value]; ok {
			return nil, &refusal{reasonDuplicate, k.Line}
		}
		v, ref := value(n.Content[i+1])
		if ref != nil {
			return nil, ref
		}
		out[k.Value] = v
	}
	return out, nil
}

func key(n *yaml.Node) *refusal {
	if ref := marked(n); ref != nil {
		return ref
	}
	resolved := *n
	resolved.Tag = compatibleTag(n)
	n = &resolved
	switch {
	case n.Tag == "!!merge":
		return &refusal{reasonMerge, n.Line}
	case n.Kind != yaml.ScalarNode || n.Tag != "!!str" || overflowed(n):
		return &refusal{reasonKey, n.Line}
	}
	return nil
}

// compatibleTag preserves the v3 implicit resolution of a bare, non-specific !.
// V4 retains that tag on scalar nodes instead of resolving it. Quoted and block
// scalars stay strings; only an identical standalone scalar supplies a new tag.
func compatibleTag(n *yaml.Node) string {
	if n.Kind != yaml.ScalarNode || n.Tag != "!" {
		return n.Tag
	}
	if n.Style != 0 {
		return "!!str"
	}
	if n.Value == "" {
		return "!!null"
	}
	var inferred yaml.Node
	if err := yaml.Unmarshal([]byte(n.Value), &inferred); err == nil && len(inferred.Content) == 1 {
		scalar := inferred.Content[0]
		if scalar.Kind == yaml.ScalarNode && scalar.Value == n.Value {
			return scalar.Tag
		}
	}
	return "!!str"
}

func scalar(n *yaml.Node) (any, *refusal) {
	switch n.Tag {
	case "!!str":
		if overflowed(n) {
			return nil, &refusal{reasonNumber, n.Line}
		}
		return n.Value, nil
	case "!!timestamp":
		return n.Value, nil
	case "!!bool":
		if n.Value == "true" || n.Value == "false" {
			return n.Value == "true", nil
		}
		return nil, &refusal{reasonSpelling, n.Line}
	case "!!null":
		if n.Value == "" || n.Value == "null" {
			return nil, nil
		}
		return nil, &refusal{reasonSpelling, n.Line}
	case "!!int":
		if v, err := strconv.ParseInt(n.Value, 10, 64); err == nil && decimal.MatchString(n.Value) && -maxSafeInteger <= v && v <= maxSafeInteger {
			return v, nil
		}
		return nil, &refusal{reasonNumber, n.Line}
	case "!!merge":
		return nil, &refusal{reasonMerge, n.Line}
	case "!!float":
		// V4 resolves negative zero as a float; the settings contract accepts it.
		if n.Value == "-0" {
			return int64(0), nil
		}
		return nil, &refusal{reasonNumber, n.Line}
	default: // !!float, the only tag left for an untagged scalar
		return nil, &refusal{reasonNumber, n.Line}
	}
}

// overflowed reports a plain !!str that is spelled as a number. The library
// tags a number it cannot hold as a string, so the tag alone would accept it.
func overflowed(n *yaml.Node) bool {
	return n.Style == 0 && numberShaped(n.Value)
}

// numberShaped follows the resolver, which never reads a value starting with an
// underscore as a number and keeps the underscores of one starting with a dot.
func numberShaped(s string) bool {
	if strings.HasPrefix(s, "_") {
		return false
	}
	if !strings.HasPrefix(s, ".") {
		s = strings.ReplaceAll(s, "_", "")
	}
	return numberSpelling.MatchString(s)
}
