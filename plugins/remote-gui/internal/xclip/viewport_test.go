package xclip

import (
	"bufio"
	"context"
	"fmt"
	"github.com/michielvha/vh-adlc/plugins/remote-gui/internal/viewport"
	"os"
	"os/exec"
	"strconv"
	"strings"
	"testing"
	"time"
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
}
