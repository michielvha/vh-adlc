# Docs pin

The plugin reads its conventions from `vhco-pro/docs` at this revision:

https://github.com/vhco-pro/docs/blob/1fbe501bb9cee3e672fbe698c968fe36d8919f4d/AGENTS.md

Pass `1fbe501bb9cee3e672fbe698c968fe36d8919f4d` as `--plugin-pin` to every `vh-adlc` command.
`vh-adlc knowledge` decides whether the repository's own pin or this one applies, and every
operation reports its answer. Moving this pin is a reviewed plugin change with a version bump.
