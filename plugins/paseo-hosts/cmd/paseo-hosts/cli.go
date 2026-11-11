package main

import (
	"context"
	"flag"
	"fmt"
	"io"
	"os"
	"os/signal"
	"strings"

	"github.com/michielvha/logger"
	"github.com/michielvha/vh-adlc/plugins/paseo-hosts/internal/clientapp"
	"github.com/michielvha/vh-adlc/plugins/paseo-hosts/internal/config"
	"github.com/michielvha/vh-adlc/plugins/paseo-hosts/internal/link"
	"github.com/michielvha/vh-adlc/plugins/paseo-hosts/internal/onboard"
	"github.com/michielvha/vh-adlc/plugins/paseo-hosts/internal/registry"
	"github.com/michielvha/vh-adlc/plugins/paseo-hosts/internal/remove"
	"github.com/michielvha/vh-adlc/plugins/paseo-hosts/internal/report"
	"github.com/michielvha/vh-adlc/plugins/paseo-hosts/internal/runtime"
)

const usage = `paseo-hosts onboards Linux servers as SSH-only Paseo daemons and links the
Paseo desktop app on clients to them.

Usage:
  paseo-hosts <command> [flags]

Commands:
  onboard <alias>    Install or refresh a server's daemon, password and exposure, then verify authentication
  link <alias>       Give a client a tunnel-only key and alias for a server and add the server to the client's desktop app
  unlink <alias>     Take one client off a server: its app entry, its alias block and its key line on the server
  remove <alias>     Unlink every client of a server, delete its daemon service, route and config, and its registry entry
  verify <alias>     Check that the daemon rejects a connection without a password and accepts the stored one
  status <alias>     Print a server's exposure, daemon port, URL, clients and agent CLIs
  list               Print every server in the registry
  password <alias>   Print a server's password; pipe it, never paste it

Terms:
  Server       a Linux machine, reached by an SSH alias, that runs a Paseo daemon
  Client       a Mac or Windows PC that runs the Paseo desktop app, reached by an SSH alias
  Registry     the <alias>.env and <alias>.password files in PASEO_HOSTS_DIR
  SSH-only     the daemon listens on loopback and is reachable only through an SSH forward
  Published    SSH-only plus one tailnet-only HTTPS route on the server

Global flags:
  --json     print one JSON object with schema_version, command, result and data on standard output
  --plain    use ASCII words instead of symbols in status lines

Variables: PASEO_HOSTS_DIR, PASEO_HOSTS_CLIENT, PASEO_HOSTS_VERSION, PASEO_HOSTS_LISTEN_PORT,
PASEO_HOSTS_SERVE_PORT, PASEO_HOSTS_CACHE, PASEO_HOSTS_CLIENT_KEY.

Exit codes: 0 success, 1 a failed check or remote step, 2 usage, 3 missing configuration,
4 an unsupported client.

Run 'paseo-hosts <command> --help' for a command's flags.
`

// command is one subcommand: its synopsis, flags and action.
type command struct {
	synopsis string
	flags    func(*flag.FlagSet, *options)
	args     int
	run      func(ctx context.Context, o *options) (any, error)
}

// options holds every flag value and the shared state of one invocation.
type options struct {
	alias      string
	client     string
	clients    list
	listenPort int
	servePort  int
	clientHost string
	publish    bool
	noApp      bool
	serverOnly bool
	noClients  bool
	skipServer bool
	purge      bool
	cfg        config.Config
	rep        *report.Reporter
	stdout     io.Writer
}

type list []string

func (l *list) String() string     { return strings.Join(*l, ",") }
func (l *list) Set(v string) error { *l = append(*l, v); return nil }

var commands = map[string]command{
	"onboard": {
		synopsis: "onboard <alias> [--publish] [--listen-port N] [--serve-port N] [--client-host HOST]",
		flags: func(fs *flag.FlagSet, o *options) {
			fs.BoolVar(&o.publish, "publish", false, "add one tailnet-only HTTPS route to the daemon")
			fs.IntVar(&o.listenPort, "listen-port", 0, "daemon port for a new server (default PASEO_HOSTS_LISTEN_PORT or 6767)")
			fs.IntVar(&o.servePort, "serve-port", 0, "tailnet HTTPS port with --publish (default PASEO_HOSTS_SERVE_PORT or 8956)")
			fs.StringVar(&o.clientHost, "client-host", "", "host name clients use to reach the server")
		},
		args: 1,
		run: func(ctx context.Context, o *options) (any, error) {
			return onboard.Run(ctx, onboard.Options{
				Alias: o.alias, Config: o.cfg, ListenPortFlag: o.listenPort, ServePortFlag: o.servePort,
				Publish: o.publish, ClientHost: o.clientHost, Report: o.rep,
			})
		},
	},
	"link": {
		synopsis: "link <alias> [--client CLIENT] [--no-app]",
		flags: func(fs *flag.FlagSet, o *options) {
			fs.StringVar(&o.client, "client", "", "SSH alias of the client (default PASEO_HOSTS_CLIENT)")
			fs.BoolVar(&o.noApp, "no-app", false, "set up SSH access only; leave the desktop app alone")
		},
		args: 1,
		run: func(ctx context.Context, o *options) (any, error) {
			client, err := o.cfg.RequireClient()
			if err != nil {
				return nil, err
			}
			lo := link.Options{Alias: o.alias, Client: client, Config: o.cfg, NoApp: o.noApp, Report: o.rep}
			if !o.noApp {
				app, err := desktopApp(ctx, o)
				if err != nil {
					return nil, err
				}
				lo.App = app.Add
			}
			return link.Run(ctx, lo)
		},
	},
	"unlink": {
		synopsis: "unlink <alias> --client CLIENT [--server-only]",
		flags: func(fs *flag.FlagSet, o *options) {
			fs.Var(&o.clients, "client", "SSH alias of the client to take off the server")
			fs.BoolVar(&o.serverOnly, "server-only", false, "do not contact the client; delete only its key line and registry record")
		},
		args: 1,
		run: func(ctx context.Context, o *options) (any, error) {
			ro := removeOptions(o)
			if !o.serverOnly {
				app, err := desktopApp(ctx, o)
				if err != nil {
					return nil, err
				}
				ro.App = app
			}
			return remove.Unlink(ctx, ro)
		},
	},
	"remove": {
		synopsis: "remove <alias> [--client CLIENT]... [--no-clients] [--skip-server] [--purge]",
		flags: func(fs *flag.FlagSet, o *options) {
			fs.Var(&o.clients, "client", "also unlink this client; repeat for more")
			fs.BoolVar(&o.noClients, "no-clients", false, "accept that unnamed clients keep their app entry and alias block")
			fs.BoolVar(&o.skipServer, "skip-server", false, "the server is gone; skip every step on it")
			fs.BoolVar(&o.purge, "purge", false, "delete all of ~/.local/share/paseo on the server")
		},
		args: 1,
		run: func(ctx context.Context, o *options) (any, error) {
			ro := removeOptions(o)
			app := &clientapp.App{Dir: o.cfg.Dir, Report: o.rep}
			if !o.skipServer {
				var err error
				if app, err = desktopApp(ctx, o); err != nil {
					return nil, err
				}
			}
			ro.App = app
			return remove.Remove(ctx, ro)
		},
	},
	"verify": {
		synopsis: "verify <alias>",
		args:     1,
		run: func(ctx context.Context, o *options) (any, error) {
			entry, password, err := load(o)
			if err != nil {
				return nil, err
			}
			rt, err := runtime.Ensure(ctx, o.cfg.Cache, o.cfg.Version)
			if err != nil {
				return nil, err
			}
			if err := onboard.Verify(ctx, rt, entry, password, o.rep); err != nil {
				return nil, err
			}
			return map[string]any{"alias": entry.Alias, "url": entry.URL}, nil
		},
	},
	"status": {
		synopsis: "status <alias>",
		args:     1,
		run: func(_ context.Context, o *options) (any, error) {
			entry, err := registry.Load(o.cfg.Dir, o.alias)
			if err != nil {
				return nil, err
			}
			return status(entry, o.rep), nil
		},
	},
	"list": {
		synopsis: "list",
		run: func(_ context.Context, o *options) (any, error) {
			entries, err := registry.List(o.cfg.Dir)
			if err != nil {
				return nil, err
			}
			out := []map[string]string{}
			for _, e := range entries {
				out = append(out, map[string]string{"alias": e.Alias, "ssh": e.SSH, "url": e.URL})
				o.rep.Data("%s\t%s\t%s", e.Alias, e.SSH, e.URL)
			}
			if len(out) == 0 {
				o.rep.Empty("No servers in %s", o.cfg.Dir)
			}
			return out, nil
		},
	},
	"password": {
		synopsis: "password <alias>",
		args:     1,
		run: func(_ context.Context, o *options) (any, error) {
			password, err := registry.ReadPassword(o.cfg.Dir, o.alias)
			if err != nil {
				return nil, err
			}
			if !o.rep.JSON() {
				_, _ = fmt.Fprintln(o.stdout, password)
			}
			return map[string]any{"alias": o.alias, "password": password}, nil
		},
	},
}

func run(args []string, _ io.Reader, stdout, stderr io.Writer, terminal bool) int {
	logger.InitWithOptions(logger.Options{Output: stderr})
	var jsonOut, plain, help bool
	var rest []string
	for i, a := range args {
		switch a {
		case "--json":
			jsonOut = true
		case "--plain":
			plain = true
		case "-h", "--help", "-help":
			help = true
		case "--":
			rest = append(rest, args[i:]...)
		default:
			rest = append(rest, a)
		}
		if a == "--" {
			break
		}
	}
	name := ""
	if len(rest) > 0 {
		name, rest = rest[0], rest[1:]
	}
	ro := report.Options{Command: name, Stdout: stdout, Stderr: stderr, JSON: jsonOut, Plain: plain, Terminal: terminal}
	if name == "help" || (name == "" && help) {
		ro.Command = "help"
		return showHelp(ro, usage)
	}
	rep := report.New(ro)
	cmd, ok := commands[name]
	if !ok {
		_, _ = fmt.Fprint(stderr, usage)
		if name == "" {
			return rep.Finish(report.Errorf(report.ExitUsage, "no command given"), nil)
		}
		return rep.Finish(report.Errorf(report.ExitUsage, "unknown command %q", name), nil)
	}

	o := &options{rep: rep, stdout: stdout}
	fs := flag.NewFlagSet(name, flag.ContinueOnError)
	fs.SetOutput(io.Discard)
	if cmd.flags != nil {
		cmd.flags(fs, o)
	}
	if help {
		return showHelp(ro, helpText(cmd, fs))
	}
	positional, err := parse(fs, rest)
	if err == nil && len(positional) != cmd.args {
		err = fmt.Errorf("want %d argument(s), got %d", cmd.args, len(positional))
	}
	if err != nil {
		_, _ = fmt.Fprint(stderr, helpText(cmd, fs))
		return rep.Finish(report.Errorf(report.ExitUsage, "%s: %v", name, err), nil)
	}
	if cmd.args == 1 {
		o.alias = positional[0]
		if !registry.ValidAlias(o.alias) {
			return rep.Finish(report.Errorf(report.ExitUsage, "invalid alias %q", o.alias), nil)
		}
	}
	if o.cfg, err = config.Load(os.Getenv, config.Flags{Client: o.client, ListenPort: o.listenPort, ServePort: o.servePort}); err != nil {
		return rep.Finish(err, nil)
	}
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt)
	defer stop()
	data, err := cmd.run(ctx, o)
	return rep.Finish(err, data)
}

// parse lets flags and arguments come in any order.
func parse(fs *flag.FlagSet, args []string) ([]string, error) {
	var positional []string
	for {
		if err := fs.Parse(args); err != nil {
			return nil, err
		}
		args = fs.Args()
		if len(args) == 0 {
			return positional, nil
		}
		if args[0] == "--" {
			return append(positional, args[1:]...), nil
		}
		positional = append(positional, args[0])
		args = args[1:]
	}
}

// showHelp prints help text, or with --json one result object holding it.
func showHelp(o report.Options, text string) int {
	if !o.JSON {
		_, _ = fmt.Fprint(o.Stdout, text)
		return report.ExitOK
	}
	return report.New(o).Finish(nil, map[string]any{"usage": text})
}

func helpText(cmd command, fs *flag.FlagSet) string {
	var b strings.Builder
	_, _ = fmt.Fprintf(&b, "Usage:\n  paseo-hosts %s [--json] [--plain]\n", cmd.synopsis)
	first := true
	fs.VisitAll(func(f *flag.Flag) {
		if first {
			b.WriteString("\nFlags:\n")
			first = false
		}
		_, _ = fmt.Fprintf(&b, "  --%-14s %s\n", f.Name, f.Usage)
	})
	return b.String()
}

func desktopApp(ctx context.Context, o *options) (*clientapp.App, error) {
	rt, err := runtime.Ensure(ctx, o.cfg.Cache, o.cfg.Version)
	if err != nil {
		return nil, err
	}
	return &clientapp.App{Dir: o.cfg.Dir, Paseo: rt.Paseo(), Report: o.rep}, nil
}

func removeOptions(o *options) remove.Options {
	return remove.Options{
		Alias: o.alias, Clients: o.clients, ServerOnly: o.serverOnly, NoClients: o.noClients,
		SkipServer: o.skipServer, Purge: o.purge, Config: o.cfg, Report: o.rep,
	}
}

func load(o *options) (*registry.Entry, string, error) {
	entry, err := registry.Load(o.cfg.Dir, o.alias)
	if err != nil {
		return nil, "", err
	}
	password, err := registry.ReadPassword(o.cfg.Dir, o.alias)
	if err != nil {
		return nil, "", err
	}
	return entry, password, nil
}

type clientStatus struct {
	Name      string `json:"name"`
	RemoteSSH string `json:"remote_ssh"`
}

type statusData struct {
	Alias      string         `json:"alias"`
	SSH        string         `json:"ssh"`
	Exposure   string         `json:"exposure"`
	DaemonPort int            `json:"daemon_port"`
	URL        string         `json:"url"`
	Clients    []clientStatus `json:"clients"`
	Agents     string         `json:"agents"`
}

func status(e *registry.Entry, rep *report.Reporter) statusData {
	s := statusData{Alias: e.Alias, SSH: e.SSH, Exposure: "ssh-only", DaemonPort: e.ListenPort, URL: e.URL, Clients: []clientStatus{}, Agents: e.Agents}
	if e.Published {
		s.Exposure = "tailnet"
	}
	for _, c := range e.Clients {
		s.Clients = append(s.Clients, clientStatus{Name: c, RemoteSSH: fmt.Sprintf("ssh://%s?daemonPort=%d", link.SSHAlias(e.Alias), e.ListenPort)})
	}
	rep.Data("alias:       %s", s.Alias)
	rep.Data("ssh:         %s", s.SSH)
	rep.Data("exposure:    %s", s.Exposure)
	rep.Data("daemon port: %d", s.DaemonPort)
	rep.Data("url:         %s", s.URL)
	if len(s.Clients) == 0 {
		rep.Data("clients:     none")
	}
	for _, c := range s.Clients {
		rep.Data("client:      %s, Remote SSH %s", c.Name, c.RemoteSSH)
	}
	rep.Data("agents:      %s", s.Agents)
	return s
}
