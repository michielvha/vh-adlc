package xclip

import (
	"bufio"
	"context"
	"io"
	"net"
	"testing"
	"time"
)

func TestFocusCancellationAfterGrabAlwaysUngrabs(t *testing.T) {
	client, server := net.Pipe()
	defer func() { _ = server.Close() }()
	c := &conn{nc: client, root: 1, maxRequest: 1 << 20, pending: make(map[uint16]chan packet), done: make(chan struct{}), wake: make(chan struct{}, 1)}
	defer c.close()
	go c.read(bufio.NewReader(client))
	h := &Helper{c: c}
	entered, released := make(chan struct{}), make(chan bool, 1)
	go func() {
		read := func() byte {
			var request [4]byte
			if _, err := io.ReadFull(server, request[:]); err != nil {
				return 0
			}
			return request[0]
		}
		if read() != 36 || read() != 43 {
			released <- false
			return
		}
		close(entered)
		// Hold the barrier reply until the caller cancels. It must still send UngrabServer.
		released <- read() == 37
	}()
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	done := make(chan error, 1)
	go func() { _, err := h.RestoreFocus(ctx, 1, nil); done <- err }()
	select {
	case <-entered:
	case <-time.After(2 * time.Second):
		t.Fatal("server grab was not sent")
	}
	cancel()
	select {
	case ok := <-released:
		if !ok {
			t.Fatal("server was not ungrabbed")
		}
	case <-time.After(2 * time.Second):
		t.Fatal("cancelled barrier left the server grabbed")
	}
	if err := <-done; err == nil {
		t.Fatal("cancelled focus operation succeeded")
	}
}
