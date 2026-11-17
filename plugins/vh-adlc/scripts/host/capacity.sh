#!/usr/bin/env bash
# Host capacity check, run before any fan-out: creating a worktree, starting another session or
# sub-agent, or launching parallel or long local work (reviews, test suites, cluster runs).
#
# Usage: capacity.sh [PATH...]   (defaults to the working directory and the temp directory)
# Prints one line per check and ends with `capacity: ok` (exit 0) or `capacity: blocked` (exit 1).
#
# Thresholds, each overridable through the environment:
#   VH_ADLC_MIN_FREE_GIB           free space on each filesystem          (default 20)
#   VH_ADLC_MAX_USED_PCT           used share of each filesystem          (default 90)
#   VH_ADLC_MAX_BTRFS_METADATA_PCT used share of allocated btrfs metadata (default 80)
#   VH_ADLC_MAX_LOAD_PER_CPU       one-minute load average per CPU        (default 2)
#
# Btrfs needs its own check: when metadata chunks are full and no device has unallocated space for a
# new one, every write stalls or fails with "No space left on device" while df still reports free space.
# Per-device unallocated space, the real limit, is readable only as root, so the unprivileged check
# uses a conservative metadata ratio instead.
set -u

min_free_gib=${VH_ADLC_MIN_FREE_GIB:-20}
max_used_pct=${VH_ADLC_MAX_USED_PCT:-90}
max_meta_pct=${VH_ADLC_MAX_BTRFS_METADATA_PCT:-80}
max_load_per_cpu=${VH_ADLC_MAX_LOAD_PER_CPU:-2}

if [ "$#" -gt 0 ]; then
  paths=("$@")
else
  paths=("$PWD" "${TMPDIR:-/tmp}")
fi

blocked=0
seen=" "

# gt A B: succeeds when the number A is greater than B (decimals allowed).
gt() { awk -v a="$1" -v b="$2" 'BEGIN { exit !(a + 0 > b + 0) }'; }

for path in "${paths[@]}"; do
  if [ ! -e "$path" ]; then
    echo "blocked $path: path does not exist"
    blocked=1
    continue
  fi
  # POSIX df: filesystem, 1024-blocks, used, available, capacity, mounted on.
  line=$(df -Pk "$path" 2>/dev/null | awk 'NR == 2')
  if [ -z "$line" ]; then
    echo "blocked $path: df could not read the filesystem"
    blocked=1
    continue
  fi
  mount=$(echo "$line" | awk '{ print $NF }')
  case "$seen" in *" $mount "*) continue ;; esac
  seen="$seen$mount "

  avail_kib=$(echo "$line" | awk '{ print $4 }')
  used_pct=$(echo "$line" | awk '{ gsub("%", "", $5); print $5 }')
  free_gib=$(awk -v k="$avail_kib" 'BEGIN { printf "%.1f", k / 1048576 }')
  state=ok
  if gt "$min_free_gib" "$free_gib" || ! gt "$max_used_pct" "$used_pct"; then
    state=blocked
    blocked=1
  fi
  echo "$state $mount: ${free_gib} GiB free, ${used_pct}% used (limits: ${min_free_gib} GiB free, below ${max_used_pct}%)"

  fstype=$(stat -f -c %T "$path" 2>/dev/null || true)
  if [ "$fstype" = "btrfs" ] && command -v findmnt >/dev/null 2>&1; then
    uuid=$(findmnt -no UUID --target "$path" 2>/dev/null | head -n 1)
    alloc="/sys/fs/btrfs/$uuid/allocation/metadata"
    if [ -n "$uuid" ] && [ -r "$alloc/total_bytes" ] && [ -r "$alloc/bytes_used" ]; then
      meta_pct=$(awk -v u="$(cat "$alloc/bytes_used")" -v t="$(cat "$alloc/total_bytes")" \
        'BEGIN { if (t > 0) printf "%.1f", u * 100 / t; else print 0 }')
      state=ok
      if ! gt "$max_meta_pct" "$meta_pct"; then
        state=blocked
        blocked=1
      fi
      echo "$state $mount: btrfs metadata ${meta_pct}% of its allocated chunks used (limit: below ${max_meta_pct}%; if blocked, the owner frees space or runs a filtered balance as root)"
    fi
  fi
done

cpus=$(getconf _NPROCESSORS_ONLN 2>/dev/null || sysctl -n hw.ncpu 2>/dev/null || echo 1)
if [ -r /proc/loadavg ]; then
  load1=$(awk '{ print $1 }' /proc/loadavg)
else
  load1=$(sysctl -n vm.loadavg 2>/dev/null | awk '{ gsub("[{}]", ""); print $1 }')
fi
if [ -n "${load1:-}" ]; then
  limit=$(awk -v c="$cpus" -v m="$max_load_per_cpu" 'BEGIN { print c * m }')
  state=ok
  if gt "$load1" "$limit"; then
    state=blocked
    blocked=1
  fi
  echo "$state load: ${load1} over ${cpus} CPUs (limit: ${limit})"
fi

if [ "$blocked" -ne 0 ]; then
  echo "capacity: blocked"
  exit 1
fi
echo "capacity: ok"
