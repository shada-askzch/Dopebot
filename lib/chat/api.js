import { auth } from '../auth/index.js';
import { chatStream } from '../ai/index.js';
import { v4 as uuidv4 } from 'uuid';

/**
 * POST handler for /stream/chat — streaming chat with session auth.
 * Dedicated route handler separate from the catch-all api/index.js.
 */
export async function POST(request) {
  const session = await auth();
  if (!session?.user?.id) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json();
  const { messages, chatId: rawChatId, trigger, codeMode, repo, branch, workspaceId, codeModeType } = body;

  if (!messages?.length) {
    return Response.json({ error: 'No messages' }, { status: 400 });
  }

  // Get the last user message — AI SDK v5 sends UIMessage[] with parts
  const lastUserMessage = [...messages].reverse().find((m) => m.role === 'user');
  if (!lastUserMessage) {
    return Response.json({ error: 'No user message' }, { status: 400 });
  }

  // Extract text from message parts (AI SDK v5+) or fall back to content
  let userText =
    lastUserMessage.parts
      ?.filter((p) => p.type === 'text')
      .map((p) => p.text)
      .join('\n') ||
    lastUserMessage.content ||
    '';

  // Extract file parts from message
  const fileParts = lastUserMessage.parts?.filter((p) => p.type === 'file') || [];
  const attachments = [];

  for (const part of fileParts) {
    const { mediaType, url } = part;
    if (!mediaType || !url) continue;

    if (mediaType.startsWith('image/') || mediaType === 'application/pdf') {
      // Images and PDFs → pass as visual attachments for the LLM
      attachments.push({ category: 'image', mimeType: mediaType, dataUrl: url });
    } else if (mediaType.startsWith('text/') || mediaType === 'application/json') {
      // Text files → decode base64 data URL and inline into message text
      try {
        const base64Data = url.split(',')[1];
        const textContent = Buffer.from(base64Data, 'base64').toString('utf-8');
        const fileName = part.name || 'file';
        userText += `\n\nFile: ${fileName}\n\`\`\`\n${textContent}\n\`\`\``;
      } catch (e) {
        console.error('Failed to decode text file:', e);
      }
    }
  }

  if (!userText.trim() && attachments.length === 0) {
    return Response.json({ error: 'Empty message' }, { status: 400 });
  }

  // Map web channel to thread_id — AI layer handles DB persistence
  const threadId = rawChatId || uuidv4();
  const { createUIMessageStream, createUIMessageStreamResponse } = await import('ai');

  const stream = createUIMessageStream({
    onError: (error) => {
      console.error('Chat stream error:', error);
      return error?.message || 'An error occurred while processing your message.';
    },
    execute: async ({ writer }) => {
      // chatStream handles: save user msg, invoke agent, save assistant msg, auto-title
      const skipUserPersist = trigger === 'regenerate-message';
      // Always pass workspace context — derive defaults for agent mode
      const effectiveRepo = repo || (process.env.GH_OWNER && process.env.GH_REPO ? `${process.env.GH_OWNER}/${process.env.GH_REPO}` : '');
      const effectiveBranch = branch || 'main';
      const streamOptions = {
        userId: session.user.id,
        skipUserPersist,
        codeMode: !!codeMode,
        repo: effectiveRepo,
        branch: effectiveBranch,
        codeModeType: codeModeType || 'plan',
      };
      if (workspaceId) streamOptions.workspaceId = workspaceId;
      const chunks = chatStream(threadId, userText, attachments, streamOptions);

      // Signal start of assistant message
      writer.write({ type: 'start' });

      let textStarted = false;
      let textId = uuidv4();

      for await (const chunk of chunks) {
        if (chunk.type === 'text') {
          if (!textStarted) {
            textId = uuidv4();
            writer.write({ type: 'text-start', id: textId });
            textStarted = true;
          }
          writer.write({ type: 'text-delta', id: textId, delta: chunk.text });

        } else if (chunk.type === 'tool-call') {
          // Close any open text block before tool events
          if (textStarted) {
            writer.write({ type: 'text-end', id: textId });
            textStarted = false;
          }
          writer.write({
            type: 'tool-input-start',
            toolCallId: chunk.toolCallId,
            toolName: chunk.toolName,
          });
          writer.write({
            type: 'tool-input-available',
            toolCallId: chunk.toolCallId,
            toolName: chunk.toolName,
            input: chunk.args,
          });

        } else if (chunk.type === 'tool-result') {
          writer.write({
            type: 'tool-output-available',
            toolCallId: chunk.toolCallId,
            output: chunk.result,
          });

        } else if (chunk.type === 'unknown') {
          // Close any open text block before unknown event
          if (textStarted) {
            writer.write({ type: 'text-end', id: textId });
            textStarted = false;
          }
          // Emit as a tool call so the UI renders it as a collapsible box
          const unknownId = `unknown-${uuidv4().slice(0, 8)}`;
          writer.write({
            type: 'tool-input-start',
            toolCallId: unknownId,
            toolName: '__unknown_event__',
          });
          writer.write({
            type: 'tool-input-available',
            toolCallId: unknownId,
            toolName: '__unknown_event__',
            input: chunk.raw,
          });
          writer.write({
            type: 'tool-output-available',
            toolCallId: unknownId,
            output: JSON.stringify(chunk.raw, null, 2),
          });
        }
      }

      // Close final text block if still open
      if (textStarted) {
        writer.write({ type: 'text-end', id: textId });
      }

      // Signal end of assistant message
      writer.write({ type: 'finish' });
    },
  });

  return createUIMessageStreamResponse({ stream });
}

/**
 * GET handler for /stream/workspace-diff/[workspaceId] — diff stats with session auth.
 * Uses a route handler instead of a server action to avoid Next.js page revalidation.
 */
export async function getWorkspaceDiff(request, { params }) {
  const session = await auth();
  if (!session?.user?.id) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { workspaceId } = await params;
  if (!workspaceId) {
    return Response.json({ success: false }, { status: 400 });
  }

  const { getWorkspaceDiffStats } = await import('../code/actions.js');
  const result = await getWorkspaceDiffStats(workspaceId, session.user);
  return Response.json(result);
}

/**
 * GET handler for /stream/workspace-diff/[workspaceId]/full — full unified diff with session auth.
 */
export async function getWorkspaceDiffFull(request, { params }) {
  const session = await auth();
  if (!session?.user?.id) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { workspaceId } = await params;
  if (!workspaceId) {
    return Response.json({ success: false }, { status: 400 });
  }

  const { getWorkspaceDiffFull: getDiffFull } = await import('../code/actions.js');
  const result = await getDiffFull(workspaceId, session.user);
  return Response.json(result);
}

/**
 * GET handler for /stream/default-repo — returns the default repo with session auth.
 * Uses a route handler instead of a server action to avoid Next.js page revalidation.
 */
export async function getDefaultRepoHandler(request) {
  const session = await auth();
  if (!session?.user?.id) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const owner = process.env.GH_OWNER;
  const repo = process.env.GH_REPO;
  return Response.json({ repo: (owner && repo) ? `${owner}/${repo}` : null });
}

/**
 * GET handler for /stream/sidebar-counts — notification + PR counts with session auth.
 * Combined endpoint to avoid multiple server action calls on mount/interval.
 */
export async function getSidebarCounts(request) {
  const session = await auth();
  if (!session?.user?.id) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const { getUnreadCount } = await import('../db/notifications.js');
  const notifications = getUnreadCount();
  let pullRequests = 0;
  try {
    const { getOpenPullRequests } = await import('../tools/github.js');
    pullRequests = (await getOpenPullRequests()).length;
  } catch {}
  return Response.json({ notifications, pullRequests });
}

/**
 * GET handler for /stream/app-version — version info with session auth.
 */
export async function getAppVersionHandler(request) {
  const session = await auth();
  if (!session?.user?.id) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const { getInstalledVersion } = await import('../cron.js');
  const { getAvailableVersion, getReleaseNotes } = await import('../db/update-check.js');
  const version = getInstalledVersion();
  const available = getAvailableVersion();
  const isNewer = available && available !== version;
  return Response.json({
    version,
    updateAvailable: isNewer ? available : null,
    changelog: isNewer ? getReleaseNotes() : null,
  });
}

/**
 * GET handler for /stream/chats — chat list with session auth.
 */
export async function getChatsHandler(request) {
  const session = await auth();
  if (!session?.user?.id) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const url = new URL(request.url);
  const limit = parseInt(url.searchParams.get('limit')) || undefined;
  const { or, eq, desc } = await import('drizzle-orm');
  const { getDb } = await import('../db/index.js');
  const { chats, codeWorkspaces } = await import('../db/schema.js');
  const db = getDb();
  let query = db
    .select({
      id: chats.id,
      userId: chats.userId,
      title: chats.title,
      starred: chats.starred,
      chatMode: chats.chatMode,
      codeWorkspaceId: chats.codeWorkspaceId,
      containerName: codeWorkspaces.containerName,
      hasChanges: codeWorkspaces.hasChanges,
      createdAt: chats.createdAt,
      updatedAt: chats.updatedAt,
    })
    .from(chats)
    .leftJoin(codeWorkspaces, eq(chats.codeWorkspaceId, codeWorkspaces.id))
    .where(or(eq(chats.userId, session.user.id), eq(chats.userId, 'telegram')))
    .orderBy(desc(chats.updatedAt));
  if (limit) query = query.limit(limit);
  return Response.json(query.all());
}

/**
 * POST handler for /stream/workspace-branch — update workspace branch with session auth.
 */
export async function updateWorkspaceBranchHandler(request) {
  const session = await auth();
  if (!session?.user?.id) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const { workspaceId, branch } = await request.json();
  const { getCodeWorkspaceById, updateBranch } = await import('../db/code-workspaces.js');
  const ws = getCodeWorkspaceById(workspaceId);
  if (!ws || ws.userId !== session.user.id) {
    return Response.json({ success: false }, { status: 403 });
  }
  updateBranch(workspaceId, branch);
  return Response.json({ success: true });
}

/**
 * GET handler for /stream/chat-messages/[chatId] — chat messages with session auth.
 */
export async function getChatMessagesHandler(request, { params }) {
  const session = await auth();
  if (!session?.user?.id) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const { chatId } = await params;
  if (!chatId) return Response.json([], { status: 400 });
  const { getChatById, getMessagesByChatId } = await import('../db/chats.js');
  const chat = getChatById(chatId);
  if (!chat || (chat.userId !== session.user.id && chat.userId !== 'telegram')) {
    return Response.json([]);
  }
  return Response.json(getMessagesByChatId(chatId));
}

/**
 * GET handler for /stream/chat-data/[chatId] — chat + workspace data with session auth.
 */
export async function getChatDataHandler(request, { params }) {
  const session = await auth();
  if (!session?.user?.id) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const { chatId } = await params;
  if (!chatId) return Response.json(null, { status: 400 });
  const { eq } = await import('drizzle-orm');
  const { getDb } = await import('../db/index.js');
  const { chats, codeWorkspaces } = await import('../db/schema.js');
  const db = getDb();
  const row = db
    .select()
    .from(chats)
    .leftJoin(codeWorkspaces, eq(chats.codeWorkspaceId, codeWorkspaces.id))
    .where(eq(chats.id, chatId))
    .get();
  if (!row) return Response.json(null);
  const chat = row.chats;
  if (chat.userId !== session.user.id && chat.userId !== 'telegram') return Response.json(null);
  const ws = row.code_workspaces;
  return Response.json({ ...chat, workspace: ws?.id ? ws : null });
}

/**
 * GET handler for /stream/chat-data-by-workspace/[workspaceId] — chat data by workspace with session auth.
 */
export async function getChatDataByWorkspaceHandler(request, { params }) {
  const session = await auth();
  if (!session?.user?.id) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const { workspaceId } = await params;
  if (!workspaceId) return Response.json(null, { status: 400 });
  const { eq } = await import('drizzle-orm');
  const { getDb } = await import('../db/index.js');
  const { chats, codeWorkspaces } = await import('../db/schema.js');
  const db = getDb();
  const row = db
    .select()
    .from(chats)
    .leftJoin(codeWorkspaces, eq(chats.codeWorkspaceId, codeWorkspaces.id))
    .where(eq(chats.codeWorkspaceId, workspaceId))
    .get();
  if (!row) return Response.json(null);
  const chat = row.chats;
  if (chat.userId !== session.user.id && chat.userId !== 'telegram') return Response.json(null);
  const ws = row.code_workspaces;
  return Response.json({ chatId: chat.id, ...chat, workspace: ws?.id ? ws : null });
}

/**
 * GET handler for /stream/repositories — list repositories with session auth.
 */
export async function getRepositoriesHandler() {
  const session = await auth();
  if (!session?.user?.id) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }
  try {
    const { listRepositories } = await import('../tools/github.js');
    const repos = await listRepositories();
    return Response.json(repos);
  } catch {
    return Response.json([]);
  }
}

/**
 * GET handler for /stream/branches?repo=owner/name — list branches with session auth.
 */
export async function getBranchesHandler(request) {
  const session = await auth();
  if (!session?.user?.id) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const url = new URL(request.url);
  const repoFullName = url.searchParams.get('repo');
  if (!repoFullName) return Response.json([]);
  try {
    const { listBranches } = await import('../tools/github.js');
    const branches = await listBranches(repoFullName);
    return Response.json(branches);
  } catch {
    return Response.json([]);
  }
}

/**
 * GET handler for /stream/voice-token — AssemblyAI temporary token with session auth.
 */
export async function getVoiceTokenHandler(request) {
  const session = await auth();
  if (!session?.user?.id) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const { getConfig } = await import('../config.js');
  const apiKey = getConfig('ASSEMBLYAI_API_KEY');
  if (!apiKey) {
    return Response.json({ error: 'Voice transcription not configured' });
  }
  const res = await fetch(
    'https://streaming.assemblyai.com/v3/token?expires_in_seconds=60',
    { headers: { Authorization: apiKey } }
  );
  if (!res.ok) {
    return Response.json({ error: 'Failed to get voice token' });
  }
  const data = await res.json();
  return Response.json({ token: data.token });
}

export async function finalizeChat(request) {
  const session = await auth();
  if (!session?.user?.id) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const { chatId, message } = await request.json();
  const { autoTitle } = await import('../ai/index.js');
  const title = await autoTitle(chatId, message);

  // Look up linked workspace (if code chat)
  let codeWorkspaceId = null;
  let featureBranch = null;
  try {
    const { getChatById } = await import('../db/chats.js');
    const chat = getChatById(chatId);
    if (chat?.codeWorkspaceId) {
      codeWorkspaceId = chat.codeWorkspaceId;
      const { getCodeWorkspaceById } = await import('../db/code-workspaces.js');
      const ws = getCodeWorkspaceById(codeWorkspaceId);
      if (ws) featureBranch = ws.featureBranch;
    }
  } catch (err) {
    console.error('Failed to look up workspace:', err);
  }

  return Response.json({ title, codeWorkspaceId, featureBranch });
}
