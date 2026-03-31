#!/bin/bash
# Start Kimi CLI in tmux, serve via ttyd (interactive runtime only)

KIMI_ARGS="kimi"
if [ -n "$LLM_MODEL" ]; then
    KIMI_ARGS="$KIMI_ARGS --model $LLM_MODEL"
fi

SESSION_FILE="/home/coding-agent/.kimi-ttyd-sessions/${PORT:-7681}"
if [ "$CONTINUE_SESSION" = "1" ] && [ -f "$SESSION_FILE" ]; then
    SESSION_ID=$(cat "$SESSION_FILE")
    if [ -n "$SESSION_ID" ]; then
        KIMI_ARGS="$KIMI_ARGS --session $SESSION_ID"
    fi
fi

tmux -u new-session -d -s kimi -e PORT="${PORT:-7681}" $KIMI_ARGS
exec ttyd --writable -p "${PORT:-7681}" tmux attach -t kimi
