package state

import (
	"net"
	"os"
	"path/filepath"
	"testing"
)

func TestSocketLeasePreservesAReplacedPath(t *testing.T) {
	name := filepath.Join(t.TempDir(), "p.sock")
	first, err := net.ListenUnix("unix", &net.UnixAddr{Name: name, Net: "unix"})
	if err != nil {
		t.Fatal(err)
	}
	first.SetUnlinkOnClose(false)
	if err = os.Chmod(name, 0o600); err != nil {
		t.Fatal(err)
	}
	lease, err := CaptureSocket(name)
	if err != nil {
		t.Fatal(err)
	}
	_ = first.Close()
	if err = ReleaseSocket(name, lease); err != nil {
		t.Fatal(err)
	}
	second, err := net.ListenUnix("unix", &net.UnixAddr{Name: name, Net: "unix"})
	if err != nil {
		t.Fatal(err)
	}
	defer func() { _ = second.Close() }()
	second.SetUnlinkOnClose(false)
	defer func() { _ = os.Remove(name) }()
	_ = os.Chmod(name, 0o600)
	if err = ReleaseSocket(name, lease); err == nil {
		t.Fatal("foreign replacement was removed")
	}
	if _, err = os.Lstat(name); err != nil {
		t.Fatal("replacement socket disappeared")
	}
}
