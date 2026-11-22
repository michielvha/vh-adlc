# Chromium smoke fixtures

Run on Linux from the repository root with Bun, Bubblewrap, iproute, socat,
OpenSSL, certutil, and Squid. The browser must be able to start a network
namespace with only loopback. The fixture servers bind ephemeral loopback ports
and issue their own HTTPS certificate. The smoke runner installs that CA into
a new temporary Chromium profile for the test.

Use the repository's pinned playwright-core 1.64.1 and its matching Chromium
headless shell. Point `WEBSITE_CHECK_PLAYWRIGHT_MODULE` at the package's
absolute `index.mjs` path.

```sh
bun test tests/vh-adlc/website-check/confinement.test.ts
```

The runner finds an installed Squid in `/usr/bin` or `/bin`. To test an
unpacked Fedora Squid package without installing it, set
`WEBSITE_CHECK_SQUID` to the absolute executable,
`WEBSITE_CHECK_SQUID_ROOT` to the extraction root, and
`WEBSITE_CHECK_SQUID_LIB` to its library directory. The test uses Squid 7.5.

The direct request to the excluded server is a positive control for its
destination log. The test removes that one record before it launches confined
Chromium. The resulting scope and upgrade log lines show only requests from
the corresponding smoke runs.
