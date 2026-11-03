package state

import (
	"context"
	"os"
	"os/exec"
	"path/filepath"
	"syscall"
	"testing"
	"time"
)

func TestPrivateStateAndIdentity(t *testing.T) {
	root := filepath.Join(t.TempDir(), "sessions")
	id, err := New(root)
	if err != nil {
		t.Fatal(err)
	}
	rec := Record{Version: 1, ID: id, Kind: "share", State: "starting", Expires: time.Now().UTC().Add(time.Hour)}
	if err = Save(root, rec); err != nil {
		t.Fatal(err)
	}
	got, err := Load(root, id)
	if err != nil || got.ID != id {
		t.Fatalf("record %+v %v", got, err)
	}
	for path, mode := range map[string]os.FileMode{root: 0o700, filepath.Join(root, id): 0o700, filepath.Join(root, id, "state.json"): 0o600} {
		fi, e := os.Lstat(path)
		if e != nil || fi.Mode().Perm() != mode {
			t.Fatalf("private mode %s: %v %v", path, fi, e)
		}
	}
	mine, err := Inspect(os.Getpid())
	if err != nil || !Alive(mine) {
		t.Fatalf("identity: %+v %v", mine, err)
	}
	mine.Start = "reused"
	if Alive(mine) {
		t.Fatal("reused process accepted")
	}
}

func TestRefuseUnsafeStateAndSymlinks(t *testing.T) {
	root := filepath.Join(t.TempDir(), "unsafe")
	if err := os.Mkdir(root, 0o755); err != nil {
		t.Fatal(err)
	}
	if _, err := New(root); err == nil {
		t.Fatal("accepted permissive state root")
	}
	root = filepath.Join(t.TempDir(), "sessions")
	id, err := New(root)
	if err != nil {
		t.Fatal(err)
	}
	dst := filepath.Join(t.TempDir(), "foreign")
	if err = os.WriteFile(dst, []byte("foreign"), 0o600); err != nil {
		t.Fatal(err)
	}
	if err = os.Symlink(dst, filepath.Join(root, id, "state.json")); err != nil {
		t.Fatal(err)
	}
	if _, err = Load(root, id); err == nil {
		t.Fatal("followed state symlink")
	}
	if _, err = Load(root, "../../foreign"); err == nil {
		t.Fatal("accepted path traversal")
	}
}

func TestLockHonorsContext(t *testing.T) {
	root := filepath.Join(t.TempDir(), "sessions")
	if err := EnsureRoot(root); err != nil {
		t.Fatal(err)
	}
	unlock, err := Lock(context.Background(), root)
	if err != nil {
		t.Fatal(err)
	}
	defer unlock()
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Millisecond)
	defer cancel()
	if release, e := Lock(ctx, root); e == nil {
		release()
		t.Fatal("concurrent lock acquired")
	}
}

func TestPrivateRejectsNonRegularRecord(t *testing.T) {
	path := filepath.Join(t.TempDir(), "record")
	if err := syscall.Mkfifo(path, 0o600); err != nil {
		t.Fatal(err)
	}
	if err := private(path, 0o600); err == nil {
		t.Fatal("accepted a FIFO as a record")
	}
}

func TestSignalUsesVerifiedProcessBirth(t *testing.T) {
	cmd := exec.Command("/bin/sleep", "30")
	if err := cmd.Start(); err != nil {
		t.Fatal(err)
	}
	defer func() { _ = cmd.Process.Kill(); _ = cmd.Wait() }()
	id, err := Inspect(cmd.Process.Pid)
	if err != nil {
		t.Fatal(err)
	}
	wrong := id
	wrong.Start = "not-the-owned-process"
	if err = Signal(wrong, syscall.SIGTERM); err == nil {
		t.Fatal("signalled an unverified process")
	}
	if !Alive(id) {
		t.Fatal("foreign identity check killed owned child")
	}
	if err = Signal(id, syscall.SIGTERM); err != nil {
		t.Fatal(err)
	}
}
