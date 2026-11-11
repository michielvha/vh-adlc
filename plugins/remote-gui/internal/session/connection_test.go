package session

import (
	"bufio"
	"context"
	"fmt"
	"io"
	"net"
	"os"
	"os/exec"
	"strings"
	"testing"
	"time"

	"github.com/michielvha/vh-adlc/plugins/remote-gui/internal/config"
	"github.com/michielvha/vh-adlc/plugins/remote-gui/internal/state"
)

func TestConnectionPeerHelper(t *testing.T) {
	if os.Getenv("REMOTE_GUI_TEST_CONN_PEER") != "1" {
		return
	}
	listener, err := net.Listen("tcp4", "127.0.0.1:0")
	if err != nil {
		os.Exit(1)
	}
	if _, err = fmt.Fprintln(os.Stdout, listener.Addr().String()); err != nil {
		os.Exit(1)
	}
	conn, err := listener.Accept()
	if err != nil {
		os.Exit(1)
	}
	count, err := io.Copy(io.Discard, conn)
	_ = conn.Close()
	_ = listener.Close()
	if err != nil {
		os.Exit(1)
	}
	if _, err = fmt.Fprintln(os.Stdout, count); err != nil {
		os.Exit(1)
	}
	os.Exit(0)
}

func TestEstablishedConnectionRequiresSelectedProcess(t *testing.T) {
	listener, err := net.Listen("tcp4", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	defer func() { _ = listener.Close() }()
	target := "http://" + listener.Addr().String()
	owner, inode, err := discover(target)
	if err != nil {
		t.Fatal(err)
	}
	record := state.Record{Config: config.Config{Target: target}, Upstream: owner, UpstreamSocket: inode}
	accepted := make(chan net.Conn, 1)
	go func() {
		conn, e := listener.Accept()
		if e == nil {
			accepted <- conn
		}
	}()
	conn, err := net.DialTimeout("tcp4", listener.Addr().String(), time.Second)
	if err != nil {
		t.Fatal(err)
	}
	defer func() { _ = conn.Close() }()
	select {
	case server := <-accepted:
		defer func() { _ = server.Close() }()
	case <-time.After(3 * time.Second):
		t.Fatal("selected app did not accept its connection")
	}
	if !connectionOwned(context.Background(), record, conn) {
		t.Fatal("selected process connection was rejected")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	child := exec.CommandContext(ctx, os.Args[0], "-test.run=^TestConnectionPeerHelper$")
	child.Env = append(os.Environ(), "REMOTE_GUI_TEST_CONN_PEER=1")
	output, err := child.StdoutPipe()
	if err != nil {
		t.Fatal(err)
	}
	if err = child.Start(); err != nil {
		t.Fatal(err)
	}
	defer func() { cancel(); _ = child.Wait() }()
	reader := bufio.NewReader(output)
	address, err := reader.ReadString('\n')
	if err != nil {
		t.Fatal(err)
	}
	foreign, err := net.DialTimeout("tcp4", strings.TrimSpace(address), time.Second)
	if err != nil {
		t.Fatal(err)
	}
	defer func() { _ = foreign.Close() }()
	if connectionOwned(ctx, record, foreign) {
		t.Fatal("connection accepted by another process was authorized")
	}
	_ = foreign.Close()
	count, err := reader.ReadString('\n')
	if err != nil || strings.TrimSpace(count) != "0" {
		t.Fatal("foreign process received request data or did not close")
	}
	if err = child.Wait(); err != nil {
		t.Fatal(err)
	}
	if !bindingAlive(record) {
		t.Fatal("selected app binding was altered")
	}
}
