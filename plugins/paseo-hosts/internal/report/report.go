// Package report writes labelled human status lines to standard error and one
// JSON result object to standard output, following the terminal-output standard.
package report

import (
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"sync"
)

// Exit codes.
const (
	ExitOK          = 0
	ExitFailed      = 1
	ExitUsage       = 2
	ExitConfig      = 3
	ExitUnsupported = 4
)

var results = map[int]string{
	ExitOK:          "ok",
	ExitFailed:      "failed",
	ExitUsage:       "usage",
	ExitConfig:      "config",
	ExitUnsupported: "unsupported",
}

// Error carries the exit code a failure maps to.
type Error struct {
	Code int
	Msg  string
}

func (e *Error) Error() string { return e.Msg }

// Errorf returns an error that exits with code.
func Errorf(code int, format string, args ...any) *Error {
	return &Error{Code: code, Msg: fmt.Sprintf(format, args...)}
}

// Code returns the exit code for err: 0 for nil, the carried code for an
// *Error and 1 for any other error.
func Code(err error) int {
	if err == nil {
		return ExitOK
	}
	var e *Error
	if errors.As(err, &e) {
		return e.Code
	}
	return ExitFailed
}

// Options configures a Reporter.
type Options struct {
	Command  string
	Stdout   io.Writer
	Stderr   io.Writer
	JSON     bool
	Plain    bool
	Terminal bool // Stderr is a terminal.
	Getenv   func(string) string
}

// Reporter renders status and results.
type Reporter struct {
	o      Options
	colour bool
	mu     sync.Mutex
}

type kind struct {
	symbol, ascii, label, colour string
}

var (
	kindStep    = kind{"›", ">", "", "\x1b[36m"}
	kindPass    = kind{"✓", "OK", "Passed: ", "\x1b[32m"}
	kindFail    = kind{"✗", "FAIL", "Failed: ", "\x1b[31m"}
	kindPartial = kind{"✗", "FAIL", "Partial: ", "\x1b[31m"}
	kindSkip    = kind{"∅", "SKIP", "Skipped: ", "\x1b[33m"}
	kindEmpty   = kind{"∅", "NONE", "No results: ", "\x1b[33m"}
)

// New returns a Reporter. Colour is used only on a terminal, without --plain
// and when NO_COLOR is absent or empty.
func New(o Options) *Reporter {
	if o.Stdout == nil {
		o.Stdout = os.Stdout
	}
	if o.Stderr == nil {
		o.Stderr = os.Stderr
	}
	if o.Getenv == nil {
		o.Getenv = os.Getenv
	}
	return &Reporter{o: o, colour: o.Terminal && !o.Plain && o.Getenv("NO_COLOR") == ""}
}

func (r *Reporter) line(k kind, format string, args ...any) {
	symbol := k.symbol
	if r.o.Plain {
		symbol = k.ascii
	}
	if r.colour {
		symbol = k.colour + symbol + "\x1b[0m"
	}
	r.mu.Lock()
	defer r.mu.Unlock()
	_, _ = fmt.Fprintf(r.o.Stderr, "%s %s%s\n", symbol, k.label, fmt.Sprintf(format, args...))
}

// Step reports the current step.
func (r *Reporter) Step(format string, args ...any) { r.line(kindStep, format, args...) }

// Pass reports a completed check or step.
func (r *Reporter) Pass(format string, args ...any) { r.line(kindPass, format, args...) }

// Fail reports a failed check or step.
func (r *Reporter) Fail(format string, args ...any) { r.line(kindFail, format, args...) }

// Partial reports work that completed only in part.
func (r *Reporter) Partial(format string, args ...any) { r.line(kindPartial, format, args...) }

// Skip reports work that did not run, with the reason.
func (r *Reporter) Skip(format string, args ...any) { r.line(kindSkip, format, args...) }

// Empty reports an empty result.
func (r *Reporter) Empty(format string, args ...any) { r.line(kindEmpty, format, args...) }

// Data writes a human data line to standard output. JSON mode omits it,
// because the JSON object carries the same data.
func (r *Reporter) Data(format string, args ...any) {
	if r.o.JSON {
		return
	}
	r.mu.Lock()
	defer r.mu.Unlock()
	_, _ = fmt.Fprintf(r.o.Stdout, format+"\n", args...)
}

// JSON reports whether the JSON result was requested.
func (r *Reporter) JSON() bool { return r.o.JSON }

// Finish reports err, writes the JSON result when requested, and returns the
// exit code.
func (r *Reporter) Finish(err error, data any) int {
	code := Code(err)
	if err != nil {
		r.Fail("%s", err.Error())
		data = map[string]any{"error": err.Error()}
	}
	if !r.o.JSON {
		return code
	}
	if data == nil {
		data = map[string]any{}
	}
	result, ok := results[code]
	if !ok {
		result = "failed"
	}
	doc := struct {
		SchemaVersion int    `json:"schema_version"`
		Command       string `json:"command"`
		Result        string `json:"result"`
		Data          any    `json:"data"`
	}{1, r.o.Command, result, data}
	r.mu.Lock()
	defer r.mu.Unlock()
	enc := json.NewEncoder(r.o.Stdout)
	enc.SetEscapeHTML(false)
	if encErr := enc.Encode(doc); encErr != nil {
		_, _ = fmt.Fprintf(r.o.Stderr, "write JSON result: %v\n", encErr)
		return ExitFailed
	}
	return code
}
