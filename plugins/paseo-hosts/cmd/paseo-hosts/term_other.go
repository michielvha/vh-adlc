//go:build !linux && !darwin

package main

import "os"

// isTerminal is false where the plugin has no terminal check.
func isTerminal(*os.File) bool { return false }
