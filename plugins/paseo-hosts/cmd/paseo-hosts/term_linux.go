package main

import (
	"os"
	"syscall"
	"unsafe"
)

// isTerminal reports whether the terminal driver answers for f.
func isTerminal(f *os.File) bool {
	rc, err := f.SyscallConn()
	if err != nil {
		return false
	}
	var errno syscall.Errno
	var t syscall.Termios
	if err := rc.Control(func(fd uintptr) {
		_, _, errno = syscall.Syscall(syscall.SYS_IOCTL, fd, syscall.TCGETS, uintptr(unsafe.Pointer(&t)))
	}); err != nil {
		return false
	}
	return errno == 0
}
