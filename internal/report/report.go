// Package report owns the vh-adlc output contract: one JSON object per run,
// its result values, their exit codes and the finding codes.
package report

import (
	"bytes"
	"cmp"
	"encoding/json"
	"io"
	"slices"
)

// SchemaVersion is the version of the output object. It changes only with a
// major release.
const SchemaVersion = 1

// Result is the outcome of one command.
type Result string

// The results a command can report.
const (
	Answered    Result = "answered"
	Pass        Result = "pass"
	Fail        Result = "fail"
	Usage       Result = "usage"
	Malformed   Result = "malformed"
	LocalFormat Result = "local-format"
	Error       Result = "error"
	InvalidPin  Result = "invalid-pin"
	MissingPage Result = "missing-page"
	Unreachable Result = "unreachable"
)

// Results lists every result value, for the output schema.
var Results = []Result{Answered, Pass, Fail, Usage, Malformed, LocalFormat, Error, InvalidPin, MissingPage, Unreachable}

// ExitCode returns the process exit code for the result.
func (r Result) ExitCode() int {
	switch r {
	case Answered, Pass:
		return 0
	case Fail:
		return 1
	case Usage:
		return 2
	case Malformed, LocalFormat:
		return 3
	case InvalidPin, MissingPage, Unreachable:
		return 5
	default:
		return 4
	}
}

// Finding is one problem a command found. Path and Line are empty and zero
// when they do not apply.
type Finding struct {
	Code    string `json:"code"`
	Message string `json:"message"`
	Path    string `json:"path"`
	Line    int    `json:"line"`
}

// Knowledge is the resolved docs revision a command worked from.
type Knowledge struct {
	Revision    string   `json:"revision"`
	Source      string   `json:"source"`
	PinFiles    []string `json:"pin_files"`
	Override    bool     `json:"override"`
	RulesSchema int      `json:"rules_schema"`
	FeatureRoot string   `json:"feature_root"`
	LocalFormat bool     `json:"local_format"`
}

// Report is the one object a command prints.
type Report struct {
	SchemaVersion int        `json:"schema_version"`
	Command       string     `json:"command"`
	Result        Result     `json:"result"`
	Knowledge     *Knowledge `json:"knowledge"`
	Data          any        `json:"data"`
	Findings      []Finding  `json:"findings"`
}

// New returns a report for the command with the given result and findings.
func New(command string, result Result, findings ...Finding) *Report {
	return &Report{SchemaVersion: SchemaVersion, Command: command, Result: result, Findings: findings}
}

// Add appends findings to the report.
func (r *Report) Add(findings ...Finding) {
	r.Findings = append(r.Findings, findings...)
}

// Write prints the report as one JSON line. Findings are sorted by path, line
// and code so identical inputs give identical bytes.
func (r *Report) Write(w io.Writer) error {
	out := *r
	out.Findings = slices.Clone(r.Findings)
	if out.Findings == nil {
		out.Findings = []Finding{}
	}
	if out.Knowledge != nil && out.Knowledge.PinFiles == nil {
		k := *out.Knowledge
		k.PinFiles = []string{}
		out.Knowledge = &k
	}
	slices.SortStableFunc(out.Findings, func(a, b Finding) int {
		return cmp.Or(cmp.Compare(a.Path, b.Path), cmp.Compare(a.Line, b.Line), cmp.Compare(a.Code, b.Code), cmp.Compare(a.Message, b.Message))
	})
	var buf bytes.Buffer
	enc := json.NewEncoder(&buf)
	enc.SetEscapeHTML(false)
	if err := enc.Encode(out); err != nil {
		return err
	}
	_, err := w.Write(buf.Bytes())
	return err
}
