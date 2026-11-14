package link

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"net"
	"net/http"
	"net/http/httptest"
	"os"
	"os/exec"
	"os/user"
	"path/filepath"
	"strconv"
	"strings"
	"testing"
	"time"
)

// TestKeyLineAgainstRealSSHD checks the authorize snippet's key line with a
// real, unprivileged sshd: the daemon tunnel works and nothing else does.
func TestKeyLineAgainstRealSSHD(t *testing.T) {
	sshd := findSSHD()
	if sshd == "" {
		t.Skip("sshd is not installed")
	}
	for _, tool := range []string{"ssh", "ssh-keygen", "bash"} {
		if _, err := exec.LookPath(tool); err != nil {
			t.Skipf("%s is not installed", tool)
		}
	}
	me, err := user.Current()
	if err != nil {
		t.Fatal(err)
	}
	dir := t.TempDir()
	home := filepath.Join(dir, "home")
	if err := os.MkdirAll(home, 0o700); err != nil {
		t.Fatal(err)
	}
	keygen(t, filepath.Join(dir, "host_key"))
	keygen(t, filepath.Join(dir, "client_key"))
	pub, err := os.ReadFile(filepath.Join(dir, "client_key.pub"))
	if err != nil {
		t.Fatal(err)
	}

	daemon := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		_, _ = w.Write([]byte("ok"))
	}))
	defer daemon.Close()
	daemonPort := daemon.Listener.Addr().(*net.TCPAddr).Port
	other := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		_, _ = w.Write([]byte("other"))
	}))
	defer other.Close()
	otherPort := other.Listener.Addr().(*net.TCPAddr).Port

	authorize := exec.Command("bash", "-s")
	authorize.Env = append(os.Environ(), "HOME="+home)
	authorize.Stdin = strings.NewReader(fmt.Sprintf("port='%d'\nkey='%s'\ncomment='paseo-hosts:test'\n{\n%s\n} </dev/null\n",
		daemonPort, strings.TrimSpace(string(pub)), authorizeScript))
	if out, err := authorize.CombinedOutput(); err != nil {
		t.Fatalf("authorize snippet: %v\n%s", err, out)
	}

	sshPort := freePort(t)
	cfg := filepath.Join(dir, "sshd_config")
	writeFile(t, cfg, strings.Join([]string{
		"Port " + strconv.Itoa(sshPort),
		"ListenAddress 127.0.0.1",
		"HostKey " + filepath.Join(dir, "host_key"),
		"PidFile " + filepath.Join(dir, "sshd.pid"),
		"AuthorizedKeysFile " + filepath.Join(home, ".ssh", "authorized_keys"),
		"StrictModes no",
		"PasswordAuthentication no",
		"KbdInteractiveAuthentication no",
		"AllowTcpForwarding yes",
		"",
	}, "\n"))
	var sshdLog bytes.Buffer
	server := exec.Command(sshd, "-D", "-e", "-f", cfg)
	server.Stdout, server.Stderr = &sshdLog, &sshdLog
	if err := server.Start(); err != nil {
		t.Fatalf("start sshd: %v", err)
	}
	defer func() {
		_ = server.Process.Kill()
		_ = server.Wait()
		if t.Failed() {
			t.Logf("sshd log:\n%s", sshdLog.String())
		}
	}()
	waitForPort(t, sshPort)

	ssh := func(timeout time.Duration, stdin string, args ...string) (string, error) {
		ctx, cancel := context.WithTimeout(context.Background(), timeout)
		defer cancel()
		base := []string{
			"-F", "/dev/null", "-i", filepath.Join(dir, "client_key"),
			"-o", "IdentitiesOnly=yes", "-o", "BatchMode=yes",
			"-o", "StrictHostKeyChecking=no", "-o", "UserKnownHostsFile=/dev/null",
			"-o", "LogLevel=ERROR", "-p", strconv.Itoa(sshPort),
		}
		cmd := exec.CommandContext(ctx, "ssh", append(base, args...)...)
		cmd.Stdin = strings.NewReader(stdin)
		out, err := cmd.CombinedOutput()
		if ctx.Err() != nil {
			return string(out), context.DeadlineExceeded
		}
		return string(out), err
	}
	target := me.Username + "@127.0.0.1"
	request := "GET /api/health HTTP/1.0\r\nHost: localhost\r\n\r\n"

	out, err := ssh(20*time.Second, request, "-W", "127.0.0.1:"+strconv.Itoa(daemonPort), target)
	if err != nil || !strings.Contains(out, "200 OK") {
		t.Fatalf("tunnel to the daemon port: err=%v\n%s", err, out)
	}
	if out, err := ssh(20*time.Second, request, "-W", "127.0.0.1:"+strconv.Itoa(otherPort), target); err == nil || strings.Contains(out, "200 OK") {
		t.Errorf("tunnel to another port was allowed: err=%v\n%s", err, out)
	}
	if out, err := ssh(20*time.Second, "", target, "echo", "shell-ran"); err == nil || strings.Contains(out, "shell-ran") {
		t.Errorf("shell command was allowed: err=%v\n%s", err, out)
	}

	remoteForward := func(listen int) {
		t.Helper()
		spec := fmt.Sprintf("127.0.0.1:%d:127.0.0.1:%d", listen, daemonPort)
		out, err := ssh(5*time.Second, "", "-N", "-o", "ExitOnForwardFailure=yes", "-R", spec, target)
		if err == nil || errors.Is(err, context.DeadlineExceeded) {
			t.Errorf("remote forward %s was allowed: err=%v\n%s", spec, err, out)
		}
	}
	remoteForward(freePort(t))
	daemon.Close()
	remoteForward(daemonPort)
}

func findSSHD() string {
	if p, err := exec.LookPath("sshd"); err == nil {
		if abs, err := filepath.Abs(p); err == nil {
			return abs
		}
	}
	for _, p := range []string{"/usr/sbin/sshd", "/usr/bin/sshd"} {
		if _, err := os.Stat(p); err == nil {
			return p
		}
	}
	return ""
}

func keygen(t *testing.T, path string) {
	t.Helper()
	if out, err := exec.Command("ssh-keygen", "-q", "-t", "ed25519", "-N", "", "-f", path).CombinedOutput(); err != nil {
		t.Fatalf("ssh-keygen: %v\n%s", err, out)
	}
}

func writeFile(t *testing.T, path, data string) {
	t.Helper()
	if err := os.WriteFile(path, []byte(data), 0o600); err != nil {
		t.Fatal(err)
	}
}

func freePort(t *testing.T) int {
	t.Helper()
	l, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	defer func() { _ = l.Close() }()
	return l.Addr().(*net.TCPAddr).Port
}

func waitForPort(t *testing.T, port int) {
	t.Helper()
	deadline := time.Now().Add(10 * time.Second)
	for time.Now().Before(deadline) {
		c, err := net.DialTimeout("tcp", "127.0.0.1:"+strconv.Itoa(port), 200*time.Millisecond)
		if err == nil {
			_ = c.Close()
			return
		}
		time.Sleep(50 * time.Millisecond)
	}
	t.Fatalf("sshd did not listen on port %d", port)
}
