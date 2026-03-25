'use client';

import { useState, useEffect } from 'react';

/**
 * Generic sub-tab navigation using pill buttons.
 * @param {{ tabs: { id: string, label: string, href: string }[], children: React.ReactNode }} props
 */
export function SubTabLayout({ tabs, children }) {
  const [activePath, setActivePath] = useState('');

  useEffect(() => {
    setActivePath(window.location.pathname);
  }, []);

  return (
    <div>
      {/* Sub-tab navigation (pills) */}
      <div className="flex gap-1.5 mb-6">
        {tabs.map((tab) => {
          const isActive = activePath === tab.href || activePath.startsWith(tab.href + '/');
          return (
            <a
              key={tab.id}
              href={tab.href}
              className={`rounded-full px-3 py-1.5 min-h-[36px] inline-flex items-center text-xs font-medium transition-colors ${
                isActive
                  ? 'bg-foreground text-background'
                  : 'text-muted-foreground hover:text-foreground hover:bg-accent'
              }`}
            >
              {tab.label}
            </a>
          );
        })}
      </div>

      {/* Sub-tab content */}
      {children}
    </div>
  );
}

// Pre-configured layouts for each top-level tab

const API_KEYS_TABS = [
  { id: 'webhooks', label: 'Webhooks', href: '/admin/api-keys/webhooks' },
  { id: 'voice', label: 'Voice', href: '/admin/api-keys/voice' },
];

const EVENT_HANDLER_TABS = [
  { id: 'llms', label: 'LLMs', href: '/admin/event-handler/llms' },
  { id: 'chat', label: 'Chat', href: '/admin/event-handler/chat' },
  { id: 'coding-agents', label: 'Coding Agents', href: '/admin/event-handler/coding-agents' },
  { id: 'agent-jobs', label: 'Agent Jobs', href: '/admin/event-handler/agent-jobs' },
  { id: 'webhooks', label: 'Webhooks', href: '/admin/event-handler/webhooks' },
  { id: 'telegram', label: 'Telegram', href: '/admin/event-handler/telegram' },
  { id: 'voice', label: 'Voice', href: '/admin/event-handler/voice' },
];

const GITHUB_TABS = [
  { id: 'tokens', label: 'Tokens', href: '/admin/github/tokens' },
  { id: 'secrets', label: 'Secrets', href: '/admin/github/secrets' },
  { id: 'variables', label: 'Variables', href: '/admin/github/variables' },
];

export function ApiKeysLayout({ children }) {
  return <SubTabLayout tabs={API_KEYS_TABS}>{children}</SubTabLayout>;
}

export function EventHandlerLayout({ children }) {
  return <SubTabLayout tabs={EVENT_HANDLER_TABS}>{children}</SubTabLayout>;
}

// Backwards compat
export function ChatSettingsLayout({ children }) {
  return <EventHandlerLayout>{children}</EventHandlerLayout>;
}

export function GitHubSettingsLayout({ children }) {
  return <SubTabLayout tabs={GITHUB_TABS}>{children}</SubTabLayout>;
}

// Backwards compat — kept as alias
export function SecretsLayout({ children }) {
  return <ApiKeysLayout>{children}</ApiKeysLayout>;
}
