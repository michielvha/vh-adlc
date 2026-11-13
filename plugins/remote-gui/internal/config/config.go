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
	"regexp"
	"strconv"
	"strings"
	"time"
	"unicode"
	"unicode/utf8"
)

type Config struct {
	Profile            string        `json:"profile,omitempty"`
	ProfileHome        string        `json:"profile_home,omitempty"`
	AgentStartApproved bool          `json:"agent_start_approved,omitempty"`
	ProfileAction      string        `json:"-"`
	BrowserMode        string        `json:"browser_mode,omitempty"`
	OwnerLogin         string        `json:"owner_login,omitempty"`
	Command            string        `json:"command"`
	Kind               string        `json:"kind"`
	ID                 string        `json:"id,omitempty"`
	Target             string        `json:"target,omitempty"`
	Transport          string        `json:"transport"`
	Home               string        `json:"home"`
	TTL                time.Duration `json:"ttl"`
	Reveal             bool          `json:"-"`
}

var profileName = regexp.MustCompile(`^[a-z0-9][a-z0-9-]{0,39}$`)

// ValidProfileName keeps a profile name a single private path element.
func ValidProfileName(name string) bool { return profileName.MatchString(name) }

func stateBase() (string, error) {
	base := os.Getenv("XDG_STATE_HOME")
	if base == "" {
		home, err := os.UserHomeDir()
		if err != nil {
			return "", errors.New("private state directory unavailable")
		}
		base = filepath.Join(home, ".local", "state")
	}
	return filepath.Join(base, "remote-gui"), nil
}

func Parse(args []string) (Config, error) {
	c := Config{Kind: "share", Transport: "tailscale", TTL: 2 * time.Hour, Home: os.Getenv("REMOTE_GUI_HOME")}
	homeOverridden := c.Home != ""
	if c.Home == "" {
		base, err := stateBase()
		if err != nil {
			return c, err
		}
		c.Home = filepath.Join(base, "sessions")
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
	case "help", "doctor", "share", "start", "handoff", "status", "access", "stop", "cleanup", "profile":
	default:
		return c, errors.New("unknown command; use remote-gui help")
	}
	fs := flag.NewFlagSet("remote-gui", flag.ContinueOnError)
	fs.SetOutput(io.Discard)
	fs.StringVar(&c.OwnerLogin, "owner-login", "", "")
	fs.StringVar(&c.BrowserMode, "browser-mode", "", "")
	fs.StringVar(&c.Kind, "kind", c.Kind, "")
	fs.StringVar(&c.Transport, "transport", c.Transport, "")
	fs.DurationVar(&c.TTL, "ttl", c.TTL, "")
	fs.StringVar(&c.Home, "home", c.Home, "")
	fs.BoolVar(&c.Reveal, "reveal", false, "")
	fs.StringVar(&c.Profile, "profile", "", "")
	var profileHome string
	fs.StringVar(&profileHome, "profile-home", "", "")
	fs.BoolVar(&c.AgentStartApproved, "agent-start-approved", false, "")
	var jsonOutput bool
	fs.BoolVar(&jsonOutput, "json", true, "")
	var flags, positionals []string
	for i := 1; i < len(args); i++ {
		a := args[i]
		// A profile name to delete is always the positional after delete, so a
		// leading hyphen reports an invalid name instead of an unknown option.
		if c.Command == "profile" && i == 2 && args[1] == "delete" {
			positionals = append(positionals, a)
			continue
		}
		if strings.HasPrefix(a, "-") {
			flags = append(flags, a)
			key, _, inline := strings.Cut(a, "=")
			if !inline && key != "--reveal" && key != "--json" && key != "--agent-start-approved" {
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
	provided := map[string]bool{}
	fs.Visit(func(option *flag.Flag) { provided[option.Name] = true })
	modeProvided := provided["browser-mode"]
	if provided["home"] {
		homeOverridden = true
	}
	if c.Command == "start" || c.Command == "handoff" {
		c.Kind = "browser"
	}
	if err := parseProfile(&c, positionals, provided, profileHome, homeOverridden); err != nil {
		return c, err
	}
	if c.Command == "profile" {
		positionals = nil
	}
	if modeProvided {
		if c.BrowserMode != "human" && c.BrowserMode != "agent" {
			return c, errors.New("browser-mode must be human or agent")
		}
		if c.Kind != "browser" || (c.Command != "start" && c.Command != "doctor" && c.Command != "handoff") {
			return c, errors.New("browser-mode requires a browser start, doctor or handoff command")
		}
	}
	if c.Command == "handoff" && !modeProvided {
		return c, errors.New("handoff requires an explicit browser-mode")
	}
	if c.Kind == "browser" {
		if c.Profile != "" && !modeProvided {
			c.BrowserMode = "human"
		}
		c.BrowserMode = c.Mode()
	}
	if c.Profile != "" && c.Command == "start" && c.BrowserMode == "agent" && !c.AgentStartApproved {
		return c, errors.New("profile-requires-human-start: start a profile session in human mode, or pass --agent-start-approved on the owner's explicit approval")
	}
	if c.AgentStartApproved && (c.Command != "start" || c.Profile == "" || c.BrowserMode != "agent") {
		return c, errors.New("agent-start-approved requires start --profile with --browser-mode agent")
	}
	if c.Kind != "share" && c.Kind != "browser" {
		return c, errors.New("kind must be share or browser")
	}
	if c.Transport != "tailscale" && c.Transport != "loopback" {
		return c, errors.New("transport must be tailscale or loopback")
	}
	if c.OwnerLogin != "" && (!ValidOwnerLogin(c.OwnerLogin) || c.Transport != "tailscale" || (c.Command != "start" && c.Command != "share" && c.Command != "doctor")) {
		return c, errors.New("owner-login requires one exact identity on a Tailscale create/doctor command")
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
	case "access", "stop", "handoff":
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

func parseProfile(c *Config, positionals []string, provided map[string]bool, profileHome string, homeOverridden bool) error {
	if c.Command == "profile" {
		switch {
		case len(positionals) == 1 && positionals[0] == "list":
			c.ProfileAction = "list"
		case len(positionals) == 2 && positionals[0] == "delete":
			c.ProfileAction = "delete"
			c.Profile = positionals[1]
			provided["profile"] = true
			if !ValidProfileName(c.Profile) {
				return errors.New("invalid-profile-name: use 1-40 lowercase letters, digits or hyphens, starting with a letter or digit")
			}
		default:
			return errors.New("profile requires list or delete <name>")
		}
	} else if provided["profile"] {
		if c.Command != "start" {
			return errors.New("profile is allowed only with start")
		}
		if !ValidProfileName(c.Profile) {
			return errors.New("invalid-profile-name: use 1-40 lowercase letters, digits or hyphens, starting with a letter or digit")
		}
	}
	if !provided["profile"] && c.Command != "profile" {
		if provided["profile-home"] {
			return errors.New("profile-home requires start --profile or a profile command")
		}
		return nil
	}
	if provided["profile-home"] {
		c.ProfileHome = profileHome
	} else if env := os.Getenv("REMOTE_GUI_PROFILE_HOME"); env != "" {
		c.ProfileHome = env
	} else if homeOverridden {
		return errors.New("profile-home-required: the sessions root is overridden; set REMOTE_GUI_PROFILE_HOME or --profile-home")
	} else {
		base, err := stateBase()
		if err != nil {
			return err
		}
		c.ProfileHome = filepath.Join(base, "profiles")
	}
	if !filepath.IsAbs(c.ProfileHome) {
		return errors.New("profile directory must be absolute")
	}
	c.ProfileHome = filepath.Clean(c.ProfileHome)
	return nil
}

// Mode preserves the agent-controlled behavior of records created before phases existed.
func (c Config) Mode() string {
	if c.BrowserMode == "" {
		return "agent"
	}
	return c.BrowserMode
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
	for key := range u.Query() {
		if strings.HasPrefix(strings.ToLower(key), "__remote_gui") {
			return nil, errors.New("reserved proxy query cannot be shared")
		}
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

func ValidOwnerLogin(login string) bool {
	if login == "" || len(login) > 320 || !utf8.ValidString(login) || strings.ContainsAny(login, ",*") {
		return false
	}
	for _, r := range login {
		if unicode.IsSpace(r) || unicode.IsControl(r) {
			return false
		}
	}
	return true
}
