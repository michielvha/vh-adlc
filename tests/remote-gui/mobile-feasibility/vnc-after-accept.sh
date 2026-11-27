#!/usr/bin/env bash
set -eu
printf '%s %s\n' "$RFB_CLIENT_ID" "$RFB_CLIENT_PORT" >>"$RG_PROBE_CLIENTS"
