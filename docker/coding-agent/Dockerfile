FROM ubuntu:24.04

ENV DEBIAN_FRONTEND=noninteractive

# ──────────────────────────────────────────────
# System packages (superset of all runtimes)
# ──────────────────────────────────────────────
RUN apt-get update && apt-get install -y \
    # Core
    git \
    curl \
    jq \
    procps \
    ca-certificates \
    gnupg \
    build-essential \
    locales \
    # Interactive (workspace runtime)
    tmux \
    # Emoji rendering (workspace runtime)
    fonts-noto-color-emoji \
    fonts-symbola \
    # Playwright Chromium system deps
    libnss3 \
    libnspr4 \
    libatk1.0-0 \
    libatk-bridge2.0-0 \
    libcups2 \
    libdrm2 \
    libdbus-1-3 \
    libxkbcommon0 \
    libatspi2.0-0 \
    libxcomposite1 \
    libxdamage1 \
    libxfixes3 \
    libxrandr2 \
    libgbm1 \
    libasound2t64 \
    libpango-1.0-0 \
    libcairo2 \
    && rm -rf /var/lib/apt/lists/*

# Locale
RUN locale-gen en_US.UTF-8
ENV LANG=en_US.UTF-8
ENV LC_ALL=en_US.UTF-8
ENV LC_CTYPE=en_US.UTF-8

# ──────────────────────────────────────────────
# GitHub CLI
# ──────────────────────────────────────────────
RUN curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg \
        | dd of=/usr/share/keyrings/githubcli-archive-keyring.gpg \
    && echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" \
        | tee /etc/apt/sources.list.d/github-cli.list > /dev/null \
    && apt-get update && apt-get install -y gh \
    && rm -rf /var/lib/apt/lists/*

# ──────────────────────────────────────────────
# ttyd (web terminal — used by workspace runtime)
# ──────────────────────────────────────────────
RUN curl -fsSL -o /usr/local/bin/ttyd \
        https://github.com/tsl0922/ttyd/releases/download/1.7.7/ttyd.x86_64 \
    && chmod +x /usr/local/bin/ttyd

# ──────────────────────────────────────────────
# Node.js 22
# ──────────────────────────────────────────────
RUN curl -fsSL https://deb.nodesource.com/setup_22.x | bash - \
    && apt-get install -y nodejs \
    && rm -rf /var/lib/apt/lists/*

# ──────────────────────────────────────────────
# Non-root user
# ──────────────────────────────────────────────
RUN useradd -m -s /bin/bash -u 1001 coding-agent \
    && mkdir -p /home/coding-agent/workspace \
    && chown coding-agent:coding-agent /home/coding-agent/workspace

# ──────────────────────────────────────────────
# Playwright Chrome for Testing (pre-installed for MCP)
# ──────────────────────────────────────────────
ENV PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers
RUN npx -y @playwright/mcp@0.0.70 install-browser chrome-for-testing \
    && chown -R coding-agent:coding-agent /opt/pw-browsers

# ──────────────────────────────────────────────
# Copy scripts, commands, and configs
# ──────────────────────────────────────────────
COPY scripts/ /scripts/
COPY .tmux.conf /home/coding-agent/.tmux.conf
COPY .tmux.conf /scripts/.tmux.conf
COPY entrypoint.sh /entrypoint.sh

RUN chmod +x /entrypoint.sh \
    && chmod +x /scripts/**/*.sh \
    && chown coding-agent:coding-agent /home/coding-agent/.tmux.conf

# ──────────────────────────────────────────────
# Runtime config
# ──────────────────────────────────────────────
USER coding-agent
WORKDIR /home/coding-agent/workspace

# RUNTIME: job | headless | interactive | cluster-worker | command/*
ENV RUNTIME=""

ENTRYPOINT ["/entrypoint.sh"]
