#!/bin/bash
# Start Pi in tmux, serve via ttyd (interactive runtime only)
# CONTINUE_SESSION: 1 = continue most recent session (-c)

PI_ARGS="pi"
if [ "$CONTINUE_SESSION" = "1" ]; then
    PI_ARGS="$PI_ARGS -c"
fi

tmux -u new-session -d -s pi "$PI_ARGS"
exec ttyd --writable -p "${PORT:-7681}" tmux attach -t pi
