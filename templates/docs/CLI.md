# CLI Reference

All commands are run via `npx thepopebot <command>`.

## Project Setup

| Command | Description |
|---------|-------------|
| `init` | Scaffold a new project, or update templates in an existing one |
| `setup` | Run the full interactive setup wizard (`npm run setup`) |
| `setup-telegram` | Reconfigure the Telegram webhook (`npm run setup-telegram`) |
| `reset-auth` | Regenerate AUTH_SECRET, invalidating all sessions |

## Templates

| Command | Description |
|---------|-------------|
| `diff [file]` | List files that differ from package templates, or diff a specific file |
| `reset [file]` | List all template files, or restore a specific one to package default |
| `upgrade` / `update` | Upgrade thepopebot (install, init, build, commit, push, restart Docker) |
| `sync <path>` | Sync local package to a test install (dev workflow) |
| `user:password <email>` | Change a user's password |

## Secrets and Variables

These set GitHub repository secrets/variables using the `gh` CLI. They read `GH_OWNER` and `GH_REPO` from your `.env`. If VALUE is omitted, you'll be prompted with masked input.

| Command | Description |
|---------|-------------|
| `set-var KEY [VALUE]` | Set a GitHub repository variable |

Agent job secrets are now managed through the admin UI (Settings > Agent Jobs > Secrets), stored encrypted in SQLite, and injected directly into Docker containers.

## Common Workflows

### Initial setup
```bash
npx thepopebot init
npm run setup
```

### Upgrade to latest version
```bash
npx thepopebot upgrade
```

### Check what changed in templates
```bash
npx thepopebot diff                    # list all differing files
npx thepopebot diff config/CRONS.json  # see specific changes
npx thepopebot reset config/CRONS.json # accept new template
```

### Set up a new LLM provider for jobs
```bash
npx thepopebot set-var LLM_PROVIDER openai
npx thepopebot set-var LLM_MODEL gpt-4o
# Set API keys via admin UI: Settings > Agent Jobs > Secrets
```
