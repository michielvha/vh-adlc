# Start the service

The service listens on port 9000 by default. Run `make start` to start it.
An external file backend is supported.

The service starts 16 workers. The package uses a 60-second probe timeout by
default. Check the live probe setting in `config/probe.conf`.

The client contract says an unavailable service returns HTTP 503.
