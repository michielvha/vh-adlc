// Package settings is the strict reader behind `vh-adlc settings read`: it
// turns one YAML settings file into a value the TypeScript operations can use,
// or refuses the file.
package settings

import (
	"bytes"
	"fmt"
	"io"
	"strconv"

	"go.yaml.in/yaml/v3"

	"github.com/michielvha/vh-adlc/internal/report"
)

const commandName = "settings read"

// answer is the report's data on success.
type answer struct {
	Value any `json:"value"`
}

// Command reads one file's bytes from r and reports its value.
func Command(r io.Reader) *report.Report {
	input, err := io.ReadAll(r)
	if err != nil {
		return report.New(commandName, report.Error, report.Finding{Code: report.CodeError, Message: fmt.Sprintf("reading stdin: %v", err)})
	}
	var doc yaml.Node
	if err := yaml.NewDecoder(bytes.NewReader(input)).Decode(&doc); err != nil {
		return report.New(commandName, report.Error, report.Finding{Code: report.CodeError, Message: "reading settings"})
	}
	rep := report.New(commandName, report.Answered)
	rep.Data = answer{Value: value(doc.Content[0])}
	return rep
}

// value converts a node to its JSON value. Collections are never nil, so an
// empty one prints as [] or {}. JSON encoding sorts the mapping keys.
func value(n *yaml.Node) any {
	switch n.Kind {
	case yaml.MappingNode:
		out := make(map[string]any, len(n.Content)/2)
		for i := 0; i+1 < len(n.Content); i += 2 {
			out[n.Content[i].Value] = value(n.Content[i+1])
		}
		return out
	case yaml.SequenceNode:
		out := make([]any, 0, len(n.Content))
		for _, item := range n.Content {
			out = append(out, value(item))
		}
		return out
	default:
		return scalar(n)
	}
}

func scalar(n *yaml.Node) any {
	switch n.Tag {
	case "!!bool":
		return n.Value == "true"
	case "!!null":
		return nil
	case "!!int":
		v, err := strconv.ParseInt(n.Value, 10, 64)
		if err != nil {
			return nil
		}
		return v
	default:
		return n.Value
	}
}
