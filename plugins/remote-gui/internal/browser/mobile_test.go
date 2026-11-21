package browser

import (
	"context"
	"net"
	"testing"
	"testing/synctest"
	"time"
)

func TestMobileGeometryRequiresOneExplicitUnitScale(t *testing.T) {
	for _, args := range [][]string{
		nil,
		{"--force-device-scale-factor=2"},
		{"--force-device-scale-factor=1", "--force-device-scale-factor=2"},
		{"--force-device-scale-factor", "1"},
	} {
		if usesUnitDeviceScale(args) {
			t.Fatalf("accepted unverifiable scale: %q", args)
		}
	}
	if !usesUnitDeviceScale([]string{"--force-device-scale-factor=1"}) {
		t.Fatal("rejected owned unit scale")
	}
}

func TestMobileFocusDiscardsReplyToCanceledRequest(t *testing.T) {
	synctest.Test(t, func(t *testing.T) {
		client, worker := net.Pipe()
		defer func() { _ = client.Close() }()
		defer func() { _ = worker.Close() }()
		if err := worker.SetDeadline(time.Now().Add(time.Second)); err != nil {
			t.Fatal(err)
		}
		focus := mobileFocus{conn: client}
		readRequest := func(want string) {
			t.Helper()
			var packet [mobilePacketSize]byte
			n, err := worker.Read(packet[:])
			if err != nil || string(packet[:n]) != want {
				t.Fatalf("worker received %q, error %v; want %s", packet[:n], err, want)
			}
		}
		ctx, cancel := context.WithCancel(t.Context())
		defer cancel()
		first := make(chan error, 1)
		go func() {
			_, err := focus.sample(ctx, 100, 10, 20)
			first <- err
		}()
		readRequest("[1,100,10,20]")
		cancel()
		if err := <-first; err != errMobileFocusUnavailable {
			t.Fatalf("canceled sample returned %v", err)
		}

		second := make(chan mobileSample, 1)
		go func() {
			sample, _ := focus.sample(t.Context(), 100, 30, 40)
			second <- sample
		}()
		readRequest("[2,100,30,40]")
		if _, err := worker.Write([]byte(`{"sequence":1,"field":{"token":"old","mode":"text"}}`)); err != nil {
			t.Fatal(err)
		}
		if _, err := worker.Write([]byte(`{"sequence":2,"field":null}`)); err != nil {
			t.Fatal(err)
		}
		if sample := <-second; sample.Sequence != 2 || sample.Field != nil {
			t.Fatalf("unexpected current sample %+v", sample)
		}
	})
}
