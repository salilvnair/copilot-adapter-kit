// ErrorWarden — normalizes engine faults into user-friendly messages.
// Maps HTTP statuses and network error codes to actionable text.
import type { Interceptor } from '../mesh/pipeline';

// ---- Network error code → category map ----

const NET_FAULT_CATALOG: Record<string, string> = {
  // DNS
  ENOTFOUND:'dns', EAI_AGAIN:'dns', ENODATA:'dns', ESERVFAIL:'dns', ENONAME:'dns',
  // Unreachable
  ECONNREFUSED:'unreachable', ENETUNREACH:'unreachable', EHOSTUNREACH:'unreachable', EADDRNOTAVAIL:'unreachable',
  // Interrupted
  ECONNRESET:'interrupted', ECONNABORTED:'interrupted', EPIPE:'interrupted', UND_ERR_SOCKET:'interrupted',
  // Timeout
  ETIMEDOUT:'timeout', ESOCKETTIMEDOUT:'timeout', UND_ERR_CONNECT_TIMEOUT:'timeout', UND_ERR_HEADERS_TIMEOUT:'timeout',
  // TLS
  CERT_HAS_EXPIRED:'tls', CERT_UNTRUSTED:'tls', SELF_SIGNED_CERT_IN_CHAIN:'tls', UNABLE_TO_VERIFY_LEAF_SIGNATURE:'tls',
  DEPTH_ZERO_SELF_SIGNED_CERT:'tls', ERR_TLS_CERT_ALTNAME_INVALID:'tls',
  // Protocol
  HPE_INVALID_VERSION:'protocol', UND_ERR_INVALID_ARG:'protocol',
  // Aborted
  ABORT_ERR:'aborted',
};

function _netCategory(code: string | undefined): 'dns'|'unreachable'|'interrupted'|'timeout'|'tls'|'protocol'|'aborted'|'generic' {
  if (!code) return 'generic';
  if (NET_FAULT_CATALOG[code]) return NET_FAULT_CATALOG[code] as any;
  if (code.startsWith('ERR_TLS_') || code.startsWith('ERR_SSL_')) return 'tls';
  if (code.startsWith('HPE_')) return 'protocol';
  return 'generic';
}

function _netMessage(category: ReturnType<typeof _netCategory>, code: string | undefined): string {
  const errCode = code || 'UNKNOWN';
  switch (category) {
    case 'dns':          return `DNS lookup failed — "${errCode}". Check network, firewall, or custom baseUrl.`;
    case 'unreachable':  return `Connection refused — "${errCode}". Verify baseUrl and that the service is running.`;
    case 'interrupted':  return `Connection interrupted — "${errCode}". Check network stability or try again.`;
    case 'timeout':      return `Connection timed out — "${errCode}". Service may be overloaded or unreachable.`;
    case 'tls':          return `TLS verification failed — "${errCode}". Check certificate or proxy settings.`;
    case 'protocol':     return `HTTP protocol error — "${errCode}". Verify the endpoint URL is correct.`;
    case 'aborted':      return `Request was aborted — "${errCode}".`;
    default:             return `Network error — "${errCode}". Verify baseUrl, network, and service status.`;
  }
}

// ---- Interceptor ----

export class ErrorWarden implements Interceptor {
  async intercept(
    _payload: any, _engine: any, sink: { onFault: (e: Error) => void },
    _signal: any, next: () => Promise<void>
  ): Promise<void> {
    const orig = sink.onFault;
    sink.onFault = async (e: Error & { status?: number; raw?: string; code?: string }) => {
      const wrapped = Object.assign(new Error(_renderMessage(e)), {
        status: e.status,
        raw: e.raw,
      });
      await orig(wrapped);
    };
    await next();
  }
}

function _renderMessage(e: Error & { status?: number; raw?: string; code?: string }): string {
  // HTTP errors
  if (e.status) {
    switch (e.status) {
      case 400: return 'Invalid request — check baseUrl and model name.';
      case 401: return 'Invalid API key. Run Copilot Adapter Kit: Set API Key.';
      case 402: return 'Insufficient balance. Top up your provider account.';
      case 429: return e.message;  // RateLimitGuard handles
      case 500: case 502: case 503: return 'Provider server error. Retry shortly.';
      default: return e.message || `HTTP ${e.status}`;
    }
  }

  // Network errors
  const cat = _netCategory(e.code);
  if (cat !== 'generic') return _netMessage(cat, e.code);

  return e.message || 'Unknown error. Check Copilot Adapter Kit: Show Logs.';
}
