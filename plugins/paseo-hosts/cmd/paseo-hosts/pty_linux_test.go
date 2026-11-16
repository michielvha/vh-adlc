package main

import (
	"os"
	"testing"
)

// openPTY returns a pseudo-terminal master, which answers TCGETS on Linux.
func openPTY(t *testing.T) *os.File {
	t.Helper()
	ptmx, err := os.OpenFile("/dev/ptmx", os.O_RDWR, 0)
	if err != nil {
		t.Skipf("no pseudo-terminal: %v", err)
	}
	t.Cleanup(func() { _ = ptmx.Close() })
	return ptmx
}
