// Package config parses the public CLI without executing host operations.
package config

import (
	"errors"
	"flag"
	"io"
	"net/netip"
	"net/url"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"
)

type Config struct {
	Command   string        `json:"command"`
	Kind      string        `json:"kind"`
	ID        string        `json:"id,omitempty"`
	Target    string        `json:"target,omitempty"`
	Transport string        `json:"transport"`
	Home      string        `json:"home"`
	TTL       time.Duration `json:"ttl"`
	Reveal    bool          `json:"-"`
}

func Parse(args []string) (Config, error) {
	c := Config{Kind: "share", Transport: "tailscale", TTL: 2 * time.Hour, Home: os.Getenv("REMOTE_GUI_HOME")}
	if c.Home == "" {
		base := os.Getenv("XDG_STATE_HOME")
		if base == "" {
			home, err := os.UserHomeDir()
			if err != nil {
				return c, errors.New("private state directory unavailable")
			}
			base = filepath.Join(home, ".local", "state")
		}
		c.Home = filepath.Join(base, "remote-gui", "sessions")
	}
	if len(args) == 0 {
		c.Command = "help"
		return c, nil
	}
	c.Command = args[0]
	if c.Command == "--help" || c.Command == "-h" {
		c.Command = "help"
	}
	switch c.Command {
	case "help", "doctor", "share", "start", "status", "access", "stop", "cleanup":
	default:
		return c, errors.New("unknown command; use remote-gui help")
	}
	fs := flag.NewFlagSet("remote-gui", flag.ContinueOnError)
	fs.SetOutput(io.Discard)
	fs.StringVar(&c.Kind, "kind", c.Kind, "")
	fs.StringVar(&c.Transport, "transport", c.Transport, "")
	fs.DurationVar(&c.TTL, "ttl", c.TTL, "")
	fs.StringVar(&c.Home, "home", c.Home, "")
	fs.BoolVar(&c.Reveal, "reveal", false, "")
	var jsonOutput bool
	fs.BoolVar(&jsonOutput, "json", true, "")
	var flags, positionals []string
	for i := 1; i < len(args); i++ {
		a := args[i]
		if strings.HasPrefix(a, "-") {
			flags = append(flags, a)
			key, _, inline := strings.Cut(a, "=")
			if !inline && key != "--reveal" && key != "--json" {
				if i+1 >= len(args) {
					return c, errors.New("missing option value")
				}
				i++
				flags = append(flags, args[i])
			}
		} else {
			positionals = append(positionals, a)
		}
	}
	if err := fs.Parse(flags); err != nil {
		return c, errors.New("invalid option; use remote-gui help")
	}
	if c.Kind != "share" && c.Kind != "browser" {
		return c, errors.New("kind must be share or browser")
	}
	if c.Transport != "tailscale" && c.Transport != "loopback" {
		return c, errors.New("transport must be tailscale or loopback")
	}
	if c.TTL <= 0 || c.TTL > 8*time.Hour {
		return c, errors.New("ttl must be positive and no more than eight hours")
	}
	if !filepath.IsAbs(c.Home) {
		return c, errors.New("state directory must be absolute")
	}
	c.Home = filepath.Clean(c.Home)
	switch c.Command {
	case "share":
		if len(positionals) != 1 {
			return c, errors.New("share requires one local HTTP URL")
		}
		u, err := Target(positionals[0])
		if err != nil {
			return c, err
		}
		c.Target = u.String()
		c.Kind = "share"
	case "start":
		c.Kind = "browser"
		if len(positionals) != 0 {
			return c, errors.New("start does not accept an existing profile or target")
		}
	case "access", "stop":
		if len(positionals) != 1 || !ValidID(positionals[0]) {
			return c, errors.New("a valid session ID is required")
		}
		c.ID = positionals[0]
	case "status":
		if len(positionals) > 1 {
			return c, errors.New("status accepts at most one session")
		}
		if len(positionals) == 1 {
			if !ValidID(positionals[0]) {
				return c, errors.New("invalid session ID")
			}
			c.ID = positionals[0]
		}
	default:
		if len(positionals) != 0 {
			return c, errors.New("unexpected positional argument")
		}
	}
	if c.Reveal && c.Command != "access" {
		return c, errors.New("reveal is allowed only with access")
	}
	return c, nil
}

func ValidID(s string) bool {
	if len(s) != 32 {
		return false
	}
	for _, r := range s {
		if !strings.ContainsRune("0123456789abcdef", r) {
			return false
		}
	}
	return true
}

// Target accepts only concrete loopback HTTP services, never browser-control routes.
func Target(raw string) (*url.URL, error) {
	u, err := url.Parse(raw)
	if err != nil || u.Scheme != "http" || u.User != nil || u.Fragment != "" || u.Opaque != "" {
		return nil, errors.New("target must be a loopback HTTP URL without credentials or fragment")
	}
	host := u.Hostname()
	if host == "localhost" {
		host = "127.0.0.1"
	}
	ip, err := netip.ParseAddr(host)
	if err != nil || !ip.Unmap().IsLoopback() {
		return nil, errors.New("only loopback application targets are supported")
	}
	port, err := strconv.Atoi(u.Port())
	if err != nil || port < 1 || port > 65535 {
		return nil, errors.New("target needs a valid explicit port")
	}
	lower := strings.ToLower(u.Path)
	if strings.HasPrefix(lower, "/devtools") || strings.HasPrefix(lower, "/json") || strings.HasPrefix(lower, "/__remote_gui") {
		return nil, errors.New("browser-control and reserved paths cannot be shared")
	}
	if ip.Is6() {
		u.Host = "[" + ip.String() + "]:" + strconv.Itoa(port)
	} else {
		u.Host = ip.String() + ":" + strconv.Itoa(port)
	}
	return u, nil
}
