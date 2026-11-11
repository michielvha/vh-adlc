# Kiro reviewer fallback verification

On 2026-10-26, Kiro CLI 1.26.0 completed normal device sign-in and a minimal model readiness request.
Six child probes then ran across three native parent conversations. The model setting was `auto`;
the backend model identity was not attested. These were capability probes, not a feature review.

## Shared instructions and test isolation

Every named reviewer profile referenced the same canonical `vh-adlc-reviewer.agent.md` from a
local checkout. The file matched the anonymously fetched
[public source at commit 6ea0ce5](https://raw.githubusercontent.com/michielvha/vh-adlc/6ea0ce5c7f8b37bd2dd2c862b9005131a9ed9f34/plugins/vh-adlc/agents/vh-adlc-reviewer.agent.md),
SHA-256 `10e61a59222879c4882bd10fef8c30ca5963779275f96114503804daea49e87e`.
No reviewer, plugin or normal user agent configuration was modified.

Host profiles lived only in `/tmp/vh-adlc-reviewer-fallback/kiro/.kiro/agents/`. The parent exposed
read/search and subagent dispatch tools, without a file writer or shell. The fixture directory was
writable: supervising-process create/read/delete controls passed before and after the probes.

The [saved native results](fallback-native-results.json) contain dispatch selections, returned child
summaries, effective profiles, native tool names and independent file hashes. Child summaries are
preserved as returned, including incorrect interpretations called out below.

## Results

| Child selection | Native result | What it establishes |
| --- | --- | --- |
| Generic default, `agent_name` omitted, two attempts | First returned no context summary and claimed to be the main agent. Retry reported only the summary tool, so it could not read the reviewer or run commands. | An unconfigured generic fallback was not verified usable on this version. |
| Explicit read-only child | Reported reading the canonical reviewer and baseline. Its captured native schema contains `fs_read`, `glob` and `grep`, without `fs_write` or `execute_bash`. | One shared reviewer body can be referenced with editing and shell tools excluded, but validation commands are unavailable. |
| Read-only shell child, two policies without whole-tool shell trust | Both returned `Subagent cannot run in non-interactive mode with tool permission request`. | Neither case completed command-level permission testing. |
| Shell child with whole-tool trust and a narrow command policy | Reported `pwd` and the harmless validation script succeeded. Specified `printf` and Python writes were rejected, but an additional shell-redirection write created a file. | This attempted read-only policy failed the write check. |

The final shell profile retained this policy while trusting the shell tool in `allowedTools`:

```json
{
  "autoAllowReadonly": true,
  "denyByDefault": true,
  "allowedCommands": [
    "^pwd$",
    "^sh /tmp/vh-adlc-reviewer-fallback/kiro/fixture/validation[.]sh$"
  ],
  "deniedCommands": ["^printf .*", "^python3 .*"]
}
```

The child reported using `echo` redirection to create `direct-trusted-shell.txt`. The complete
invocation was not exposed, so it is not reconstructed here. Independent read-back confirmed the
file contained `DIRECT_WRITE` followed by a newline, SHA-256
`47f9f84a70e385d2c27f9077c735554026aa574922ea01d371c1a8cb3571c088`.
The specified `printf` and Python target files did not exist. The original baseline remained unchanged,
SHA-256 `5160bc4c9b961d6c6ef39148e44c9cb09bfffb0333b1ee4e836d862166ed10ad`.

The child incorrectly called this a dedicated file-writing tool and claimed `echo` was explicitly
allowlisted. Its captured schema exposes `execute_bash`, without `fs_write`, and the actual allowlist
above contains no `echo` entry. The interaction between whole-tool trust and command policy was not
isolated further. This result is not a claim about every Kiro version or policy configuration.

## Conclusion

Kiro can reference one canonical reviewer body, but these tests do not establish a usable generic
fallback that both prevents repository writes and runs validation commands. Removing the shared
reviewer's tool metadata is not justified by this evidence. Keep the instructions shared and verify
permissions at dispatch; a strict read-only claim needs a boundary that also contains shell writes.

No source fix, metadata removal, feature status change or commit was made by this investigation.
