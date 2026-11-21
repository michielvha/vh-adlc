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
	worker   *child
	conn     net.Conn
	address  string
	// The query lock serializes requests.
	sequence uint64
}

type mobileSample struct {
	Sequence uint64        `json:"sequence"`
	Field    *mobile.Field `json:"field"`
}

const mobilePacketSize = 512

var errMobileFocusUnavailable = errors.New("mobile-focus-unavailable")

func (f *mobileFocus) live() bool {
	return f != nil && state.Alive(f.bus.identity) && state.Alive(f.registry.identity) && state.Alive(f.worker.identity)
}

func mobileResource(role string) bool {
	return role == "mobile-accessibility-bus" || role == "mobile-accessibility-registry" || role == "mobile-accessibility-worker"
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
	daemon, err := exec.LookPath("dbus-daemon")
	registry := accessibilityRegistry()
	if err != nil || registry == "" {
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
	var registryProcess *child
	defer func() {
		if r.mobile == nil {
			if registryProcess != nil {
				_ = state.Signal(registryProcess.identity, syscall.SIGTERM)
			}
			_ = state.Signal(bus.identity, syscall.SIGTERM)
		}
	}()
	socket := "\x00remote-gui-a11y-" + r.id
	for range 15 {
		conn, err := net.DialTimeout("unix", socket, 20*time.Millisecond)
		if err == nil {
			_ = conn.Close()
			registryProcess, err = r.spawn("mobile-accessibility-registry", registry, nil,
				append(append([]string(nil), r.env...), "DBUS_SESSION_BUS_ADDRESS="+address, "AT_SPI_BUS_ADDRESS="+address))
			if err != nil {
				return
			}
			focus := &mobileFocus{bus: bus, registry: registryProcess, address: address}
			if r.startMobileWorker(ctx, focus) == nil {
				r.mobile = focus
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

// A connected packet socket keeps requests private to the two owned processes.
// Packet boundaries keep a canceled read from consuming part of the next reply.
func (r *runtime) startMobileWorker(ctx context.Context, focus *mobileFocus) error {
	pair, err := syscall.Socketpair(syscall.AF_UNIX, syscall.SOCK_SEQPACKET|syscall.SOCK_CLOEXEC, 0)
	if err != nil {
		return errMobileFocusUnavailable
	}
	parent := os.NewFile(uintptr(pair[0]), "focus-supervisor")
	peer := os.NewFile(uintptr(pair[1]), "focus-worker")
	conn, err := net.FileConn(parent)
	_ = parent.Close()
	if err != nil {
		_ = peer.Close()
		return errMobileFocusUnavailable
	}
	cmd := exec.Command("/usr/bin/python3", "-I", "-c", mobileFocusScript, focus.address)
	cmd.ExtraFiles = []*os.File{peer}
	worker, err := r.startChild("mobile-accessibility-worker", cmd, r.env)
	_ = peer.Close()
	if err != nil {
		_ = conn.Close()
		return err
	}
	go func() {
		<-worker.done
		_ = conn.Close()
	}()
	ctx, cancel := context.WithTimeout(ctx, time.Second)
	defer cancel()
	deadline, _ := ctx.Deadline()
	if conn.SetReadDeadline(deadline) == nil {
		var ready [1]byte
		if n, err := conn.Read(ready[:]); err == nil && n == 1 && ready[0] == 1 && ctx.Err() == nil {
			focus.conn, focus.worker = conn, worker
			return nil
		}
	}
	_ = state.Signal(worker.identity, syscall.SIGTERM)
	_ = conn.Close()
	return errMobileFocusUnavailable
}

func (f *mobileFocus) sample(ctx context.Context, pid, x, y int) (mobileSample, error) {
	var sample mobileSample
	ctx, cancel := context.WithTimeout(ctx, 370*time.Millisecond)
	defer cancel()
	deadline, _ := ctx.Deadline()
	if ctx.Err() != nil || f.conn.SetDeadline(deadline) != nil {
		return sample, errMobileFocusUnavailable
	}
	interrupted := make(chan struct{})
	stop := context.AfterFunc(ctx, func() {
		_ = f.conn.SetDeadline(time.Now())
		close(interrupted)
	})
	defer func() {
		if !stop() {
			<-interrupted
		}
	}()
	f.sequence++
	request, err := json.Marshal([4]uint64{f.sequence, uint64(pid), uint64(x), uint64(y)})
	if err != nil {
		return sample, errMobileFocusUnavailable
	}
	if _, err := f.conn.Write(request); err != nil {
		return sample, errMobileFocusUnavailable
	}
	// A query can outlive its HTTP request. Discard its reply before trying
	// to use a newer one, within the newer query's own deadline.
	for {
		var packet [mobilePacketSize + 1]byte
		n, err := f.conn.Read(packet[:])
		if err != nil || n > mobilePacketSize || ctx.Err() != nil {
			return mobileSample{}, errMobileFocusUnavailable
		}
		sample = mobileSample{}
		if json.Unmarshal(packet[:n], &sample) != nil || sample.Sequence == 0 || sample.Sequence > f.sequence {
			return mobileSample{}, errMobileFocusUnavailable
		}
		if sample.Sequence == f.sequence {
			return sample, nil
		}
	}
}

func (r *runtime) editableAt(ctx context.Context, x, y int) (*mobile.Field, error) {
	if !r.mobileQuery.TryLock() {
		return nil, errMobileFocusUnavailable
	}
	defer r.mobileQuery.Unlock()
	if !r.mu.TryLock() {
		return nil, errMobileFocusUnavailable
	}
	browser, phase, helper := r.chrome, r.generation.Load(), r.mobile
	epoch := r.mobilePhase.Load()
	ready := !r.stopped && r.modeReady && browser != nil && helper.live() && r.mobileScalePhase == phase
	r.mu.Unlock()
	if !ready || !state.Alive(browser.identity) {
		return nil, errMobileFocusUnavailable
	}
	sample, err := helper.sample(ctx, browser.identity.PID, x, y)
	if err != nil {
		return nil, err
	}
	if !r.mu.TryLock() {
		return nil, errMobileFocusUnavailable
	}
	defer r.mu.Unlock()
	if r.stopped || !r.modeReady || r.chrome != browser || r.generation.Load() != phase || r.mobilePhase.Load() != epoch || !state.Alive(browser.identity) || !helper.live() {
		return nil, errMobileFocusUnavailable
	}
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
