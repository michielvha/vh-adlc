package main

import (
	"os"

	"github.com/michielvha/logger"
)

func main() {
	logger.InitWithOptions(logger.Options{Output: os.Stderr})
	os.Exit(run(os.Args[1:], os.Stdin, os.Stdout, os.Stderr, isTerminal(os.Stderr)))
}

func isTerminal(f *os.File) bool {
	info, err := f.Stat()
	return err == nil && info.Mode()&os.ModeCharDevice != 0
}
