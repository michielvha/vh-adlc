package clean

import (
	"errors"
	"fmt"
	"io/fs"
	"os"
	"path/filepath"
	"strings"

	"github.com/michielvha/vh-adlc/internal/report"
)

const envCommand = "env"

// EnvOptions are the inputs of `vh-adlc env`.
type EnvOptions struct {
	Repo string
	Host HostPaths
	GOOS string
}

// EnvData is the report's data on success.
type EnvData struct {
	TempRoot string `json:"temp_root"`
	TMPDIR   string `json:"TMPDIR"`
	GOTMPDIR string `json:"GOTMPDIR"`
}

// Env creates the project's temp root and reports the variables that point a
// run at it. It reads the manifest from the working tree, because it deletes
// nothing, and creates nothing when it fails.
func Env(o EnvOptions) *report.Report {
	if o.GOOS != "linux" {
		return report.New(envCommand, report.Error, report.Finding{Code: report.CodeUnsupportedPlatform, Message: fmt.Sprintf("env supports Linux only, not %s", o.GOOS)})
	}
	root, err := prepareRoot(o)
	if err != nil {
		code, message := report.CodeError, err.Error()
		var c *CodedError
		if errors.As(err, &c) {
			code = c.Code
		}
		path := ""
		if code == report.CodeManifestMissing || code == report.CodeManifestInvalid || code == report.CodeTempRootUndeclared {
			path = ManifestPath
		}
		result := report.Fail
		if code == report.CodeError {
			result = report.Error
		}
		return report.New(envCommand, result, report.Finding{Code: code, Message: message, Path: path})
	}
	rep := report.New(envCommand, report.Answered)
	rep.Data = EnvData{TempRoot: root, TMPDIR: root, GOTMPDIR: root}
	return rep
}

func prepareRoot(o EnvOptions) (string, error) {
	b, err := os.ReadFile(filepath.Join(o.Repo, ManifestPath))
	switch {
	case errors.Is(err, fs.ErrNotExist):
		return "", coded(report.CodeManifestMissing, "the working tree has no %s", ManifestPath)
	case err != nil:
		return "", coded(report.CodeManifestInvalid, "reading %s: %v", ManifestPath, err)
	}
	m, err := ParseManifest(b)
	if err != nil {
		return "", coded(report.CodeManifestInvalid, "%v", err)
	}
	if m.TempRoot == nil {
		return "", coded(report.CodeTempRootUndeclared, "%s declares no temp_root", ManifestPath)
	}
	base, err := LoadTempBase(o.Host, o.Repo)
	if err != nil {
		return "", err
	}
	exists, err := CheckBase(base, o.Host.UID)
	if err != nil {
		return "", err
	}
	if !exists {
		if err := os.MkdirAll(base, 0o700); err != nil {
			return "", fmt.Errorf("creating the temp base: %w", err)
		}
		if _, err := CheckBase(base, o.Host.UID); err != nil {
			return "", err
		}
	}
	root := filepath.Join(base, m.Project)
	info, err := os.Lstat(root)
	switch {
	case errors.Is(err, fs.ErrNotExist):
		if err := os.Mkdir(root, 0o700); err != nil {
			return "", fmt.Errorf("creating the temp root: %w", err)
		}
	case err != nil:
		return "", coded(report.CodeTempBaseRefused, "temp root %s: %v", root, err)
	default:
		if info.Mode()&fs.ModeSymlink != 0 || !info.IsDir() || ownerOf(info) != o.Host.UID {
			return "", coded(report.CodeTempBaseRefused, "temp root %s is not a directory the user owns", root)
		}
	}
	if err := os.Chmod(root, 0o700); err != nil {
		return "", fmt.Errorf("setting the temp root's mode: %w", err)
	}
	return root, nil
}

// ShellLines prints the --sh form: one export line per variable, each value
// single-quoted for a POSIX shell.
func ShellLines(d EnvData) string {
	return "export TMPDIR=" + shellQuote(d.TMPDIR) + "\nexport GOTMPDIR=" + shellQuote(d.GOTMPDIR) + "\n"
}

func shellQuote(s string) string {
	return "'" + strings.ReplaceAll(s, "'", `'\''`) + "'"
}
