// Package profile owns remote-gui's reusable, owner-bound browser profiles: a
// private store, a single-writer lock and recovery of Chromium's own locks.
package profile

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
	"syscall"
	"time"

	"github.com/michielvha/vh-adlc/plugins/remote-gui/internal/config"
	"github.com/michielvha/vh-adlc/plugins/remote-gui/internal/state"
)

// Meta is a profile's private metadata. The holder fields are set only while a
// session holds the profile lock.
type Meta struct {
	Name          string          `json:"name"`
	OwnerLogin    string          `json:"owner_login"`
	Transport     string          `json:"transport"`
	Created       time.Time       `json:"created"`
	LastUsed      time.Time       `json:"last_used"`
	ChromiumMajor int             `json:"chromium_major,omitempty"`
	HolderID      string          `json:"holder_id,omitempty"`
	HolderGuard   *state.Identity `json:"holder_guard,omitempty"`
}

// Entry is the secret-free view that profile list prints.
type Entry struct {
	Name       string    `json:"name"`
	OwnerLogin string    `json:"owner_login,omitempty"`
	Transport  string    `json:"transport,omitempty"`
	Created    time.Time `json:"created"`
	LastUsed   time.Time `json:"last_used"`
	InUse      bool      `json:"in_use"`
	Holder     string    `json:"holder_session,omitempty"`
}

// InUseError reports a profile held by another session. Holder is a session
// ID whose guard is alive, or "starting".
type InUseError struct{ Holder string }

func (e *InUseError) Error() string { return "profile-in-use; holder: " + e.Holder }

// BrowserRunningError reports a live Chromium that still uses the profile.
// PID and Host come from Chromium's SingletonLock and identify that browser
// only on this host and PID namespace.
type BrowserRunningError struct {
	Host string
	PID  int
}

func (e *BrowserRunningError) Error() string { return "profile-browser-still-running" }

// ErrMissing reports a profile that does not exist.
var ErrMissing = errors.New("profile-missing")

// afterOpen lets tests replace the lock file between open and flock.
var afterOpen = func() {}

// Held is a profile whose single-writer lock is held through File.
type Held struct {
	File       *os.File
	root, name string
}

// FromFile wraps a lock descriptor inherited from the process that took it.
func FromFile(f *os.File, root, name string) *Held { return &Held{File: f, root: root, name: name} }

func (h *Held) Dir() string      { return filepath.Join(h.root, h.name) }
func (h *Held) Chromium() string { return filepath.Join(h.Dir(), "chromium") }

// Release closes the lock descriptor. It is safe to call more than once.
func (h *Held) Release() {
	if h == nil || h.File == nil {
		return
	}
	_ = syscall.Flock(int(h.File.Fd()), syscall.LOCK_UN)
	_ = h.File.Close()
	h.File = nil
}

// Remove deletes the whole profile directory while the lock is held, then
// releases it. The directory itself was checked not to be a symlink.
func (h *Held) Remove() error {
	defer h.Release()
	if err := os.RemoveAll(h.Dir()); err != nil {
		return errors.New("profile-delete-incomplete")
	}
	return nil
}

func privateDir(path string, all bool, label string) error {
	var err error
	if all {
		err = os.MkdirAll(path, 0o700)
	} else if err = os.Mkdir(path, 0o700); os.IsExist(err) {
		err = nil
	}
	if err != nil {
		return fmt.Errorf("creating private profile %s: %w", label, err)
	}
	if err = state.Private(path, 0o700); err != nil {
		return fmt.Errorf("profile %s: %w", label, err)
	}
	return nil
}

// Acquire creates the profile if needed and takes its lock without waiting.
func Acquire(root, name string) (*Held, error) { return acquire(root, name, true) }

// AcquireExisting takes the lock of an existing profile and never creates one.
func AcquireExisting(root, name string) (*Held, error) { return acquire(root, name, false) }

func acquire(root, name string, create bool) (*Held, error) {
	if !config.ValidProfileName(name) {
		return nil, errors.New("invalid-profile-name")
	}
	dir := filepath.Join(root, name)
	if !create {
		if _, err := os.Lstat(dir); os.IsNotExist(err) {
			return nil, ErrMissing
		}
	}
	if err := privateDir(root, true, "store"); err != nil {
		return nil, err
	}
	lock := filepath.Join(dir, ".lock")
	for range 2 {
		if !create {
			if _, err := os.Lstat(dir); os.IsNotExist(err) {
				return nil, ErrMissing
			}
		}
		if err := privateDir(dir, false, "directory"); err != nil {
			return nil, err
		}
		f, err := os.OpenFile(lock, os.O_CREATE|os.O_RDWR|syscall.O_NOFOLLOW, 0o600)
		if err != nil {
			return nil, errors.New("profile lock unavailable")
		}
		if err = state.Private(lock, 0o600); err != nil {
			_ = f.Close()
			return nil, fmt.Errorf("profile lock: %w", err)
		}
		afterOpen()
		if err = syscall.Flock(int(f.Fd()), syscall.LOCK_EX|syscall.LOCK_NB); err != nil {
			_ = f.Close()
			if errors.Is(err, syscall.EWOULDBLOCK) {
				return nil, &InUseError{Holder: holder(root, name)}
			}
			return nil, errors.New("cannot lock profile")
		}
		var opened, current syscall.Stat_t
		if syscall.Fstat(int(f.Fd()), &opened) == nil && syscall.Lstat(lock, &current) == nil && opened.Dev == current.Dev && opened.Ino == current.Ino {
			held := &Held{File: f, root: root, name: name}
			if err = privateDir(held.Chromium(), false, "chromium directory"); err != nil {
				held.Release()
				return nil, err
			}
			return held, nil
		}
		// A concurrent delete replaced or removed the file this descriptor locked.
		_ = f.Close()
	}
	return nil, errors.New("profile-lock-replaced")
}

func holder(root, name string) string {
	m, err := ReadMeta(root, name)
	if err == nil && m.HolderID != "" && m.HolderGuard != nil && state.Alive(*m.HolderGuard) {
		return m.HolderID
	}
	return "starting"
}

func readMeta(dir, name string) (Meta, bool, error) {
	var m Meta
	path := filepath.Join(dir, "meta.json")
	f, err := os.OpenFile(path, os.O_RDONLY|syscall.O_NOFOLLOW, 0)
	if os.IsNotExist(err) {
		return m, false, nil
	}
	if err != nil {
		return m, false, errors.New("profile metadata unavailable")
	}
	defer func() { _ = f.Close() }()
	if err = state.Private(path, 0o600); err != nil {
		return m, false, fmt.Errorf("profile metadata: %w", err)
	}
	if err = json.NewDecoder(f).Decode(&m); err != nil || m.Name != name {
		return m, false, errors.New("invalid profile metadata")
	}
	return m, true, nil
}

// ReadMeta reads metadata without the lock, for list, holder reports and the
// supervisor's owner check. Writers replace the file atomically.
func ReadMeta(root, name string) (Meta, error) {
	if !config.ValidProfileName(name) {
		return Meta{}, errors.New("invalid-profile-name")
	}
	if err := state.Private(root, 0o700); err != nil {
		return Meta{}, fmt.Errorf("profile store: %w", err)
	}
	dir := filepath.Join(root, name)
	if err := state.Private(dir, 0o700); err != nil {
		return Meta{}, fmt.Errorf("profile directory: %w", err)
	}
	m, exists, err := readMeta(dir, name)
	if err == nil && !exists {
		err = ErrMissing
	}
	return m, err
}

// Meta reads the profile's metadata under the lock; exists is false for a new profile.
func (h *Held) Meta() (Meta, bool, error) { return readMeta(h.Dir(), h.name) }

// SaveMeta atomically replaces meta.json. Only the lock holder writes it.
func (h *Held) SaveMeta(m Meta) error {
	m.Name = h.name
	path := filepath.Join(h.Dir(), "meta.json")
	if _, err := os.Lstat(path); err == nil {
		if err = state.Private(path, 0o600); err != nil {
			return fmt.Errorf("profile metadata: %w", err)
		}
	}
	data, err := json.Marshal(m)
	if err != nil {
		return errors.New("cannot encode profile metadata")
	}
	return writePrivate(h.Dir(), ".meta-", path, data)
}

func writePrivate(dir, pattern, path string, data []byte) error {
	f, err := os.CreateTemp(dir, pattern)
	if err != nil {
		return errors.New("cannot stage private profile file")
	}
	defer func() { _ = os.Remove(f.Name()) }()
	if err = f.Chmod(0o600); err == nil {
		if _, err = f.Write(data); err == nil {
			err = f.Sync()
		}
	}
	if closeErr := f.Close(); err == nil {
		err = closeErr
	}
	if err != nil {
		return errors.New("cannot write private profile file")
	}
	if err = os.Rename(f.Name(), path); err != nil {
		return errors.New("cannot publish private profile file")
	}
	return nil
}

// List reports every profile without taking any lock, so it cannot make a
// start fail. A missing store lists nothing and is not created.
func List(root string) ([]Entry, error) {
	if _, err := os.Lstat(root); os.IsNotExist(err) {
		return []Entry{}, nil
	}
	if err := state.Private(root, 0o700); err != nil {
		return nil, fmt.Errorf("profile store: %w", err)
	}
	entries, err := os.ReadDir(root)
	if err != nil {
		return nil, errors.New("cannot list profiles")
	}
	out := []Entry{}
	for _, e := range entries {
		if !config.ValidProfileName(e.Name()) {
			continue
		}
		if !e.IsDir() || e.Type()&os.ModeSymlink != 0 {
			return nil, errors.New("unsafe profile entry")
		}
		m, err := ReadMeta(root, e.Name())
		if err != nil && !errors.Is(err, ErrMissing) {
			return nil, err
		}
		entry := Entry{Name: e.Name(), OwnerLogin: m.OwnerLogin, Transport: m.Transport, Created: m.Created, LastUsed: m.LastUsed}
		if m.HolderID != "" && m.HolderGuard != nil && state.Alive(*m.HolderGuard) {
			entry.InUse, entry.Holder = true, m.HolderID
		}
		out = append(out, entry)
	}
	return out, nil
}

// CheckSingleton decides from Chromium's singleton socket, not from how a
// browser spelled the profile path, whether a browser still uses chromium. A
// live socket refuses; a missing target or refused connection marks the three
// singleton files stale, and they are removed. It connects only to the socket
// path that SingletonSocket names.
func CheckSingleton(chromium string) error {
	lock := filepath.Join(chromium, "SingletonLock")
	if _, err := os.Lstat(lock); os.IsNotExist(err) {
		return nil
	} else if err != nil {
		return errors.New("profile-browser-lock-unreadable")
	}
	running := &BrowserRunningError{}
	if target, err := os.Readlink(lock); err == nil {
		if i := strings.LastIndexByte(target, '-'); i > 0 {
			running.Host = target[:i]
			running.PID, _ = strconv.Atoi(target[i+1:])
		}
	}
	socket, err := os.Readlink(filepath.Join(chromium, "SingletonSocket"))
	if err == nil {
		if !filepath.IsAbs(socket) {
			socket = filepath.Join(chromium, socket)
		}
		conn, dialErr := net.DialTimeout("unix", socket, time.Second)
		if dialErr == nil {
			_ = conn.Close()
			return running
		}
		if !errors.Is(dialErr, syscall.ECONNREFUSED) && !errors.Is(dialErr, syscall.ENOENT) && !errors.Is(dialErr, syscall.ENOTDIR) {
			return errors.New("profile-browser-lock-unverified")
		}
	} else if !os.IsNotExist(err) && !errors.Is(err, syscall.EINVAL) {
		return errors.New("profile-browser-lock-unreadable")
	}
	for _, name := range []string{"SingletonLock", "SingletonSocket", "SingletonCookie"} {
		if err = os.Remove(filepath.Join(chromium, name)); err != nil && !os.IsNotExist(err) {
			return errors.New("stale-browser-lock-removal-failed")
		}
	}
	return nil
}

func set(prefs map[string]any, value any, path ...string) {
	for _, key := range path[:len(path)-1] {
		next, ok := prefs[key].(map[string]any)
		if !ok {
			next = map[string]any{}
			prefs[key] = next
		}
		prefs = next
	}
	prefs[path[len(path)-1]] = value
}

// MergePreferences sets remote-gui's controlled keys and keeps every other
// preference Chromium saved. A first launch opens the New Tab page instead of
// the last session and marks the previous exit clean, so neither tabs nor
// session-only cookies return; a handoff restores the last session.
func MergePreferences(chromium, downloads string, first bool) error {
	dir := filepath.Join(chromium, "Default")
	if err := os.Mkdir(dir, 0o700); err != nil && !os.IsExist(err) {
		return errors.New("browser-preferences-unavailable")
	}
	if info, err := os.Lstat(dir); err != nil || !info.IsDir() || info.Mode()&os.ModeSymlink != 0 {
		return errors.New("browser-preferences-unavailable")
	}
	path := filepath.Join(dir, "Preferences")
	prefs := map[string]any{}
	data, err := os.ReadFile(path)
	if err == nil {
		if err = json.Unmarshal(data, &prefs); err != nil || prefs == nil {
			return errors.New("browser-preferences-unreadable")
		}
	} else if !os.IsNotExist(err) {
		return errors.New("browser-preferences-unavailable")
	}
	set(prefs, downloads, "download", "default_directory")
	set(prefs, false, "download", "prompt_for_download")
	set(prefs, false, "credentials_enable_service")
	set(prefs, false, "profile", "password_manager_enabled")
	if first {
		set(prefs, 5, "session", "restore_on_startup")
		set(prefs, "Normal", "profile", "exit_type")
	} else {
		set(prefs, 1, "session", "restore_on_startup")
	}
	if data, err = json.Marshal(prefs); err != nil {
		return errors.New("browser-preferences-unavailable")
	}
	return writePrivate(dir, ".preferences-", path, data)
}

var version = regexp.MustCompile(`\b(\d+)\.\d+\.\d+\.\d+\b`)

// InstalledMajor reads the browser's major version from --version.
func InstalledMajor(binary string) (int, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	out, err := exec.CommandContext(ctx, binary, "--version").Output()
	if err != nil {
		return 0, errors.New("chromium-version-unavailable")
	}
	match := version.FindSubmatch(out)
	if match == nil {
		return 0, errors.New("chromium-version-unavailable")
	}
	major, err := strconv.Atoi(string(match[1]))
	if err != nil || major <= 0 {
		return 0, errors.New("chromium-version-unavailable")
	}
	return major, nil
}

// CheckVersion refuses a profile last opened by a newer Chromium major
// version, so Chromium never downgrades its data.
func CheckVersion(m Meta, installed int) error {
	if m.ChromiumMajor > installed {
		return fmt.Errorf("profile-chromium-newer: the profile was last opened by Chromium %d and Chromium %d is installed; upgrade Chromium or delete the profile", m.ChromiumMajor, installed)
	}
	return nil
}
