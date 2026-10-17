// Command vh-adlc answers the mechanical questions of the vh-adlc development
// loop from a repository's files and Git history. This file only wires flags
// to the internal packages and prints their report.
package main

import (
	"context"
	"flag"
	"fmt"
	"io"
	"os"
	"os/signal"
	"regexp"
	"strings"

	"github.com/michielvha/vh-adlc/internal/knowledge"
	"github.com/michielvha/vh-adlc/internal/report"
)

// version is set at build time with -X main.version.
var version = "dev"

func main() {
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt)
	code := run(ctx, os.Args[1:], os.Stdout)
	stop()
	os.Exit(code)
}

// options are the flags every document command takes.
type options struct {
	repo       string
	pluginPin  string
	offline    bool
	docsSource string

	pages    stringList
	issue    string
	slug     string
	review   string
	returned string
}

type stringList []string

func (s *stringList) String() string { return strings.Join(*s, ",") }

func (s *stringList) Set(v string) error {
	*s = append(*s, v)
	return nil
}

func (o *options) knowledge() knowledge.Options {
	return knowledge.Options{Repo: o.repo, PluginPin: o.pluginPin, Offline: o.offline, DocsSource: o.docsSource, Pages: o.pages}
}

// command describes one subcommand: its name, the positional arguments it
// takes and the function that answers it.
type command struct {
	name        string
	positionals []string
	flags       func(fs *flag.FlagSet, o *options)
	run         func(ctx context.Context, o *options, args []string) *report.Report
}

var fullSHA = regexp.MustCompile(`^[0-9a-f]{40}$`)

func commands() []command {
	return []command{
		{name: "knowledge", flags: func(fs *flag.FlagSet, o *options) {
			fs.Var(&o.pages, "page", "a docs page the operation will read (repeatable)")
		}, run: func(ctx context.Context, o *options, _ []string) *report.Report {
			return knowledge.Command(ctx, o.knowledge())
		}},
		{name: "find", flags: func(fs *flag.FlagSet, o *options) {
			fs.StringVar(&o.issue, "issue", "", "issue number")
			fs.StringVar(&o.slug, "slug", "", "document slug")
		}},
		{name: "lint", positionals: []string{"doc"}},
		{name: "gate", positionals: []string{"target-status", "doc"}},
		{name: "fresh", positionals: []string{"doc"}},
		{name: "next", positionals: []string{"doc"}},
		{name: "review check", positionals: []string{"doc"}, flags: func(fs *flag.FlagSet, o *options) {
			fs.StringVar(&o.review, "review", "", "review ID, for example R-3")
			fs.StringVar(&o.returned, "returned", "", "file holding the records the reviewer returned")
		}},
	}
}

func run(ctx context.Context, args []string, stdout io.Writer) int {
	if len(args) == 1 && args[0] == "--version" {
		if _, err := fmt.Fprintf(stdout, "vh-adlc %s\n", version); err != nil {
			return report.Error.ExitCode()
		}
		return 0
	}
	rep := dispatch(ctx, args)
	if err := rep.Write(stdout); err != nil {
		fmt.Fprintf(os.Stderr, "vh-adlc: writing report: %v\n", err)
		return report.Error.ExitCode()
	}
	return rep.Result.ExitCode()
}

func usage(name, format string, a ...any) *report.Report {
	return report.New(name, report.Usage, report.Finding{Code: report.CodeUsage, Message: fmt.Sprintf(format, a...)})
}

func dispatch(ctx context.Context, args []string) *report.Report {
	if len(args) == 0 {
		return usage("", "a command is required: knowledge, find, lint, gate, fresh, next or review check")
	}
	name, rest := args[0], args[1:]
	if name == "review" {
		if len(rest) == 0 || rest[0] != "check" {
			return usage("review", "the only review subcommand is check")
		}
		name, rest = "review check", rest[1:]
	}
	for _, c := range commands() {
		if c.name != name {
			continue
		}
		o := &options{}
		fs := flag.NewFlagSet(c.name, flag.ContinueOnError)
		fs.SetOutput(io.Discard)
		fs.StringVar(&o.repo, "repo", ".", "repository directory")
		fs.StringVar(&o.pluginPin, "plugin-pin", "", "the plugin's vhco-pro/docs pin, a full SHA")
		fs.BoolVar(&o.offline, "offline", false, "read docs from the cache only")
		fs.StringVar(&o.docsSource, "docs-source", "", "read docs from a local repository (tests only)")
		if c.flags != nil {
			c.flags(fs, o)
		}
		positionals, err := parseInterleaved(fs, rest)
		if err != nil {
			return usage(c.name, "%v", err)
		}
		if len(positionals) != len(c.positionals) {
			return usage(c.name, "%s takes %d positional argument(s): %s", c.name, len(c.positionals), strings.Join(c.positionals, " "))
		}
		if !fullSHA.MatchString(o.pluginPin) {
			return usage(c.name, "--plugin-pin must be a full 40-character lowercase SHA")
		}
		if c.run == nil {
			return report.New(c.name, report.Error, report.Finding{Code: report.CodeError, Message: c.name + " is not implemented"})
		}
		return c.run(ctx, o, positionals)
	}
	return usage(name, "unknown command %q", name)
}

// parseInterleaved parses flags that may come before or after positional
// arguments. Each pass parses flags until the first non-flag argument, which
// becomes a positional; parsing then continues with what follows it.
func parseInterleaved(fs *flag.FlagSet, args []string) ([]string, error) {
	var positionals []string
	for {
		if err := fs.Parse(args); err != nil {
			return nil, err
		}
		args = fs.Args()
		if len(args) == 0 {
			return positionals, nil
		}
		if strings.HasPrefix(args[0], "-") {
			return nil, fmt.Errorf("positional argument %q may not begin with -", args[0])
		}
		positionals = append(positionals, args[0])
		args = args[1:]
	}
}
