#!/bin/bash
# Called by ttyd on each connection — uses tmux to keep Kimi alive between disconnects

SESSION_NAME="kimi-${PORT}"

# Already running — just reattach
if tmux has-session -t "$SESSION_NAME" 2>/dev/null; then
    exec tmux attach -t "$SESSION_NAME"
fi

# Build Kimi args
SESSION_FILE="/home/coding-agent/.kimi-ttyd-sessions/${PORT}"
KIMI_ARGS="kimi"

if [ -f "$SESSION_FILE" ]; then
    SESSION_ID=$(cat "$SESSION_FILE")
    if [ -n "$SESSION_ID" ]; then
        KIMI_ARGS="$KIMI_ARGS --session $SESSION_ID"
    fi
fi

# Start tmux session with Kimi, then attach
tmux -u new-session -d -s "$SESSION_NAME" -e PORT="${PORT}" -c /home/coding-agent/workspace $KIMI_ARGS
exec tmux attach -t "$SESSION_NAME"
