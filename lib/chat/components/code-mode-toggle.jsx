'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { GitBranchIcon, ChevronDownIcon, SpinnerIcon, XIcon } from './icons.js';
import { Combobox } from './ui/combobox.js';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator } from './ui/dropdown-menu.js';
import { cn } from '../utils.js';

export const COMMAND_LABELS = {
  'commit': 'Commit Branch',
  'push': 'Push Branch',
  'create-pr': 'Create PR',
  'rebase': 'Rebase Branch',
  'resolve-conflicts': 'Resolve Conflicts',
};

/**
 * Repo/branch picker dropdowns for the empty state (below chat input).
 * Only rendered when codeMode is on and no messages have been sent.
 */
export function RepoBranchPicker({
  repo,
  onRepoChange,
  branch,
  onBranchChange,
  getRepositories,
  getBranches,
}) {
  const [repos, setRepos] = useState([]);
  const [branches, setBranches] = useState([]);
  const [loadingRepos, setLoadingRepos] = useState(false);
  const [loadingBranches, setLoadingBranches] = useState(false);
  const [reposLoaded, setReposLoaded] = useState(false);

  // Load repos eagerly on mount
  useEffect(() => {
    setLoadingRepos(true);
    getRepositories().then((data) => {
      const list = data || [];
      setRepos(list);
      setReposLoaded(true);
      setLoadingRepos(false);
      if (list.length === 1) {
        onRepoChange(list[0].full_name);
      }
    }).catch(() => setLoadingRepos(false));
  }, []);

  // Load branches when repo changes
  useEffect(() => {
    if (!repo) return;
    setLoadingBranches(true);
    setBranches([]);
    getBranches(repo).then((data) => {
      const branchList = data || [];
      setBranches(branchList);
      const defaultBranch = branchList.find((b) => b.isDefault);
      if (defaultBranch) {
        onBranchChange(defaultBranch.name);
      }
      setLoadingBranches(false);
    }).catch(() => setLoadingBranches(false));
  }, [repo]);

  const repoOptions = repos.map((r) => ({ value: r.full_name, label: r.full_name }));
  const branchOptions = branches.map((b) => ({ value: b.name, label: b.name }));

  return (
    <div className="flex flex-wrap items-center justify-center gap-3">
      <div className="w-full sm:w-auto sm:min-w-[240px] sm:max-w-[240px]">
        <Combobox
          options={repoOptions}
          value={repo}
          onChange={onRepoChange}
          placeholder="Select repository..."
          loading={loadingRepos}
          highlight={!repo && !loadingRepos}
        />
      </div>
      <div className={cn("w-full sm:w-auto sm:min-w-[200px] sm:max-w-[200px]", !repo && "opacity-50 pointer-events-none")}>
        <Combobox
          options={branchOptions}
          value={branch}
          onChange={onBranchChange}
          placeholder="Select branch..."
          loading={loadingBranches}
          highlight={!!repo && !branch && !loadingBranches}
        />
      </div>
    </div>
  );
}

/**
 * Workspace toolbar bar with branch info, diff stats, and command buttons.
 * Only rendered when a workspace exists (after first message creates one).
 */
export function WorkspaceBar({
  repo,
  branch,
  onBranchChange,
  getBranches,
  workspace,
  diffStats,
  onDiffStatsRefresh,
  onShowDiff,
}) {
  const [branches, setBranches] = useState([]);
  const [loadingBranches, setLoadingBranches] = useState(false);

  const featureBranch = workspace?.featureBranch;
  const repoName = repo ? repo.split('/').pop() : '';

  return (
    <div className="flex items-center gap-2 text-xs min-w-0 px-1 py-0.5">
      <div className="flex items-center gap-1.5 text-muted-foreground min-w-0">
        <GitBranchIcon size={12} className="shrink-0" />
        {repoName && <span className="shrink-0 cursor-default" title={repo}>{repoName}</span>}
        {branch && (
          <>
            <span className="shrink-0 text-muted-foreground/30">/</span>
            <div className="shrink-0 max-w-[120px]">
              <Combobox
                options={branches.map((b) => ({ value: b.name, label: b.name }))}
                value={branch}
                onChange={onBranchChange}
                loading={loadingBranches}
                side="top"
                onOpen={() => {
                  if (!loadingBranches && repo) {
                    setLoadingBranches(true);
                    getBranches(repo).then((data) => {
                      setBranches(data || []);
                    }).catch(() => {
                      setBranches([]);
                    }).finally(() => setLoadingBranches(false));
                  }
                }}
                triggerClassName="font-medium text-foreground hover:text-primary hover:bg-accent transition-colors cursor-pointer truncate text-xs rounded px-1 -mx-1"
                triggerLabel={<span className="truncate" title={branch}>{branch}</span>}
              />
            </div>
          </>
        )}
        {featureBranch && (
          <>
            <span className="shrink-0 text-muted-foreground/50">&larr;</span>
            <span className="text-primary truncate min-w-[60px] cursor-default" title={featureBranch}>{featureBranch}</span>
          </>
        )}
      </div>
      {workspace?.id && <WorkspaceCommandButton workspaceId={workspace.id} diffStats={diffStats} onDiffStatsRefresh={onDiffStatsRefresh} onShowDiff={onShowDiff} />}
    </div>
  );
}

export function CommandOutputDialog({ title, output, exitCode, running, onClose }) {
  const outputRef = useRef(null);

  useEffect(() => {
    if (outputRef.current) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight;
    }
  }, [output]);

  // Close on Escape
  useEffect(() => {
    if (running) return;
    const handler = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [running, onClose]);

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={running ? undefined : onClose}>
      <div
        className="bg-background border border-border rounded-lg shadow-lg w-full max-w-xl mx-4 flex flex-col max-h-[70vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <span className="text-sm font-semibold">{title}</span>
          {!running && (
            <button
              type="button"
              onClick={onClose}
              className="text-muted-foreground hover:text-foreground transition-colors p-0.5"
            >
              <XIcon size={16} />
            </button>
          )}
        </div>

        {/* Body */}
        <div ref={outputRef} className="flex-1 overflow-auto p-4 min-h-[120px]">
          {running ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <SpinnerIcon size={14} className="animate-spin" />
              Running...
            </div>
          ) : output ? (
            <pre className="text-xs font-mono whitespace-pre-wrap break-words text-foreground">{output.trim()}</pre>
          ) : (
            <span className="text-sm text-muted-foreground">No output</span>
          )}
        </div>

        {/* Footer */}
        {!running && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-border">
            <span className={cn('text-xs font-medium', exitCode === 0 ? 'text-green-500' : 'text-destructive')}>
              {exitCode === 0 ? 'Completed' : `Exited with code ${exitCode}`}
            </span>
            <button
              type="button"
              onClick={onClose}
              className="text-xs px-3 py-1.5 border border-border text-muted-foreground hover:text-foreground hover:bg-accent rounded-md transition-colors"
            >
              Close
            </button>
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}

function WorkspaceCommandButton({ workspaceId, diffStats, onDiffStatsRefresh, onShowDiff }) {
  const [selectedCommand, setSelectedCommand] = useState('create-pr');
  const [commandRunning, setCommandRunning] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [commandOutput, setCommandOutput] = useState('');
  const [commandExitCode, setCommandExitCode] = useState(null);

  const handleRun = useCallback(async () => {
    if (commandRunning) return;

    // Refresh diff stats and check for changes before running
    const fresh = await onDiffStatsRefresh?.();
    const stats = fresh || diffStats;
    if (!(stats?.insertions || 0) && !(stats?.deletions || 0)) {
      setDialogOpen(true);
      setCommandOutput('You have no changes.');
      setCommandExitCode(1);
      return;
    }

    setCommandRunning(true);
    setDialogOpen(true);
    setCommandOutput('');
    setCommandExitCode(null);
    try {
      const { runWorkspaceCommand } = await import('../../code/actions.js');
      const result = await runWorkspaceCommand(workspaceId, selectedCommand);
      setCommandOutput(result.output || result.message || '');
      setCommandExitCode(result.exitCode ?? (result.success ? 0 : 1));
      onDiffStatsRefresh?.();
    } catch (err) {
      setCommandOutput(err.message || 'Command failed');
      setCommandExitCode(1);
    } finally {
      setCommandRunning(false);
    }
  }, [workspaceId, selectedCommand, commandRunning, diffStats, onDiffStatsRefresh]);

  const handleDialogClose = useCallback(() => {
    setDialogOpen(false);
  }, []);

  return (
    <div className="ml-auto flex items-center">
      <div className="flex items-center gap-1.5 shrink-0">
        <button
          type="button"
          onClick={onShowDiff}
          className="text-xs leading-4 px-2.5 h-[28px] flex items-center gap-1.5 font-medium border border-border rounded-md whitespace-nowrap hover:bg-accent transition-colors cursor-pointer"
        >
          <span className="text-green-500">+{diffStats?.insertions ?? 0}</span>
          <span className="text-destructive">-{diffStats?.deletions ?? 0}</span>
        </button>
        <div className="flex items-center">
          <button
            type="button"
            onClick={handleRun}
            disabled={commandRunning}
            className="text-xs leading-4 px-2.5 h-[28px] font-medium border border-border text-muted-foreground hover:bg-accent hover:text-foreground transition-colors rounded-l-md disabled:opacity-50"
          >
            {commandRunning ? (
              <span className="flex items-center gap-1.5">
                <SpinnerIcon size={12} className="animate-spin" />
                Running...
              </span>
            ) : (
              COMMAND_LABELS[selectedCommand]
            )}
          </button>
          <DropdownMenu>
            <DropdownMenuTrigger>
              <button
                type="button"
                disabled={commandRunning}
                className="text-xs leading-4 px-1.5 h-[28px] font-medium border border-border border-l-0 text-muted-foreground hover:bg-accent hover:text-foreground transition-colors rounded-r-md disabled:opacity-50 flex items-center"
              >
                <ChevronDownIcon size={14} />
              </button>
            </DropdownMenuTrigger>
          <DropdownMenuContent side="top" align="end" className="whitespace-nowrap">
            <DropdownMenuItem onClick={() => setSelectedCommand('commit')}>
              Commit
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setSelectedCommand('push')}>
              Push
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setSelectedCommand('create-pr')}>
              Create PR
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => setSelectedCommand('rebase')}>
              Rebase
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setSelectedCommand('resolve-conflicts')}>
              Resolve Conflicts
            </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {dialogOpen && (
        <CommandOutputDialog
          title={COMMAND_LABELS[selectedCommand]}
          output={commandOutput}
          exitCode={commandExitCode}
          running={commandRunning}
          onClose={handleDialogClose}
        />
      )}
    </div>
  );
}
