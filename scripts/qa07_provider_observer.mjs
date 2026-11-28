// Inject with evaluateOnNewDocument before navigating to the owned frontend.
// Observes real providers; never creates a provider, emits wallet events or changes replies.
export function installProviderObserver({ runId, sourceCommit, origin, sinkName = '__qa07Record' }) {
  if (window.location.origin !== origin) return;
  if (window.__qa07Observer) throw new Error('Observer already installed in this document');
  const entries = [];
  const providers = new Map();
  const failures = [];
  let sequence = 0;
  let pendingSinkWrites = 0;
  const copy = value => value === undefined ? null : JSON.parse(JSON.stringify(value));
  // Keep only observer-owned metadata here: even inspecting an error can throw.
  const fail = (stage, relatedSequence, type) => {
    failures.push({ stage, relatedSequence, type });
  };
  const record = (value, stage = 'record') => {
    const relatedSequence = ++sequence;
    let entry;
    try {
      entry = copy({ sequence: relatedSequence, at: new Date().toISOString(), monotonicMs: performance.now(), runId, sourceCommit, ...(typeof value === 'function' ? value() : value) });
    } catch {
      fail(stage, relatedSequence, 'serialization-or-metadata');
      // A failure marker is not a request/result/event and contains no invented payload.
      entry = { sequence: relatedSequence, kind: 'observation-failure', stage };
    }
    entries.push(entry);
    try {
      const sink = window[sinkName];
      if (typeof sink !== 'function') {
        fail('sink', relatedSequence, 'unavailable');
      } else {
        // Do not let a sink mutate the authoritative in-memory observation.
        const delivery = Reflect.apply(sink, window, [copy(entry)]);
        pendingSinkWrites++;
        Promise.resolve(delivery).then(
          () => { pendingSinkWrites--; },
          () => { pendingSinkWrites--; fail('sink', relatedSequence, 'rejected'); },
        );
      }
    } catch {
      fail('sink', relatedSequence, 'throw');
    }
    return relatedSequence;
  };
  const safeParams = new Set(['eth_accounts', 'eth_chainId', 'eth_requestAccounts', 'eth_sendTransaction', 'eth_call', 'eth_getTransactionCount', 'wallet_switchEthereumChain', 'wallet_addEthereumChain', 'wallet_requestPermissions', 'wallet_getPermissions', 'wallet_revokePermissions']);
  const safeResults = new Set(['eth_accounts', 'eth_chainId', 'eth_requestAccounts', 'eth_sendTransaction']);
  const attach = (provider, discovery, info = null) => {
    if (!provider || typeof provider.request !== 'function') return;
    if (providers.has(provider)) {
      record({ kind: 'rediscovered', providerId: providers.get(provider).id, discovery, info });
      return;
    }
    const id = `provider-${providers.size + 1}`;
    const original = provider.request;
    const state = { id, provider, original, wrapped: null, installed: false };
    providers.set(provider, state);
    const wrapped = function (args) {
      let method;
      const begin = record(() => {
        method = args?.method;
        return { kind: 'request', providerId: id, method, params: safeParams.has(method) ? args.params : null, paramsRedacted: !safeParams.has(method), from: method === 'eth_sendTransaction' ? args.params?.[0]?.from ?? null : null };
      }, 'request');
      const failed = error => {
        record(() => ({ kind: 'error', providerId: id, requestSequence: begin, method, code: error?.code ?? null, message: safeParams.has(method) ? String(error?.message ?? error) : null, data: safeParams.has(method) ? error?.data ?? null : null }), 'error');
        throw error;
      };
      let result;
      try { result = Reflect.apply(original, provider, [args]); } catch (error) { return failed(error); }
      return Promise.resolve(result).then(value => {
        record(() => ({ kind: 'response', providerId: id, requestSequence: begin, method, result: safeResults.has(method) ? value : null, resultRedacted: !safeResults.has(method) }), 'response');
        return value;
      }, failed);
    };
    state.wrapped = wrapped;
    try {
      state.installed = Reflect.set(provider, 'request', wrapped) && provider.request === wrapped;
    } catch { state.installed = false; }
    record({ kind: state.installed ? 'observer-installed' : 'observer-unavailable', providerId: id, discovery, info, isMetaMask: provider.isMetaMask === true });
    if (!state.installed) return;
    for (const event of ['accountsChanged', 'chainChanged', 'disconnect', 'connect']) {
      provider.on?.(event, value => record(() => ({ kind: 'event', providerId: id, event, value }), 'event'));
    }
  };
  const scan = discovery => {
    const injected = window.ethereum;
    for (const provider of injected?.providers?.length ? injected.providers : [injected]) attach(provider, discovery);
  };
  window.addEventListener('eip6963:announceProvider', event => {
    const detail = event.detail;
    attach(detail?.provider, 'eip6963-capture-before-app-listener', detail?.info ? { uuid: detail.info.uuid, name: detail.info.name, rdns: detail.info.rdns } : null);
  }, true);
  window.addEventListener('ethereum#initialized', () => scan('ethereum-initialized-capture'), true);
  window.__qa07Observer = {
    mark(label) { record({ kind: 'marker', label }); },
    snapshot() {
      return { runId, sourceCommit, origin, entries: copy(entries), observation: { complete: failures.length === 0 && pendingSinkWrites === 0, pendingSinkWrites, failures: copy(failures) }, providers: [...providers.values()].map(s => ({ id: s.id, installed: s.installed, stillWrapped: s.provider.request === s.wrapped })) };
    },
  };
  record({ kind: 'document-init', readyState: document.readyState });
  scan('document-init-before-app');
}
