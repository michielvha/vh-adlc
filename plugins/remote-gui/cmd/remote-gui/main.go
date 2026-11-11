package main

import (
	"context"
	"errors"
	"os"
	"time"

	"github.com/michielvha/vh-adlc/plugins/remote-gui/internal/app"
	"github.com/michielvha/vh-adlc/plugins/remote-gui/internal/browser"
	"github.com/michielvha/vh-adlc/plugins/remote-gui/internal/config"
	"github.com/michielvha/vh-adlc/plugins/remote-gui/internal/session"
)

func main() {
	session.BrowserLauncher = browser.Start
	if handled, code := session.Internal(os.Args[1:]); handled {
		os.Exit(code)
	}
	os.Exit(app.RunWith(os.Args[1:], os.Stdout, execute))
}

func execute(c config.Config) (any, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	reconciled, err := session.Cleanup(ctx, c.Home)
	if err != nil {
		return nil, err
	}
	switch c.Command {
	case "start", "share":
		return session.Start(c)
	case "status":
		if c.ID != "" {
			return session.Read(c.Home, c.ID)
		}
		return struct {
			SchemaVersion int            `json:"schema_version"`
			Result        string         `json:"result"`
			Sessions      []session.View `json:"sessions"`
		}{1, "observed", reconciled}, nil
	case "access":
		return session.Access(c.Home, c.ID, c.Reveal)
	case "handoff":
		return session.Handoff(c.Home, c.ID, c.Mode())
	case "stop":
		return session.Stop(c.Home, c.ID)
	case "cleanup":
		return struct {
			SchemaVersion int            `json:"schema_version"`
			Result        string         `json:"result"`
			Sessions      []session.View `json:"sessions"`
		}{1, "reconciled", reconciled}, nil
	}
	return nil, errors.New("unsupported-lifecycle-command")
}
