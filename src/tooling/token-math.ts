// TokenMath — conservative token estimation.
//
// A naive chars/4 estimate systematically UNDERCOUNTS code, JSON and non-Latin
// text, which makes VS Code pack more real tokens into a request than it thinks
// it is sending. Every estimate here is deliberately biased to over-count: it is
// far cheaper to under-fill a context window than to overshoot a spend cap.

/** Bias applied to learned ratios so calibration can never make us optimistic. */
const SAFETY = 1.05;
/** Clamp for learned chars-per-token so one odd response can't skew everything. */
const RATIO_MIN = 2.0;
const RATIO_MAX = 4.5;

export interface TextLike {
  content?: Array<{ value?: string | string[] }>;
}

/** Flatten a string or a VS Code-style message into raw text. */
export function flatten(input: string | TextLike | undefined): string {
  if (!input) return '';
  if (typeof input === 'string') return input;
  if (!Array.isArray(input.content)) return '';
  let out = '';
  for (const p of input.content) {
    const v = p?.value;
    if (Array.isArray(v)) out += v.join('');
    else if (typeof v === 'string') out += v;
  }
  return out;
}

/**
 * Estimate tokens for a chunk of text.
 *
 * Two independent estimates are taken and the LARGER wins:
 *   - character based, weighting non-ASCII far more heavily (CJK is ~1 token/char)
 *   - word based, since punctuation-dense code splits into more tokens than words
 */
export function estimateTokens(text: string, charsPerToken = 3.6): number {
  if (!text) return 0;
  const ratio = Math.min(Math.max(charsPerToken, RATIO_MIN), RATIO_MAX);

  let ascii = 0;
  for (let i = 0; i < text.length; i++) {
    if (text.charCodeAt(i) < 128) ascii++;
  }
  const nonAscii = text.length - ascii;

  // Non-ASCII: ~0.9 tokens per char (CJK, emoji, accented scripts).
  const byChars = ascii / ratio + nonAscii * 0.9;

  // Whitespace-delimited runs. Code averages well above 1 token per run.
  const words = text.split(/\s+/).length;
  const byWords = words * 1.35 + nonAscii * 0.9;

  return Math.ceil(Math.max(byChars, byWords));
}

/** Estimate tokens for a whole outbound payload, tool schemas included. */
export function estimatePayloadTokens(
  payload: { messages?: unknown; tools?: unknown },
  charsPerToken = 3.6,
): number {
  const msgs = payload.messages ? JSON.stringify(payload.messages) : '';
  const tools = payload.tools ? JSON.stringify(payload.tools) : '';
  // JSON scaffolding (braces, quotes, keys) is itself tokenised by the provider,
  // so we estimate over the serialised form rather than the text alone.
  return estimateTokens(msgs, charsPerToken) + estimateTokens(tools, charsPerToken);
}

export class TokenMath {
  private ratio = 3.6;

  estimate(input: string | TextLike): number {
    return estimateTokens(flatten(input), this.ratio);
  }

  /** Learn the real chars-per-token from a provider usage report, biased low. */
  calibrate(tokens: number, chars: number): void {
    if (tokens <= 0 || chars <= 0) return;
    const observed = chars / tokens / SAFETY;
    this.ratio = Math.min(Math.max(observed, RATIO_MIN), RATIO_MAX);
  }

  get charsPerToken(): number { return this.ratio; }
}

export const tokenMath = new TokenMath();
