package state

import (
	"net"
	"os"
	"path/filepath"
	"testing"
)

func TestKernelUnixPeerIsNotAHeaderOrOwnedSignalIdentity(t *testing.T) {
	name := filepath.Join(t.TempDir(), "p.sock")
	listener, err := net.Listen("unix", name)
	if err != nil {
		t.Fatal(err)
	}
	defer func() { _ = listener.Close() }()
	accepted := make(chan net.Conn, 1)
	go func() {
		conn, e := listener.Accept()
		if e == nil {
			accepted <- conn
		}
	}()
	conn, err := net.Dial("unix", name)
	if err != nil {
		t.Fatal(err)
	}
	defer func() { _ = conn.Close() }()
	server := <-accepted
	defer func() { _ = server.Close() }()
	peer, err := ReadPeer(conn)
	if err != nil {
		t.Fatal(err)
	}
	if peer.PID != os.Getpid() || peer.UID != uint32(os.Getuid()) || !peer.Alive() || !peer.Matches(server) {
		t.Fatal("kernel peer identity was not verified")
	}
	old := peer
	old.Start = "reused"
	if old.Alive() || old.Matches(server) {
		t.Fatal("reused PID authorized")
	}
	wrong := peer
	wrong.UID++
	if wrong.Alive() || wrong.Matches(server) {
		t.Fatal("different UID authorized")
	}
	tcp, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	defer func() { _ = tcp.Close() }()
	client, err := net.Dial("tcp", tcp.Addr().String())
	if err != nil {
		t.Fatal(err)
	}
	defer func() { _ = client.Close() }()
	other, err := tcp.Accept()
	if err != nil {
		t.Fatal(err)
	}
	defer func() { _ = other.Close() }()
	if peer.Matches(other) {
		t.Fatal("TCP client obtained trusted Unix peer context")
	}
}
