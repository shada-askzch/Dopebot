# Configuration

## Config Files

The `config/` directory defines your agent's personality and behavior:

| File | Purpose |
|------|---------|
| `agent-chat/SYSTEM.md` | Agent chat system prompt |
| `code-chat/SYSTEM.md` | Code workspace planning system prompt |
| `agent-job/SOUL.md` | Agent identity, personality traits, and values |
| `agent-job/AGENT_JOB.md` | Agent runtime environment docs |
| `agent-job/SUMMARY.md` | Prompt for summarizing completed jobs |
| `cluster/SYSTEM.md` | System prompt for cluster worker agents |
| `cluster/ROLE.md` | Per-role prompt template for cluster workers |
| `HEARTBEAT.md` | Self-monitoring behavior |
| `CRONS.json` | Scheduled job definitions |
| `TRIGGERS.json` | Webhook trigger definitions |

### Markdown Includes and Variables

Config markdown files support includes and built-in variables (processed by the package's `render-md.js`):

| Syntax | Description |
|--------|-------------|
| `{{ filepath.md }}` | Include another file (relative to project root, recursive with circular detection) |
| `{{datetime}}` | Current ISO timestamp |
| `{{skills}}` | Dynamic bullet list of active skill descriptions from `skills/active/*/SKILL.md` frontmatter |

---

## Environment Variables

Set in `.env` in your project root. These configure the **Event Handler** (web chat, Telegram, webhooks, job summaries).

| Variable | Description | Required |
|----------|-------------|----------|
| `APP_URL` | Public URL for webhooks and Telegram | Yes |
| `AUTH_SECRET` | NextAuth session encryption (auto-generated) | Yes |
| `GH_TOKEN` | GitHub PAT for creating branches/files | Yes |
| `GH_OWNER` | GitHub repository owner | Yes |
| `GH_REPO` | GitHub repository name | Yes |
| `TELEGRAM_BOT_TOKEN` | Telegram bot token | For Telegram |
| `TELEGRAM_WEBHOOK_SECRET` | Telegram webhook validation secret | No |
| `TELEGRAM_CHAT_ID` | Default chat ID for notifications | For Telegram |
| `GH_WEBHOOK_SECRET` | GitHub Actions webhook auth | For notifications |
| `LLM_PROVIDER` | `anthropic`, `openai`, `google`, or `custom` | No (default: `anthropic`) |
| `LLM_MODEL` | Model name override | No |
| `LLM_MAX_TOKENS` | Max tokens for LLM responses | No (default: 4096) |
| `ANTHROPIC_API_KEY` | Anthropic API key | For anthropic provider |
| `OPENAI_API_KEY` | OpenAI API key / Whisper | For openai provider |
| `CUSTOM_OPENAI_BASE_URL` | Custom OpenAI-compatible base URL | For custom provider |
| `GOOGLE_API_KEY` | Google API key | For google provider |
| `CUSTOM_API_KEY` | Custom provider API key | For custom provider |
| `AGENT_BACKEND` | Agent runner: `pi` or `claude-code` | No (default: `claude-code`) |
| `ASSEMBLYAI_API_KEY` | API key for voice transcription | For voice input |
| `DATABASE_PATH` | Override SQLite DB location | No |
| `COMPOSE_FILE` | Override docker-compose file | No |

---

## LLM Providers

thepopebot has **two independent LLM configurations**:

- **Event Handler** (chat, Telegram, webhooks, summaries) — configured via `.env`
- **Jobs** (Docker agent on GitHub Actions) — configured via GitHub repo variables

You can run different models for each. For example, Claude for interactive chat and a local Ollama model for jobs.

| Provider | Example model | API key env var |
|----------|---------------|-----------------|
| `anthropic` (default) | `claude-sonnet-4-20250514` | `ANTHROPIC_API_KEY` |
| `openai` | `gpt-4o` | `OPENAI_API_KEY` |
| `google` | `gemini-2.5-pro` | `GOOGLE_API_KEY` |
| `custom` | Any OpenAI-compatible API | `CUSTOM_API_KEY` + `CUSTOM_OPENAI_BASE_URL` |

### Setting the Event Handler Model

```bash
# In .env
LLM_PROVIDER=anthropic
LLM_MODEL=claude-sonnet-4-20250514
ANTHROPIC_API_KEY=sk-ant-...
```

Restart your server after changes.

### Setting the Default Job Model

```bash
npx thepopebot set-var LLM_PROVIDER openai
npx thepopebot set-var LLM_MODEL gpt-4o
# Set API keys via admin UI: Settings > Agent Jobs > Secrets
```

### Per-Job Overrides

Add `llm_provider` and `llm_model` to any agent-type entry in `CRONS.json` or `TRIGGERS.json`:

```json
{
  "name": "Code review",
  "schedule": "0 9 * * 1",
  "type": "agent",
  "job": "Review open PRs",
  "llm_provider": "openai",
  "llm_model": "gpt-4o"
}
```

### Using the `custom` Provider

Point at any OpenAI-compatible endpoint (DeepSeek, Ollama, Together AI, etc.):

```bash
# Cloud custom (DeepSeek, Together AI, etc.)
npx thepopebot set-var LLM_PROVIDER custom
npx thepopebot set-var LLM_MODEL deepseek-chat
npx thepopebot set-var CUSTOM_OPENAI_BASE_URL https://api.deepseek.com/v1
# Set CUSTOM_API_KEY via admin UI: Settings > Agent Jobs > Secrets

# Local custom (Ollama, LM Studio, etc.) — needs self-hosted runner
npx thepopebot set-var RUNS_ON self-hosted
npx thepopebot set-var LLM_PROVIDER custom
npx thepopebot set-var LLM_MODEL qwen3:8b
npx thepopebot set-var CUSTOM_OPENAI_BASE_URL http://host.docker.internal:11434/v1
```

---

## Agent Job Secrets

Agent job secrets are managed through the admin UI (Settings > Agent Jobs > Secrets). They are stored encrypted in SQLite and injected as env vars into Docker containers. The agent can discover available secrets via the `get-secret` skill.

---

## GitHub Repository Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `APP_URL` | Public URL for the event handler | Required |
| `AUTO_MERGE` | Set to `"false"` to disable auto-merge | Enabled |
| `ALLOWED_PATHS` | Comma-separated path prefixes for auto-merge | `/logs` |
| `JOB_IMAGE_URL` | Docker image for job agent | Default thepopebot image |
| `EVENT_HANDLER_IMAGE_URL` | Docker image for event handler | Default thepopebot image |
| `RUNS_ON` | GitHub Actions runner label | `ubuntu-latest` |
| `LLM_PROVIDER` | LLM provider for Docker agent | `anthropic` |
| `LLM_MODEL` | LLM model name for Docker agent | Provider default |
| `AGENT_BACKEND` | Agent runner: `pi` or `claude-code` | `claude-code` |

---

## GitHub PAT Permissions

Create a fine-grained PAT scoped to your repository:

| Permission | Access | Why |
|------------|--------|-----|
| Actions | Read and write | Trigger and monitor workflows |
| Administration | Read and write | Required for self-hosted runners |
| Contents | Read and write | Create branches, commit files |
| Metadata | Read-only | Required (auto-selected) |
| Pull requests | Read and write | Create and manage PRs |
| Secrets | Read and write | Manage agent secrets from web UI |
| Workflows | Read and write | Create and update workflow files |

---

## Docker Compose

For self-hosted deployment:

```bash
npm run build
docker compose up -d
```

This starts Traefik (reverse proxy with SSL), the Event Handler (Node.js + PM2), and a self-hosted GitHub Actions runner.

To customize Docker Compose without losing changes on upgrade, set `COMPOSE_FILE=docker-compose.custom.yml` in `.env`. The custom file is scaffolded by init but never overwritten.
