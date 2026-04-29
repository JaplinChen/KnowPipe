#!/bin/bash

set -euo pipefail

KILL_OMLX=0
KILL_CLAUDE_CLI=0
SHOW_TOP="${SHOW_TOP:-12}"

usage() {
  cat <<'EOF'
Usage:
  bash scripts/memory-audit.sh
  bash scripts/memory-audit.sh --kill-omlx
  bash scripts/memory-audit.sh --kill-claude-cli

Options:
  --kill-omlx        Stop local `omlx serve` processes after the report.
  --kill-claude-cli  Stop Claude Code CLI/worktree sessions after the report.
  -h, --help         Show this help.
EOF
}

for arg in "$@"; do
  case "$arg" in
    --kill-omlx)
      KILL_OMLX=1
      ;;
    --kill-claude-cli)
      KILL_CLAUDE_CLI=1
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown argument: $arg" >&2
      usage >&2
      exit 1
      ;;
  esac
done

if ! command -v ps >/dev/null 2>&1; then
  echo "ps command not found" >&2
  exit 1
fi

report="$(ps -axo pid,ppid,%cpu,%mem,rss,etime,command)"
claude_cli_pids=""
for pid in $(pgrep -f '/claude.app/Contents/MacOS/claude' || true); do
  full_cmd="$(ps -p "$pid" -o command= 2>/dev/null || true)"
  if [ -n "$full_cmd" ] && [[ "$full_cmd" != *"/Contents/Helpers/disclaimer "* ]]; then
    claude_cli_pids+="${pid}"$'\n'
  fi
done
claude_cli_pids="$(printf "%s" "$claude_cli_pids" | awk 'NF')"

echo "Memory audit ($(date '+%Y-%m-%d %H:%M:%S'))"
echo
echo "Top ${SHOW_TOP} processes by RSS (MB)"
printf "%-8s %-8s %-6s %-6s %-10s %-12s %s\n" "PID" "PPID" "%CPU" "%MEM" "RSS(MB)" "ELAPSED" "COMMAND"
set +o pipefail
echo "$report" \
  | tail -n +2 \
  | sort -k5 -nr \
  | head -n "$SHOW_TOP" \
  | awk '{
      rss_mb = $5 / 1024
      cmd = ""
      for (i = 7; i <= NF; i++) cmd = cmd $i " "
      printf "%-8s %-8s %-6s %-6s %-10.1f %-12s %s\n", $1, $2, $3, $4, rss_mb, $6, cmd
    }'
set -o pipefail

echo
echo "Grouped RSS summary"
echo "$report" | awk '
function bump(name, amount) {
  totals[name] += amount
}
NR == 1 { next }
{
  rss = $5
  cmd = ""
  for (i = 7; i <= NF; i++) cmd = cmd $i " "

  if (cmd ~ /omlx serve/) bump("omlx", rss)
  else if (cmd ~ /Virtualization\.VirtualMachine|claudevm\.bundle/) bump("claude_vm", rss)
  else if (cmd ~ /Claude|claude/) bump("claude", rss)
  else if (cmd ~ /Codex/) bump("codex", rss)
  else if (cmd ~ /Google Chrome/) bump("chrome", rss)
  else if (cmd ~ /Brave Browser/) bump("brave", rss)
  else if (cmd ~ /KnowPipe|tsx src\/index\.ts|esbuild --service/) bump("knowpipe", rss)
  else bump("other", rss)
}
END {
  order[1] = "omlx"
  order[2] = "claude_vm"
  order[3] = "claude"
  order[4] = "codex"
  order[5] = "chrome"
  order[6] = "brave"
  order[7] = "knowpipe"
  order[8] = "other"

  for (i = 1; i <= 8; i++) {
    key = order[i]
    printf "%-12s %.1f MB\n", key ":", totals[key] / 1024
  }
}'

echo
echo "Candidates to review"
echo "$report" | awk '
NR == 1 { next }
{
  rss_mb = $5 / 1024
  cmd = ""
  for (i = 7; i <= NF; i++) cmd = cmd $i " "

  reason = ""
  if (cmd ~ /omlx serve/ && rss_mb > 1024) {
    reason = "local model server; often safe to stop when idle"
  } else if (cmd ~ /Virtualization\.VirtualMachine/ && rss_mb > 1024) {
    reason = "Claude local agent VM; close Claude Desktop if not needed"
  } else if (cmd ~ /Claude\/.*\/MacOS\/claude/ && rss_mb > 200) {
    reason = "Claude CLI/worktree session; stop stale sessions"
  } else if (cmd ~ /Google Chrome Helper \(Renderer\)|Brave Browser Helper \(Renderer\)/ && rss_mb > 200) {
    reason = "heavy browser tab/renderer"
  }

  if (reason != "") {
    printf "- PID %s (%.1f MB): %s [%s]\n", $1, rss_mb, reason, cmd
  }
}'

echo
echo "Claude CLI sessions"
if [ -z "$claude_cli_pids" ]; then
  echo "  No Claude CLI sessions found."
else
  for pid in $claude_cli_pids; do
    line="$(echo "$report" | awk -v target="$pid" '
      $1 == target {
        cmd = ""
        for (i = 7; i <= NF; i++) cmd = cmd $i " "
        printf "%s|%s|%s|%s", $5, $6, $3, cmd
      }'
    )"
    rss_kb="${line%%|*}"
    rest="${line#*|}"
    elapsed="${rest%%|*}"
    rest="${rest#*|}"
    cpu="${rest%%|*}"
    cmd="${rest#*|}"
    worktree="$(lsof -a -d cwd -p "$pid" -Fn 2>/dev/null | awk 'BEGIN { found = "" } /^n/ { found = substr($0, 2) } END { print found }')"
    [ -z "$worktree" ] && worktree="(cwd unavailable)"
    rss_mb="$(awk -v rss="$rss_kb" 'BEGIN { printf "%.1f", rss / 1024 }')"
    printf "  - PID %s | RSS %s MB | CPU %s | ELAPSED %s\n" "$pid" "$rss_mb" "$cpu" "$elapsed"
    echo "    worktree: $worktree"
    echo "    cmd: $cmd"
  done
fi

echo
echo "memory_pressure"
memory_pressure | sed 's/^/  /'

if [ "$KILL_OMLX" -eq 1 ]; then
  pids="$(pgrep -f 'omlx serve' || true)"
  echo
  if [ -z "$pids" ]; then
    echo "No running \`omlx serve\` process found."
  else
    echo "Stopping \`omlx serve\` PIDs: $pids"
    kill -TERM $pids
  fi
fi

if [ "$KILL_CLAUDE_CLI" -eq 1 ]; then
  echo
  if [ -z "$claude_cli_pids" ]; then
    echo "No running Claude CLI session found."
  else
    echo "Stopping Claude CLI PIDs: $claude_cli_pids"
    kill -TERM $claude_cli_pids
  fi
fi
