# Skills

Skills extend your agent's capabilities. A skill is a folder containing a `SKILL.md` file and optionally script files. The agent reads the SKILL.md to learn how to use it, then runs scripts via bash.

Skills work with both Pi and Claude Code — they share the same `skills/active/` directory.

---

## How Skills Work

- `skills/` — all available skills
- `skills/active/` — symlinks to activated skills (both agents read from here)

At startup, the agent scans `skills/active/` and loads **only the name + description** from each SKILL.md frontmatter into its system prompt. Full instructions are loaded on-demand when the agent decides a skill is relevant.

---

## Default Active Skills

These are activated out of the box:

| Skill | Description |
|-------|-------------|
| `get-secret` | List available LLM-accessible credentials |

## Available Skills

These ship with the package but must be activated manually:

| Skill | Description |
|-------|-------------|
| `brave-search` | Web search and content extraction via Brave Search API |
| `google-docs` | Create and manage Google Docs on a shared drive |
| `google-drive` | Google Drive operations (list, upload, download, delete) |
| `kie-ai` | AI image and video generation via kie.ai API |
| `youtube-transcript` | YouTube transcript extraction |

---

## Activate / Deactivate

```bash
# Activate
cd skills/active
ln -s ../skill-name skill-name

# Deactivate
rm skills/active/skill-name
```

---

## Building a Custom Skill

### Skill Folder Structure

```
skills/my-skill/
├── SKILL.md          # Instructions for agent and human
├── package.json      # Optional: npm dependencies
└── script.sh         # Script(s) the agent runs
```

### SKILL.md Format

```markdown
---
name: my-skill
description: One sentence describing what the skill does and when to use it.
---

# My Skill

## Usage

\```bash
skills/my-skill/script.sh <args>
\```
```

- **`name`** — kebab-case, matches the folder name
- **`description`** — appears in the system prompt under "Active skills"
- **Body** — full usage instructions the agent reads on-demand
- Use **project-root-relative paths** in all examples

### Simple Bash Skill

```bash
#!/bin/bash
if [ -z "$1" ]; then echo "Usage: my-skill.sh <arg>"; exit 1; fi
if [ -z "$MY_API_KEY" ]; then echo "Error: MY_API_KEY not set"; exit 1; fi
curl -s "https://api.example.com/endpoint" \
  -H "Authorization: Bearer $MY_API_KEY" \
  -d "query=$1"
```

### Node.js Skill

If bash + curl isn't sufficient, use Node.js with a `package.json`. Dependencies are installed automatically in Docker. Run `npm install` once locally in the skill directory.

---

## Credential Setup

If a skill needs an API key, add it via the admin UI (Settings > Agent Jobs > Secrets). The secret will be injected as an env var into Docker containers. The agent can discover available secrets via the `get-secret` skill.

---

## External Skills

Additional skills are available at: https://github.com/badlogic/pi-skills

Skills follow the **Agent Skills standard** (SKILL.md format), compatible with Pi, Claude Code, Codex CLI, Amp, and Droid.
