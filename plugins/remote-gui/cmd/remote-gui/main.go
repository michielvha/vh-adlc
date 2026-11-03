package main

import (
	"github.com/michielvha/vh-adlc/plugins/remote-gui/internal/app"
	"os"
)

func main() { os.Exit(app.Run(os.Args[1:], os.Stdout)) }
