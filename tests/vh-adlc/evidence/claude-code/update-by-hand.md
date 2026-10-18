# Update, by hand

Result: the update commands run; no newer version was available to update to

| Field | Value |
| --- | --- |
| Host | 2.1.284 (Claude Code), CLI, isolated profile with a fresh HOME |
| Plugin | vh-adlc 0.1.0 on `feat/personal-development-loop`, added as a local marketplace from the checkout |
| OS | linux x64 |
| Date | 2026-10-18 |

## Commands and what they printed

- `claude plugin marketplace add <checkout>`: exit 0, added `vhco-tools`
- `claude plugin install vh-adlc@vhco-tools`: exit 0, installed at user scope
- `claude plugin marketplace update vhco-tools`: exit 0, validated the local marketplace and updated it
- `claude plugin update vh-adlc@vhco-tools`: exit 0, "vh-adlc is already at the latest version (0.1.0)"
- `claude plugin list`: listed `vh-adlc@vhco-tools`
- `claude plugin uninstall vh-adlc@vhco-tools`: exit 0
- `claude plugin marketplace remove vhco-tools`: exit 0

## Limitations

Only one version exists, so this run shows the commands work and leave the plugin installed. It does not
show a move from an older version to a newer one. The same commands against `michielvha/vh-adlc` on
GitHub cannot list `vh-adlc` until this branch merges.
