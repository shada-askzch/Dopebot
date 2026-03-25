import { HumanMessage, AIMessage } from '@langchain/core/messages';
import { z } from 'zod';
import { getAgentChat, getCodeChat } from './agent.js';
import { createModel } from './model.js';
import { agentJobSummaryMd } from '../paths.js';
import { render_md } from '../utils/render-md.js';
import { getChatById, createChat, saveMessage, updateChatTitle, linkChatToWorkspace } from '../db/chats.js';

/**
 * Ensure a chat exists in the DB and save a message.
 * Centralized so every channel gets persistence automatically.
 *
 * @param {string} threadId - Chat/thread ID
 * @param {string} role - 'user' or 'assistant'
 * @param {string} text - Message text
 * @param {object} [options] - { userId, chatTitle }
 */
function persistMessage(threadId, role, text, options = {}) {
  try {
    if (!getChatById(threadId)) {
      createChat(options.userId || 'unknown', options.chatTitle || 'New Chat', threadId);
    }
    saveMessage(threadId, role, text);
  } catch (err) {
    console.error(`[persistMessage] Failed to save ${role} message to chat ${threadId} (${text?.length ?? 0} chars):`, err);
  }
}

/**
 * Process a chat message through the LangGraph agent.
 * Saves user and assistant messages to the DB automatically.
 *
 * @param {string} threadId - Conversation thread ID (from channel adapter)
 * @param {string} message - User's message text
 * @param {Array} [attachments=[]] - Normalized attachments from adapter
 * @param {object} [options] - { userId, chatTitle } for DB persistence
 * @returns {Promise<string>} AI response text
 */
async function chat(threadId, message, attachments = [], options = {}) {
  const agent = await getAgentChat();

  // Save user message to DB
  persistMessage(threadId, 'user', message || '[attachment]', options);

  // Build content blocks: text + any image attachments as base64 vision
  const content = [];

  if (message) {
    content.push({ type: 'text', text: message });
  }

  for (const att of attachments) {
    if (att.category === 'image') {
      content.push({
        type: 'image_url',
        image_url: {
          url: `data:${att.mimeType};base64,${att.data.toString('base64')}`,
        },
      });
    }
    // Documents: future handling
  }

  // If only text and no attachments, simplify to a string
  const messageContent = content.length === 1 && content[0].type === 'text'
    ? content[0].text
    : content;

  const result = await agent.invoke(
    { messages: [new HumanMessage({ content: messageContent })] },
    { configurable: { thread_id: threadId } }
  );

  const lastMessage = result.messages[result.messages.length - 1];

  // LangChain message content can be a string or an array of content blocks
  let response;
  if (typeof lastMessage.content === 'string') {
    response = lastMessage.content;
  } else {
    response = lastMessage.content
      .filter((block) => block.type === 'text')
      .map((block) => block.text)
      .join('\n');
  }

  // Save assistant response to DB
  persistMessage(threadId, 'assistant', response, options);

  // Auto-generate title for new chats
  if (options.userId && message) {
    autoTitle(threadId, message).catch(() => {});
  }

  return response;
}

/**
 * Process a chat message with streaming (for channels that support it).
 * Saves user and assistant messages to the DB automatically.
 *
 * @param {string} threadId - Conversation thread ID
 * @param {string} message - User's message text
 * @param {Array} [attachments=[]] - Image/PDF attachments: { category, mimeType, dataUrl }
 * @param {object} [options] - { userId, chatTitle, skipUserPersist } for DB persistence
 * @returns {AsyncIterableIterator<string>} Stream of text chunks
 */
async function* chatStream(threadId, message, attachments = [], options = {}) {
  // Resolve agent and workspace context
  const isCodeMode = !!options.codeMode;
  const existingChat = getChatById(threadId);
  let workspaceId = options.workspaceId;
  const repo = options.repo;
  const branch = options.branch;
  const codeModeType = options.codeModeType || 'plan';

  if (!existingChat) {
    // Create workspace if not already provided
    if (!workspaceId) {
      const { createCodeWorkspace, updateFeatureBranch } = await import('../db/code-workspaces.js');
      const workspace = createCodeWorkspace(options.userId || 'unknown', {
        repo: repo,
        branch: branch,
      });
      workspaceId = workspace.id;
      const { generateRandomName } = await import('../utils/random-name.js');
      const shortId = workspaceId.replace(/-/g, '').slice(0, 8);
      const featureBranch = `thepopebot/${generateRandomName()}-${shortId}`;
      updateFeatureBranch(workspaceId, featureBranch);
    }
    createChat(options.userId || 'unknown', 'New Chat', threadId, { chatMode: isCodeMode ? 'code' : 'agent' });
    linkChatToWorkspace(threadId, workspaceId);
  } else {
    workspaceId = workspaceId || existingChat.codeWorkspaceId;
  }

  const agent = isCodeMode
    ? await getCodeChat()
    : await getAgentChat();

  // Save user message to DB (skip on regeneration — message already exists)
  if (!options.skipUserPersist) {
    persistMessage(threadId, 'user', message || '[attachment]', options);
  }

  // Build content blocks: text + any image/PDF attachments as vision
  const content = [];

  if (message) {
    content.push({ type: 'text', text: message });
  }

  for (const att of attachments) {
    if (att.category === 'image') {
      // Support both dataUrl (web) and Buffer (Telegram) formats
      const url = att.dataUrl
        ? att.dataUrl
        : `data:${att.mimeType};base64,${att.data.toString('base64')}`;
      content.push({
        type: 'image_url',
        image_url: { url },
      });
    }
  }

  // If only text and no attachments, simplify to a string
  let messageContent = content.length === 1 && content[0].type === 'text'
    ? content[0].text
    : content;

  // Append chat mode for agent chats so the LLM sees the user's selected mode
  if (!isCodeMode) {
    if (typeof messageContent === 'string') {
      messageContent += `\n\n[chat mode: ${codeModeType}]`;
    } else if (Array.isArray(messageContent)) {
      const textBlock = messageContent.find(b => b.type === 'text');
      if (textBlock) textBlock.text += `\n\n[chat mode: ${codeModeType}]`;
    }
  }

  try {
    const stream = await agent.stream(
      { messages: [new HumanMessage({ content: messageContent })] },
      { configurable: { thread_id: threadId, workspaceId, repo, branch, codeModeType }, streamMode: 'messages' }
    );

    let fullText = '';
    const toolCallNames = {};
    const pendingToolCalls = new Map();
    let headlessContainer = null;

    for await (const event of stream) {
      // streamMode: 'messages' yields [message, metadata] tuples
      const msg = Array.isArray(event) ? event[0] : event;
      const msgType = msg._getType?.();

      if (msgType === 'ai') {
        // Tool calls — AIMessage.tool_calls is an array of { id, name, args }
        if (msg.tool_calls?.length > 0) {
          for (const tc of msg.tool_calls) {
            toolCallNames[tc.id] = tc.name;
            pendingToolCalls.set(tc.id, { toolName: tc.name, args: tc.args });
            yield {
              type: 'tool-call',
              toolCallId: tc.id,
              toolName: tc.name,
              args: tc.args,
            };
          }
        }

        // Text content (wrapped in structured object)
        let text = '';
        if (typeof msg.content === 'string') {
          text = msg.content;
        } else if (Array.isArray(msg.content)) {
          text = msg.content
            .filter((b) => b.type === 'text' && b.text)
            .map((b) => b.text)
            .join('');
        }

        if (text) {
          fullText += text;
          yield { type: 'text', text };
        }
      } else if (msgType === 'tool') {
        // Tool result — ToolMessage has tool_call_id and content
        yield {
          type: 'tool-result',
          toolCallId: msg.tool_call_id,
          result: msg.content,
        };

        // Save complete tool invocation as JSON
        const tc = pendingToolCalls.get(msg.tool_call_id);
        if (tc) {
          persistMessage(threadId, 'assistant', JSON.stringify({
            type: 'tool-invocation',
            toolCallId: msg.tool_call_id,
            toolName: tc.toolName,
            state: 'output-available',
            input: tc.args,
            output: msg.content,
          }), options);
          pendingToolCalls.delete(msg.tool_call_id);
        }

        // Detect headless container tool result for Phase 2 streaming
        const headlessToolName = toolCallNames[msg.tool_call_id];
        if (headlessToolName === 'start_headless_coding_agent' || headlessToolName === 'update_popebot') {
          try {
            const parsed = JSON.parse(msg.content);
            if (parsed.status === 'started' && parsed.containerName) {
              headlessContainer = { ...parsed, toolName: headlessToolName };
            }
          } catch {}
        }
      }
      // Skip other message types (human, system)
    }

    // Save assistant response to DB (defer if headless streaming follows)
    if (fullText && !headlessContainer) {
      persistMessage(threadId, 'assistant', fullText, options);
    }

    // Phase 2: Stream headless container output live
    if (headlessContainer) {
      try {
        const { tailContainerLogs, waitForContainer, removeContainer } =
          await import('../tools/docker.js');
        const { parseHeadlessStream } = await import('./headless-stream.js');

        const logStream = await tailContainerLogs(headlessContainer.containerName);

        // Collect conversation parts during streaming, add to memory in one batch at the end
        let resultSummary = '';
        const memoryParts = [];
        const headlessPendingToolCalls = new Map();
        let pendingText = '';

        let lastEmittedText = '';
        for await (const chunk of parseHeadlessStream(logStream, headlessContainer.codingAgent)) {
          // Result summary: skip if duplicate, otherwise ensure it starts on a new line
          if (chunk._resultSummary && chunk.type === 'text') {
            resultSummary = chunk._resultSummary;
            if (pendingText.trim() && chunk.text.trim() === pendingText.trim()) {
              continue;
            }
            chunk = { ...chunk, text: '\n\n' + chunk.text };
          }
          yield chunk;
          if (chunk.type === 'text') {
            fullText += chunk.text;
            memoryParts.push(chunk.text);
            pendingText += chunk.text;
          } else if (chunk.type === 'tool-call') {
            // Flush accumulated text before tool call
            if (pendingText) {
              persistMessage(threadId, 'assistant', pendingText, options);
              pendingText = '';
            }
            memoryParts.push('[tool-call] ' + chunk.toolName + ': ' + JSON.stringify(chunk.args));
            headlessPendingToolCalls.set(chunk.toolCallId, { toolName: chunk.toolName, args: chunk.args });
          } else if (chunk.type === 'tool-result') {
            memoryParts.push('[tool-result] ' + chunk.result);
            const tc = headlessPendingToolCalls.get(chunk.toolCallId);
            if (tc) {
              persistMessage(threadId, 'assistant', JSON.stringify({
                type: 'tool-invocation',
                toolCallId: chunk.toolCallId,
                toolName: tc.toolName,
                state: 'output-available',
                input: tc.args,
                output: chunk.result,
              }), options);
              headlessPendingToolCalls.delete(chunk.toolCallId);
            }
          }
          if (chunk._resultSummary) resultSummary = chunk._resultSummary;
        }

        // Flush remaining accumulated text
        if (pendingText) {
          persistMessage(threadId, 'assistant', pendingText, options);
          pendingText = '';
        }

        // Container has exited by now (tailContainerLogs follows until EOF)
        const exitCode = await waitForContainer(headlessContainer.containerName);
        await removeContainer(headlessContainer.containerName);

        if (exitCode === 0) {
          const completionMsg = codeModeType === 'plan'
            ? '\n\nPlanning complete.'
            : '\n\nCoding complete.';
          yield { type: 'text', text: completionMsg };
          fullText += completionMsg;
          persistMessage(threadId, 'assistant', completionMsg, options);
        } else {
          const failureMsg = '\n\nTask exited with errors.';
          yield { type: 'text', text: failureMsg };
          fullText += failureMsg;
          persistMessage(threadId, 'assistant', failureMsg, options);
        }

        // Inject full conversation into LangGraph memory using the correct agent
        if (memoryParts.length > 0) {
          await agent.updateState(
            { configurable: { thread_id: threadId } },
            { messages: [new AIMessage(memoryParts.join('\n'))] }
          );
        }
        // Also inject the summary separately for concise follow-up context
        if (resultSummary) {
          await agent.updateState(
            { configurable: { thread_id: threadId } },
            { messages: [new AIMessage(resultSummary)] }
          );
        }

      } catch (err) {
        console.error('[chatStream] headless stream error:', err);
        yield { type: 'text', text: '\n\nError streaming headless output: ' + err.message };
      }
    }

  } catch (err) {
    console.error('[chatStream] error:', err);
    throw err;
  }
}

/**
 * Auto-generate a chat title from the first user message (fire-and-forget).
 * Uses structured output to avoid thinking-token leaks with extended-thinking models.
 */
async function autoTitle(threadId, firstMessage) {
  try {
    const chat = getChatById(threadId);
    if (!chat || chat.title !== 'New Chat') return;

    const model = await createModel({ maxTokens: 250 });
    const response = await model.withStructuredOutput(z.object({ title: z.string() })).invoke([
      ['system', 'Generate a descriptive (8-12 word) title for this chat based on the user\'s first message.'],
      ['human', firstMessage],
    ]);
    if (response.title.trim()) {
      updateChatTitle(threadId, response.title.trim());

      return response.title.trim();
    }
  } catch (err) {
    console.error('[autoTitle] Failed to generate title:', err.message);
  }
  return null;
}

/**
 * One-shot summarization with a different system prompt and no memory.
 * Used for agent job completion summaries sent via GitHub webhook.
 *
 * @param {object} results - Agent job results from webhook payload
 * @returns {Promise<string>} Summary text
 */
async function summarizeAgentJob(results) {
  try {
    const model = await createModel({ maxTokens: 1024 });
    const systemPrompt = render_md(agentJobSummaryMd);

    if (!systemPrompt) {
      console.error(`[summarizeAgentJob] Empty system prompt — agent-job/SUMMARY.md not found or empty at: ${agentJobSummaryMd}`);
    }

    const userMessage = [
      results.job ? `## Task\n${results.job}` : '',
      results.commit_message ? `## Commit Message\n${results.commit_message}` : '',
      results.changed_files?.length ? `## Changed Files\n${results.changed_files.join('\n')}` : '',
      results.status ? `## Status\n${results.status}` : '',
      results.merge_result ? `## Merge Result\n${results.merge_result}` : '',
      results.pr_url ? `## PR URL\n${results.pr_url}` : '',
      results.run_url ? `## Run URL\n${results.run_url}` : '',
      results.log ? `## Agent Log\n${results.log}` : '',
    ]
      .filter(Boolean)
      .join('\n\n');

    console.log(`[summarizeAgentJob] System prompt: ${systemPrompt.length} chars, user message: ${userMessage.length} chars`);

    const response = await model.invoke([
      ['system', systemPrompt],
      ['human', userMessage],
    ]);

    const text =
      typeof response.content === 'string'
        ? response.content
        : response.content
            .filter((block) => block.type === 'text')
            .map((block) => block.text)
            .join('\n');

    console.log(`[summarizeAgentJob] Result: ${text.length} chars — ${text.slice(0, 200)}`);

    return text.trim() || 'Agent job finished.';
  } catch (err) {
    console.error('[summarizeAgentJob] Failed to summarize agent job:', err);
    return 'Agent job finished.';
  }
}

export { chat, chatStream, summarizeAgentJob, persistMessage, autoTitle };
