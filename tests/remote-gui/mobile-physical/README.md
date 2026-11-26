# Physical phone checks

These files support the physical part of the remote-gui mobile keyboard feature (T8). They run an independently installed remote-gui copy on the Linux host. A synthetic page records every input event the remote Chromium sees, so a phone tester only taps and types.

- `fixture.py` serves the page on `127.0.0.1:<port>` and a cross-origin frame on the next port. Each event is appended to `<run>/events.jsonl` and `GET /state` prints per-field counts and the last value. The page has text, password, textarea and contenteditable fields, readonly and disabled fields, two adjacent fields, a cross-origin framed field, and a low field with a submit button. Buttons move focus or change the text field to a password after six seconds, so focus changes can be tested without a second person.
- `start.sh <new run dir> <installed plugin root> [ttl]` starts the fixture and one human browser session over Tailscale, then prints the owner's viewer URL.
- `viewer-check.mjs` opens viewer URLs in desktop Chromium, with `TOUCH=1` for touch emulation. It reports whether the canvas drew and whether the viewer requested the mobile module. The rollback check uses it.

Install a copy with `git archive <commit> plugins/remote-gui | tar -x -C <dir>` and build it through its own `scripts/remote-gui.sh` with a private `REMOTE_GUI_BUILD_CACHE`. Record the SHA-256 of the built binary. The fields only ever hold text typed during the test, and the run directory is removed afterwards.

## Phone checklist

Run this checklist in iPhone Safari on the tailnet as the session owner. Android Chrome verification is a follow-up. Open the printed URL, tap the remote address bar twice, type `127.0.0.1:18731/` and press Go.

1. Tap Text once. The keyboard stays closed and a **Tap to type** prompt appears. Tap the prompt: the keyboard opens. Type `z`.
2. In the same field type `é` from the keyboard and `😀`. Prepare `é` as U+0065 U+0301 in a disposable local note or the iOS test runner, then use Safari’s native Paste action in the open editor. Inspect the synthetic remote value as codepoints to distinguish it from U+00E9. Press backspace once and record the resulting field value.
3. Repeat step 1 in Password, Textarea, Contenteditable, the framed field and the address bar.
4. Tap the background area, Readonly and Disabled. No prompt and no keyboard should appear.
5. Tap Adjacent A and then Adjacent B quickly, then back. The prompt follows the field you tapped last.
6. Tap **Move focus to Textarea in 6 s**, then tap Text once and wait. The prompt closes when focus moves. Tap **Make Text a password in 6 s**, tap Text once and wait. The prompt closes again. Tap **Make Text plain again**.
7. With a composing keyboard (Japanese kana or Chinese pinyin), start a word without committing it. The page must show nothing until commit. Cancel one word and commit another.
8. Start composing, then turn on airplane mode for five seconds and turn it off. After the viewer reconnects, nothing from the unfinished word appears.
9. Rotate to landscape and back. Open and dismiss the keyboard twice. After a dismissal, one tap must not reopen it.
10. Scroll to Low field and Submit, then type into Low field and tap Submit. Open the Clipboard panel while a prompt shows. Reload the viewer and type once more.
11. Confirm the noVNC toolbar has no keyboard button.

Use the real RFB browser regression to check per-tap pointer packets, caret placement and per-edit key packets. The physical fixture records visible Safari behavior and the resulting remote edits.
