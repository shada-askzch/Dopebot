#!/bin/bash
# Start Codex CLI in tmux, serve via ttyd (interactive runtime only)
# CONTINUE_SESSION: 1 = continue most recent session (resume --last)

CODEX_ARGS="codex"
if [ "$CONTINUE_SESSION" = "1" ]; then
    CODEX_ARGS="$CODEX_ARGS resume --last"
fi

tmux -u new-session -d -s codex "$CODEX_ARGS"
exec ttyd --writable -p "${PORT:-7681}" tmux attach -t codex
