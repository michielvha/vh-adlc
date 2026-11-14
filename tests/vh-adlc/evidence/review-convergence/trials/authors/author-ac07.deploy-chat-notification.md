---
status: draft
status_description: "Draft written; nine open questions wait for the owner, and no spec review has run."
issue: null
goal: "Every run of deploy.sh ends with one short message in the team's chat channel that states how the deploy ended, without changing the deploy itself or its exit status."
covers:
  - deploy.sh
  - tests/
---

# Plan: Deploy chat notification

After `./ship-release` finishes, `deploy.sh` posts one short message about the deploy to the team's chat
webhook, a remote HTTPS service. The post never changes the deploy's exit status.

## Context

### Owner summary

The team wants a message in its chat channel after each deploy. Today `deploy.sh` only runs
`./ship-release` and tells nobody. This feature adds one HTTPS POST to the team's chat webhook at the end
of `deploy.sh`. The message names the outcome, the commit, the host and the finish time in UTC.

The webhook URL comes from the environment variable `DEPLOY_CHAT_WEBHOOK_URL`. Chat webhook URLs carry
their own access token, so the script never prints the URL and never puts it on curl's command line,
where other users of the host could read it in the process list. When the variable is unset or empty,
`deploy.sh` deploys exactly as it does today and prints a one-line note that it skipped the message. That
makes the upgrade safe on hosts that are not configured yet.

The deploy matters more than the message. If the post fails, times out or gets an error response,
`deploy.sh` prints a warning on stderr and still exits with the status of `./ship-release`. It makes one
attempt with a 10 second limit and does not retry, because a retried POST can show the same deploy twice.
The cost is that a message lost to a brief outage stays lost. Two deploys running at the same time each
post their own message and share no state.

Out of scope: retries and queued delivery, locking concurrent deploys, choosing a chat service on the
team's behalf, and any change to `./ship-release`.

Rollback is a revert of `deploy.sh`. The feature keeps no state and writes no files, so nothing needs
cleaning up, and a leftover `DEPLOY_CHAT_WEBHOOK_URL` is ignored.

Nine choices are open below. The criteria follow each recommendation and change if the owner picks
otherwise. The largest ones: whether failed deploys also post (recommended yes), whether a failed post
ever fails the script (recommended no), and which chat service the payload targets, which sets its JSON
shape.

Validation is planned and has not run: a stubbed shell test for exit codes, payload and secrecy, a local
TLS server test that drives the real curl, and a manual post to the real channel. No spec review has run
yet. Accepting this document would authorize implementing the scope above. It would not authorize
creating the webhook, storing its URL on any host or posting to the real channel outside the manual test.

### Background

- `deploy.sh` has two lines: `#!/bin/sh` and `./ship-release` (`deploy.sh:1`, `deploy.sh:2`). Because
  `./ship-release` is the last command, the script's exit status is the exit status of `./ship-release`.
  The script sends no notification of any kind.
- `./ship-release` is not in this repository: `git ls-files` lists only `AGENTS.md` and `deploy.sh`, and
  `ls -la ship-release` reports `No such file or directory`. What it deploys and how it behaves when two
  copies run at once is outside this repository, so this feature treats it as a black box with an exit
  status.
- The repository has no tests, no CI configuration and no other scripts (`git ls-files` above).
- curl reads its options, including the URL, from standard input with `-K -`. In a check on the authoring
  host (`curl 8.15.0`), a failed request to `https://127.0.0.1:9/services/SECRETTOKEN` printed
  `curl: (7) Failed to connect to 127.0.0.1 port 9 after 0 ms: Could not connect to server`, and one to
  `https://example.invalid/services/SECRETTOKEN` printed `curl: (6) Could not resolve host:
  example.invalid`. Neither message contained the URL path, where webhook services put the token.
- curl does no retries unless `--retry` is set; `man curl` says setting it to 0 means no retries, which
  is the default.
- The authoring host has `python3` 3.14.10 and `openssl` 3.5.9, which the TLS test in the Test Plan
  uses. The deploy host's tools are not known from this repository.

## Scope

In scope:

- `deploy.sh` runs `./ship-release`, records its exit status, posts one message to the URL in
  `DEPLOY_CHAT_WEBHOOK_URL`, and exits with the recorded status.
- The message states the outcome, the short commit ID, the host name and the UTC finish time.
- Skipping the post, with a note on stderr, when the URL is unset or empty, when the URL does not start
  with `https://`, or when curl is not installed.
- A warning on stderr when the post fails, with no retry.
- Tests under `tests/` and a written manual procedure.

Out of scope, by name:

- Retries, a local outbox or any delivery that outlives the `deploy.sh` process.
- Locking or queueing concurrent runs of `deploy.sh`.
- A message when `deploy.sh` itself is killed (for example with Ctrl-C or SIGKILL) before the post.
- Changes to `./ship-release`, its output or its exit codes.
- Creating the webhook, choosing the channel, or storing the URL on deploy hosts.
- Messages for anything other than a `deploy.sh` run, such as builds or rollbacks done by other tools.

## Design

### Flow

`deploy.sh` keeps `#!/bin/sh` and stays POSIX sh. It runs `./ship-release` as now, saves `$?` in a
variable, calls a shell function `notify_chat` with that status, and ends with `exit` of the saved
status. Nothing `notify_chat` does can change that status: the function runs with errors handled inside
it, and its own return value is ignored. The script does not enable `set -e`, so a failing command inside
the function cannot end the script early.

`notify_chat` does the following, in order:

1. If `DEPLOY_CHAT_WEBHOOK_URL` is unset or empty, print `deploy.sh: DEPLOY_CHAT_WEBHOOK_URL not set,
   skipping chat notification` to stderr and return.
2. If the value does not start with `https://`, print `deploy.sh: DEPLOY_CHAT_WEBHOOK_URL is not an
   https URL, skipping chat notification` to stderr and return. The value itself is not printed.
3. If `command -v curl` finds nothing, print `deploy.sh: curl not found, skipping chat notification` to
   stderr and return.
4. Build the message text (see Message) and the JSON payload (see Payload).
5. Send one POST with curl: the URL goes in on standard input through `-K -`, the payload through
   `--data-binary`, with `Content-Type: application/json`, `--connect-timeout 5`, `--max-time 10`, no
   `--retry`, `-sS`, and `-o /dev/null -w '%{http_code}'` so only the status code is captured.
6. Treat curl exit 0 with an HTTP status from 200 to 299 as success and print nothing. Anything else
   prints one stderr line: `deploy.sh: chat notification failed (curl exit <n>, HTTP <code>)`. curl's own
   `-sS` error line also reaches stderr; the Background check shows it names the host but not the path.

The script never runs with `set -x` and never echoes the URL. `DEPLOY_CHAT_WEBHOOK_URL` is read only
inside `notify_chat`.

### Message

The text is one line:

`Deploy <outcome>: <commit> on <host> at <time>`

- `<outcome>` is `succeeded` when `./ship-release` exited 0, and `failed (exit <n>)` otherwise, with its
  exit status as `<n>`.
- `<commit>` is the output of `git rev-parse --short HEAD` in the working directory, or `unknown commit`
  when that command fails.
- `<host>` is the output of `hostname`, or `unknown host` when that fails.
- `<time>` is `date -u +%Y-%m-%dT%H:%M:%SZ`, taken after `./ship-release` returns.

Before the values go into the text, the script removes every character outside `A-Za-z0-9._:-`, a space
and the parentheses, so no value can need JSON escaping or inject chat markup.

### Payload

`{"text":"<message>"}`. Slack, Mattermost, Google Chat and Rocket.Chat incoming webhooks accept a `text`
field; Discord expects `content` and Microsoft Teams workflows expect a different shape. The service is
an open question (Q6); this design follows its recommendation.

### Glossary

| Term | Meaning |
| --- | --- |
| deploy notification | The one chat message `deploy.sh` posts after `./ship-release` returns. |
| `DEPLOY_CHAT_WEBHOOK_URL` | The environment variable that holds the webhook URL. Unset or empty turns the notification off. |
| `succeeded` | Outcome word for a `./ship-release` exit status of 0. |
| `failed (exit <n>)` | Outcome words for any other exit status `<n>`. |

### Concurrent runs

The notification keeps no state: no lock file, no temporary file, no shared counter. Two runs of
`deploy.sh` at the same time each run their own `./ship-release` and post their own message, carrying their
own outcome, commit and finish time. The chat channel may show them in a different order from the order in
which the deploys finished; the UTC time in each message gives the real order. Whether two concurrent
`./ship-release` runs are safe is a property of `./ship-release` and stays unchanged (Q8).

### Partial failure

| What fails | What happens |
| --- | --- |
| `./ship-release` fails | A `failed (exit <n>)` message is posted (Q1), and `deploy.sh` exits `<n>`. |
| DNS, connect or TLS failure | Warning on stderr, no message in chat, exit status unchanged. |
| Webhook returns 4xx or 5xx, including 429 | Warning on stderr with the HTTP code, exit status unchanged. |
| Webhook does not answer | curl stops after 10 seconds (Q4); warning on stderr, exit status unchanged. |
| Request delivered but the response is lost | The message may appear in chat while `deploy.sh` prints a warning. No duplicate follows, because there is no retry. |
| `deploy.sh` killed after `./ship-release` and before the post | No message. Out of scope. |
| URL unset, not https, or curl missing | Skip note on stderr, no request, exit status unchanged (Q5, Q9). |

### Retry and replay

`deploy.sh` makes exactly one attempt per run (Q3). Incoming chat webhooks offer no idempotency key, so a
retry after an ambiguous failure could post the same deploy twice. A message lost to an outage is not
sent later. Running `deploy.sh` again is a new deploy: it runs `./ship-release` again and posts a new
message, which is correct for that new run. Nobody should rerun `deploy.sh` only to get a missing message.

### Upgrade and rollback

Upgrade: the new `deploy.sh` works on a host with no configuration. Without `DEPLOY_CHAT_WEBHOOK_URL` it
deploys as before, prints the skip note and exits with the same status as the old script. Setting the
variable turns the message on for that host. Hosts can upgrade one at a time, because no host's
behaviour depends on another's version.

Rollback: revert the `deploy.sh` change. The feature writes no files and keeps no state, so the old
script runs exactly as before and ignores the variable. A deploy of an older release through the new
`deploy.sh` is a normal run and posts a normal message.

## Acceptance Criteria

- [ ] AC-01: When `./ship-release` exits 0 and `DEPLOY_CHAT_WEBHOOK_URL` holds an https URL, `deploy.sh`
      sends exactly one POST to that URL whose body is `{"text":"Deploy succeeded: <commit> on <host> at <time>"}`,
      and exits 0.
- [ ] AC-02: When `./ship-release` exits with a non-zero status `<n>`, `deploy.sh` sends exactly one POST
      whose body is `{"text":"Deploy failed (exit <n>): <commit> on <host> at <time>"}`, and exits `<n>`.
- [ ] AC-03: When the post fails (connection refused, an HTTP status outside 200 to 299, or a timeout),
      `deploy.sh` prints one `deploy.sh: chat notification failed` line on stderr, makes no second request,
      and exits with the exit status of `./ship-release`.
- [ ] AC-04: Against a webhook that accepts the connection and never answers, `deploy.sh` exits within 12
      seconds of `./ship-release` returning.
- [ ] AC-05: When `DEPLOY_CHAT_WEBHOOK_URL` is unset or empty, or curl is not on `PATH`, `deploy.sh` runs
      `./ship-release`, sends no request, prints the matching skip note on stderr, and exits with the exit
      status of `./ship-release`.
- [ ] AC-06: When `DEPLOY_CHAT_WEBHOOK_URL` does not start with `https://`, `deploy.sh` sends no request,
      prints the not-https skip note on stderr without the URL, and exits with the exit status of
      `./ship-release`.
- [ ] AC-07: The webhook URL never appears in `deploy.sh`'s stdout or stderr, and never appears in the
      command-line arguments of any process `deploy.sh` starts.
- [ ] AC-08: Two runs of `deploy.sh` started at the same time each send exactly one POST, and each body
      carries that run's own outcome.
- [ ] AC-09: Over real TLS, the POST carries `Content-Type: application/json` and a body that parses as
      JSON with a single `text` field, using the outcome words from the Glossary.
- [ ] AC-10: After a deploy with the real webhook URL set, the team's chat channel shows one message in the
      AC-01 format.

## Test Plan

| Criterion | Proof |
| --- | --- |
| AC-01, AC-02, AC-03, AC-05, AC-06 | `tests/deploy_notify_test.sh`: copies `deploy.sh` into a temporary directory that is a fresh git repository with one commit, adds a stub `./ship-release` that exits with a chosen status, and puts stub `curl`, `hostname` and `date` first on `PATH`. The `curl` stub records every invocation, its standard input and its arguments, and answers with a chosen exit code and HTTP status. Cases: ship exit 0, ship exit 3, curl exit 7, HTTP 500, HTTP 429, URL unset, URL empty, URL `http://example.test/x`, curl missing from `PATH`. Each case passes when the recorded request count, the exact body string, the stderr lines and `deploy.sh`'s exit status equal the expected values for that case. |
| AC-04 | `tests/deploy_notify_https_test.sh`, hang case: a local Python TLS server with a throwaway self-signed certificate (trusted through `CURL_CA_BUNDLE`) accepts the connection and never responds. Passes when `deploy.sh` exits within 12 seconds of the stub `./ship-release` returning, prints the failure line, and exits with the stub's status. |
| AC-07 | `tests/deploy_notify_test.sh`, secrecy case: the URL holds the marker `SECRETMARKER`. Passes when the marker appears in no recorded `curl` argument, in no captured stdout or stderr of any case, and in the output of `ps -o args` sampled by the `curl` stub while it runs. |
| AC-08 | `tests/deploy_notify_https_test.sh`, concurrency case: two runs of `deploy.sh` start in the background against the local TLS server, one with a stub `./ship-release` exiting 0 and one exiting 4. Passes when the server logged exactly two requests, one body has `succeeded` and the other `failed (exit 4)`, and the runs exit 0 and 4. |
| AC-09 | `tests/deploy_notify_https_test.sh`, payload case: the local TLS server answers 200 and records the request. Passes when the `Content-Type` header is `application/json`, `python3 -c 'import json,sys; d=json.load(sys.stdin); assert list(d)==["text"]'` accepts the body, and the text starts with `Deploy succeeded: `. |
| AC-10 | Manual procedure: on a deploy host, set `DEPLOY_CHAT_WEBHOOK_URL` to the real webhook, run `deploy.sh` with a release the team agreed to ship, and check the channel. Passes when exactly one new message appears and it matches the AC-01 format with that host's name and the deployed commit. Record the date, host and commit as evidence. |

## Tasks

None yet; written once the document is planned.

## Open Questions

### Q1: Should a failed deploy also post a message?

**Recommendation:** A. Yes, post a `failed (exit <n>)` message, because a failed deploy is the one the
team most needs to see.

| Option | You get | It costs |
| --- | --- | --- |
| **A. Post on every outcome** | The channel shows failures as well as successes | Failed runs during debugging add noise to the channel |
| **B. Post on success only** | A quieter channel | A failed deploy is silent; the team learns about it elsewhere |

**Why this is yours:** it decides what the channel is for and how much noise the team accepts.

### Q2: Should a failed post ever make deploy.sh exit non-zero?

**Recommendation:** A. Never; keep the exit status of `./ship-release`, because the deploy already
happened and callers judge it by that status.

| Option | You get | It costs |
| --- | --- | --- |
| **A. Warn only** | Exit status means what it means today | A missed message shows only as a stderr warning |
| **B. Exit non-zero on a failed post** | A missing message is impossible to overlook | A successful deploy reports failure, and automation may roll back or retry the deploy |

**Why this is yours:** it trades the visibility of the message against the meaning of the exit status
that callers rely on.

### Q3: Should deploy.sh retry a failed post?

**Recommendation:** A. No retry, because chat webhooks have no idempotency key and a retry after an
ambiguous failure can post the same deploy twice.

| Option | You get | It costs |
| --- | --- | --- |
| **A. One attempt** | No duplicate messages, simplest script | A brief outage loses the message |
| **B. Retry only when the connection was never made** | Recovers from refused connections with no duplicate risk | More script logic; timeouts and 5xx stay unretried |
| **C. Up to 3 attempts on any failure** | Best chance of delivery | Duplicate messages after timeouts; up to 30 more seconds of waiting |

**Why this is yours:** it weighs a lost message against a duplicate one and a longer run.

### Q4: How long may the post delay the end of deploy.sh?

**Recommendation:** A. 5 seconds to connect and 10 seconds in total, which covers a normal webhook
round trip and keeps a hung service from stalling the deploy.

| Option | You get | It costs |
| --- | --- | --- |
| **A. 5 s connect, 10 s total** | Bounded delay, room for a slow service | A service slower than 10 s is reported as failed |
| **B. 2 s connect, 5 s total** | Faster end to every run | More false failures on a slow network |
| **C. 10 s connect, 30 s total** | Fewer false failures | A hung service holds the deploy for half a minute |

**Why this is yours:** it trades delivery against how long an operator or pipeline waits.

### Q5: What should deploy.sh do when the URL is unset or curl is missing?

**Recommendation:** A. Skip the post with a one-line note on stderr, so upgraded hosts that are not
configured keep deploying as before.

| Option | You get | It costs |
| --- | --- | --- |
| **A. Skip with a note** | Safe upgrade, one host at a time | A host that should post can stay silent if nobody reads stderr |
| **B. Refuse to deploy** | No host deploys without notifying | Every host must be configured before the upgrade, and a curl removal blocks deploys |
| **C. Skip silently** | Clean output | Nobody notices a host that never posts |

**Why this is yours:** it decides whether the message is optional or required for a deploy.

### Q6: Which chat service does the webhook belong to?

**Recommendation:** A. A service that accepts `{"text": ...}`, such as Slack, Mattermost, Google Chat
or Rocket.Chat; the design and AC-01, AC-02 and AC-09 assume it.

| Option | You get | It costs |
| --- | --- | --- |
| **A. `text` payload** | Works with the most common incoming webhooks | Discord and Teams reject it |
| **B. Discord `content` payload** | Works with Discord | The criteria and tests change to `content` |
| **C. Teams workflow payload** | Works with Microsoft Teams | A larger payload and different criteria |

**Why this is yours:** only the team knows which service its channel uses.

### Q7: What should the message contain?

**Recommendation:** A. Outcome, short commit ID, host name and UTC finish time, which tells readers what
shipped where and lets them order concurrent deploys.

| Option | You get | It costs |
| --- | --- | --- |
| **A. Outcome, commit, host, time** | Enough to tell runs apart | Internal host names reach a third-party chat service |
| **B. Outcome and commit only** | Nothing about hosts leaves the network | Concurrent or multi-host deploys are hard to tell apart |
| **C. A plus the operator's user name** | Shows who deployed | Personal data in a third-party service |

**Why this is yours:** it sets what information leaves the deploy host for an external service.

### Q8: Should this feature stop two deploys from running at once?

**Recommendation:** A. No; keep concurrency as it is today, because each run posts its own message and
locking deploys is a separate change to deploy behaviour.

| Option | You get | It costs |
| --- | --- | --- |
| **A. No lock** | Small, focused change | Concurrent deploys stay possible, as today |
| **B. Add a lock to deploy.sh** | One deploy at a time per host | Stale lock handling and a behaviour change outside the notification |

**Why this is yours:** it decides whether this feature grows into changing how deploys run.

### Q9: Should deploy.sh refuse a webhook URL that is not https?

**Recommendation:** A. Refuse it, since the webhook is an HTTPS service and the URL holds a token that
plain HTTP would expose.

| Option | You get | It costs |
| --- | --- | --- |
| **A. https only** | The token never travels in clear text | An internal plain-HTTP relay cannot be used |
| **B. Accept any URL** | Works with any relay | A typo or a misconfigured relay sends the token in clear text |

**Why this is yours:** it trades flexibility against protecting the webhook token.

## Review Log

| Date | Review | Kind | Commit | Model | Isolation | Outcome |
| --- | --- | --- | --- | --- | --- | --- |
