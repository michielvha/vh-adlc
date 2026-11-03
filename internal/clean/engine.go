package clean

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net"
	"net/http"
	"strings"
	"syscall"
	"time"

	"github.com/michielvha/vh-adlc/internal/report"
)

// DefaultDockerSocket is read when DOCKER_HOST is unset.
const DefaultDockerSocket = "/var/run/docker.sock"

// ResolveSocket picks the engine socket the Docker CLI would use without a
// context: DOCKER_HOST when it is unix://, otherwise the default socket. A
// tcp:// or ssh:// DOCKER_HOST reads as no engine, a stated limit, so ok is
// false.
func ResolveSocket(dockerHost string) (socket string, ok bool) {
	switch {
	case dockerHost == "":
		return DefaultDockerSocket, true
	case strings.HasPrefix(dockerHost, "unix://"):
		return strings.TrimPrefix(dockerHost, "unix://"), true
	default:
		return "", false
	}
}

// Engine is a small Docker Engine API client on a Unix socket. It never sends
// a force parameter.
type Engine struct {
	client *http.Client
}

// NewEngine returns a client for the socket.
func NewEngine(socket string) *Engine {
	return &Engine{client: &http.Client{
		Timeout: 2 * time.Minute,
		Transport: &http.Transport{
			DialContext: func(ctx context.Context, _, _ string) (net.Conn, error) {
				var d net.Dialer
				return d.DialContext(ctx, "unix", socket)
			},
		},
	}}
}

// container is the part of a container listing clean reads.
type container struct {
	ID     string            `json:"Id"`
	Names  []string          `json:"Names"`
	State  string            `json:"State"`
	Labels map[string]string `json:"Labels"`
	Mounts []mount           `json:"Mounts"`
}

type mount struct {
	Type   string `json:"Type"`
	Source string `json:"Source"`
}

type network struct {
	ID     string            `json:"Id"`
	Name   string            `json:"Name"`
	Labels map[string]string `json:"Labels"`
}

type volume struct {
	Name   string            `json:"Name"`
	Labels map[string]string `json:"Labels"`
}

// engineState is one listing of the engine. Absent means no engine runs: the
// socket is missing or refuses, or DOCKER_HOST is not a Unix socket.
type engineState struct {
	Absent     bool
	Containers []container
}

// binds are the host paths containers bind-mount.
func (s engineState) binds() []string {
	var out []string
	for _, c := range s.Containers {
		for _, m := range c.Mounts {
			if m.Type == "bind" && m.Source != "" {
				out = append(out, m.Source)
			}
		}
	}
	return out
}

// listEngine lists every container. A missing or refusing socket is an
// absent engine; permission denied, any other error or a failed listing is a
// failed check, reported as engine-unreachable.
func listEngine(ctx context.Context, e *Engine) (engineState, error) {
	if e == nil {
		return engineState{Absent: true}, nil
	}
	var cs []container
	err := e.get(ctx, "/containers/json?all=1", &cs)
	switch {
	case err == nil:
		return engineState{Containers: cs}, nil
	case errors.Is(err, syscall.ENOENT), errors.Is(err, syscall.ECONNREFUSED):
		return engineState{Absent: true}, nil
	default:
		return engineState{}, coded(report.CodeEngineUnreachable, "listing containers: %v", err)
	}
}

func (e *Engine) get(ctx context.Context, path string, out any) error {
	resp, err := e.request(ctx, http.MethodGet, path)
	if err != nil {
		return err
	}
	defer func() { _ = resp.Body.Close() }()
	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("GET %s: %s", path, resp.Status)
	}
	if err := json.NewDecoder(resp.Body).Decode(out); err != nil {
		return fmt.Errorf("GET %s: decoding: %w", path, err)
	}
	return nil
}

func (e *Engine) request(ctx context.Context, method, path string) (*http.Response, error) {
	req, err := http.NewRequestWithContext(ctx, method, "http://docker"+path, nil)
	if err != nil {
		return nil, err
	}
	return e.client.Do(req)
}
