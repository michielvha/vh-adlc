package browser

import (
	"context"
	_ "embed"
	"encoding/json"
	"errors"
	"fmt"
	"net"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
	"syscall"
	"time"

	"github.com/michielvha/vh-adlc/plugins/remote-gui/internal/mobile"
	"github.com/michielvha/vh-adlc/plugins/remote-gui/internal/state"
)

//go:embed mobile_focus.py
var mobileFocusScript string

type mobileFocus struct {
	bus      *child
	registry *child
	address  string
	// The query lock serializes access to the last verified reference.
	hint      string
	hintEpoch uint64
}

func (f *mobileFocus) live() bool {
	return f != nil && state.Alive(f.bus.identity) && state.Alive(f.registry.identity)
}

func mobileResource(role string) bool {
	return role == "mobile-accessibility-bus" || role == "mobile-accessibility-registry"
}

func accessibilityRegistry() string {
	for _, file := range []string{"/usr/libexec/at-spi2-registryd", "/usr/lib/at-spi2-core/at-spi2-registryd"} {
		info, err := os.Stat(file)
		if err == nil && info.Mode().IsRegular() && info.Mode().Perm()&0o111 != 0 {
			return file
		}
	}
	return ""
}

// The private bus has no services or activation directories. Its abstract
// socket needs no on-disk lease and only accepts the host user's credentials.
func (r *runtime) startMobileFocus(ctx context.Context) {
	const python = "/usr/bin/python3"
	daemon, err := exec.LookPath("dbus-daemon")
	registry := accessibilityRegistry()
	if err != nil || registry == "" {
		return
	}
	probe, cancel := context.WithTimeout(ctx, 500*time.Millisecond)
	defer cancel()
	if exec.CommandContext(probe, python, "-I", "-c", "import dbus, gi; gi.require_version('Atspi', '2.0')").Run() != nil {
		return
	}
	address := "unix:abstract=remote-gui-a11y-" + r.id
	config := fmt.Sprintf(`<busconfig><type>session</type><listen>%s</listen><auth>EXTERNAL</auth>
<policy context="default"><deny user="*"/><allow user="%d"/></policy>
<policy user="%d"><allow own="*"/><allow send_destination="*"/><allow receive_sender="*"/></policy></busconfig>`, address, os.Getuid(), os.Getuid())
	file := filepath.Join(r.home, r.id, "mobile-bus.xml")
	if os.WriteFile(file, []byte(config), 0o600) != nil {
		return
	}
	bus, err := r.spawn("mobile-accessibility-bus", daemon, []string{"--nofork", "--config-file=" + file}, r.env)
	if err != nil {
		return
	}
	var helper *child
	defer func() {
		if r.mobile == nil {
			if helper != nil {
				_ = state.Signal(helper.identity, syscall.SIGTERM)
			}
			_ = state.Signal(bus.identity, syscall.SIGTERM)
		}
	}()
	socket := "\x00remote-gui-a11y-" + r.id
	for range 15 {
		conn, err := net.DialTimeout("unix", socket, 20*time.Millisecond)
		if err == nil {
			_ = conn.Close()
			helper, err = r.spawn("mobile-accessibility-registry", registry, nil,
				append(append([]string(nil), r.env...), "DBUS_SESSION_BUS_ADDRESS="+address, "AT_SPI_BUS_ADDRESS="+address))
			if err == nil && registryReady(ctx, address) {
				r.mobile = &mobileFocus{bus: bus, registry: helper, address: address}
				r.mobilePhase.Store(1)
			}
			return
		}
		if ctx.Err() != nil || !state.Alive(bus.identity) {
			return
		}
		time.Sleep(20 * time.Millisecond)
	}
}

func registryReady(ctx context.Context, address string) bool {
	ctx, cancel := context.WithTimeout(ctx, 500*time.Millisecond)
	defer cancel()
	// The registry must own its name before Chromium tries to register.
	const check = `import dbus, sys, time
bus = dbus.bus.BusConnection(sys.argv[1])
for _ in range(20):
    if bus.name_has_owner("org.a11y.atspi.Registry"):
        sys.exit(0)
    time.sleep(.02)
sys.exit(1)
`
	return exec.CommandContext(ctx, "/usr/bin/python3", "-I", "-c", check, address).Run() == nil
}

func (r *runtime) editableAt(ctx context.Context, x, y int) (*mobile.Field, error) {
	if !r.mobileQuery.TryLock() {
		return nil, errors.New("mobile-focus-unavailable")
	}
	defer r.mobileQuery.Unlock()
	if !r.mu.TryLock() {
		return nil, errors.New("mobile-focus-unavailable")
	}
	browser, phase, helper := r.chrome, r.generation.Load(), r.mobile
	epoch := r.mobilePhase.Load()
	ready := !r.stopped && r.modeReady && browser != nil && helper.live() && r.mobileScalePhase == phase
	r.mu.Unlock()
	if !ready || !state.Alive(browser.identity) {
		return nil, errors.New("mobile-focus-unavailable")
	}
	ctx, cancel := context.WithTimeout(ctx, 370*time.Millisecond)
	defer cancel()
	hint := ""
	if helper.hintEpoch == epoch {
		hint = helper.hint
	}
	cmd := exec.CommandContext(ctx, "/usr/bin/python3", "-I", "-c", mobileFocusScript,
		helper.address, strconv.Itoa(browser.identity.PID), strconv.Itoa(x), strconv.Itoa(y), hint)
	result, err := cmd.Output()
	if err != nil {
		return nil, errors.New("mobile-focus-unavailable")
	}
	var sample struct {
		Field *mobile.Field `json:"field"`
		Path  string        `json:"path"`
	}
	if len(result) > 512 || json.Unmarshal(result, &sample) != nil {
		return nil, errors.New("mobile-focus-unavailable")
	}
	if !r.mu.TryLock() {
		return nil, errors.New("mobile-focus-unavailable")
	}
	defer r.mu.Unlock()
	if r.stopped || !r.modeReady || r.chrome != browser || r.generation.Load() != phase || r.mobilePhase.Load() != epoch || !state.Alive(browser.identity) || !helper.live() {
		return nil, errors.New("mobile-focus-unavailable")
	}
	helper.hint, helper.hintEpoch = sample.Path, epoch
	if sample.Field != nil {
		sample.Field.Phase = epoch
	}
	return sample.Field, nil
}

// Verify the owned launch used a single explicit unit scale before treating
// screen DIPs as pixels of the owned zero-offset framebuffer.
func usesUnitDeviceScale(args []string) bool {
	seen := false
	for _, part := range args {
		if part == "--force-device-scale-factor" || strings.HasPrefix(part, "--force-device-scale-factor=") {
			if seen || part != "--force-device-scale-factor=1" {
				return false
			}
			seen = true
		}
	}
	return seen
}
