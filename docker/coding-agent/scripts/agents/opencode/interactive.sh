#!/bin/bash
# Start OpenCode in tmux, serve via ttyd (interactive runtime only)
# CONTINUE_SESSION: 1 = continue most recent session (tui --continue)

OPENCODE_ARGS="opencode"
if [ "$CONTINUE_SESSION" = "1" ]; then
    OPENCODE_ARGS="$OPENCODE_ARGS tui --continue"
fi

tmux -u new-session -d -s opencode "$OPENCODE_ARGS"
exec ttyd --writable -p "${PORT:-7681}" tmux attach -t opencode
