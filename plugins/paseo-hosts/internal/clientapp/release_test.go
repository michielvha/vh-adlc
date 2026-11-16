//go:build !paseotest

package clientapp_test

import (
	"bytes"
	"os"
	"testing"
)

const injectionBuilt = false

func TestReleaseBuildHasNoFaultInjection(t *testing.T) {
	exe, err := os.Executable()
	if err != nil {
		t.Fatal(err)
	}
	data, err := os.ReadFile(exe)
	if err != nil {
		t.Fatal(err)
	}
	if bytes.Contains(data, []byte(rejectSwitch())) {
		t.Fatal("a build without the paseotest tag holds the fault injection switch")
	}
}
