// Package viewport defines the browser session's bounded exported geometry.
package viewport

import "context"

const Max = 4096

type Size struct {
	Width  int `json:"width"`
	Height int `json:"height"`
}

func (s Size) Valid() bool {
	return s.Width >= 320 && s.Height >= 240 && s.Width <= Max && s.Height <= Max
}

var Initial = Size{Width: 1440, Height: 900}

type Resize func(context.Context, Size) (bool, error)
