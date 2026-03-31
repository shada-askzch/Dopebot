#!/bin/bash
# Run Kimi CLI headlessly with the given PROMPT
# Sets AGENT_EXIT for downstream scripts (commit, push, etc.)

KIMI_ARGS=(--print -p "$PROMPT" --output-format stream-json)

if [ -n "$LLM_MODEL" ]; then
    KIMI_ARGS+=(--model "$LLM_MODEL")
fi

SESSION_FILE="/home/coding-agent/.kimi-ttyd-sessions/7681"
if [ "$CONTINUE_SESSION" = "1" ] && [ -f "$SESSION_FILE" ]; then
    SESSION_ID=$(cat "$SESSION_FILE")
    if [ -n "$SESSION_ID" ]; then
        KIMI_ARGS+=(--session "$SESSION_ID")
    fi
fi

set +e
kimi "${KIMI_ARGS[@]}"
AGENT_EXIT=$?
set -e
