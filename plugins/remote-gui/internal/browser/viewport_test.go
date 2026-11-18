package browser

import (
	"context"
	"errors"
	"slices"
	"testing"

	"github.com/michielvha/vh-adlc/plugins/remote-gui/internal/viewport"
	"github.com/michielvha/vh-adlc/plugins/remote-gui/internal/xclip"
)

type geometryFake struct {
	windows []xclip.Window
	configs int
	fail    bool
}

func (f *geometryFake) Windows(context.Context, int) ([]xclip.Window, error) {
	return slices.Clone(f.windows), nil
}
func (f *geometryFake) Configure(ctx context.Context, _ int, w []xclip.Window) error {
	f.configs++
	if err := ctx.Err(); err != nil {
		return err
	}
	if f.fail {
		return errors.New("native failure")
	}
	f.windows = slices.Clone(w)
	return nil
}
func (f *geometryFake) Workarea(context.Context, viewport.Size) error { return nil }
func geometryFixture() (*geometryController, *geometryFake, *viewport.Size, *int) {
	f := &geometryFake{windows: []xclip.Window{{ID: 1, Width: 1440, Height: 900, Normal: true}}}
	clip := viewport.Initial
	calls := 0
	c := &geometryController{helper: f, pid: 1, size: viewport.Initial, owns: func() bool { return true }, readClip: func(context.Context) (viewport.Size, error) { return clip, nil }, setClip: func(ctx context.Context, size viewport.Size) error {
		calls++
		if err := ctx.Err(); err != nil {
			return err
		}
		clip = size
		return nil
	}}
	return c, f, &clip, &calls
}
func TestViewportTransactionAndNewWindows(t *testing.T) {
	c, f, clip, calls := geometryFixture()
	size := viewport.Size{Width: 390, Height: 812}
	same, err := c.apply(context.Background(), size)
	if err != nil || same || *clip != size || f.windows[0].Width != 390 {
		t.Fatalf("apply: %v %v", same, err)
	}
	configs := f.configs
	same, err = c.apply(context.Background(), size)
	if err != nil || !same || f.configs != configs || *calls != 1 {
		t.Fatal("duplicate repeated mutation")
	}
	f.windows = append(f.windows, xclip.Window{ID: 2, Width: 1440, Height: 900, Normal: true})
	same, err = c.apply(context.Background(), size)
	if err != nil || same || f.windows[1].Width != 390 {
		t.Fatal("new normal window was not reconciled")
	}
	f.windows = f.windows[:1]
	same, err = c.apply(context.Background(), size)
	if err != nil || same {
		t.Fatal("window destruction did not invalidate confirmation")
	}
}
func TestViewportPartialRollbackRecovery(t *testing.T) {
	for _, rollbackFails := range []bool{false, true} {
		t.Run(map[bool]string{false: "confirmed rollback", true: "uncertain rollback"}[rollbackFails], func(t *testing.T) {
			c, f, clip, _ := geometryFixture()
			a := viewport.Size{Width: 390, Height: 812}
			b := viewport.Size{Width: 900, Height: 1200}
			if _, err := c.apply(context.Background(), a); err != nil {
				t.Fatal(err)
			}
			c.setClip = func(context.Context, viewport.Size) error {
				if rollbackFails {
					f.fail = true
				}
				return errors.New("clip failure")
			}
			if _, err := c.apply(context.Background(), b); err == nil {
				t.Fatal("partial resize succeeded")
			}
			if rollbackFails && c.confirmed {
				t.Fatal("uncertain geometry remained confirmed")
			}
			f.fail = false
			calls := 0
			c.setClip = func(_ context.Context, size viewport.Size) error { calls++; *clip = size; return nil }
			same, err := c.apply(context.Background(), a)
			if err != nil {
				t.Fatal(err)
			}
			if rollbackFails && (same || calls == 0 || f.windows[0].Width != 390) {
				t.Fatal("remembered size skipped reconciliation")
			}
		})
	}
}
func TestViewportOwnershipCancellationAndBusy(t *testing.T) {
	c, f, _, calls := geometryFixture()
	c.owns = func() bool { return false }
	if _, err := c.apply(context.Background(), viewport.Initial); err == nil || f.configs != 0 || *calls != 0 {
		t.Fatal("unowned mutation")
	}
	c.owns = func() bool { return true }
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	if _, err := c.apply(ctx, viewport.Initial); err == nil || f.configs != 0 {
		t.Fatal("cancelled mutation")
	}
	r := &runtime{}
	r.mu.Lock()
	_, err := r.resize(context.Background(), viewport.Initial)
	r.mu.Unlock()
	if err == nil || err.Error() != "viewport-busy" {
		t.Fatal("handoff/stop lock did not refuse resize")
	}
	r.stopped = true
	if _, err = r.resize(context.Background(), viewport.Initial); err == nil {
		t.Fatal("stopped runtime resized")
	}
}

func TestViewportStopCancelsInFlightMutation(t *testing.T) {
	config, id := setup(t)
	g, f, _, _ := geometryFixture()
	r := &runtime{home: config.Home, id: id, geometry: g}
	r.geometryCtx, r.geometryCancel = context.WithCancel(context.Background())
	entered := make(chan struct{})
	g.setClip = func(ctx context.Context, _ viewport.Size) error { close(entered); <-ctx.Done(); return ctx.Err() }
	done := make(chan error, 1)
	go func() { _, err := r.resize(context.Background(), viewport.Size{Width: 390, Height: 812}); done <- err }()
	<-entered
	r.stop()
	if err := <-done; err == nil {
		t.Fatal("cancelled resize succeeded")
	}
	configs := f.configs
	if _, err := r.resize(context.Background(), viewport.Initial); err == nil || f.configs != configs {
		t.Fatal("mutation after stop")
	}
}

func TestViewportRollbackCannotConfirmPreviouslyMixedState(t *testing.T) {
	c, f, _, _ := geometryFixture()
	f.windows[0].Width = 900
	c.setClip = func(context.Context, viewport.Size) error { return errors.New("clip unavailable") }
	if _, err := c.apply(context.Background(), viewport.Initial); err == nil {
		t.Fatal("failed resize succeeded")
	}
	if c.confirmed {
		t.Fatal("rollback confirmed a pre-existing mismatch")
	}
}
