#!/bin/bash
# Kimi CLI setup — session tracking hook, system prompt, Playwright MCP

WORKSPACE_DIR=$(pwd)

# Write system prompt to AGENTS.md (Kimi reads this automatically)
if [ -n "$SYSTEM_PROMPT" ]; then
    echo "$SYSTEM_PROMPT" > "${WORKSPACE_DIR}/AGENTS.md"
else
    rm -f "${WORKSPACE_DIR}/AGENTS.md"
fi

# Write the session tracking hook script (run on every SessionStart)
# Writes Kimi session_id to .kimi-ttyd-sessions/${PORT:-7681}
cat > /home/coding-agent/.kimi-ttyd-sessions-hook.sh << 'EOF'
#!/bin/bash
SESSION_ID=$(cat | grep -o '"session_id": *"[^"]*"' | cut -d'"' -f4)
[ -z "$SESSION_ID" ] || [ "$SESSION_ID" = "null" ] && exit 0
DIR=/home/coding-agent/.kimi-ttyd-sessions
mkdir -p "$DIR"
FILE="$DIR/${PORT:-7681}"
echo "$SESSION_ID" > "$FILE"
echo '{}' >&1
exit 0
EOF
chmod +x /home/coding-agent/.kimi-ttyd-sessions-hook.sh

# Configure Kimi: yolo mode + session tracking hook + model
cat > ~/.kimi/config.toml << TOML
default_yolo = true
$([ -n "$LLM_MODEL" ] && echo "default_model = \"$LLM_MODEL\"")

[[hooks]]
event = "SessionStart"
command = "bash /home/coding-agent/.kimi-ttyd-sessions-hook.sh"
timeout = 5
TOML

# Register Playwright MCP server for browser automation
kimi mcp add --transport stdio playwright -- npx -y @playwright/mcp@latest --headless --browser chromium 2>/dev/null || true
