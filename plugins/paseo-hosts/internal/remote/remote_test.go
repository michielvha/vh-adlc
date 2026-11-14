//go:build unix

package remote_test

import (
	"context"
	"errors"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"syscall"
	"testing"
	"time"

	"github.com/michielvha/vh-adlc/plugins/paseo-hosts/internal/remote"
)

func TestCallPastItsDeadlineTimesOut(t *testing.T) {
	dir := t.TempDir()
	pidFile := filepath.Join(dir, "pid")
	ssh := "#!/bin/sh\necho $$ > '" + pidFile + "'\nexec sleep 600\n"
	if err := os.WriteFile(filepath.Join(dir, "ssh"), []byte(ssh), 0o755); err != nil {
		t.Fatal(err)
	}
	t.Setenv("PATH", dir+string(os.PathListSeparator)+os.Getenv("PATH"))
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	start := time.Now()
	_, err := remote.Bash(remote.WithDeadline(ctx, 500*time.Millisecond), "client", "true", nil)
	if elapsed := time.Since(start); elapsed > 5*time.Second {
		t.Fatalf("the call took %s", elapsed)
	}
	var to *remote.Timeout
	if !errors.As(err, &to) || errors.Is(err, remote.ErrUnreachable) || !strings.Contains(err.Error(), "timed out after 500ms") {
		t.Fatalf("error %v is not a timeout after 500ms", err)
	}
	data, err := os.ReadFile(pidFile)
	if err != nil {
		t.Fatal(err)
	}
	pid, err := strconv.Atoi(strings.TrimSpace(string(data)))
	if err != nil {
		t.Fatal(err)
	}
	if err := syscall.Kill(pid, 0); err == nil {
		t.Fatalf("the stand-in ssh %d still runs", pid)
	}
}
