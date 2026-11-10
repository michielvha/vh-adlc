package main

import (
	"fmt"
	"io"

	"github.com/michielvha/vh-adlc/plugins/paseo-hosts/internal/report"
)

const usage = `paseo-hosts onboards Linux servers as SSH-only Paseo daemons and links desktop apps to them.

Usage:
  paseo-hosts <command> [flags]
`

func run(args []string, _ io.Reader, stdout, stderr io.Writer, terminal bool) int {
	var jsonOut, plain bool
	var rest []string
	for _, a := range args {
		switch a {
		case "--json":
			jsonOut = true
		case "--plain":
			plain = true
		default:
			rest = append(rest, a)
		}
	}
	command := ""
	if len(rest) > 0 {
		command = rest[0]
	}
	rep := report.New(report.Options{Command: command, Stdout: stdout, Stderr: stderr, JSON: jsonOut, Plain: plain, Terminal: terminal})
	switch command {
	case "-h", "--help", "help":
		_, _ = fmt.Fprint(stdout, usage)
		return report.ExitOK
	default:
		_, _ = fmt.Fprint(stderr, usage)
		return rep.Finish(report.Errorf(report.ExitUsage, "unknown command %q", command), nil)
	}
}
