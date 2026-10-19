# Update, by hand

Result: the README's update commands moved vh-adlc from 0.1.1 to 0.1.2 through the public marketplace

| Field | Value |
| --- | --- |
| Host | 2.1.303 (Claude Code), CLI, isolated profile with a fresh HOME and no GitHub token |
| Marketplace | `michielvha/vh-adlc` on GitHub, cloned over HTTPS |
| From | vh-adlc 0.1.1, published on `main` at `d92cf82` |
| To | vh-adlc 0.1.2, published on `main` at `12db4bb` |
| OS | linux x64 |
| Date | 2026-10-19 |

## Commands and what they printed

- `claude plugin marketplace add michielvha/vh-adlc`: exit 0, added `vhco-tools` from a clone of `main` at `12db4bb`
- `git fetch --deepen=20 origin` and `git reset --hard d92cf82` in the profile's marketplace clone: exit 0, the clone at `d92cf82`
- `claude plugin install vh-adlc@vhco-tools`: exit 0, installed at user scope
- `claude plugin list`: `vh-adlc@vhco-tools`, version 0.1.1
- `claude plugin marketplace update vhco-tools`: exit 0, cloned `michielvha/vh-adlc` again and replaced the old clone, now at `12db4bb`
- `claude plugin update vh-adlc@vhco-tools`: exit 0, "Plugin "vh-adlc" updated from 0.1.1 to 0.1.2 for scope user. Restart to apply changes."
- `claude plugin list`: `vh-adlc@vhco-tools`, version 0.1.2
- `claude plugin details vh-adlc@vhco-tools`: vh-adlc 0.1.2 with Skills (7) and Agents (1)
- `claude plugin uninstall vh-adlc@vhco-tools`: exit 0
- `claude plugin marketplace remove vhco-tools`: exit 0
- `claude plugin list`: no plugins installed

## Limitations

The public marketplace serves only its newest version, so the older install came from rolling the
profile's own marketplace clone back to the commit that published 0.1.1. Both update commands then ran
against GitHub as the README gives them. The run used `tests/vh-adlc/scenarios/host.ts` for the
isolated profile.
