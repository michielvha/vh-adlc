[Documentation](../README.md) / Verifying releases

# Verifying releases

Each release of the `vh-adlc` binary publishes a `checksums.txt` and a detached signature,
`checksums.txt.sig`, made with the VHCO Pro release signing key. The public key is
[`release-signing-key.asc`](../../release-signing-key.asc) in this repository, and its primary fingerprint
is:

```text
9A5CD8F7CF9617B1C57F359ED61B8A7F2C06BAB6
```

From the [releases page](https://github.com/michielvha/vh-adlc/releases), download
the archive for your platform, `checksums.txt` and `checksums.txt.sig` into the
repository root. With GnuPG installed, run the following from that directory:

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

The plugin installer also checks the archive and binary against its
[lock file](../../plugins/vh-adlc/vh-adlc.lock.json). Updating the plugin and
installing a newer standalone binary are separate operations; the installer
requires the version and hashes in that lock.

See [how releases are published](../internal/releasing.md) for the maintainer workflow.
