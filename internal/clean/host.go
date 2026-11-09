package clean

import (
	"errors"
	"fmt"
	"io/fs"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"syscall"

	"github.com/michielvha/vh-adlc/internal/report"
)

// CodedError carries the finding code a failure reports.
type CodedError struct {
	Code    string
	Message string
}

func (e *CodedError) Error() string { return e.Message }

func coded(code, format string, a ...any) *CodedError {
	return &CodedError{Code: code, Message: fmt.Sprintf(format, a...)}
}

// HostPaths are the host facts the temp base depends on. Tests point them at
// temporary directories.
type HostPaths struct {
	ConfigDir string // the user config directory, os.UserConfigDir
	Home      string
	Tmp       string // /tmp
	UID       int
}

type rawHost struct {
	TempBase *string `yaml:"temp_base"`
}

// DefaultTempBase is the base used when host.yaml sets none.
func DefaultTempBase(p HostPaths) string {
	return filepath.Join(p.Tmp, "vh-adlc-"+itoa(p.UID))
}

func itoa(n int) string { return strconv.Itoa(n) }

// LoadTempBase reads `<config dir>/vh-adlc/host.yaml` and returns the temp base
// for the repository at repo. Any problem with the file or the value it sets
// is host-settings-invalid.
func LoadTempBase(p HostPaths, repo string) (string, error) {
	if p.ConfigDir == "" {
		return DefaultTempBase(p), nil // no config directory, so no host.yaml
	}
	file := filepath.Join(p.ConfigDir, "vh-adlc", "host.yaml")
	b, err := os.ReadFile(file)
	switch {
	case errors.Is(err, fs.ErrNotExist):
		return DefaultTempBase(p), nil
	case err != nil:
		return "", coded(report.CodeHostSettingsInvalid, "reading host.yaml in the user config directory: %v", err)
	}
	var raw rawHost
	if err := decodeStrict(b, &raw); err != nil {
		return "", coded(report.CodeHostSettingsInvalid, "host.yaml: %v", err)
	}
	if raw.TempBase == nil {
		return DefaultTempBase(p), nil
	}
	base := *raw.TempBase
	if err := validTempBase(base, p.Home, repo); err != nil {
		return "", coded(report.CodeHostSettingsInvalid, "host.yaml: temp_base %s", err)
	}
	return filepath.Clean(base), nil
}

// validTempBase says why a temp_base is not usable: relative, the home
// directory itself, inside a Git work tree, or the repository's directory or
// one of its parents.
func validTempBase(base, home, repo string) error {
	if !filepath.IsAbs(base) {
		return errors.New("is not absolute")
	}
	base = filepath.Clean(base)
	if home != "" && base == filepath.Clean(home) {
		return errors.New("is the home directory")
	}
	if repo != "" {
		abs, err := filepath.Abs(repo)
		if err != nil {
			return fmt.Errorf("cannot be checked against the repository: %w", err)
		}
		if within(abs, base) {
			return errors.New("is the repository or one of its parents")
		}
	}
	for dir := base; ; dir = filepath.Dir(dir) {
		if workTreeRoot(dir) {
			return fmt.Errorf("is inside the Git work tree at %s", dir)
		}
		if dir == filepath.Dir(dir) {
			return nil
		}
	}
}

// within reports whether path is dir or below it.
func within(path, dir string) bool {
	rel, err := filepath.Rel(dir, path)
	return err == nil && rel != ".." && !strings.HasPrefix(rel, "../")
}

// workTreeRoot reports a directory holding a .git file, as a linked worktree
// has, or a .git directory with a HEAD file. An empty .git directory does not
// make a work tree.
func workTreeRoot(dir string) bool {
	info, err := os.Lstat(filepath.Join(dir, ".git"))
	if err != nil {
		return false
	}
	if info.Mode().IsRegular() {
		return true
	}
	if !info.IsDir() {
		return false
	}
	head, err := os.Lstat(filepath.Join(dir, ".git", "HEAD"))
	return err == nil && head.Mode().IsRegular()
}

// CheckBase reports whether the base exists, and refuses one that is a
// symlink, not a directory, owned by another user, or writable by group or
// others.
func CheckBase(base string, uid int) (bool, error) {
	info, err := os.Lstat(base)
	switch {
	case errors.Is(err, fs.ErrNotExist):
		return false, nil
	case err != nil:
		return false, coded(report.CodeTempBaseRefused, "temp base %s: %v", base, err)
	}
	if err := ownedDir(info, uid); err != nil {
		return true, coded(report.CodeTempBaseRefused, "temp base %s %v", base, err)
	}
	return true, nil
}

// ownedDir refuses anything but a real directory the user owns that no one
// else can write.
func ownedDir(info fs.FileInfo, uid int) error {
	switch {
	case info.Mode()&fs.ModeSymlink != 0:
		return errors.New("is a symlink")
	case !info.IsDir():
		return errors.New("is not a directory")
	case ownerOf(info) != uid:
		return errors.New("is owned by another user")
	case info.Mode().Perm()&0o022 != 0:
		return errors.New("is writable by group or others")
	}
	return nil
}

// ownerOf returns a file's owner uid, or -1 when the platform does not say.
func ownerOf(info fs.FileInfo) int {
	if st, ok := info.Sys().(*syscall.Stat_t); ok {
		return int(st.Uid)
	}
	return -1
}
