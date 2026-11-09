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
	"runtime"
	"strings"
	"time"

	"github.com/michielvha/vh-adlc/internal/clean"
	"github.com/michielvha/vh-adlc/internal/doc"
	"github.com/michielvha/vh-adlc/internal/fresh"
	"github.com/michielvha/vh-adlc/internal/gate"
	"github.com/michielvha/vh-adlc/internal/knowledge"
	"github.com/michielvha/vh-adlc/internal/next"
	"github.com/michielvha/vh-adlc/internal/report"
	"github.com/michielvha/vh-adlc/internal/review"
	"github.com/michielvha/vh-adlc/internal/settings"
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
	stdin    bool

	sh        bool
	dryRun    bool
	olderThan string
	compose   bool
	kind      bool
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
// takes and the function that answers it. A command that reads no conventions
// sets noPin, and any --plugin-pin it is given goes unchecked.
type command struct {
	name        string
	positionals []string
	noPin       bool
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
		}, run: func(ctx context.Context, o *options, _ []string) *report.Report {
			return doc.FindCommand(ctx, o.knowledge(), o.issue, o.slug)
		}},
		{name: "lint", positionals: []string{"doc"}, run: func(ctx context.Context, o *options, args []string) *report.Report {
			return doc.LintCommand(ctx, o.knowledge(), args[0])
		}},
		{name: "gate", positionals: []string{"target-status", "doc"}, run: func(ctx context.Context, o *options, args []string) *report.Report {
			return gate.Command(ctx, o.knowledge(), args[0], args[1])
		}},
		{name: "fresh", positionals: []string{"doc"}, run: func(ctx context.Context, o *options, args []string) *report.Report {
			return fresh.Command(ctx, o.knowledge(), args[0])
		}},
		{name: "next", positionals: []string{"doc"}, run: func(ctx context.Context, o *options, args []string) *report.Report {
			return next.Command(ctx, o.knowledge(), args[0])
		}},
		{name: "review check", positionals: []string{"doc"}, flags: func(fs *flag.FlagSet, o *options) {
			fs.StringVar(&o.review, "review", "", "review ID, for example R-3")
			fs.StringVar(&o.returned, "returned", "", "file holding the records the reviewer returned")
		}, run: func(ctx context.Context, o *options, args []string) *report.Report {
			return review.Command(ctx, o.knowledge(), args[0], o.review, o.returned)
		}},
		{name: "settings read", noPin: true, flags: func(fs *flag.FlagSet, o *options) {
			fs.BoolVar(&o.stdin, "stdin", false, "read the settings file's bytes from stdin")
		}, run: func(_ context.Context, o *options, _ []string) *report.Report {
			if !o.stdin {
				return usage("settings read", "settings read needs --stdin")
			}
			return settings.Command(os.Stdin)
		}},
		{name: "env", noPin: true, flags: func(fs *flag.FlagSet, o *options) {
			fs.BoolVar(&o.sh, "sh", false, "print shell-quoted export lines instead of the report")
		}, run: func(_ context.Context, o *options, _ []string) *report.Report {
			host := clean.RealOptions().Host
			return clean.Env(clean.EnvOptions{Repo: o.repo, Host: host, GOOS: runtime.GOOS})
		}},
		{name: "clean", noPin: true, flags: func(fs *flag.FlagSet, o *options) {
			fs.BoolVar(&o.dryRun, "dry-run", false, "plan and report, removing nothing")
			fs.StringVar(&o.olderThan, "older-than", "", "a minimum age that can only raise the rules' ages, such as 48h")
			fs.BoolVar(&o.compose, "compose", false, "also stop and remove abandoned Compose projects")
			fs.BoolVar(&o.kind, "kind", false, "also delete kind clusters whose marks have all ended")
		}, run: func(ctx context.Context, o *options, _ []string) *report.Report {
			var older time.Duration
			if o.olderThan != "" {
				d, err := time.ParseDuration(o.olderThan)
				if err != nil || d < 0 {
					return usage("clean", "--older-than must be a duration such as 48h")
				}
				older = d
			}
			co := clean.RealOptions()
			co.Repo, co.DryRun, co.OlderThan, co.Compose, co.Kind, co.GOOS = o.repo, o.dryRun, older, o.compose, o.kind, runtime.GOOS
			return clean.Clean(ctx, co)
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
	rep, o := dispatch(ctx, args)
	if o != nil && o.sh && rep.Command == "env" {
		return writeShell(rep, stdout)
	}
	if err := rep.Write(stdout); err != nil {
		fmt.Fprintf(os.Stderr, "vh-adlc: writing report: %v\n", err)
		return report.Error.ExitCode()
	}
	return rep.Result.ExitCode()
}

// writeShell prints env's export lines on success. On failure it prints
// nothing to stdout, so an eval of the output changes nothing, and writes the
// report to stderr.
func writeShell(rep *report.Report, stdout io.Writer) int {
	data, ok := rep.Data.(clean.EnvData)
	if rep.Result != report.Answered || !ok {
		if err := rep.Write(os.Stderr); err != nil {
			fmt.Fprintf(os.Stderr, "vh-adlc: writing report: %v\n", err)
		}
		return rep.Result.ExitCode()
	}
	if _, err := io.WriteString(stdout, clean.ShellLines(data)); err != nil {
		return report.Error.ExitCode()
	}
	return 0
}

func usage(name, format string, a ...any) *report.Report {
	return report.New(name, report.Usage, report.Finding{Code: report.CodeUsage, Message: fmt.Sprintf(format, a...)})
}

func dispatch(ctx context.Context, args []string) (*report.Report, *options) {
	if len(args) == 0 {
		return usage("", "a command is required: knowledge, find, lint, gate, fresh, next, review check, settings read, env or clean"), nil
	}
	name, rest := args[0], args[1:]
	if name == "review" {
		if len(rest) == 0 || rest[0] != "check" {
			return usage("review", "the only review subcommand is check"), nil
		}
		name, rest = "review check", rest[1:]
	}
	if name == "settings" {
		if len(rest) == 0 || rest[0] != "read" {
			return usage("settings", "the only settings subcommand is read"), nil
		}
		name, rest = "settings read", rest[1:]
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
			return usage(c.name, "%v", err), nil
		}
		if len(positionals) != len(c.positionals) {
			return usage(c.name, "%s takes %d positional argument(s): %s", c.name, len(c.positionals), strings.Join(c.positionals, " ")), nil
		}
		if !c.noPin && !fullSHA.MatchString(o.pluginPin) {
			return usage(c.name, "--plugin-pin must be a full 40-character lowercase SHA"), nil
		}
		return c.run(ctx, o, positionals), o
	}
	return usage(name, "unknown command %q", name), nil
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
