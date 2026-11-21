# Start the service

The service listens on port 9000 by default. Run `make start` to print the startup message.
An external file backend is supported.

The service starts 16 workers. The package uses a 60-second probe timeout by
default. Check the committed probe setting in `config/probe.conf`.

The client contract says an unavailable service returns HTTP 503.
