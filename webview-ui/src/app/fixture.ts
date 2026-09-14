/* Development fixture — the mock's own data.
 *
 * Only used when the page is open outside VS Code (npm run dev), so a screen
 * can be checked against the approved mock without an extension host. Guarded
 * by import.meta.env.DEV, so it is dropped from the production bundle. */

import type { AppState } from './state';

const HOUR = 3_600_000;

export const FIXTURE: AppState = {
  version: '1.0.3',
  providers: {
    'p-deepseek': { uuid: 'p-deepseek', family: 'deepseek', name: 'DeepSeek', baseUrl: 'https://api.deepseek.com/v1' },
    'p-openrouter': { uuid: 'p-openrouter', family: 'openrouter', name: 'OpenRouter', baseUrl: 'https://openrouter.ai/api/v1' },
    'p-anthropic': { uuid: 'p-anthropic', family: 'anthropic', name: 'Anthropic', baseUrl: 'https://api.anthropic.com/v1' },
    'p-ollama': { uuid: 'p-ollama', family: 'ollama', name: 'Ollama', baseUrl: 'http://localhost:11434/v1' },
    'p-groq': { uuid: 'p-groq', family: 'groq', name: 'Groq', baseUrl: 'https://api.groq.com/openai/v1' },
  },
  models: {
    'p-deepseek': [
      { uuid: 'm1', id: 'deepseek-reasoner', name: 'DeepSeek Reasoner', family: 'deepseek', detail: 'Reasoning, 128K context', maxIn: 128000, maxOut: 32768, thinking: true, toolCalling: 128, pricing: '$0.55 / $2.19' },
      { uuid: 'm2', id: 'deepseek-chat', name: 'DeepSeek Chat', family: 'deepseek', detail: 'Fast general purpose', maxIn: 128000, maxOut: 8192, toolCalling: 128, pricing: '$0.27 / $1.10' },
    ],
    'p-anthropic': [
      { uuid: 'm3', id: 'claude-sonnet-5', name: 'Claude Sonnet 5', family: 'anthropic', detail: 'Balanced reasoning, 200K context', maxIn: 200000, maxOut: 64000, image: true, thinking: true, toolCalling: 128, pricing: 'in $3.00 / out $15.00' },
      { uuid: 'm4', id: 'claude-opus-5', name: 'Claude Opus 5', family: 'anthropic', detail: 'Deepest reasoning', maxIn: 200000, maxOut: 64000, image: true, thinking: true, toolCalling: 128 },
    ],
    'p-groq': [
      { uuid: 'm5', id: 'llama-3.3-70b', name: 'Llama 3.3 70B', family: 'groq', detail: 'Fast inference', maxIn: 128000, maxOut: 16384, toolCalling: 64 },
    ],
    'p-ollama': [
      { uuid: 'm6', id: 'qwen3-coder-480b', name: 'Qwen3 Coder', family: 'ollama', detail: 'Local, free', maxIn: 256000, maxOut: 32768, toolCalling: 32 },
      { uuid: 'm7', id: 'gpt-4o-mini', name: 'GPT-4o mini', family: 'ollama', detail: 'Hidden example', maxIn: 128000, maxOut: 16384 },
    ],
    'p-openrouter': [
      { uuid: 'm8', id: 'codex-5.3', name: 'Codex 5.3', family: 'openrouter', detail: 'Responses API', maxIn: 400000, maxOut: 128000, apiPath: '/responses', toolCalling: 64 },
      { uuid: 'm9', id: 'grok-3', name: 'Grok 3', family: 'openrouter', maxIn: 128000, maxOut: 16384 },
    ],
  },
  keys: { 'p-deepseek': true, 'p-anthropic': true, 'p-groq': true, 'p-ollama': false, 'p-openrouter': false },
  health: {
    'p-deepseek': { reachable: true, ms: 118, status: 200, checkedAt: Date.now() - 2 * 60_000 },
    'p-openrouter': { reachable: true, ms: 240, status: 401, checkedAt: Date.now() - 5 * 60_000 },
    'p-anthropic': { reachable: true, ms: 204, status: 200, authFailedAt: Date.now() - 40 * 60_000, checkedAt: Date.now() - 60_000 },
    'p-ollama': { reachable: false, checkedAt: Date.now() - 2 * 24 * HOUR },
    'p-groq': { reachable: true, ms: 61, status: 200, checkedAt: Date.now() - 60_000 },
  },
  hiddenCustomModels: ['ollama:gpt-4o-mini'],
  engineFamilies: [
    { family: 'openai', label: 'OpenAI', defaultUrl: 'https://api.openai.com/v1', desc: '' },
    { family: 'anthropic', label: 'Anthropic', defaultUrl: 'https://api.anthropic.com/v1', desc: '' },
    { family: 'deepseek', label: 'DeepSeek', defaultUrl: 'https://api.deepseek.com/v1', desc: '' },
    { family: 'groq', label: 'Groq', defaultUrl: 'https://api.groq.com/openai/v1', desc: '' },
    { family: 'openrouter', label: 'OpenRouter', defaultUrl: 'https://openrouter.ai/api/v1', desc: '' },
    { family: 'ollama', label: 'Ollama', defaultUrl: 'http://localhost:11434/v1', desc: '' },
    { family: 'custom', label: 'Custom', defaultUrl: '', desc: '' },
  ],
  maxTokens: 0,
  logLevel: 'meta',
  probeIntervalMinutes: 5,
  budget: {
    caps: {
      enforce: true,
      dailyTokenLimit: 2_000_000,
      dailyCostLimitUsd: 25,
      maxInputTokensPerRequest: 200_000,
      maxOutputTokens: 0,
      maxTurnsPerConversation: 50,
    },
    day: {
      day: '2026-09-13',
      inputTokens: 1_830_000,
      outputTokens: 170_000,
      costUsd: 18.42,
      requests: 214,
      blocked: 17,
      estimated: false,
      hourly: [3_000, 2_000, 180_000, 520_000, 540_000, 530_000, 190_000, 12_000,
               8_000, 14_000, 3_000, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      hourlyCost: [0.02, 0.01, 1.7, 4.9, 5.1, 5.0, 1.8, 0.1,
                   0.07, 0.13, 0.03, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      refusals: [
        { at: Date.now() - 30 * 60_000, reason: 'Daily token budget reached — 2.00M of 2.00M tokens used today.', modelId: 'deepseek-reasoner', estimatedInput: 118_000 },
        { at: Date.now() - 95 * 60_000, reason: 'Agent loop guard — 50 requests already sent for this conversation (limit 50).', modelId: 'deepseek-reasoner', estimatedInput: 121_000 },
        { at: Date.now() - 190 * 60_000, reason: 'Request too large — ~241K input tokens exceeds the per-request limit of 200K.', modelId: 'claude-sonnet-5', estimatedInput: 241_000 },
      ],
      byModel: {
        'deepseek-reasoner': { inputTokens: 1_150_000, outputTokens: 60_000, costUsd: 9.88, requests: 96 },
        'claude-sonnet-5': { inputTokens: 480_000, outputTokens: 32_000, costUsd: 6.14, requests: 54 },
        'qwen3-coder-480b': { inputTokens: 220_000, outputTokens: 21_000, costUsd: 2.4, requests: 41 },
        'llama-3.3-70b': { inputTokens: 30_000, outputTokens: 6_000, costUsd: 0, requests: 23 },
      },
    },
    history: Array.from({ length: 40 }, (_, i) => {
      const d = new Date();
      d.setDate(d.getDate() - (40 - i));
      const day = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      const weekend = d.getDay() === 0 || d.getDay() === 6;
      const tokens = weekend ? 0 : Math.round(300_000 + Math.abs(Math.sin(i)) * 1_700_000);
      return {
        day, tokens,
        costUsd: (tokens / 1e6) * 9.2,
        requests: Math.round(tokens / 9000),
        blocked: tokens > 1_900_000 ? 12 : 0,
        capped: tokens >= 2_000_000,
      };
    }),
    tokenPct: 100,
    costPct: 73.7,
    overLimit: true,
    nearLimit: true,
  },
  audit: {
    ok: true,
    path: '~/.salilvnair/copilot-adapter-kit/db/cak.db',
    sizeBytes: 148_480,
    recordBodies: false,
    counts: { ai: 4, ui: 3 },
    ai: [
      {
        audit_id: 4, conversation_id: '4c1f8a93b6e2d507', stage: 'chat.refused',
        provider: 'deepseek', model: 'deepseek-reasoner',
        input_tokens: 118_000, output_tokens: 0, duration_ms: 1,
        error: 'Daily token budget reached — 2.00M of 2.00M tokens used today.',
        meta: JSON.stringify({ messages: 34, tools: 128, estimated: true }),
        created_at: new Date(Date.now() - 30 * 60_000).toISOString(),
      },
      {
        audit_id: 3, conversation_id: '4c1f8a93b6e2d507', stage: 'chat.complete',
        provider: 'deepseek', model: 'deepseek-reasoner',
        input_tokens: 118_240, output_tokens: 1_913, cost_usd: 0.0691, duration_ms: 8_388,
        meta: JSON.stringify({ messages: 34, tools: 128, maxTokens: 32_768 }),
        created_at: new Date(Date.now() - 46 * 60_000).toISOString(),
      },
      {
        audit_id: 2, conversation_id: '9b02c7aa14ef3d61', stage: 'chat.error',
        provider: 'anthropic', model: 'claude-sonnet-5',
        input_tokens: 8_420, output_tokens: 0, duration_ms: 312,
        error: 'Invalid API key. Run Copilot Adapter Kit: Set API Key.',
        meta: JSON.stringify({ messages: 8, tools: 64 }),
        created_at: new Date(Date.now() - 95 * 60_000).toISOString(),
      },
      {
        audit_id: 1, conversation_id: 'a71d0c33e9b45f28', stage: 'git.commit',
        provider: 'deepseek', model: 'deepseek-chat',
        input_tokens: 4_210, output_tokens: 288, cost_usd: 0.0014, duration_ms: 1_804,
        meta: JSON.stringify({ messages: 1, tools: 0 }),
        created_at: new Date(Date.now() - 3 * 3_600_000).toISOString(),
      },
    ],
    ui: [
      { id: 3, event_type: 'provider.remove', module: 'providers', action: 'OpenRouter', created_at: new Date(Date.now() - 12 * 60_000).toISOString() },
      { id: 2, event_type: 'budget.limit', module: 'spend-guard', action: 'dailyTokenLimit → 2000000', created_at: new Date(Date.now() - 70 * 60_000).toISOString() },
      { id: 1, event_type: 'extension.activate', module: 'core', action: '1.0.3', created_at: new Date(Date.now() - 5 * 3_600_000).toISOString() },
    ],
  },
  usageByModel: {},
};
