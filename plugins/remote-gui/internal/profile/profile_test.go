package profile

import (
	"encoding/json"
	"errors"
	"net"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"syscall"
	"testing"
	"time"

	"github.com/michielvha/vh-adlc/plugins/remote-gui/internal/state"
)

func store(t *testing.T) string {
	t.Helper()
	return filepath.Join(t.TempDir(), "profiles")
}

func mode(t *testing.T, path string) os.FileMode {
	t.Helper()
	info, err := os.Lstat(path)
	if err != nil {
		t.Fatal(err)
	}
	return info.Mode()
}

func TestStorePathsArePrivate(t *testing.T) {
	root := store(t)
	held, err := Acquire(root, "work")
	if err != nil {
		t.Fatal(err)
	}
	defer held.Release()
	if err = held.SaveMeta(Meta{Name: "work", Transport: "loopback", Created: time.Now().UTC(), LastUsed: time.Now().UTC()}); err != nil {
		t.Fatal(err)
	}
	dir := filepath.Join(root, "work")
	for path, want := range map[string]os.FileMode{
		root:                            os.ModeDir | 0o700,
		dir:                             os.ModeDir | 0o700,
		filepath.Join(dir, "chromium"):  os.ModeDir | 0o700,
		filepath.Join(dir, ".lock"):     0o600,
		filepath.Join(dir, "meta.json"): 0o600,
	} {
		if got := mode(t, path); got != want {
			t.Fatalf("%s mode %v, want %v", path, got, want)
		}
	}
	if held.Chromium() != filepath.Join(dir, "chromium") {
		t.Fatal("unexpected Chromium directory")
	}
}

func TestStoreRefusesSymlinksAndWideModes(t *testing.T) {
	for _, target := range []string{"root", "profile", "meta.json", ".lock", "chromium"} {
		t.Run(target, func(t *testing.T) {
			root := store(t)
			held, err := Acquire(root, "work")
			if err != nil {
				t.Fatal(err)
			}
			if err = held.SaveMeta(Meta{Name: "work", Transport: "loopback"}); err != nil {
				t.Fatal(err)
			}
			held.Release()
			path := map[string]string{"root": root, "profile": filepath.Join(root, "work")}[target]
			if path == "" {
				path = filepath.Join(root, "work", target)
			}
			moved := path + ".real"
			if err = os.Rename(path, moved); err != nil {
				t.Fatal(err)
			}
			if err = os.Symlink(moved, path); err != nil {
				t.Fatal(err)
			}
			held, err = Acquire(root, "work")
			if err == nil {
				_, _, err = held.Meta()
				held.Release()
			}
			if err == nil {
				t.Fatalf("followed a symlinked %s", target)
			}
			if target == "meta.json" {
				if _, err = ReadMeta(root, "work"); err == nil {
					t.Fatal("unlocked read followed a symlinked meta.json")
				}
			}
		})
	}
	root := store(t)
	held, err := Acquire(root, "work")
	if err != nil {
		t.Fatal(err)
	}
	held.Release()
	if err = os.Chmod(filepath.Join(root, "work"), 0o755); err != nil {
		t.Fatal(err)
	}
	if held, err = Acquire(root, "work"); err == nil {
		held.Release()
		t.Fatal("accepted a group-readable profile directory")
	}
}

func TestMetaFields(t *testing.T) {
	root := store(t)
	held, err := Acquire(root, "work")
	if err != nil {
		t.Fatal(err)
	}
	defer held.Release()
	if _, exists, err := held.Meta(); err != nil || exists {
		t.Fatalf("new profile reported metadata: %v %v", exists, err)
	}
	created := time.Date(2026, 11, 10, 9, 0, 0, 0, time.UTC)
	guard := state.Identity{PID: 42, Start: "1", Boot: "b", Group: 42, Session: 42}
	want := Meta{Name: "work", OwnerLogin: "owner@example.test", Transport: "tailscale", Created: created, LastUsed: created.Add(time.Hour), ChromiumMajor: 151, HolderID: strings.Repeat("a", 32), HolderGuard: &guard}
	if err = held.SaveMeta(want); err != nil {
		t.Fatal(err)
	}
	data, err := os.ReadFile(filepath.Join(root, "work", "meta.json"))
	if err != nil {
		t.Fatal(err)
	}
	var fields map[string]any
	if err = json.Unmarshal(data, &fields); err != nil {
		t.Fatal(err)
	}
	for _, key := range []string{"name", "owner_login", "transport", "created", "last_used", "chromium_major", "holder_id", "holder_guard"} {
		if _, ok := fields[key]; !ok {
			t.Fatalf("meta.json lacks %s: %s", key, data)
		}
	}
	got, exists, err := held.Meta()
	if err != nil || !exists || got.OwnerLogin != want.OwnerLogin || got.HolderGuard == nil || *got.HolderGuard != guard || !got.LastUsed.Equal(want.LastUsed) {
		t.Fatalf("metadata round trip: %+v %v", got, err)
	}
	unlocked, err := ReadMeta(root, "work")
	if err != nil || unlocked.HolderID != want.HolderID {
		t.Fatalf("unlocked read: %+v %v", unlocked, err)
	}
}

func deadIdentity(t *testing.T) state.Identity {
	t.Helper()
	cmd := exec.Command("sleep", "30")
	if err := cmd.Start(); err != nil {
		t.Fatal(err)
	}
	identity, err := state.Inspect(cmd.Process.Pid)
	if err != nil {
		t.Fatal(err)
	}
	_ = cmd.Process.Kill()
	_ = cmd.Wait()
	return identity
}

func TestLockIsExclusiveAndReportsOnlyALiveHolder(t *testing.T) {
	root := store(t)
	held, err := Acquire(root, "work")
	if err != nil {
		t.Fatal(err)
	}
	defer held.Release()
	expectHolder := func(want string) {
		t.Helper()
		_, err := Acquire(root, "work")
		var inUse *InUseError
		if !errors.As(err, &inUse) || !strings.Contains(err.Error(), "profile-in-use") || inUse.Holder != want || !strings.Contains(err.Error(), "holder: "+want) {
			t.Fatalf("expected profile-in-use with holder %q: %v", want, err)
		}
	}
	expectHolder("starting")
	id := strings.Repeat("b", 32)
	if err = held.SaveMeta(Meta{Name: "work", Transport: "loopback", HolderID: id}); err != nil {
		t.Fatal(err)
	}
	expectHolder("starting")
	dead := deadIdentity(t)
	if err = held.SaveMeta(Meta{Name: "work", Transport: "loopback", HolderID: id, HolderGuard: &dead}); err != nil {
		t.Fatal(err)
	}
	expectHolder("starting")
	self, err := state.Inspect(os.Getpid())
	if err != nil {
		t.Fatal(err)
	}
	if err = held.SaveMeta(Meta{Name: "work", Transport: "loopback", HolderID: id, HolderGuard: &self}); err != nil {
		t.Fatal(err)
	}
	expectHolder(id)
	held.Release()
	again, err := Acquire(root, "work")
	if err != nil {
		t.Fatalf("released lock still held: %v", err)
	}
	again.Release()
}

func TestLockRechecksReplacedFile(t *testing.T) {
	root := store(t)
	held, err := Acquire(root, "work")
	if err != nil {
		t.Fatal(err)
	}
	held.Release()
	lock := filepath.Join(root, "work", ".lock")
	replaced := 0
	afterOpen = func() {
		if replaced > 0 {
			return
		}
		replaced++
		if err := os.Remove(lock); err != nil {
			t.Error(err)
		}
		if err := os.WriteFile(lock, nil, 0o600); err != nil {
			t.Error(err)
		}
	}
	defer func() { afterOpen = func() {} }()
	held, err = Acquire(root, "work")
	if err != nil {
		t.Fatal(err)
	}
	defer held.Release()
	var opened, current syscall.Stat_t
	if err = syscall.Fstat(int(held.File.Fd()), &opened); err != nil {
		t.Fatal(err)
	}
	if err = syscall.Lstat(lock, &current); err != nil {
		t.Fatal(err)
	}
	if replaced != 1 || opened.Ino != current.Ino || opened.Dev != current.Dev {
		t.Fatal("lock was not retried on the file at the profile path")
	}
}

func singletons(t *testing.T, host, socketTarget string) string {
	t.Helper()
	chromium := filepath.Join(t.TempDir(), "chromium")
	if err := os.Mkdir(chromium, 0o700); err != nil {
		t.Fatal(err)
	}
	for name, target := range map[string]string{"SingletonLock": host + "-4242", "SingletonCookie": "1234567890", "SingletonSocket": socketTarget} {
		if err := os.Symlink(target, filepath.Join(chromium, name)); err != nil {
			t.Fatal(err)
		}
	}
	return chromium
}

func present(chromium string) int {
	count := 0
	for _, name := range []string{"SingletonLock", "SingletonCookie", "SingletonSocket"} {
		if _, err := os.Lstat(filepath.Join(chromium, name)); err == nil {
			count++
		}
	}
	return count
}

func TestSingletonCheckRecoversStaleLocks(t *testing.T) {
	host, err := os.Hostname()
	if err != nil {
		t.Fatal(err)
	}
	socketDir, err := os.MkdirTemp("/tmp", "rg-singleton-")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = os.RemoveAll(socketDir) })
	refused := filepath.Join(socketDir, "refused")
	listener, err := net.Listen("unix", refused)
	if err != nil {
		t.Fatal(err)
	}
	listener.(*net.UnixListener).SetUnlinkOnClose(false)
	_ = listener.Close()
	for name, chromium := range map[string]string{
		"missing socket target": singletons(t, host, filepath.Join(socketDir, "absent")),
		"refusing socket":       singletons(t, host, refused),
		"other hostname":        singletons(t, "other-host.example", filepath.Join(socketDir, "absent")),
	} {
		if err = CheckSingleton(chromium); err != nil {
			t.Fatalf("%s: %v", name, err)
		}
		if present(chromium) != 0 {
			t.Fatalf("%s: stale singleton files remain", name)
		}
	}
	if err = CheckSingleton(filepath.Join(t.TempDir())); err != nil {
		t.Fatal("profile without singleton files refused")
	}
}

func TestSingletonCheckRefusesALiveBrowser(t *testing.T) {
	socketDir, err := os.MkdirTemp("/tmp", "rg-singleton-")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = os.RemoveAll(socketDir) })
	live := filepath.Join(socketDir, "live")
	listener, err := net.Listen("unix", live)
	if err != nil {
		t.Fatal(err)
	}
	defer func() { _ = listener.Close() }()
	go func() {
		for {
			conn, err := listener.Accept()
			if err != nil {
				return
			}
			_ = conn.Close()
		}
	}()
	chromium := singletons(t, "some-host", live)
	err = CheckSingleton(chromium)
	var running *BrowserRunningError
	if !errors.As(err, &running) || !strings.Contains(err.Error(), "profile-browser-still-running") || running.PID != 4242 {
		t.Fatalf("live browser not refused: %v", err)
	}
	if present(chromium) != 3 {
		t.Fatal("singleton files of a live browser were removed")
	}
}

func readPreferences(t *testing.T, chromium string) map[string]any {
	t.Helper()
	data, err := os.ReadFile(filepath.Join(chromium, "Default", "Preferences"))
	if err != nil {
		t.Fatal(err)
	}
	var prefs map[string]any
	if err = json.Unmarshal(data, &prefs); err != nil {
		t.Fatal(err)
	}
	return prefs
}

func lookup(prefs map[string]any, path ...string) any {
	var value any = prefs
	for _, key := range path {
		object, ok := value.(map[string]any)
		if !ok {
			return nil
		}
		value = object[key]
	}
	return value
}

func TestPreferencesMerge(t *testing.T) {
	chromium := filepath.Join(t.TempDir(), "chromium")
	if err := os.MkdirAll(filepath.Join(chromium, "Default"), 0o700); err != nil {
		t.Fatal(err)
	}
	saved := `{"custom":{"keep":true},"profile":{"exit_type":"Crashed","name":"Owner"},"session":{"restore_on_startup":1},"download":{"default_directory":"/old/downloads"}}`
	if err := os.WriteFile(filepath.Join(chromium, "Default", "Preferences"), []byte(saved), 0o600); err != nil {
		t.Fatal(err)
	}
	downloads := filepath.Join(t.TempDir(), "downloads")
	if err := MergePreferences(chromium, downloads, true); err != nil {
		t.Fatal(err)
	}
	prefs := readPreferences(t, chromium)
	for path, want := range map[string]any{
		"custom.keep":                      true,
		"profile.name":                     "Owner",
		"profile.exit_type":                "Normal",
		"profile.password_manager_enabled": false,
		"credentials_enable_service":       false,
		"download.default_directory":       downloads,
		"download.prompt_for_download":     false,
		"session.restore_on_startup":       float64(5),
	} {
		if got := lookup(prefs, strings.Split(path, ".")...); got != want {
			t.Fatalf("first launch %s = %v, want %v", path, got, want)
		}
	}
	if mode(t, filepath.Join(chromium, "Default", "Preferences")) != 0o600 {
		t.Fatal("merged preferences are not private")
	}
	prefs["profile"].(map[string]any)["exit_type"] = "SessionEnded"
	data, _ := json.Marshal(prefs)
	if err := os.WriteFile(filepath.Join(chromium, "Default", "Preferences"), data, 0o600); err != nil {
		t.Fatal(err)
	}
	if err := MergePreferences(chromium, downloads, false); err != nil {
		t.Fatal(err)
	}
	prefs = readPreferences(t, chromium)
	if lookup(prefs, "session", "restore_on_startup") != float64(1) || lookup(prefs, "profile", "exit_type") != "SessionEnded" || lookup(prefs, "custom", "keep") != true {
		t.Fatalf("handoff merge: %v", prefs)
	}
	fresh := filepath.Join(t.TempDir(), "chromium")
	if err := os.Mkdir(fresh, 0o700); err != nil {
		t.Fatal(err)
	}
	if err := MergePreferences(fresh, downloads, true); err != nil {
		t.Fatal(err)
	}
	if lookup(readPreferences(t, fresh), "profile", "exit_type") != "Normal" || mode(t, filepath.Join(fresh, "Default")) != os.ModeDir|0o700 {
		t.Fatal("fresh profile preferences not created privately")
	}
}

func TestChromiumVersion(t *testing.T) {
	if err := CheckVersion(Meta{ChromiumMajor: 152}, 151); err == nil || !strings.Contains(err.Error(), "profile-chromium-newer") {
		t.Fatalf("newer profile accepted: %v", err)
	}
	for _, recorded := range []int{0, 150, 151} {
		if err := CheckVersion(Meta{ChromiumMajor: recorded}, 151); err != nil {
			t.Fatalf("recorded %d refused: %v", recorded, err)
		}
	}
	dir := t.TempDir()
	for output, want := range map[string]int{"Chromium 151.0.7922.137 Fedora Project": 151, "Google Chrome 152.0.1.2 ": 152} {
		binary := filepath.Join(dir, "chromium")
		if err := os.WriteFile(binary, []byte("#!/bin/sh\necho '"+output+"'\n"), 0o700); err != nil {
			t.Fatal(err)
		}
		got, err := InstalledMajor(binary)
		if err != nil || got != want {
			t.Fatalf("%q: %d %v", output, got, err)
		}
		_ = os.Remove(binary)
	}
	binary := filepath.Join(dir, "garbage")
	if err := os.WriteFile(binary, []byte("#!/bin/sh\necho nothing\n"), 0o700); err != nil {
		t.Fatal(err)
	}
	if _, err := InstalledMajor(binary); err == nil {
		t.Fatal("unparseable version accepted")
	}
}

func TestListShowsProfilesWithoutLocking(t *testing.T) {
	root := store(t)
	if entries, err := List(root); err != nil || len(entries) != 0 {
		t.Fatalf("empty store: %v %v", entries, err)
	}
	if _, err := os.Lstat(root); !os.IsNotExist(err) {
		t.Fatal("list created the store")
	}
	held, err := Acquire(root, "work")
	if err != nil {
		t.Fatal(err)
	}
	defer held.Release()
	self, _ := state.Inspect(os.Getpid())
	id := strings.Repeat("c", 32)
	if err = held.SaveMeta(Meta{Name: "work", OwnerLogin: "owner@example.test", Transport: "tailscale", HolderID: id, HolderGuard: &self}); err != nil {
		t.Fatal(err)
	}
	entries, err := List(root)
	if err != nil || len(entries) != 1 || !entries[0].InUse || entries[0].Holder != id || entries[0].OwnerLogin != "owner@example.test" {
		t.Fatalf("in-use entry: %+v %v", entries, err)
	}
	held.Release()
	if again, err := Acquire(root, "work"); err != nil {
		t.Fatal("list kept a lock")
	} else {
		again.Release()
	}
	if entries, err = List(root); err != nil || len(entries) != 1 || entries[0].InUse {
		t.Fatalf("idle entry: %+v %v", entries, err)
	}
}
