#!/bin/bash
# Start Claude Code in tmux, serve via ttyd (interactive runtime only)
# CONTINUE_SESSION: 1 = continue most recent session (-c)

CLAUDE_ARGS="claude --dangerously-skip-permissions"
if [ "$CONTINUE_SESSION" = "1" ]; then
    CLAUDE_ARGS="$CLAUDE_ARGS -c"
fi

tmux -u new-session -d -s claude "$CLAUDE_ARGS"
exec ttyd --writable -p "${PORT:-7681}" tmux attach -t claude
