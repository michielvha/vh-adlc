# Archived Semrush MCP responses

Copies of the credential-free archive Stackweaver kept from its 2026-10-29 Semrush MCP
session (`semrush-visibility-2026-10-29`), used by the helper tests and the scenario stub:

- `initialize-response.json`: the `initialize` reply, unchanged.
- `success-response.json`: the one-row `domain_ranks` control report, with the competitor
  target replaced by `fixture.example`. It reported 10 API units.
- `no-data-response.json`: a `domain_ranks` `no_data` reply for an owned site, with its
  `trace_id` replaced by zeros. An error reply carries no `structuredContent` and no usage.
- `execute-report-request.json`: the control's `tools/call` request, target replaced.

The error cases change only the `code` inside `content[0].text` of the no-data reply.
