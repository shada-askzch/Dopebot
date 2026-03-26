#!/bin/bash
# Claude Code setup — trust config, onboarding skip, Playwright MCP

WORKSPACE_DIR=$(pwd)

mkdir -p ~/.claude

cat > ~/.claude/settings.json << 'EOF'
{
  "theme": "dark",
  "hasTrustDialogAccepted": true,
  "skipDangerousModePermissionPrompt": true,
  "permissions": {
    "allow": [
      "WebSearch",
      "WebFetch"
    ]
  }
}
EOF

cat > ~/.claude.json << ENDJSON
{
  "hasCompletedOnboarding": true,
  "projects": {
    "${WORKSPACE_DIR}": {
      "allowedTools": ["WebSearch"],
      "hasTrustDialogAccepted": true,
      "hasTrustDialogHooksAccepted": true
    }
  }
}
ENDJSON

# Register Playwright MCP server for browser automation
claude mcp add --transport stdio playwright -- npx -y @playwright/mcp@latest --headless --browser chromium
