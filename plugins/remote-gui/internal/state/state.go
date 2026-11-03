// Package state owns private records and stable Linux process identities.
package state

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"runtime"
	"strconv"
	"strings"
	"syscall"
	"time"

	"github.com/michielvha/vh-adlc/plugins/remote-gui/internal/config"
)

type Identity struct {
	PID     int    `json:"pid"`
	Start   string `json:"start"`
	Boot    string `json:"boot"`
	Group   int    `json:"group"`
	Session int    `json:"session"`
}
type Process struct {
	Role     string   `json:"role"`
	Identity Identity `json:"identity"`
}
type Forward struct {
	ParentTCP bool            `json:"parent_tcp"`
	ParentWeb bool            `json:"parent_web"`
	Port      int             `json:"port"`
	Host      string          `json:"host"`
	Target    string          `json:"target"`
	TCP       json.RawMessage `json:"tcp"`
	Web       json.RawMessage `json:"web"`
}
type Record struct {
	Display        *Display      `json:"display,omitempty"`
	Owner          string        `json:"owner"`
	UpstreamSocket string        `json:"upstream_socket,omitempty"`
	Version        int           `json:"version"`
	ID             string        `json:"id"`
	Kind           string        `json:"kind"`
	State          string        `json:"state"`
	Config         config.Config `json:"config"`
	Created        time.Time     `json:"created"`
	Expires        time.Time     `json:"expires"`
	Guard          Identity      `json:"guard"`
	Supervisor     Identity      `json:"supervisor"`
	Owned          []Process     `json:"owned,omitempty"`
	Upstream       Identity      `json:"upstream"`
	Origin         string        `json:"origin,omitempty"`
	ProxyAddress   string        `json:"proxy_address,omitempty"`
	CDPAddress     string        `json:"cdp_address,omitempty"`
	Marker         string        `json:"marker,omitempty"`
	Forward        *Forward      `json:"forward,omitempty"`
	Diagnostic     string        `json:"diagnostic,omitempty"`
}

func private(path string, mode os.FileMode) error {
	fi, err := os.Lstat(path)
	if err != nil {
		return errors.New("private state path unavailable")
	}
	if mode == 0o600 && !fi.Mode().IsRegular() {
		return errors.New("state record is not a regular file")
	}
	if mode == 0o700 && !fi.IsDir() {
		return errors.New("state directory is not a directory")
	}
	stat, ok := fi.Sys().(*syscall.Stat_t)
	if fi.Mode()&os.ModeSymlink != 0 || fi.Mode().Perm() != mode || !ok || stat.Uid != uint32(os.Getuid()) {
		return errors.New("state path must be owned by this user with private permissions")
	}
	return nil
}

func EnsureRoot(root string) error {
	if !filepath.IsAbs(root) {
		return errors.New("private state root must be absolute")
	}
	if err := os.MkdirAll(root, 0o700); err != nil {
		return errors.New("cannot create private state root")
	}
	if err := private(root, 0o700); err != nil {
		return err
	}
	fi, err := os.Lstat(root)
	if err != nil || !fi.IsDir() {
		return errors.New("state root is not a directory")
	}
	return nil
}

func Lock(ctx context.Context, root string) (func(), error) {
	if err := EnsureRoot(root); err != nil {
		return nil, err
	}
	f, err := os.OpenFile(filepath.Join(root, ".lock"), os.O_CREATE|os.O_RDWR|syscall.O_NOFOLLOW, 0o600)
	if err != nil {
		return nil, errors.New("private lock unavailable")
	}
	if err = private(f.Name(), 0o600); err != nil {
		_ = f.Close()
		return nil, err
	}
	for {
		err = syscall.Flock(int(f.Fd()), syscall.LOCK_EX|syscall.LOCK_NB)
		if err == nil {
			return func() { _ = syscall.Flock(int(f.Fd()), syscall.LOCK_UN); _ = f.Close() }, nil
		}
		if err != syscall.EWOULDBLOCK && err != syscall.EAGAIN {
			_ = f.Close()
			return nil, errors.New("cannot lock private state")
		}
		select {
		case <-ctx.Done():
			_ = f.Close()
			return nil, ctx.Err()
		case <-time.After(10 * time.Millisecond):
		}
	}
}

func New(root string) (string, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	release, err := Lock(ctx, root)
	if err != nil {
		return "", err
	}
	defer release()
	for range 5 {
		var b [16]byte
		if _, err = rand.Read(b[:]); err != nil {
			return "", errors.New("session randomness unavailable")
		}
		id := hex.EncodeToString(b[:])
		if err = os.Mkdir(filepath.Join(root, id), 0o700); err == nil {
			return id, nil
		}
		if !os.IsExist(err) {
			return "", errors.New("cannot allocate private session")
		}
	}
	return "", errors.New("cannot allocate unique session")
}

func directory(root, id string) (string, error) {
	if !config.ValidID(id) {
		return "", errors.New("invalid session ID")
	}
	if err := private(root, 0o700); err != nil {
		return "", err
	}
	dir := filepath.Join(root, id)
	if err := private(dir, 0o700); err != nil {
		return "", err
	}
	return dir, nil
}

func Save(root string, r Record) error {
	r.Owner = "remote-gui/v1"
	r.Config.Home = root
	dir, err := directory(root, r.ID)
	if err != nil {
		return err
	}
	name := filepath.Join(dir, "state.json")
	if _, err = os.Lstat(name); err == nil {
		if err = private(name, 0o600); err != nil {
			return err
		}
	} else if !os.IsNotExist(err) {
		return errors.New("cannot inspect private state")
	}
	data, err := json.Marshal(r)
	if err != nil {
		return errors.New("cannot encode session state")
	}
	f, err := os.CreateTemp(dir, ".state-")
	if err != nil {
		return errors.New("cannot stage session state")
	}
	defer func() { _ = os.Remove(f.Name()) }()
	if err = f.Chmod(0o600); err != nil {
		_ = f.Close()
		return err
	}
	if _, err = f.Write(data); err != nil {
		_ = f.Close()
		return errors.New("cannot write session state")
	}
	if err = f.Sync(); err != nil {
		_ = f.Close()
		return err
	}
	if err = f.Close(); err != nil {
		return err
	}
	if err = os.Rename(f.Name(), name); err != nil {
		return errors.New("cannot publish session state")
	}
	return nil
}

func Load(root, id string) (Record, error) {
	var r Record
	dir, err := directory(root, id)
	if err != nil {
		return r, err
	}
	name := filepath.Join(dir, "state.json")
	if err = private(name, 0o600); err != nil {
		return r, err
	}
	f, err := os.OpenFile(name, os.O_RDONLY|syscall.O_NOFOLLOW, 0)
	if err != nil {
		return r, errors.New("cannot open session state")
	}
	defer func() { _ = f.Close() }()
	dec := json.NewDecoder(f)
	if err = dec.Decode(&r); err != nil || r.Version != 1 || r.ID != id || r.Owner != "remote-gui/v1" || r.Config.Home != root {
		return r, errors.New("invalid session state")
	}
	return r, nil
}

func Update(ctx context.Context, root, id string, fn func(*Record)) error {
	release, err := Lock(ctx, root)
	if err != nil {
		return err
	}
	defer release()
	r, err := Load(root, id)
	if err != nil {
		return err
	}
	fn(&r)
	return Save(root, r)
}

func IDs(root string) ([]string, error) {
	if _, err := os.Lstat(root); os.IsNotExist(err) {
		return nil, nil
	}
	if err := EnsureRoot(root); err != nil {
		return nil, err
	}
	entries, err := os.ReadDir(root)
	if err != nil {
		return nil, errors.New("cannot list session state")
	}
	var ids []string
	for _, e := range entries {
		if config.ValidID(e.Name()) {
			if !e.IsDir() || e.Type()&os.ModeSymlink != 0 {
				return nil, errors.New("unsafe session entry")
			}
			ids = append(ids, e.Name())
		}
	}
	return ids, nil
}

func Inspect(pid int) (Identity, error) {
	var id Identity
	if pid <= 0 {
		return id, errors.New("invalid process identity")
	}
	data, err := os.ReadFile("/proc/" + strconv.Itoa(pid) + "/stat")
	if err != nil {
		return id, errors.New("process unavailable")
	}
	end := strings.LastIndexByte(string(data), ')')
	if end < 0 {
		return id, errors.New("invalid process identity")
	}
	fields := strings.Fields(string(data)[end+1:])
	if len(fields) < 20 {
		return id, errors.New("invalid process identity")
	}
	boot, err := os.ReadFile("/proc/sys/kernel/random/boot_id")
	if err != nil {
		return id, errors.New("boot identity unavailable")
	}
	group, e1 := strconv.Atoi(fields[2])
	session, e2 := strconv.Atoi(fields[3])
	if e1 != nil || e2 != nil || fields[0] == "Z" {
		return id, errors.New("process unavailable")
	}
	fi, err := os.Stat("/proc/" + strconv.Itoa(pid))
	if err != nil {
		return id, errors.New("process unavailable")
	}
	stat, ok := fi.Sys().(*syscall.Stat_t)
	if !ok || stat.Uid != uint32(os.Getuid()) {
		return id, errors.New("process is not owned by this user")
	}
	return Identity{PID: pid, Start: fields[19], Boot: strings.TrimSpace(string(boot)), Group: group, Session: session}, nil
}

func Equal(a, b Identity) bool {
	return a.PID > 0 && a.PID == b.PID && a.Start == b.Start && a.Boot == b.Boot && a.Group == b.Group && a.Session == b.Session
}
func Alive(id Identity) bool { got, err := Inspect(id.PID); return err == nil && Equal(id, got) }

// Signal pins the Linux process before checking its birth identity. The syscall
// numbers are the Linux amd64 ABI from asm/unistd_64.h; other platforms fail closed.
func Signal(id Identity, sig os.Signal) error {
	if runtime.GOOS != "linux" || runtime.GOARCH != "amd64" {
		return errors.New("pidfd signalling requires Linux amd64")
	}
	signal, ok := sig.(syscall.Signal)
	if !ok || id.PID <= 0 {
		return errors.New("invalid owned-process signal")
	}
	fd, _, errno := syscall.Syscall(434, uintptr(id.PID), 0, 0)
	if errno != 0 {
		return errors.New("pidfd unavailable; process left untouched")
	}
	defer func() { _ = syscall.Close(int(fd)) }()
	got, err := Inspect(id.PID)
	if err != nil || !Equal(id, got) {
		return errors.New("process ownership changed")
	}
	_, _, errno = syscall.Syscall6(424, fd, uintptr(signal), 0, 0, 0, 0)
	if errno != 0 {
		return errors.New("owned process could not be signalled")
	}
	return nil
}
