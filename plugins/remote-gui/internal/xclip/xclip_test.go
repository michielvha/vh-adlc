package xclip

import (
	"context"
	"crypto/rand"
	"encoding/binary"
	"encoding/hex"
	"errors"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
	"testing"
	"time"
)

// scratchDisplay starts a private Xvfb with a fresh cookie file, as the browser runtime does.
func scratchDisplay(t *testing.T) Display {
	t.Helper()
	if os.Getenv("REMOTE_GUI_BROWSER_E2E") != "1" {
		t.Skip("set REMOTE_GUI_BROWSER_E2E=1 with existing Xvfb and xauth")
	}
	xvfb, xauth := os.Getenv("REMOTE_GUI_XVFB"), os.Getenv("REMOTE_GUI_XAUTH")
	if xvfb == "" {
		xvfb = "Xvfb"
	}
	if xauth == "" {
		xauth = "xauth"
	}
	directory, err := os.MkdirTemp("/tmp", "rg-xclip-")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = os.RemoveAll(directory) })
	authority := filepath.Join(directory, "Xauthority")
	for attempt := range 32 {
		number := 47000 + (os.Getpid()*7+attempt*13)%2000
		lock, socket := "/tmp/.X"+strconv.Itoa(number)+"-lock", "/tmp/.X11-unix/X"+strconv.Itoa(number)
		if _, e := os.Lstat(lock); e == nil {
			continue
		}
		if _, e := os.Lstat(socket); e == nil {
			continue
		}
		writeCookie(t, xauth, authority, number)
		cmd := exec.Command(xvfb, ":"+strconv.Itoa(number), "-screen", "0", "640x480x24", "-nolisten", "tcp", "-auth", authority)
		if err = cmd.Start(); err != nil {
			t.Fatal(err)
		}
		done := make(chan struct{})
		go func() { _ = cmd.Wait(); close(done) }()
		t.Cleanup(func() { _ = cmd.Process.Kill(); <-done })
		deadline := time.Now().Add(10 * time.Second)
		for time.Now().Before(deadline) {
			select {
			case <-done:
				deadline = time.Time{}
				continue
			default:
			}
			if _, e := os.Lstat(socket); e == nil {
				return Display{Number: number, Authority: authority}
			}
			time.Sleep(20 * time.Millisecond)
		}
	}
	t.Fatal("no scratch display started")
	return Display{}
}

func writeCookie(t *testing.T, xauth, authority string, number int) {
	t.Helper()
	cookie := make([]byte, 16)
	if _, err := rand.Read(cookie); err != nil {
		t.Fatal(err)
	}
	_ = os.Remove(authority)
	cmd := exec.Command(xauth, "-f", authority)
	cmd.Stdin = strings.NewReader("add :" + strconv.Itoa(number) + " . " + hex.EncodeToString(cookie) + "\n")
	if out, err := cmd.CombinedOutput(); err != nil {
		t.Fatalf("xauth: %v %s", err, out)
	}
}

func open(t *testing.T, d Display) *Helper {
	t.Helper()
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	h, err := Open(ctx, d)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = h.Close() })
	return h
}

func bounded(t *testing.T) context.Context {
	t.Helper()
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	t.Cleanup(cancel)
	return ctx
}

// exactly64KiB is 65536 bytes of valid UTF-8 that includes characters outside Latin-1.
func exactly64KiB() string {
	var b strings.Builder
	for b.Len()+len("Zürich € ✓ ") <= MaxText {
		b.WriteString("Zürich € ✓ ")
	}
	b.WriteString(strings.Repeat("x", MaxText-b.Len()))
	return b.String()
}

func TestRoundTrip(t *testing.T) {
	d := scratchDisplay(t)
	a, b := open(t, d), open(t, d)
	ctx := bounded(t)
	for _, text := range []string{"Zürich € ✓", exactly64KiB()} {
		if err := a.Set(ctx, text); err != nil {
			t.Fatal(err)
		}
		same, err := a.Get(ctx)
		if err != nil || same != text {
			t.Fatalf("same helper Get: %v, %d bytes", err, len(same))
		}
		other, err := b.Get(ctx)
		if err != nil || other != text {
			t.Fatalf("second helper Get: %v, %d bytes", err, len(other))
		}
	}
	if len(exactly64KiB()) != MaxText {
		t.Fatal("fixture is not exactly 64 KiB")
	}
	if err := a.Set(ctx, exactly64KiB()+"x"); !errors.Is(err, ErrTooLarge) {
		t.Fatalf("oversized Set: %v", err)
	}
	// Ownership passing to another client drops the held text.
	if err := b.Set(ctx, "second owner ✓"); err != nil {
		t.Fatal(err)
	}
	got, err := a.Get(ctx)
	if err != nil || got != "second owner ✓" {
		t.Fatalf("Get after losing ownership: %v %q", err, got)
	}
}

func TestOversizedRemoteText(t *testing.T) {
	d := scratchDisplay(t)
	reader, owner := open(t, d), open(t, d)
	ctx := bounded(t)
	if err := owner.own(ctx, "CLIPBOARD", strings.Repeat("a", MaxText+1)); err != nil {
		t.Fatal(err)
	}
	if _, err := reader.Get(ctx); !errors.Is(err, ErrTooLarge) {
		t.Fatalf("oversized remote text: %v", err)
	}
	incr, err := owner.atom(ctx, "INCR")
	if err != nil {
		t.Fatal(err)
	}
	owner.setAnswer(func(uint32) (uint32, byte, []byte, bool) {
		size := make([]byte, 4)
		binary.LittleEndian.PutUint32(size, 1<<20)
		return incr, 32, size, true
	})
	if err = owner.own(ctx, "CLIPBOARD", "incr"); err != nil {
		t.Fatal(err)
	}
	if _, err = reader.Get(ctx); !errors.Is(err, ErrTooLarge) {
		t.Fatalf("INCR reply: %v", err)
	}
}

func TestLatin1Fallback(t *testing.T) {
	d := scratchDisplay(t)
	reader, owner := open(t, d), open(t, d)
	ctx := bounded(t)
	utf8String, err := owner.atom(ctx, "UTF8_STRING")
	if err != nil {
		t.Fatal(err)
	}
	owner.setAnswer(func(target uint32) (uint32, byte, []byte, bool) {
		if target == utf8String {
			return 0, 0, nil, false
		}
		if target == atomString {
			return atomString, 8, []byte("Z\xfcrich \xa9"), true
		}
		return 0, 0, nil, false
	})
	if err = owner.own(ctx, "CLIPBOARD", "unused"); err != nil {
		t.Fatal(err)
	}
	got, err := reader.Get(ctx)
	if err != nil || got != "Zürich ©" {
		t.Fatalf("STRING fallback: %v %q", err, got)
	}
}

func TestClearAndProbes(t *testing.T) {
	d := scratchDisplay(t)
	a, probe := open(t, d), open(t, d)
	ctx := bounded(t)
	if owner, err := probe.Owner(ctx, "CLIPBOARD"); err != nil || owner != 0 {
		t.Fatalf("fresh display owner: %v %d", err, owner)
	}
	if err := a.Set(ctx, "clear-sentinel ✓"); err != nil {
		t.Fatal(err)
	}
	if owner, err := probe.Owner(ctx, "CLIPBOARD"); err != nil || owner == 0 {
		t.Fatalf("owner probe after Set: %v %d", err, owner)
	}
	if err := probe.own(ctx, "PRIMARY", "primary-sentinel"); err != nil {
		t.Fatal(err)
	}
	if exists, err := probe.CutBufferExists(ctx); err != nil || exists {
		t.Fatalf("fresh cut buffer: %v %v", err, exists)
	}
	if err := probe.SetCutBuffer(ctx, "stale-cut"); err != nil {
		t.Fatal(err)
	}
	if exists, err := probe.CutBufferExists(ctx); err != nil || !exists {
		t.Fatalf("cut buffer setter: %v %v", err, exists)
	}
	if err := a.Clear(ctx); err != nil {
		t.Fatal(err)
	}
	for _, selection := range []string{"CLIPBOARD", "PRIMARY"} {
		if owner, err := probe.Owner(ctx, selection); err != nil || owner != 0 {
			t.Fatalf("%s owner after Clear: %v %d", selection, err, owner)
		}
	}
	if exists, err := probe.CutBufferExists(ctx); err != nil || exists {
		t.Fatalf("cut buffer after Clear: %v %v", err, exists)
	}
	if got, err := a.Get(ctx); err != nil || got != "" {
		t.Fatalf("Get after Clear: %v %q", err, got)
	}
	if err := a.Set(ctx, "after clear"); err != nil {
		t.Fatal("retaking ownership after Clear failed")
	}
}

func TestWrongCookieRefused(t *testing.T) {
	d := scratchDisplay(t)
	xauth := os.Getenv("REMOTE_GUI_XAUTH")
	if xauth == "" {
		xauth = "xauth"
	}
	wrong := filepath.Join(t.TempDir(), "Xauthority")
	writeCookie(t, xauth, wrong, d.Number)
	ctx := bounded(t)
	if h, err := Open(ctx, Display{Number: d.Number, Authority: wrong}); !errors.Is(err, ErrRefused) {
		if h != nil {
			_ = h.Close()
		}
		t.Fatalf("wrong cookie: %v", err)
	}
}

func TestMenusListsOnlyViewableMenus(t *testing.T) {
	d := scratchDisplay(t)
	h := open(t, d)
	ctx := bounded(t)
	c, err := dial(ctx, d, func(*conn, packet) {})
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(c.close)
	atom := func(name string) uint32 {
		reply, e := c.call(ctx, internAtom(name))
		if e != nil {
			t.Fatal(e)
		}
		return le.Uint32(reply[8:])
	}
	kind := atom("_NET_WM_WINDOW_TYPE")
	window := func(typeName string, mapped bool) uint32 {
		id := c.id()
		reqs := [][]byte{createWindow(id, c.root, 0), changeProperty(id, kind, atomAtom, 32, atoms32(atom(typeName)), false)}
		if mapped {
			reqs = append(reqs, windowRequest(8, id)) // MapWindow
		}
		if e := c.check(ctx, reqs...); e != nil {
			t.Fatal(e)
		}
		return id
	}
	menu := window("_NET_WM_WINDOW_TYPE_MENU", true)
	window("_NET_WM_WINDOW_TYPE_MENU", false)
	window("_NET_WM_WINDOW_TYPE_NORMAL", true)
	menus, err := h.Menus(ctx)
	if err != nil {
		t.Fatal(err)
	}
	if len(menus) != 1 || !menus[menu] {
		t.Fatalf("menus: %v, want only %d", menus, menu)
	}
}
