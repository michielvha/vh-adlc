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

	"go.yaml.in/yaml/v3"

	"github.com/michielvha/vh-adlc/internal/report"
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

type refusal struct {
	reason string
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
		return report.New(commandName, report.Malformed, report.Finding{Code: report.CodeSettingsInvalid, Message: ref.reason})
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
		return nil, &refusal{reason: reasonSyntax}
	}
	var extra yaml.Node
	switch err := dec.Decode(&extra); {
	case err == nil:
		return nil, &refusal{reason: reasonDocuments}
	case !errors.Is(err, io.EOF):
		return nil, &refusal{reason: reasonSyntax}
	}
	top := doc.Content[0]
	if top.Kind != yaml.MappingNode {
		return nil, &refusal{reason: reasonTop}
	}
	return value(top)
}

// value converts a node to its JSON value. Collections are never nil, so an
// empty one prints as [] or {}. JSON encoding sorts the mapping keys.
func value(n *yaml.Node) (any, *refusal) {
	if ref := marked(n); ref != nil {
		return nil, ref
	}
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
// A bare `!` sets no TaggedStyle: the tree does not show it, so it passes.
func marked(n *yaml.Node) *refusal {
	switch {
	case n.Anchor != "" || n.Kind == yaml.AliasNode:
		return &refusal{reason: reasonAnchor}
	case n.Style&yaml.TaggedStyle != 0:
		return &refusal{reason: reasonTag}
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
			return nil, &refusal{reason: reasonDuplicate}
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
	switch {
	case n.Tag == "!!merge":
		return &refusal{reason: reasonMerge}
	case n.Kind != yaml.ScalarNode || n.Tag != "!!str":
		return &refusal{reason: reasonKey}
	}
	return nil
}

func scalar(n *yaml.Node) (any, *refusal) {
	switch n.Tag {
	case "!!str", "!!timestamp":
		return n.Value, nil
	case "!!bool":
		if n.Value == "true" || n.Value == "false" {
			return n.Value == "true", nil
		}
		return nil, &refusal{reason: reasonSpelling}
	case "!!null":
		if n.Value == "" || n.Value == "null" {
			return nil, nil
		}
		return nil, &refusal{reason: reasonSpelling}
	case "!!int":
		if v, err := strconv.ParseInt(n.Value, 10, 64); err == nil && decimal.MatchString(n.Value) && -maxSafeInteger <= v && v <= maxSafeInteger {
			return v, nil
		}
		return nil, &refusal{reason: reasonNumber}
	case "!!merge":
		return nil, &refusal{reason: reasonMerge}
	default: // !!float, the only tag left for an untagged scalar
		return nil, &refusal{reason: reasonNumber}
	}
}
