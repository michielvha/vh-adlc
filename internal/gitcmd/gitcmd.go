// Package gitcmd runs git with a fixed output shape. Every call adds
// --no-pager and core.quotePath=false, and runs with LC_ALL=C and
// GIT_OPTIONAL_LOCKS=0, so reading a repository never rewrites its index.
package gitcmd

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"os"
	"os/exec"
	"regexp"
	"strconv"
	"strings"
)

// MinMajor and MinMinor are the oldest Git version the binary supports.
const (
	MinMajor = 2
	MinMinor = 35
)

// Git runs git in Dir. Env entries are added to the process environment and
// override it.
type Git struct {
	Dir string
	Env []string
}

// ExitError is a git command that ran and exited non-zero.
type ExitError struct {
	Args   []string
	Code   int
	Stderr string
}

func (e *ExitError) Error() string {
	return fmt.Sprintf("git %s: exit %d: %s", strings.Join(e.Args, " "), e.Code, strings.TrimSpace(e.Stderr))
}

// TooOldError reports a Git older than MinMajor.MinMinor.
type TooOldError struct{ Version string }

func (e *TooOldError) Error() string {
	return fmt.Sprintf("git %s is older than the required %d.%d", e.Version, MinMajor, MinMinor)
}

// Run runs git with args and returns its standard output.
func (g Git) Run(ctx context.Context, args ...string) ([]byte, error) {
	full := append([]string{"--no-pager", "-c", "core.quotePath=false"}, args...)
	cmd := exec.CommandContext(ctx, "git", full...)
	cmd.Dir = g.Dir
	cmd.Env = append(os.Environ(), "LC_ALL=C", "GIT_OPTIONAL_LOCKS=0")
	cmd.Env = append(cmd.Env, g.Env...)
	var stdout, stderr bytes.Buffer
	cmd.Stdout, cmd.Stderr = &stdout, &stderr
	if err := cmd.Run(); err != nil {
		var exit *exec.ExitError
		if errors.As(err, &exit) {
			return stdout.Bytes(), &ExitError{Args: args, Code: exit.ExitCode(), Stderr: stderr.String()}
		}
		return nil, fmt.Errorf("running git %s: %w", strings.Join(args, " "), err)
	}
	return stdout.Bytes(), nil
}

// Output runs git and returns its output with surrounding whitespace removed.
func (g Git) Output(ctx context.Context, args ...string) (string, error) {
	out, err := g.Run(ctx, args...)
	return strings.TrimSpace(string(out)), err
}

// ExitCode returns the exit code of a failed git command, or -1 when err is
// not an *ExitError.
func ExitCode(err error) int {
	var e *ExitError
	if errors.As(err, &e) {
		return e.Code
	}
	return -1
}

// SplitZ splits NUL-terminated output into its records.
func SplitZ(b []byte) []string {
	var out []string
	for rec := range bytes.SplitSeq(b, []byte{0}) {
		if len(rec) > 0 {
			out = append(out, string(rec))
		}
	}
	return out
}

var versionRe = regexp.MustCompile(`^git version (\d+)\.(\d+)`)

// CheckVersion fails with *TooOldError when git is older than the minimum.
func (g Git) CheckVersion(ctx context.Context) error {
	out, err := g.Output(ctx, "--version")
	if err != nil {
		return err
	}
	m := versionRe.FindStringSubmatch(out)
	if m == nil {
		return &TooOldError{Version: out}
	}
	major, _ := strconv.Atoi(m[1])
	minor, _ := strconv.Atoi(m[2])
	if major < MinMajor || (major == MinMajor && minor < MinMinor) {
		return &TooOldError{Version: strings.TrimPrefix(out, "git version ")}
	}
	return nil
}
