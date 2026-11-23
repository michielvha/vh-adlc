# Chromium smoke fixtures

Run on Linux from the repository root with Bun, Bubblewrap, iproute, socat,
OpenSSL, certutil, and Squid. The browser must be able to start a network
namespace with only loopback. The fixture servers bind ephemeral loopback ports
and issue their own HTTPS certificate. The smoke runner installs that CA into
a new temporary Chromium profile for the test.

The runner accepts only the playwright-core version pinned in
`plugins/vh-adlc/scripts/website-check/package.json` and its `bun.lock`. Install
it outside the plugin directory, which the package checks scan, and add its
Chromium headless shell, as the CI `checker` job does:

```sh
work=$(mktemp -d)
cp plugins/vh-adlc/scripts/website-check/package.json plugins/vh-adlc/scripts/website-check/bun.lock "$work/"
bun install --cwd "$work" --frozen-lockfile --ignore-scripts
bun "$work/node_modules/playwright-core/cli.js" install chromium-headless-shell
export WEBSITE_CHECK_PLAYWRIGHT_MODULE="$work/node_modules/playwright-core/index.mjs"
```

```sh
bun test tests/vh-adlc/website-check/confinement.test.ts tests/vh-adlc/website-check/observations.test.ts
```

The observation fixture serves one HTTPS origin with direct socket control, so it
can drop a connection, break off a body after its headers and hold a body open.
Its session page leaves the 401 bodies unread, as an anonymous session client
usually does. Chromium never finishes such a fetch, so the expected response is
matched on its observed status.

The runner finds an installed Squid in `/usr/bin` or `/bin`. Ubuntu installs it in
`/usr/sbin`, so set `WEBSITE_CHECK_SQUID=/usr/sbin/squid` there. To test an
unpacked Fedora Squid package without installing it, set
`WEBSITE_CHECK_SQUID` to the absolute executable,
`WEBSITE_CHECK_SQUID_ROOT` to the extraction root, and
`WEBSITE_CHECK_SQUID_LIB` to its library directory. The test uses Squid 7.5.

The direct request to the excluded server is a positive control for its
destination log. The test removes that one record before it launches confined
Chromium. The resulting scope and upgrade log lines show only requests from
the corresponding smoke runs.
