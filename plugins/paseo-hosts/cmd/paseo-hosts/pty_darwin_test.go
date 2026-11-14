package main

import (
	"bytes"
	"os"
	"syscall"
	"testing"
	"unsafe"
)

// openPTY returns the slave side of a pseudo-terminal. On macOS the master
// does not answer TIOCGETA, so the slave is granted, unlocked and opened.
func openPTY(t *testing.T) *os.File {
	t.Helper()
	ptmx, err := os.OpenFile("/dev/ptmx", os.O_RDWR, 0)
	if err != nil {
		t.Skipf("no pseudo-terminal: %v", err)
	}
	t.Cleanup(func() { _ = ptmx.Close() })
	var name [128]byte
	for _, req := range []struct {
		cmd uintptr
		arg uintptr
	}{
		{syscall.TIOCPTYGRANT, 0},
		{syscall.TIOCPTYUNLK, 0},
		{syscall.TIOCPTYGNAME, uintptr(unsafe.Pointer(&name[0]))},
	} {
		if _, _, errno := syscall.Syscall(syscall.SYS_IOCTL, ptmx.Fd(), req.cmd, req.arg); errno != 0 {
			t.Fatalf("pseudo-terminal ioctl %#x: %v", req.cmd, errno)
		}
	}
	slave, err := os.OpenFile(string(name[:bytes.IndexByte(name[:], 0)]), os.O_RDWR|syscall.O_NOCTTY, 0)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = slave.Close() })
	return slave
}
