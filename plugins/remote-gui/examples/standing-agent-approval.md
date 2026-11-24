## Standing browser approval

The owner authorizes agent-mode reuse of the saved remote-gui profile `cloudflare`
for work the owner has requested. This approval remains active across tasks and
viewer expiry until the owner restricts or revokes it. Do not request browser-use
approval again solely to reopen that profile. Pass `--browser-mode agent
--agent-start-approved` when an eligible new session is needed, and reuse an
existing healthy session first.

Keep the profile's pinned owner and use saved provider sessions through the
browser. Do not read or copy profile files, cookies or password stores. If an
actual sign-in, MFA or other credential challenge appears, hand control to the
human before credential entry and wait for confirmed hand-back. A provider may
expire its own login even though browser-use approval remains active.

This authorizes browser control for the requested work. Provider actions retain
their existing authorization boundaries. Later owner restrictions override this
standing instruction.
