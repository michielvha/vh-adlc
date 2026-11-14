// Package remote runs embedded snippets on servers and clients over ssh.
// Scripts and their data travel on standard input, never as arguments.
package remote

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"slices"
	"strconv"
	"strings"
	"time"

	"github.com/michielvha/logger"
)

// Bootstrap is the fixed remote command for Windows clients. It holds no
// data and works whether the OpenSSH default shell is cmd.exe or PowerShell.
const Bootstrap = `powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -Command "iex ([Console]::In.ReadToEnd())"`

// ErrUnreachable marks an ssh connection failure (exit 255).
var ErrUnreachable = errors.New("unreachable over SSH")

// Margin is what a deadline adds to twice a snippet's own longest wait.
// Tests shorten it.
var Margin = 30 * time.Second

// Deadline is the deadline for a call whose snippet waits at most wait by
// its own timers.
func Deadline(wait time.Duration) time.Duration { return 2*wait + Margin }

type deadlineKey struct{}

// WithDeadline gives the calls made with ctx a deadline of d each.
func WithDeadline(ctx context.Context, d time.Duration) context.Context {
	return context.WithValue(ctx, deadlineKey{}, d)
}

var errDeadline = errors.New("deadline passed")

// Timeout is a call that passed its deadline; its ssh process was killed.
type Timeout struct {
	Alias string
	After time.Duration
}

func (t *Timeout) Error() string { return fmt.Sprintf("%s: timed out after %s", t.Alias, t.After) }

// Vars are the values a snippet receives in its preamble.
type Vars map[string]string

// Output is a snippet's standard output and its KEY=value lines.
type Output struct {
	Text   string
	Values map[string]string
}

var (
	valueRE = regexp.MustCompile(`^([A-Z][A-Z0-9_]*)=(.*)$`)
	nameRE  = regexp.MustCompile(`^[a-z][a-z0-9_]*$`)
)

func sortedKeys(v Vars) []string {
	keys := make([]string, 0, len(v))
	for k := range v {
		if !nameRE.MatchString(k) {
			panic("remote: invalid snippet variable name " + k)
		}
		keys = append(keys, k)
	}
	slices.Sort(keys)
	return keys
}

// Bash runs script with bash on alias. The script body is one compound
// command, so nothing it runs can read the rest of the script.
func Bash(ctx context.Context, alias, script string, vars Vars) (Output, error) {
	var b strings.Builder
	for _, k := range sortedKeys(vars) {
		fmt.Fprintf(&b, "%s='%s'\n", k, strings.ReplaceAll(vars[k], "'", `'\''`))
	}
	b.WriteString("{\n")
	b.WriteString(script)
	b.WriteString("\n} </dev/null\n")
	return run(ctx, alias, b.String(), "bash", "-s")
}

// PowerShell runs script with Windows PowerShell on alias through the
// fixed bootstrap.
func PowerShell(ctx context.Context, alias, script string, vars Vars) (Output, error) {
	var b strings.Builder
	b.WriteString("$ErrorActionPreference = 'Stop'\n$ProgressPreference = 'SilentlyContinue'\n")
	for _, k := range sortedKeys(vars) {
		fmt.Fprintf(&b, "$%s = '%s'\n", k, strings.ReplaceAll(vars[k], "'", "''"))
	}
	b.WriteString(script)
	b.WriteString("\n")
	return run(ctx, alias, b.String(), Bootstrap)
}

// Command runs a fixed command line on alias with no input.
func Command(ctx context.Context, alias string, command ...string) (Output, error) {
	return run(ctx, alias, "", command...)
}

func run(ctx context.Context, alias, stdin string, command ...string) (Output, error) {
	args := append([]string{"-o", "BatchMode=yes", "-o", "ConnectTimeout=15", alias}, command...)
	logger.Debug("ssh", "alias", alias, "command", strings.Join(command, " "))
	d, timed := ctx.Value(deadlineKey{}).(time.Duration)
	if timed {
		var cancel context.CancelFunc
		ctx, cancel = context.WithTimeoutCause(ctx, d, errDeadline)
		defer cancel()
	}
	cmd := exec.CommandContext(ctx, "ssh", args...)
	// A process ssh leaves behind can hold its output open after the kill.
	cmd.WaitDelay = 2 * time.Second
	cmd.Stdin = strings.NewReader(stdin)
	var stdout, stderr bytes.Buffer
	cmd.Stdout, cmd.Stderr = &stdout, &stderr
	err := cmd.Run()
	out := Output{Text: stdout.String(), Values: map[string]string{}}
	for _, line := range strings.Split(out.Text, "\n") {
		if m := valueRE.FindStringSubmatch(strings.TrimRight(line, "\r")); m != nil {
			out.Values[m[1]] = m[2]
		}
	}
	if err == nil {
		return out, nil
	}
	if timed && errors.Is(context.Cause(ctx), errDeadline) {
		return out, &Timeout{Alias: alias, After: d}
	}
	var ee *exec.ExitError
	if !errors.As(err, &ee) {
		return out, fmt.Errorf("run ssh %s: %w", alias, err)
	}
	if ee.ExitCode() == 255 {
		return out, fmt.Errorf("%s is %w: %s", alias, ErrUnreachable, lastLine(stderr.String()))
	}
	for _, line := range strings.Split(out.Text, "\n") {
		if msg, ok := strings.CutPrefix(strings.TrimRight(line, "\r"), "FAIL: "); ok {
			return out, &Failure{Alias: alias, Msg: msg}
		}
	}
	return out, &Failure{Alias: alias, Msg: fmt.Sprintf("exit %d: %s", ee.ExitCode(), lastLine(stderr.String()))}
}

// Failure is a snippet that ran and failed.
type Failure struct {
	Alias string
	Msg   string
}

func (f *Failure) Error() string { return f.Alias + ": " + f.Msg }

func lastLine(s string) string {
	lines := strings.Split(strings.TrimSpace(s), "\n")
	return strings.TrimSpace(lines[len(lines)-1])
}

// SSHConfig is what `ssh -G` resolves for an alias on the operator host.
type SSHConfig struct {
	Hostname     string
	Port         int
	User         string
	HostKeyAlias string
	KnownHosts   []string
}

// Resolve runs `ssh -G alias`.
func Resolve(ctx context.Context, alias string) (SSHConfig, error) {
	out, err := exec.CommandContext(ctx, "ssh", "-G", alias).Output()
	if err != nil {
		return SSHConfig{}, fmt.Errorf("ssh -G %s: %w", alias, err)
	}
	home, _ := os.UserHomeDir()
	c := SSHConfig{Port: 22}
	for _, line := range strings.Split(string(out), "\n") {
		k, v, _ := strings.Cut(strings.TrimSpace(line), " ")
		switch k {
		case "hostname":
			c.Hostname = v
		case "user":
			c.User = v
		case "port":
			c.Port, _ = strconv.Atoi(v)
		case "hostkeyalias":
			c.HostKeyAlias = v
		case "userknownhostsfile":
			for _, f := range strings.Fields(v) {
				if rest, ok := strings.CutPrefix(f, "~/"); ok {
					f = filepath.Join(home, rest)
				}
				c.KnownHosts = append(c.KnownHosts, f)
			}
		}
	}
	return c, nil
}
