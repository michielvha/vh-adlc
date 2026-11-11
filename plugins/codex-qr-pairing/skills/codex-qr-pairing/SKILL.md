---
name: codex-qr-pairing
description: Generate a fresh QR code or manual code to pair another device with the current Codex host. Use when linking a device to this host's sessions, including when a phone's manual-entry screen crashes.
---

# Codex QR pairing

Run on the host whose sessions the user wants to access. The host must already
have Codex signed in and Remote Control running. Pairing a different host requires
running the command there.

## Generate and display

1. Check `codex remote-control pair --help` and that `qrencode` is available.
   If a dependency is missing, report it before creating a short-lived token.
2. Run `codex remote-control pair --json` and parse its stdout as JSON. If the
   sandbox blocks the local control socket, request the host permission needed
   to rerun that same command. Do not disable the sandbox or restart the daemon.
3. Keep `pairingCode` as a string, including leading zeros. Build this exact URL,
   URL-encoding the token as a query value:

   ```text
   https://chatgpt.com/codex/pair?pairing_code=PAIRING_CODE
   ```

   Use the full `pairingCode`, not `manualPairingCode`. A QR containing only the
   token is not a recognizable pairing link. Never reuse an earlier chat's token.
4. Check `expiresAt` (Unix seconds). If expired, generate a new token before
   rendering. Use the returned expiry rather than assuming a fixed lifetime.
5. Write a PNG outside the repository, in a session artifact or temporary directory:

   ```sh
   qrencode -o /absolute/artifact/directory/codex-qr-pairing.png -s 9 -m 4 -l M 'FULL_PAIRING_URL'
   ```

   Pass the actual URL as one argument, with proper shell quoting or an argument
   array. Render locally; do not send the token to a hosted QR-generation service.
6. Display the PNG inline using its absolute path:

   ```markdown
   ![Codex QR pairing QR](/absolute/artifact/directory/codex-qr-pairing.png)
   ```

   Tell the user to scan with their phone's Camera app and complete setup in
   ChatGPT using the same account and workspace. Include the expiry in their
   timezone. If they requested a manual code, provide `manualPairingCode` as well.
   A desktop client can add a host under Settings > Connections > Control other
   devices where that feature is available. Offer its manual-code flow when
   requested; QR pairing has only been tested here with a phone.

Generation does not prove that the phone completed pairing. If the link opens
but the phone app crashes, report that separately; do not invent another URL
format. Do not reset credentials, revoke devices, expose a port, or stop sessions
as part of generating a code. Keep live tokens and QR images out of Git and docs.

## Evidence

The full-URL QR above successfully paired a phone with a Linux Codex host on
2026-10-27. The raw-token QR was not recognized by that phone.

- [Codex developer commands](https://learn.chatgpt.com/docs/developer-commands)
  documents `remote-control pair --json` and its response fields.
- [Desktop QR payload observed in the Codex issue tracker](https://github.com/openai/codex/issues/49618#issuecomment-5972532404)
  records the `/codex/pair?pairing_code=` URL format.
- [Remote connections](https://learn.chatgpt.com/docs/remote-connections)
  describes mobile QR setup and access from other supported desktop devices.
