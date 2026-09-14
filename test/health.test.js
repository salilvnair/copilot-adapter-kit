// The reachability probe.
//
// The Providers screen promises "never with your key attached", and that
// promise is the whole reason this is a separate signal from key validity: a
// probe that carried the key would be sending it somewhere to ask whether it
// works, which is exactly what the design refuses to do.
//
// So the probe is asserted at the fetch: what URL, what method, and — the part
// that matters — what headers.

const Module = require('module');
const path = require('path');
const ROOT = process.argv[2];

let stored = {};
let settings = {};
const vscodeStub = {
  workspace: {
    getConfiguration: () => ({ get: (k, d) => (settings[k] !== undefined ? settings[k] : d) }),
  },
  window: { showInformationMessage() {}, showWarningMessage() {}, showErrorMessage() {} },
};
const origResolve = Module._resolveFilename;
Module._resolveFilename = function (req, ...rest) {
  if (req === 'vscode') return 'vscode';
  return origResolve.call(this, req, ...rest);
};
require.cache['vscode'] = { id: 'vscode', filename: 'vscode', loaded: true, exports: vscodeStub };

const { ProviderHealth } = require(path.join(ROOT, 'out/kernel/health.js'));

let pass = 0, fail = 0;
const check = (name, cond, extra = '') => {
  if (cond) { pass++; console.log('  PASS  ' + name); }
  else { fail++; console.log('  FAIL  ' + name + (extra ? ' -> ' + extra : '')); }
};

/** An extension context with just the state the prober touches. */
const ext = () => ({
  globalState: {
    get: () => stored,
    update: async (_k, v) => { stored = v; },
  },
});

/** Records every request the prober makes. */
let calls = [];
function stubFetch(reply) {
  calls = [];
  global.fetch = async (url, init) => {
    calls.push({ url, init });
    if (typeof reply === 'function') return reply();
    return reply;
  };
}

const ok = (status = 200) => ({ status });

(async () => {
  console.log('\n=== 1. it asks the endpoint, and asks it for nothing ===');
  {
    stored = {};
    stubFetch(ok(200));
    const h = new ProviderHealth(ext());
    await h.probe('p1', 'https://api.deepseek.com/v1');

    check('one request was made', calls.length === 1, String(calls.length));
    check('to the models endpoint', calls[0].url === 'https://api.deepseek.com/v1/models', calls[0].url);
    check('a trailing slash does not double up',
      await (async () => {
        stubFetch(ok(200));
        await new ProviderHealth(ext()).probe('p1', 'https://api.deepseek.com/v1/');
        return calls[0].url === 'https://api.deepseek.com/v1/models';
      })(), calls[0]?.url);

    stubFetch(ok(200));
    await new ProviderHealth(ext()).probe('p1', 'https://api.deepseek.com/v1');
    check('it only reads', calls[0].init.method === 'GET', calls[0].init.method);
  }

  console.log('\n=== 2. the key is never attached ===');
  {
    stored = {};
    stubFetch(ok(200));
    const h = new ProviderHealth(ext());
    await h.probe('p1', 'https://api.deepseek.com/v1');

    const init = calls[0].init ?? {};
    const headers = init.headers ?? {};
    const names = headers instanceof Map
      ? [...headers.keys()]
      : Object.keys(headers);

    check('no headers are sent at all', names.length === 0, names.join(', '));
    check('nothing resembling authorization',
      !names.some(n => /auth|key|token|bearer/i.test(n)), names.join(', '));
    check('no body is sent', init.body === undefined);
    // The one place a key could hide: the query string.
    check('the key is not smuggled into the URL',
      !/[?&]/.test(calls[0].url), calls[0].url);
  }

  console.log('\n=== 3. reachable means "answered", not "authorised" ===');
  {
    stored = {};
    stubFetch(ok(401));
    const h = new ProviderHealth(ext());
    const rec = await h.probe('p1', 'https://api.deepseek.com/v1');
    check('a 401 endpoint is reachable — it is the key that is wrong, not the URL',
      rec.reachable === true, JSON.stringify(rec));
    check('the status is kept so the panel can explain itself', rec.status === 401);
    check('it does not claim the key failed — nothing was sent to test it',
      rec.authFailedAt === undefined);
  }

  console.log('\n=== 4. only a transport failure counts as down ===');
  {
    stored = {};
    stubFetch(() => { throw new Error('getaddrinfo ENOTFOUND'); });
    const rec = await new ProviderHealth(ext()).probe('p1', 'https://nope.invalid/v1');
    check('an unreachable host is down', rec.reachable === false, JSON.stringify(rec));
    check('and it is timestamped', typeof rec.checkedAt === 'number');
    check('with no round trip to report', rec.ms === undefined);
  }

  console.log('\n=== 5. key validity comes from real requests only ===');
  {
    stored = {};
    const h = new ProviderHealth(ext());
    h.recordAuthFailure('p1');
    check('a 401 during real use is recorded', typeof h.get('p1').authFailedAt === 'number');

    h.recordSuccess('p1');
    check('and cleared when a real request later succeeds',
      h.get('p1').authFailedAt === undefined, JSON.stringify(h.get('p1')));
  }

  console.log('\n=== 6. every configured provider is probed, deleted ones are not ===');
  {
    stored = {};
    stubFetch(ok(200));
    const h = new ProviderHealth(ext());
    await h.probeAll({
      live:    { baseUrl: 'https://a.example/v1' },
      alsoOk:  { baseUrl: 'https://b.example/v1' },
      binned:  { baseUrl: 'https://c.example/v1', _deleted: true },
      noUrl:   {},
      broken:  null,
    });
    const urls = calls.map(c => c.url).sort();
    check('two providers, two probes', calls.length === 2, urls.join(', '));
    check('nothing in the Bin is contacted', !urls.some(u => u.includes('c.example')), urls.join(', '));
    check('a malformed entry does not take the sweep down', true);
  }

  console.log('\n=== 7. a fresh answer is reused, and Test always asks ===');
  {
    settings = {};                       // the default interval: 5 minutes
    stored = {};
    stubFetch(ok(200));
    const h = new ProviderHealth(ext());

    await h.probe('p1', 'https://a.example/v1', true);
    check('the first check reaches the network', calls.length === 1, String(calls.length));

    const before = calls.length;
    await h.probe('p1', 'https://a.example/v1', true);
    check('re-opening the panel inside the interval does not',
      calls.length === before, String(calls.length));

    await h.probe('p1', 'https://a.example/v1');       // what Test does
    check('Test asks regardless', calls.length === before + 1, String(calls.length));
  }

  console.log('\n=== 8. the interval is the setting, not a constant ===');
  {
    stored = {};
    settings['health.probeIntervalMinutes'] = 0;       // check on every open
    stubFetch(ok(200));
    const h = new ProviderHealth(ext());
    await h.probe('p1', 'https://a.example/v1', true);
    await h.probe('p1', 'https://a.example/v1', true);
    check('zero means every panel open probes', calls.length === 2, String(calls.length));

    stored = {};
    settings['health.probeIntervalMinutes'] = 60;
    stubFetch(ok(200));
    const h2 = new ProviderHealth(ext());
    await h2.probe('p2', 'https://b.example/v1', true);
    await h2.probe('p2', 'https://b.example/v1', true);
    check('a longer interval holds the answer longer', calls.length === 1, String(calls.length));

    // An answer older than the interval is refreshed, not kept forever.
    stored = { p3: { reachable: true, checkedAt: Date.now() - 61 * 60_000 } };
    stubFetch(ok(200));
    await new ProviderHealth(ext()).probe('p3', 'https://c.example/v1', true);
    check('a stale answer is replaced', calls.length === 1, String(calls.length));
    settings = {};
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
