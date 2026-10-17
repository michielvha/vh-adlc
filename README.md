# vhco-tools

A Claude Code plugin marketplace with workstation tooling that is not tied to one project.

## Install on a workstation

In Claude Code:

```
/plugin marketplace add michielvha/vh-adlc
/plugin install github-app-registration@vhco-tools
```

The scripts need [Bun](https://bun.sh).

## Plugins

| Plugin | What it does |
|---|---|
| `github-app-registration` | Registers a GitHub App through GitHub's manifest flow, stores its credentials locally with mode 0600, and copies them into a project's env and key files without printing them. |

## Developing

Run a plugin's tests with `bun test --cwd plugins/<plugin>/skills/<skill>/scripts`.

## Verifying a vh-adlc release

Each release of the `vh-adlc` binary publishes a `checksums.txt` and a detached signature,
`checksums.txt.sig`, made with the VHCO Pro release signing key. The public key is
[`release-signing-key.asc`](release-signing-key.asc) in this repository, and its primary fingerprint
is:

```text
9A5CD8F7CF9617B1C57F359ED61B8A7F2C06BAB6
```

Download the archive for your platform with `checksums.txt` and `checksums.txt.sig`, then run:

```sh
gpg --import release-signing-key.asc
gpg --fingerprint release@vhco.pro
gpg --verify checksums.txt.sig checksums.txt
sha256sum --check --ignore-missing checksums.txt            # Linux
shasum -a 256 --check --ignore-missing checksums.txt        # macOS
```

The fingerprint `gpg --fingerprint` prints must equal the one above. `gpg --verify` names the key's
signing subkey, `929B7A7AF19CB3E67EEEEC0272E691932274AE79`, and the key's primary fingerprint is the
one to compare.
