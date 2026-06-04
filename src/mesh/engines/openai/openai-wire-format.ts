// WireFormat: VS Code messages → OpenAI-compatible JSON payload
import vscode from 'vscode';
import { unpackStash } from '../../../conduit/replay';
import type { ContentFragment, Envelope, ToolDef, ToolSignal } from '../../contract';

export function forgeEnvelopes(
  msgs: readonly vscode.LanguageModelChatRequestMessage[],
  attachmentMode: boolean,
  isThinkingModel = false,
): Envelope[] {
  const out: Envelope[] = [];

  for (const src of msgs) {
    const role = _mapRole(src.role);
    let text = '';
    const fragments: ContentFragment[] = [];
    const calls: ToolSignal[] = [];
    const results: { cid: string; body: string }[] = [];
    let hasAttach = false;

    for (const p of src.content) {
      if (p instanceof vscode.LanguageModelTextPart) {
        text += p.value;
        if (attachmentMode) fragments.push({ type: 'text', text: p.value });
      } else if (p instanceof vscode.LanguageModelToolCallPart) {
        calls.push({ id: p.callId, type: 'function', function: { name: p.name, arguments: JSON.stringify(p.input) } });
      } else if (p instanceof vscode.LanguageModelToolResultPart) {
        let b = ''; for (const i of p.content) { if (i instanceof vscode.LanguageModelTextPart) b += i.value; }
        results.push({ cid: p.callId, body: b || JSON.stringify(p.content) });
      } else if (attachmentMode && p instanceof vscode.LanguageModelDataPart && p.mimeType.toLowerCase().startsWith('image/')) {
        hasAttach = true;
        fragments.push({ type: 'image_url', image_url: { url: `data:${p.mimeType};base64,${Buffer.from(p.data).toString('base64')}` } });
      }
    }

    if (role === 'assistant') {
      if (text || calls.length) {
        const e: Envelope = { role: 'assistant', content: text || '' };
        if (calls.length) e.tool_calls = calls;
        // Unpack stashed chain-of-thought from a prior turn — only for thinking models
        if (isThinkingModel) {
          const stash = unpackStash(src);
          if (stash.ok && stash.chain) e.reasoning_content = stash.chain;
        }
        out.push(e);
      }
    } else if (text || hasAttach) {
      out.push({ role: role as 'user'|'assistant', content: hasAttach ? fragments : text });
    }

    for (const r of results) out.push({ role: 'tool', content: r.body, tool_call_id: r.cid });
  }
  return out;
}

export function forgeTools(raw?: readonly vscode.LanguageModelChatTool[]): ToolDef[] | undefined {
  if (!raw?.length) return undefined;
  return raw.map(t => ({ type: 'function' as const, function: { name: t.name, description: t.description, parameters: t.inputSchema as Record<string,unknown>|undefined } }));
}

function _mapRole(r: vscode.LanguageModelChatMessageRole): 'user'|'assistant' {
  switch (r) { case vscode.LanguageModelChatMessageRole.User: return 'user'; case vscode.LanguageModelChatMessageRole.Assistant: return 'assistant'; default: return 'user'; }
}
