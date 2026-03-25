import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import { createAgentJob } from '../tools/create-agent-job.js';

import { getConfig } from '../config.js';

const agentJobTool = tool(
  async ({ prompt }) => {
    const result = await createAgentJob(prompt);
    return JSON.stringify({
      success: true,
      agent_job_id: result.agent_job_id,
      branch: result.branch,
      title: result.title,
    });
  },
  {
    name: 'agent_job',
    description:
      'Use when chat mode is job. Dispatches an autonomous task — the agent executes work in a Docker container with full filesystem, browser, and shell access. Results do not stream back. Always present the full job description and get explicit approval before calling.',
    schema: z.object({
      prompt: z
        .string()
        .describe(
          'Detailed agent job description including context and requirements. Be specific about what needs to be done.'
        ),
    }),
  }
);


/**
 * Coding agent tool for agent chat (thepopebot repo).
 * Reads workspaceId and codeModeType from runtime.configurable.
 */
const agentChatCodingTool = tool(
  async ({ prompt }, runtime) => {
    try {
      const { randomUUID } = await import('crypto');
      const { workspaceId, codeModeType } = runtime.configurable;

      const ghOwner = getConfig('GH_OWNER');
      const ghRepo = getConfig('GH_REPO');
      if (!ghOwner || !ghRepo) {
        return JSON.stringify({ success: false, error: 'GH_OWNER or GH_REPO not configured' });
      }
      const repo = `${ghOwner}/${ghRepo}`;

      const { getCodeWorkspaceById } = await import('../db/code-workspaces.js');
      const workspace = getCodeWorkspaceById(workspaceId);
      const featureBranch = workspace?.featureBranch;
      const mode = codeModeType === 'code' ? 'dangerous' : 'plan';

      const codingAgent = getConfig('CODING_AGENT') || 'claude-code';
      const containerName = `${codingAgent}-headless-${randomUUID().slice(0, 8)}`;

      const { runHeadlessContainer } = await import('../tools/docker.js');
      const { backendApi } = await runHeadlessContainer({
        containerName,
        repo,
        branch: 'main',
        featureBranch,
        workspaceId,
        taskPrompt: prompt,
        mode,
        injectSecrets: true,
      });

      return JSON.stringify({
        success: true,
        status: 'started',
        containerName,
        featureBranch,
        codingAgent,
        backendApi,
      });
    } catch (err) {
      console.error('[coding_agent] Failed:', err);
      return JSON.stringify({
        success: false,
        error: err.message || 'Failed to launch investigation container',
      });
    }
  },
  {
    name: 'coding_agent',
    description:
      'Use when chat mode is plan or code. Investigates or modifies the PopeBot — its configuration, abilities, personality, skills, crons, triggers, prompts, or code. Results stream directly into this conversation.',
    schema: z.object({
      prompt: z.string().describe(
        'A direct copy of the coding task including all relevant context from the conversation.'
      ),
    }),
    returnDirect: true,
  }
);

/**
 * Coding agent tool for code chat (any repo).
 * Reads repo, branch, workspaceId, codeModeType from runtime.configurable.
 */
const codeChatCodingTool = tool(
  async ({ prompt }, runtime) => {
    try {
      const { randomUUID } = await import('crypto');
      const { repo, branch, workspaceId, codeModeType } = runtime.configurable;

      const { getCodeWorkspaceById } = await import('../db/code-workspaces.js');
      const workspace = getCodeWorkspaceById(workspaceId);
      const featureBranch = workspace?.featureBranch;
      const mode = codeModeType === 'code' ? 'dangerous' : 'plan';

      const { runHeadlessContainer } = await import('../tools/docker.js');
      const codingAgent = getConfig('CODING_AGENT') || 'claude-code';
      const containerName = `${codingAgent}-headless-${randomUUID().slice(0, 8)}`;

      const { backendApi } = await runHeadlessContainer({
        containerName, repo, branch, featureBranch, workspaceId,
        taskPrompt: prompt,
        mode,
      });

      return JSON.stringify({
        success: true,
        status: 'started',
        containerName,
        featureBranch,
        codingAgent,
        backendApi,
      });
    } catch (err) {
      console.error('[coding_agent] Failed:', err);
      return JSON.stringify({
        success: false,
        error: err.message || 'Failed to launch headless coding task',
      });
    }
  },
  {
    name: 'coding_agent',
    description:
      'Use when you need to plan or execute a coding task.',
    schema: z.object({
      prompt: z.string().describe(
        'A direct copy of the coding task including all relevant context from the conversation.'
      ),
    }),
    returnDirect: true,
  }
);

export { agentJobTool, agentChatCodingTool, codeChatCodingTool };
