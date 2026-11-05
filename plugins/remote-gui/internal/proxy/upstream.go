package proxy

import (
	"context"
	"errors"
	"net"
)

func (p *Proxy) checkedDial(dial func(context.Context, string, string) (net.Conn, error)) func(context.Context, string, string) (net.Conn, error) {
	return func(ctx context.Context, network, address string) (net.Conn, error) {
		if p.upstreamAlive != nil && !p.upstreamAlive() {
			p.Revoke()
			return nil, errors.New("application ownership changed")
		}
		conn, err := dial(ctx, network, address)
		if err != nil {
			return nil, err
		}
		// The transport cannot write request headers, app cookies or WebSocket
		// handshakes until this connection passes the post-connect check.
		owned := p.upstreamAlive == nil || p.upstreamAlive()
		if owned && p.upstreamConnection != nil {
			owned = p.upstreamConnection(ctx, conn)
			if owned && p.upstreamAlive != nil {
				owned = p.upstreamAlive()
			}
		}
		if !owned {
			_ = conn.Close()
			p.Revoke()
			return nil, errors.New("application ownership changed")
		}
		return conn, nil
	}
}
