package browser

import (
	"context"
	"errors"
	"fmt"
	"os/exec"
	"slices"
	"strconv"
	"strings"
	"time"

	"github.com/michielvha/vh-adlc/plugins/remote-gui/internal/app"
	"github.com/michielvha/vh-adlc/plugins/remote-gui/internal/session"
	"github.com/michielvha/vh-adlc/plugins/remote-gui/internal/state"
	"github.com/michielvha/vh-adlc/plugins/remote-gui/internal/viewport"
	"github.com/michielvha/vh-adlc/plugins/remote-gui/internal/xclip"
)

type geometryHelper interface {
	Windows(context.Context, int) ([]xclip.Window, error)
	Configure(context.Context, int, []xclip.Window) error
	Workarea(context.Context, viewport.Size) error
}
type geometryController struct {
	helper            geometryHelper
	pid               int
	size              viewport.Size
	confirmed         bool
	windows, observed []xclip.Window
	owns              func() bool
	setClip           func(context.Context, viewport.Size) error
	readClip          func(context.Context) (viewport.Size, error)
}

var errViewportUnavailable = errors.New("viewport-unavailable")

func (c *geometryController) eligible(ctx context.Context) bool { return ctx.Err() == nil && c.owns() }

func (c *geometryController) apply(ctx context.Context, size viewport.Size) (bool, error) {
	if !size.Valid() || !c.eligible(ctx) {
		return false, errViewportUnavailable
	}
	windows, err := c.helper.Windows(ctx, c.pid)
	if err != nil || len(windows) == 0 {
		c.confirmed = false
		return false, errViewportUnavailable
	}
	if c.confirmed && c.size == size && slices.Equal(windows, c.windows) {
		return true, nil
	}
	c.confirmed = false
	oldClip, err := c.readClip(ctx)
	if err != nil {
		return false, errViewportUnavailable
	}
	desired := xclip.FitWindows(windows, size)
	err = c.helper.Workarea(ctx, size)
	if err == nil && c.eligible(ctx) {
		err = c.helper.Configure(ctx, c.pid, desired)
	} else if err == nil {
		err = errViewportUnavailable
	}
	if err == nil && c.eligible(ctx) {
		err = c.setClip(ctx, size)
	} else if err == nil {
		err = errViewportUnavailable
	}
	var current []xclip.Window
	if err == nil {
		current, err = c.helper.Windows(ctx, c.pid)
	}
	var exported viewport.Size
	if err == nil {
		exported, err = c.readClip(ctx)
	}
	if err == nil && c.eligible(ctx) && exported == size && slices.Equal(current, desired) {
		c.size, c.confirmed, c.windows, c.observed = size, true, current, current
		return false, nil
	}
	// Cancellation/stop prevents further mutation. Other failures get a bounded restore.
	if c.eligible(ctx) {
		restore, cancel := context.WithTimeout(ctx, 2*time.Second)
		defer cancel()
		_ = c.helper.Workarea(restore, oldClip)
		if c.eligible(restore) {
			_ = c.helper.Configure(restore, c.pid, windows)
		}
		if c.eligible(restore) {
			_ = c.setClip(restore, oldClip)
		}
		back, e := c.helper.Windows(restore, c.pid)
		clip, e2 := c.readClip(restore)
		c.confirmed = e == nil && e2 == nil && clip == oldClip && oldClip == c.size && slices.Equal(back, windows) && slices.Equal(back, xclip.FitWindows(back, oldClip))
		if c.confirmed {
			c.windows = back
		}
	}
	c.observed, _ = c.helper.Windows(ctx, c.pid)
	return false, errViewportUnavailable
}

func (r *runtime) viewportOwned() bool {
	if r.stopped || r.chrome == nil || !r.modeReady || r.display == nil || (r.geometryCtx != nil && r.geometryCtx.Err() != nil) {
		return false
	}
	got, err := state.CaptureDisplay(r.display.Number, r.display.Owner)
	if err != nil || *got != *r.display || !state.Alive(r.chrome.identity) {
		return false
	}
	for _, child := range r.children {
		if child.role == "vnc" {
			return state.Alive(child.identity) && session.OwnsListener("http://"+r.vncAddress, child.identity)
		}
	}
	return false
}

func (r *runtime) vncGeometry(ctx context.Context, args ...string) ([]byte, error) {
	if !r.viewportOwned() {
		return nil, errViewportUnavailable
	}
	command := exec.CommandContext(ctx, app.Tool("REMOTE_GUI_X11VNC", "x11vnc"), append([]string{"-display", ":" + strconv.Itoa(r.display.Number)}, args...)...)
	command.Env = r.env
	out, err := command.Output()
	if err != nil {
		return nil, errViewportUnavailable
	}
	return out, nil
}

func (r *runtime) setClip(ctx context.Context, size viewport.Size) error {
	_, err := r.vncGeometry(ctx, "-sync", "-remote", fmt.Sprintf("clip:%dx%d+0+0", size.Width, size.Height))
	return err
}

func (r *runtime) readClip(ctx context.Context) (viewport.Size, error) {
	out, err := r.vncGeometry(ctx, "-query", "dpy_x,dpy_y")
	if err != nil {
		return viewport.Size{}, err
	}
	values := make(map[string]int)
	for _, part := range strings.Split(strings.TrimSpace(string(out)), ",") {
		key, value, ok := strings.Cut(strings.TrimPrefix(part, "aro="), ":")
		if ok {
			n, e := strconv.Atoi(value)
			if e == nil {
				values[key] = n
			}
		}
	}
	size := viewport.Size{Width: values["dpy_x"], Height: values["dpy_y"]}
	if !size.Valid() {
		return size, errViewportUnavailable
	}
	return size, nil
}

func (r *runtime) resize(ctx context.Context, size viewport.Size) (bool, error) {
	if !r.mu.TryLock() {
		return false, errors.New("viewport-busy")
	}
	defer r.mu.Unlock()
	if r.stopped || r.geometry == nil {
		return false, errViewportUnavailable
	}
	if r.chrome != nil && r.geometry.pid != r.chrome.identity.PID {
		r.geometry.pid = r.chrome.identity.PID
		r.geometry.confirmed = false
		r.geometry.windows = nil
	}
	ctx, cancel := context.WithTimeout(ctx, 2*time.Second)
	defer cancel()
	if r.geometryCtx != nil {
		stop := context.AfterFunc(r.geometryCtx, cancel)
		defer stop()
	}
	return r.geometry.apply(ctx, size)
}

func (r *runtime) startGeometry() {
	helper, ok := r.clip.(geometryHelper)
	if !ok {
		return
	}
	r.geometry = &geometryController{helper: helper, pid: r.chrome.identity.PID, size: viewport.Initial, owns: r.viewportOwned, setClip: r.setClip, readClip: r.readClip}
	go func() {
		ticker := time.NewTicker(150 * time.Millisecond)
		defer ticker.Stop()
		for {
			select {
			case <-r.geometryCtx.Done():
				return
			case <-ticker.C:
				if !r.mu.TryLock() {
					continue
				}
				if !r.stopped && r.modeReady && r.chrome != nil {
					g := r.geometry
					g.pid = r.chrome.identity.PID
					ctx, cancel := context.WithTimeout(r.geometryCtx, 2*time.Second)
					windows, err := g.helper.Windows(ctx, g.pid)
					if err == nil && !slices.Equal(windows, g.observed) {
						g.confirmed = false
						g.observed = windows
						_, _ = g.apply(ctx, g.size)
					}
					if err == nil {
						r.restoreGeometryFocus(ctx, windows)
					}
					cancel()
				}
				r.mu.Unlock()
			}
		}
	}()
}

func (r *runtime) restoreGeometryFocus(ctx context.Context, windows []xclip.Window) {
	if !r.viewportOwned() || ctx.Err() != nil {
		return
	}
	if focus, ok := r.geometry.helper.(interface {
		RestoreFocus(context.Context, int, []xclip.Window) (bool, error)
	}); ok {
		_, _ = focus.RestoreFocus(ctx, r.geometry.pid, windows)
	}
}
