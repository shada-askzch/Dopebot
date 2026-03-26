#!/bin/bash
# Start Gemini CLI in tmux, serve via ttyd (interactive runtime only)
# CONTINUE_SESSION: 1 = continue most recent session (--resume)

GEMINI_ARGS="gemini --approval-mode yolo"
if [ "$CONTINUE_SESSION" = "1" ]; then
    GEMINI_ARGS="$GEMINI_ARGS --resume"
fi

tmux -u new-session -d -s gemini "$GEMINI_ARGS"
exec ttyd --writable -p "${PORT:-7681}" tmux attach -t gemini
