// TokenMath — approximate token counting for VS Code's token budget display.
export class TokenMath {
  private ratio = 4.0;

  estimate(input: string | { content?: Array<{ value?: string | string[] }> }): number {
    let chars = 0;
    if (typeof input === 'string') {
      chars = input.length;
    } else if (Array.isArray(input.content)) {
      for (const p of input.content) {
        const v = p.value;
        chars += Array.isArray(v) ? v.join('').length : typeof v === 'string' ? v.length : 0;
      }
    }
    return Math.ceil(chars / this.ratio);
  }

  calibrate(tokens: number, chars: number): void {
    if (tokens > 0 && chars > 0) this.ratio = chars / tokens;
  }
}

export const tokenMath = new TokenMath();
