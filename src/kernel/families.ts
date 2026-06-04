// Known provider families — all OpenAI-compatible APIs.
// Each entry maps to the standard /chat/completions path.
export interface FamilyDef {
  family: string;
  label: string;
  defaultUrl: string;
  desc: string;
}

export const KNOWN_FAMILIES: FamilyDef[] = [
  { family: 'openai',     label: 'OpenAI',            defaultUrl: 'https://api.openai.com/v1',              desc: 'GPT-4o, GPT-5, o4-mini, Codex' },
  { family: 'anthropic',  label: 'Anthropic',         defaultUrl: 'https://api.anthropic.com/v1',           desc: 'Claude Opus, Sonnet, Haiku — native Messages API' },
  { family: 'deepseek',   label: 'DeepSeek',          defaultUrl: 'https://api.deepseek.com/v1',            desc: 'V3, R1 — reasoning_content' },
  { family: 'groq',       label: 'Groq',              defaultUrl: 'https://api.groq.com/openai/v1',         desc: 'Fast inference — Llama, Mixtral, Gemma' },
  { family: 'together',   label: 'Together AI',       defaultUrl: 'https://api.together.xyz/v1',            desc: 'Llama, Mixtral, Qwen, DeepSeek' },
  { family: 'fireworks',  label: 'Fireworks AI',      defaultUrl: 'https://api.fireworks.ai/inference/v1',  desc: 'Serverless — Llama, Mixtral, Qwen' },
  { family: 'openrouter', label: 'OpenRouter',        defaultUrl: 'https://openrouter.ai/api/v1',           desc: 'Multi-provider gateway — 200+ models' },
  { family: 'mistral',    label: 'Mistral',           defaultUrl: 'https://api.mistral.ai/v1',              desc: 'Large, Small, Codestral' },
  { family: 'xai',        label: 'xAI (Grok)',        defaultUrl: 'https://api.x.ai/v1',                    desc: 'Grok-3' },
  { family: 'ollama',     label: 'Ollama',            defaultUrl: 'http://localhost:11434/v1',              desc: 'Local — Llama, Mistral, Phi, Gemma, Qwen' },
  { family: 'lmstudio',   label: 'LM Studio',         defaultUrl: 'http://localhost:1234/v1',               desc: 'Local — Llama, Mistral, Qwen, Gemma, DeepSeek' },
  { family: 'vllm',       label: 'vLLM (self-hosted)',defaultUrl: 'http://localhost:8000/v1',               desc: 'Self‑hosted — any model, OpenAI‑compatible server' },
  { family: 'custom',     label: 'Custom',            defaultUrl: '',                                       desc: 'Any OpenAI‑compatible endpoint' },
];

/** Lookup a default URL by family key. */
export function defaultUrlFor(family: string): string {
  return KNOWN_FAMILIES.find(f => f.family === family)?.defaultUrl ?? '';
}
