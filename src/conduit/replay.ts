// Thought stashing — persist chain-of-thought across turns for models that emit
// reasoning_content. During streaming we stash the thinking; at response-end we
// inject a hidden data-part. On the next turn, forgeEnvelopes unpacks the stash
// and threads it back as reasoning_content in the assistant envelope.

import vscode from 'vscode';

// ---- Constants ----

/** MIME tag for stashed chain-of-thought parts. */
export const STASH_MIME = 'x-cak/chain';

/** 2-byte magic header: 0xCA 0x0B ("CAK" + version byte). */
const MAGIC = new Uint8Array([0xca, 0x0b]);

// ---- Public types ----

export interface ThoughtStash {
  chain: string;
}

export interface UnpackedStash {
  ok: boolean;
  chain?: string;
}

// ---- Pack ----

/** Serialise a thought stash into a hidden LanguageModelDataPart.
 *  Format: MAGIC (2 bytes) + raw UTF-8 chain text. */
export function packStash(stash: ThoughtStash): vscode.LanguageModelDataPart {
  const text = new TextEncoder().encode(stash.chain);
  const buf = new Uint8Array(MAGIC.length + text.length);
  buf.set(MAGIC, 0);
  buf.set(text, MAGIC.length);
  return new vscode.LanguageModelDataPart(buf, STASH_MIME);
}

// ---- Unpack ----

/** Walk a message's content parts and extract the first stashed chain. */
export function unpackStash(msg: vscode.LanguageModelChatRequestMessage): UnpackedStash {
  for (const part of msg.content) {
    if (!(part instanceof vscode.LanguageModelDataPart)) continue;
    if (part.mimeType !== STASH_MIME) continue;
    return _decode(part.data);
  }
  return { ok: false };
}

// ---- Helpers ----

export function shouldStash(stash: ThoughtStash): boolean {
  return stash.chain.length > 0;
}

function _decode(data: Uint8Array): UnpackedStash {
  if (data.length < MAGIC.length) return { ok: false };
  if (data[0] !== MAGIC[0] || data[1] !== MAGIC[1]) return { ok: false };
  const text = new TextDecoder().decode(data.slice(MAGIC.length));
  return { ok: true, chain: text };
}
