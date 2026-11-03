package main

import (
	"os"

	"github.com/michielvha/vh-adlc/plugins/remote-gui/internal/app"
)

func main() { os.Exit(app.Run(os.Args[1:], os.Stdout)) }
