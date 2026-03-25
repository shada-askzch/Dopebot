'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { PlusIcon, CopyIcon, CheckIcon, SpinnerIcon } from './icons.js';
import { SecretRow, Dialog, EmptyState } from './settings-shared.js';
import { OAUTH_PROVIDERS } from '../../oauth/providers.js';
import {
  getAgentJobSecrets,
  updateAgentJobSecret,
  deleteAgentJobSecretAction,
  initiateOAuthFlow,
} from '../actions.js';

// ─────────────────────────────────────────────────────────────────────────────
// Build flat list of provider/package options for the dropdown
// ─────────────────────────────────────────────────────────────────────────────

function buildProviderOptions() {
  const options = [];
  for (const [providerId, provider] of Object.entries(OAUTH_PROVIDERS)) {
    for (const [packageId, pkg] of Object.entries(provider.packages)) {
      options.push({
        id: `${providerId}:${packageId}`,
        providerId,
        packageId,
        providerName: provider.name,
        packageName: pkg.name,
        label: `${provider.name} > ${pkg.name}`,
        scopes: pkg.scopes,
        authorizeUrl: provider.authorizeUrl,
        tokenUrl: provider.tokenUrl,
      });
    }
  }
  return options;
}

const PROVIDER_OPTIONS = buildProviderOptions();

// ─────────────────────────────────────────────────────────────────────────────
// Unified add secret dialog (manual + OAuth modes)
// ─────────────────────────────────────────────────────────────────────────────

function AddSecretDialog({ open, onAdd, onCancel, onOAuthSuccess }) {
  // Shared state
  const [mode, setMode] = useState('manual');
  const [name, setName] = useState('');
  const [error, setError] = useState(null);
  const nameRef = useRef(null);

  // Manual mode state
  const [value, setValue] = useState('');
  const [showValue, setShowValue] = useState(false);
  const [saving, setSaving] = useState(false);

  // OAuth mode state
  const [selectedOption, setSelectedOption] = useState('');
  const [clientId, setClientId] = useState('');
  const [clientSecret, setClientSecret] = useState('');
  const [scopes, setScopes] = useState('');
  const [redirectUri, setRedirectUri] = useState('');
  const [copied, setCopied] = useState(false);
  const [status, setStatus] = useState('form'); // form | waiting | success
  const popupRef = useRef(null);
  const timeoutRef = useRef(null);

  // Reset all state on open
  useEffect(() => {
    if (open) {
      setMode('manual');
      setName('');
      setError(null);
      // Manual
      setValue('');
      setShowValue(false);
      setSaving(false);
      // OAuth
      setSelectedOption('');
      setClientId('');
      setClientSecret('');
      setScopes('');
      setStatus('form');
      setCopied(false);
      setRedirectUri(`${window.location.origin}/api/oauth/callback`);
      setTimeout(() => nameRef.current?.focus(), 50);
    }
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, [open]);

  // Clear error on mode switch
  const handleModeChange = (newMode) => {
    setMode(newMode);
    setError(null);
  };

  // Update scopes when provider/package selection changes
  useEffect(() => {
    if (selectedOption) {
      const opt = PROVIDER_OPTIONS.find((o) => o.id === selectedOption);
      if (opt) setScopes(opt.scopes);
    }
  }, [selectedOption]);

  // ── Manual save ──────────────────────────────────────────────────────────

  const handleSave = async () => {
    const trimmed = name.trim().toUpperCase();
    if (!trimmed || !value) return;
    setSaving(true);
    setError(null);
    const result = await onAdd(trimmed, value);
    setSaving(false);
    if (result?.success) {
      onCancel();
    } else {
      setError(result?.error || 'Failed to add secret');
    }
  };

  // ── OAuth flow ───────────────────────────────────────────────────────────

  const handleMessage = useCallback((event) => {
    if (event.origin !== window.location.origin) return;
    const data = event.data;
    if (data?.type === 'oauth-success') {
      setStatus('success');
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      onOAuthSuccess();
      setTimeout(() => onCancel(), 1500);
    } else if (data?.type === 'oauth-error') {
      setStatus('form');
      setError(data.detail || 'Authorization failed.');
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    }
  }, [onCancel, onOAuthSuccess]);

  useEffect(() => {
    if (status === 'waiting') {
      window.addEventListener('message', handleMessage);
      return () => window.removeEventListener('message', handleMessage);
    }
  }, [status, handleMessage]);

  const handleCopyRedirectUri = () => {
    navigator.clipboard.writeText(redirectUri);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleAuthorize = async () => {
    const trimmedName = name.trim().toUpperCase();
    if (!trimmedName || !selectedOption || !clientId || !clientSecret) return;

    setError(null);
    const opt = PROVIDER_OPTIONS.find((o) => o.id === selectedOption);
    if (!opt) return;

    const result = await initiateOAuthFlow({
      secretName: trimmedName,
      clientId,
      clientSecret,
      tokenUrl: opt.tokenUrl,
      scopes,
      secretType: 'agent_job_secret',
      returnPath: '/admin/event-handler/agent-jobs',
    });

    if (result?.error) {
      setError(result.error);
      return;
    }

    // Build the authorize URL
    const params = new URLSearchParams({
      response_type: 'code',
      client_id: clientId,
      redirect_uri: result.redirectUri,
      scope: scopes,
      state: result.state,
      access_type: 'offline',
      prompt: 'consent',
    });
    const authorizeUrl = `${opt.authorizeUrl}?${params.toString()}`;

    // Open popup
    popupRef.current = window.open(authorizeUrl, 'oauth-popup', 'width=600,height=700');
    setStatus('waiting');

    // Timeout after 5 minutes
    timeoutRef.current = setTimeout(() => {
      if (status === 'waiting') {
        setStatus('form');
        setError('Authorization timed out. Please try again.');
      }
    }, 5 * 60 * 1000);
  };

  // ── Render ───────────────────────────────────────────────────────────────

  const inputClass = 'w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm font-mono focus:outline-none focus:ring-1 focus:ring-foreground';

  return (
    <Dialog open={open} onClose={onCancel} title="Add Secret">
      {status === 'success' ? (
        <div className="flex items-center justify-center gap-2 py-8 text-green-500">
          <CheckIcon size={20} />
          <span className="text-sm font-medium">Token saved!</span>
        </div>
      ) : status === 'waiting' ? (
        <div className="flex flex-col items-center justify-center gap-3 py-8">
          <SpinnerIcon size={20} className="animate-spin text-muted-foreground" />
          <p className="text-sm text-muted-foreground">Waiting for authorization...</p>
          <p className="text-xs text-muted-foreground">Complete the login in the popup window.</p>
        </div>
      ) : (
        <>
          <div className="space-y-3">
            {/* Mode toggle */}
            <div className="flex rounded-md border border-border overflow-hidden">
              <button
                type="button"
                onClick={() => handleModeChange('manual')}
                className={`flex-1 px-3 py-1.5 text-xs font-medium transition-colors ${
                  mode === 'manual'
                    ? 'bg-foreground text-background'
                    : 'text-muted-foreground hover:text-foreground hover:bg-accent'
                }`}
              >
                Manual
              </button>
              <button
                type="button"
                onClick={() => handleModeChange('oauth')}
                className={`flex-1 px-3 py-1.5 text-xs font-medium transition-colors ${
                  mode === 'oauth'
                    ? 'bg-foreground text-background'
                    : 'text-muted-foreground hover:text-foreground hover:bg-accent'
                }`}
              >
                OAuth
              </button>
            </div>

            {/* Secret name — shared */}
            <div>
              <label className="text-xs font-medium mb-1 block">Name</label>
              <input
                ref={nameRef}
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, ''))}
                placeholder={mode === 'manual' ? 'e.g. GOOGLE_SERVICE_ACCOUNT_KEY' : 'e.g. GOOGLE_OAUTH_TOKEN'}
                className={inputClass}
                onKeyDown={(e) => e.key === 'Enter' && mode === 'manual' && handleSave()}
              />
            </div>

            {/* Manual mode fields */}
            {mode === 'manual' && (
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-medium">Value</label>
                  <button
                    type="button"
                    onClick={() => setShowValue(!showValue)}
                    className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {showValue ? 'Hide' : 'Show'}
                  </button>
                </div>
                {showValue ? (
                  <textarea
                    value={value}
                    onChange={(e) => setValue(e.target.value)}
                    placeholder="Enter value (supports multi-line JSON)..."
                    rows={4}
                    className={`${inputClass} resize-y`}
                  />
                ) : (
                  <textarea
                    value={value}
                    onChange={(e) => setValue(e.target.value)}
                    placeholder="Enter value (supports multi-line JSON)..."
                    rows={4}
                    className={`${inputClass} resize-y`}
                    style={{ WebkitTextSecurity: 'disc' }}
                  />
                )}
              </div>
            )}

            {/* OAuth mode fields */}
            {mode === 'oauth' && (
              <>
                <div>
                  <label className="text-xs font-medium mb-1 block">Provider</label>
                  <select
                    value={selectedOption}
                    onChange={(e) => setSelectedOption(e.target.value)}
                    className={`${inputClass} font-sans`}
                  >
                    <option value="">Select a provider...</option>
                    {Object.entries(OAUTH_PROVIDERS).map(([providerId, provider]) => (
                      <optgroup key={providerId} label={provider.name}>
                        {Object.entries(provider.packages).map(([packageId, pkg]) => (
                          <option key={`${providerId}:${packageId}`} value={`${providerId}:${packageId}`}>
                            {pkg.name}
                          </option>
                        ))}
                      </optgroup>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-medium mb-1 block">Client ID</label>
                  <input
                    type="text"
                    value={clientId}
                    onChange={(e) => setClientId(e.target.value)}
                    placeholder="OAuth client ID"
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className="text-xs font-medium mb-1 block">Client Secret</label>
                  <input
                    type="password"
                    value={clientSecret}
                    onChange={(e) => setClientSecret(e.target.value)}
                    placeholder="OAuth client secret"
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className="text-xs font-medium mb-1 block">Scopes</label>
                  <textarea
                    value={scopes}
                    onChange={(e) => setScopes(e.target.value)}
                    placeholder="Space-separated scopes"
                    rows={3}
                    className={`${inputClass} resize-y`}
                  />
                  <p className="text-xs text-muted-foreground mt-1">Predefined scopes. Edit if needed.</p>
                </div>
                <div>
                  <label className="text-xs font-medium mb-1 block">Redirect URI</label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={redirectUri}
                      readOnly
                      className={`${inputClass} text-muted-foreground bg-muted flex-1`}
                    />
                    <button
                      type="button"
                      onClick={handleCopyRedirectUri}
                      className="rounded-md px-2.5 py-1.5 text-xs border border-border text-muted-foreground hover:text-foreground transition-colors shrink-0"
                      title="Copy redirect URI"
                    >
                      {copied ? <CheckIcon size={14} /> : <CopyIcon size={14} />}
                    </button>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">Add this URL as a redirect URI in your OAuth app.</p>
                </div>
              </>
            )}

            {error && <p className="text-xs text-destructive">{error}</p>}
          </div>

          {/* Footer */}
          <div className="flex justify-end gap-2 mt-5">
            <button onClick={onCancel} className="rounded-md px-3 py-1.5 text-sm font-medium border border-border text-muted-foreground hover:text-foreground transition-colors">Cancel</button>
            {mode === 'manual' ? (
              <button onClick={handleSave} disabled={!name.trim() || !value || saving}
                className="rounded-md px-3 py-1.5 text-sm font-medium bg-foreground text-background hover:bg-foreground/90 disabled:opacity-50 transition-colors">
                {saving ? 'Saving...' : 'Save'}
              </button>
            ) : (
              <button
                onClick={handleAuthorize}
                disabled={!name.trim() || !selectedOption || !clientId || !clientSecret}
                className="rounded-md px-3 py-1.5 text-sm font-medium bg-foreground text-background hover:bg-foreground/90 disabled:opacity-50 transition-colors"
              >
                Authorize
              </button>
            )}
          </div>
        </>
      )}
    </Dialog>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Jobs page
// ─────────────────────────────────────────────────────────────────────────────

export function JobsPage() {
  const [secrets, setSecrets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);

  const loadSecrets = async () => {
    try {
      const result = await getAgentJobSecrets();
      setSecrets(Array.isArray(result) ? result : []);
    } catch {
      setSecrets([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSecrets();
  }, []);

  const handleAdd = async (name, value) => {
    const result = await updateAgentJobSecret(name, value);
    if (result?.success) await loadSecrets();
    return result;
  };

  const handleUpdate = async (name, value) => {
    const result = await updateAgentJobSecret(name, value);
    if (result?.success) await loadSecrets();
    return result;
  };

  const handleDelete = async (name) => {
    const result = await deleteAgentJobSecretAction(name);
    if (result?.success) await loadSecrets();
    return result;
  };

  if (loading) {
    return <div className="h-48 animate-pulse rounded-md bg-border/50" />;
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-base font-medium">Job Secrets</h2>
          <p className="text-sm text-muted-foreground">Custom environment variables passed to agent job containers. These are merged with built-in auth credentials when launching jobs.</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => setShowAdd(true)}
            className="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium bg-foreground text-background hover:bg-foreground/90 shrink-0 transition-colors"
          >
            <PlusIcon size={14} />
            Add secret
          </button>
        </div>
      </div>
      <AddSecretDialog
        open={showAdd}
        onAdd={handleAdd}
        onCancel={() => setShowAdd(false)}
        onOAuthSuccess={loadSecrets}
      />
      {secrets.length === 0 ? (
        <EmptyState
          message="No job secrets configured yet."
          actionLabel="Add secret"
          onAction={() => setShowAdd(true)}
        />
      ) : (
        <div className="rounded-lg border bg-card p-4">
          <div className="divide-y divide-border">
            {secrets.map((s) => (
              <SecretRow
                key={s.key}
                label={s.key}
                mono
                isSet={s.isSet}
                onSave={(val) => handleUpdate(s.key, val)}
                onDelete={() => handleDelete(s.key)}
                icon={false}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
