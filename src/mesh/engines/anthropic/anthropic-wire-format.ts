// Anthropic wire format — Payload → Anthropic Messages API request body.
// Converts from the abstract Envelope[]/ToolDef[] format to Anthropic's native format.

import type { Envelope, Payload } from '../../contract';

export interface AnthropicContentBlock {
  type: 'text' | 'image' | 'tool_use' | 'tool_result' | 'thinking' | 'redacted_thinking';
  text?: string;
  source?: { type: 'base64'; media_type: string; data: string };
  id?: string;
  name?: string;
  input?: Record<string, unknown>;
  tool_use_id?: string;
  content?: string | AnthropicContentBlock[];
  thinking?: string;
  data?: string;
}

export interface AnthropicRequest {
  model: string;
  max_tokens: number;
  stream: boolean;
  system?: string | { type: 'text'; text: string; cache_control?: { type: 'ephemeral' } }[];
  messages: { role: 'user' | 'assistant'; content: string | AnthropicContentBlock[] }[];
  tools?: { name: string; description?: string; input_schema: Record<string, unknown> }[];
  tool_choice?: { type: 'auto' | 'any' | 'tool'; name?: string };
  thinking?: { type: 'enabled'; budget_tokens: number };
}

export function toAnthropicRequest(payload: Payload): AnthropicRequest {
  const envelopes = payload.messages;
  const systemTexts: string[] = [];
  const messages: AnthropicRequest['messages'] = [];

  for (let i = 0; i < envelopes.length; i++) {
    const env = envelopes[i];

    // Extract system messages to top-level system field
    if (env.role === 'system') {
      systemTexts.push(typeof env.content === 'string' ? env.content : _extractText(env.content));
      continue;
    }

    // Handle tool results — Anthropic puts them in user messages
    if (env.role === 'tool') {
      const lastMsg = messages[messages.length - 1];
      const toolContent: AnthropicContentBlock = {
        type: 'tool_result',
        tool_use_id: env.tool_call_id || '',
        content: typeof env.content === 'string' ? env.content : _extractText(env.content),
      };
      if (lastMsg && lastMsg.role === 'user') {
        if (typeof lastMsg.content === 'string') {
          lastMsg.content = [{ type: 'text', text: lastMsg.content }, toolContent];
        } else {
          lastMsg.content.push(toolContent);
        }
      } else {
        // Standalone tool result — wrap in a user message
        messages.push({ role: 'user', content: [toolContent] });
      }
      continue;
    }

    // User and Assistant messages
    const blocks: AnthropicContentBlock[] = [];

    if (typeof env.content === 'string') {
      if (env.content) blocks.push({ type: 'text', text: env.content });
    } else {
      for (const frag of env.content) {
        if (frag.type === 'text' && frag.text) {
          blocks.push({ type: 'text', text: frag.text });
        } else if (frag.type === 'image_url' && frag.image_url?.url) {
          const url = frag.image_url.url;
          // Parse data: URL → base64
          const match = url.match(/^data:([^;]+);base64,(.+)$/);
          if (match) {
            blocks.push({
              type: 'image',
              source: { type: 'base64', media_type: match[1], data: match[2] },
            });
          }
        }
      }
    }

    if (env.role === 'assistant' && env.tool_calls?.length) {
      for (const tc of env.tool_calls) {
        let input: Record<string, unknown> = {};
        try { input = JSON.parse(tc.function.arguments || '{}'); } catch { /* keep empty */ }
        blocks.push({ type: 'tool_use', id: tc.id, name: tc.function.name, input });
      }
    }

    if (blocks.length || (env.role === 'assistant' && !env.tool_calls?.length)) {
      // Assistant with no content and no tool_calls = skip
      if (env.role === 'assistant' && !blocks.length) continue;
    }

    if (!blocks.length) continue;

    messages.push({
      role: (env.role === 'user' || env.role === 'assistant') ? env.role : 'user',
      content: blocks.length === 1 && blocks[0].type === 'text' ? blocks[0].text! : blocks,
    });
  }

  const req: AnthropicRequest = {
    model: payload.model,
    max_tokens: payload.max_tokens || 4096,
    stream: payload.stream !== false,
    messages,
  };

  if (systemTexts.length) {
    req.system = systemTexts.join('\n\n');
  }

  if (payload.tools?.length) {
    req.tools = payload.tools.map(t => ({
      name: t.function.name,
      description: t.function.description,
      input_schema: t.function.parameters || { type: 'object', properties: {} },
    }));
    req.tool_choice = { type: 'auto' };
  }

  return req;
}

function _extractText(content: Envelope['content']): string {
  if (typeof content === 'string') return content;
  return content.filter(f => f.type === 'text').map(f => f.text || '').join('');
}
