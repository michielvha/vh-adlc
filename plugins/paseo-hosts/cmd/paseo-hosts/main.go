package main

import (
	"fmt"
	"os"

	"github.com/michielvha/logger"
)

const usage = `paseo-hosts onboards Linux servers as SSH-only Paseo daemons and links desktop apps to them.

Usage:
  paseo-hosts <command> [flags]
`

func main() {
	logger.InitWithOptions(logger.Options{Output: os.Stderr})
	if len(os.Args) > 1 && (os.Args[1] == "-h" || os.Args[1] == "--help" || os.Args[1] == "help") {
		_, _ = fmt.Fprint(os.Stdout, usage)
		return
	}
	_, _ = fmt.Fprint(os.Stderr, usage)
	os.Exit(2)
}
