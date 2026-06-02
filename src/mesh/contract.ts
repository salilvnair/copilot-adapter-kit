// SPI — every engine implements this signature.
// Equivalent to Spring's ServiceProviderInterface.

export interface Payload {
  model: string; stream: boolean; max_tokens?: number;
  messages: Envelope[];
  tools?: ToolDef[]; tool_choice?: 'none'|'auto'|'required';
  apiPath?: string;
}

export interface Envelope {
  role: 'system'|'user'|'assistant'|'tool';
  content: string | ContentFragment[];
  tool_call_id?: string; tool_calls?: ToolSignal[];
  reasoning_content?: string;
}

export interface ContentFragment {
  type: 'text'|'image_url';
  text?: string;
  image_url?: { url: string; detail?: 'auto'|'low'|'high' };
}

export interface ToolSignal  { id: string; type: 'function'; function: { name: string; arguments: string }; }
export interface ToolDef     { type: 'function'; function: { name: string; description?: string; parameters?: Record<string,unknown> }; }
export interface UsageReport { prompt_tokens: number; completion_tokens: number; total_tokens: number; }

export interface StreamEvents {
  onToken: (t: string) => void;
  onThinking: (t: string) => void;
  onToolSignal: (tc: ToolSignal) => void;
  onFault: (e: Error) => Promise<void> | void;
  onComplete: () => void;
  onReport?: (u: UsageReport) => void;
}

export interface Engine {
  configure?(endpoint: string, apiKey: string): void;
  readonly family: string;
  stream(request: Payload, sink: StreamEvents, signal?: AbortSignal): Promise<void>;
}
