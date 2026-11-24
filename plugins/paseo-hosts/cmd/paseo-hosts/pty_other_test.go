//go:build !linux && !darwin

package main

import (
	"os"
	"testing"
)

func openPTY(t *testing.T) *os.File {
	t.Skip("no pseudo-terminal check on this platform")
	return nil
}
