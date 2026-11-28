const rpcPrefix = 'http://127.0.0.1:';
const servicePorts = new Set([3300, 55432, 5173]);

export function parseRpcPort(raw) {
  if (raw === undefined) return 18545;
  if (typeof raw !== 'string' || raw.length === 0 || raw.length > 64 || /[^0-9]/.test(raw)) {
    throw new Error('RPC port must contain decimal digits only');
  }
  const digits = raw.replace(/^0+/, '') || '0';
  // Bound significant digits before conversion; oversized input must not wrap or round.
  if (digits.length > 5) throw new Error('RPC port must be in range 1..65535');
  const port = Number(digits);
  if (port < 1 || port > 65535) throw new Error('RPC port must be in range 1..65535');
  if (servicePorts.has(port)) throw new Error(`RPC port ${port} collides with another BE09 service`);
  return port;
}

export function validateRpcUrl(url) {
  if (typeof url !== 'string' || !url.startsWith(rpcPrefix)) {
    throw new Error('RPC URL must be exactly http://127.0.0.1:<canonical decimal port>');
  }
  const port = parseRpcPort(url.slice(rpcPrefix.length));
  if (url !== `${rpcPrefix}${port}`) {
    throw new Error('RPC URL must use a canonical decimal port without padding');
  }
  return url;
}

export function validateRpcAllocation(url, scope = 'ordinary') {
  if (scope !== 'ordinary' && scope !== 'issue40') throw new Error(`Invalid BE09 scope: ${scope}`);
  validateRpcUrl(url);
  if (scope === 'issue40' && url !== `${rpcPrefix}28545`) {
    throw new Error('BE09 issue40 scope requires the allocated RPC port 28545');
  }
  return url;
}
