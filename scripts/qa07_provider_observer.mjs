// Inject with evaluateOnNewDocument before navigating to the owned frontend.
// Observes real providers; never creates a provider, emits wallet events or changes replies.
export function installProviderObserver({ runId, sourceCommit, origin, sinkName = '__qa07Record' }) {
  if (window.location.origin !== origin) return;
  if (window.__qa07Observer) throw new Error('Observer already installed in this document');
  const entries = [];
  const providers = new Map();
  let sequence = 0;
  const copy = value => value === undefined ? null : JSON.parse(JSON.stringify(value));
  const record = value => {
    const entry = { sequence: ++sequence, at: new Date().toISOString(), monotonicMs: performance.now(), runId, sourceCommit, ...value };
    entries.push(entry);
    if (typeof window[sinkName] === 'function') {
      // A failed external sink invalidates delivery, but must not change wallet behavior.
      try { Promise.resolve(window[sinkName](entry)).catch(() => {}); } catch {}
    }
    return entry;
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
      const method = args?.method;
      const begin = record({ kind: 'request', providerId: id, method, params: safeParams.has(method) ? copy(args.params) : null, paramsRedacted: !safeParams.has(method), from: method === 'eth_sendTransaction' ? args.params?.[0]?.from ?? null : null });
      const failed = error => {
        record({ kind: 'error', providerId: id, requestSequence: begin.sequence, method, code: error?.code ?? null, message: safeParams.has(method) ? String(error?.message ?? error) : null });
        throw error;
      };
      let result;
      try { result = Reflect.apply(original, provider, [args]); } catch (error) { return failed(error); }
      return Promise.resolve(result).then(value => {
        record({ kind: 'response', providerId: id, requestSequence: begin.sequence, method, result: safeResults.has(method) ? copy(value) : null, resultRedacted: !safeResults.has(method) });
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
      provider.on?.(event, value => record({ kind: 'event', providerId: id, event, value: copy(value) }));
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
      return { runId, sourceCommit, origin, entries: copy(entries), providers: [...providers.values()].map(s => ({ id: s.id, installed: s.installed, stillWrapped: s.provider.request === s.wrapped })) };
    },
  };
  record({ kind: 'document-init', readyState: document.readyState });
  scan('document-init-before-app');
}
