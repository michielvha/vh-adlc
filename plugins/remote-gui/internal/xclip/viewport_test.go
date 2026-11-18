package xclip

import (
	"bufio"
	"context"
	"fmt"
	"os"
	"os/exec"
	"slices"
	"strconv"
	"strings"
	"testing"
	"time"

	"github.com/michielvha/vh-adlc/plugins/remote-gui/internal/viewport"
)

func viewportWindow(t *testing.T, h *Helper, pid int, kind string) uint32 {
	t.Helper()
	ctx := bounded(t)
	c := h.c
	id := c.id()
	pa, err := h.atom(ctx, "_NET_WM_PID")
	if err != nil {
		t.Fatal(err)
	}
	ka, err := h.atom(ctx, "_NET_WM_WINDOW_TYPE")
	if err != nil {
		t.Fatal(err)
	}
	va, err := h.atom(ctx, kind)
	if err != nil {
		t.Fatal(err)
	}
	if err = c.check(ctx, createWindow(id, c.root, 0), changeProperty(id, pa, 6, 32, atoms32(uint32(pid)), false), changeProperty(id, ka, atomAtom, 32, atoms32(va), false), windowRequest(8, id)); err != nil {
		t.Fatal(err)
	}
	return id
}
func TestViewportWindowsAndWorkarea(t *testing.T) {
	d := scratchDisplay(t)
	h := open(t, d)
	ctx := bounded(t)
	pid := os.Getpid()
	normal := viewportWindow(t, h, pid, "_NET_WM_WINDOW_TYPE_NORMAL")
	menu := viewportWindow(t, h, pid, "_NET_WM_WINDOW_TYPE_MENU")
	foreign := viewportWindow(t, h, pid+1, "_NET_WM_WINDOW_TYPE_NORMAL")
	if err := h.Configure(ctx, pid, []Window{{ID: menu, X: 600, Y: 400, Width: 100, Height: 70}}); err != nil {
		t.Fatal(err)
	}
	windows, err := h.Windows(ctx, pid)
	if err != nil {
		t.Fatal(err)
	}
	if len(windows) != 2 {
		t.Fatalf("owned windows: %+v", windows)
	}
	target := viewport.Size{Width: 390, Height: 300}
	desired := FitWindows(windows, target)
	if err = h.Configure(ctx, pid, desired); err != nil {
		t.Fatal(err)
	}
	if err = h.Workarea(ctx, target); err != nil {
		t.Fatal(err)
	}
	got, err := h.Windows(ctx, pid)
	if err != nil {
		t.Fatal(err)
	}
	for _, w := range got {
		if w.ID == normal && (w.Width != 390 || w.Height != 300 || w.X != 0 || w.Y != 0) {
			t.Fatalf("normal geometry %+v", w)
		}
		if w.ID == menu && (w.X < 0 || w.Y < 0 || w.X+w.Width > 390 || w.Y+w.Height > 300) {
			t.Fatalf("menu outside viewport %+v", w)
		}
	}
	// Raising an existing window changes stacking, not the geometry cache key.
	raise := make([]byte, 16)
	raise[0] = 12
	le.PutUint32(raise[4:], normal)
	le.PutUint16(raise[8:], 64)
	if err = h.c.check(ctx, raise); err != nil {
		t.Fatal(err)
	}
	raised, err := h.Windows(ctx, pid)
	if err != nil || !slices.Equal(got, raised) {
		t.Fatalf("stack order invalidated geometry: %v %+v", err, raised)
	}
	// Forging a different PID must not make Configure touch a foreign window.
	if err = h.Configure(ctx, pid, []Window{{ID: foreign, Width: 400, Height: 400}}); err == nil {
		t.Fatal("foreign window mutation accepted")
	}
	newer := viewportWindow(t, h, pid, "_NET_WM_WINDOW_TYPE_NORMAL")
	next, err := h.Windows(ctx, pid)
	if err != nil || len(next) != 3 {
		t.Fatalf("new normal window missing: %v %+v", err, next)
	}
	if err = h.c.check(ctx, destroyWindow(newer)); err != nil {
		t.Fatal(err)
	}
	next, err = h.Windows(ctx, pid)
	if err != nil || len(next) != 2 {
		t.Fatalf("destroyed window retained: %v %+v", err, next)
	}
}

func TestViewportForeignClient(t *testing.T) {
	if os.Getenv("RG_VIEWPORT_FOREIGN") == "1" {
		number, _ := strconv.Atoi(os.Getenv("RG_VIEWPORT_DISPLAY"))
		pid, _ := strconv.Atoi(os.Getenv("RG_VIEWPORT_PARENT"))
		h, err := Open(context.Background(), Display{Number: number, Authority: os.Getenv("RG_VIEWPORT_AUTH")})
		if err != nil {
			t.Fatal(err)
		}
		defer func() { _ = h.Close() }()
		id := viewportWindow(t, h, pid, "_NET_WM_WINDOW_TYPE_NORMAL")
		fmt.Printf("foreign-window:%d\n", id)
		time.Sleep(time.Minute)
		return
	}
	d := scratchDisplay(t)
	h := open(t, d)
	pid := os.Getpid()
	own := viewportWindow(t, h, pid, "_NET_WM_WINDOW_TYPE_NORMAL")
	command := exec.Command(os.Args[0], "-test.run=^TestViewportForeignClient$", "-test.v")
	command.Env = append(os.Environ(), "RG_VIEWPORT_FOREIGN=1", "RG_VIEWPORT_DISPLAY="+strconv.Itoa(d.Number), "RG_VIEWPORT_AUTH="+d.Authority, "RG_VIEWPORT_PARENT="+strconv.Itoa(pid))
	stdout, err := command.StdoutPipe()
	if err != nil {
		t.Fatal(err)
	}
	if err = command.Start(); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = command.Process.Kill(); _ = command.Wait() })
	scanner := bufio.NewScanner(stdout)
	var foreign uint64
	for scanner.Scan() {
		line := scanner.Text()
		if strings.HasPrefix(line, "foreign-window:") {
			foreign, err = strconv.ParseUint(strings.TrimPrefix(line, "foreign-window:"), 10, 32)
			if err != nil {
				t.Fatal(err)
			}
			break
		}
	}
	if foreign == 0 {
		t.Fatal("foreign fixture did not create a window")
	}
	windows, err := h.Windows(bounded(t), pid)
	if err != nil || len(windows) != 1 || windows[0].ID != own {
		t.Fatalf("forged PID accepted: %v %+v", err, windows)
	}
	if err = h.Configure(bounded(t), pid, []Window{{ID: uint32(foreign), Width: 390, Height: 300}}); err == nil {
		t.Fatal("server-attributed foreign window was resized")
	}
	focus := make([]byte, 12)
	focus[0] = 42
	focus[1] = 1
	le.PutUint32(focus[4:], uint32(foreign))
	if err = h.c.check(bounded(t), focus); err != nil {
		t.Fatal(err)
	}
	changed, err := h.RestoreFocus(bounded(t), pid, windows)
	if err != nil || changed {
		t.Fatal("foreign client's native focus was stolen")
	}

}

func TestViewportRestoresOnlyMissingNativeFocus(t *testing.T) {
	d := scratchDisplay(t)
	h := open(t, d)
	ctx := bounded(t)
	pid := os.Getpid()
	first := viewportWindow(t, h, pid, "_NET_WM_WINDOW_TYPE_NORMAL")
	windows, err := h.Windows(ctx, pid)
	if err != nil {
		t.Fatal(err)
	}
	changed, err := h.RestoreFocus(ctx, pid, windows)
	if err != nil || !changed {
		t.Fatalf("missing focus not restored: %v", err)
	}
	focused, err := h.Focused(ctx, pid)
	if err != nil || !focused {
		t.Fatal("native browser did not receive focus")
	}
	changed, err = h.RestoreFocus(ctx, pid, windows)
	if err != nil || changed {
		t.Fatal("valid native focus was stolen")
	}
	second := viewportWindow(t, h, pid, "_NET_WM_WINDOW_TYPE_NORMAL")
	focus := make([]byte, 12)
	focus[0] = 42
	focus[1] = 1
	le.PutUint32(focus[4:], second)
	if err = h.c.check(ctx, focus); err != nil {
		t.Fatal(err)
	}
	if err = h.c.check(ctx, destroyWindow(second)); err != nil {
		t.Fatal(err)
	}
	changed, err = h.RestoreFocus(ctx, pid, windows)
	if err != nil || !changed {
		t.Fatalf("closing a focused window lost input: %v", err)
	}
	target, err := h.c.call(ctx, []byte{43, 0, 0, 0})
	if err != nil || le.Uint32(target[8:]) != first {
		t.Fatal("focus did not return to remaining owned window")
	}
}

func TestViewportFocusCancellationReleasesServer(t *testing.T) {
	d := scratchDisplay(t)
	h := open(t, d)
	pid := os.Getpid()
	viewportWindow(t, h, pid, "_NET_WM_WINDOW_TYPE_NORMAL")
	windows, err := h.Windows(bounded(t), pid)
	if err != nil {
		t.Fatal(err)
	}
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	_, _ = h.RestoreFocus(ctx, pid, windows)
	// A second client must still complete the X11 handshake after cancellation.
	other := open(t, d)
	if _, err = other.Windows(bounded(t), pid); err != nil {
		t.Fatal("cancelled focus operation retained server grab")
	}
}

func TestViewportFocusDoesNotInterruptANewTransient(t *testing.T) {
	d := scratchDisplay(t)
	h := open(t, d)
	ctx := bounded(t)
	pid := os.Getpid()
	viewportWindow(t, h, pid, "_NET_WM_WINDOW_TYPE_NORMAL")
	before, err := h.Windows(ctx, pid)
	if err != nil {
		t.Fatal(err)
	}
	// A menu maps after the watcher's snapshot, before its focus recovery.
	viewportWindow(t, h, pid, "_NET_WM_WINDOW_TYPE_MENU")
	focus := make([]byte, 12)
	focus[0], focus[1] = 42, 1
	le.PutUint32(focus[4:], h.c.root)
	if err = h.c.check(ctx, focus); err != nil {
		t.Fatal(err)
	}
	changed, err := h.RestoreFocus(ctx, pid, before)
	if err != nil || changed {
		t.Fatalf("focus recovery interrupted an owned native menu: changed=%v error=%v", changed, err)
	}
}
