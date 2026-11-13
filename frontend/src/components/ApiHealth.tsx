import { useEffect, useState } from "react";
import { apiBaseUrl, apiScope, deployment } from "../chain/config";
import { useWallet } from "../chain/wallet";
import { loadHealth, type Health } from "../data/api";

export default function ApiHealth() {
  const { account, chainId } = useWallet();
  const [attempt, setAttempt] = useState(0);
  const scope = `${apiBaseUrl}:${apiScope?.chainId}:${apiScope?.deploymentId}:${account}:${chainId}`;
  const [result, setResult] = useState<{ scope: string; attempt: number; health?: Health; error?: string }>();
  useEffect(() => {
    if (!apiBaseUrl) return;
    let disposed = false;
    let controller: AbortController | undefined;
    let timer: number | undefined;
    async function refresh() {
      controller = new AbortController();
      const timeout = setTimeout(() => controller?.abort(), 10_000);
      try {
        const health = await loadHealth(controller.signal);
        if (!disposed) setResult({ scope, attempt, health });
      } catch (cause) {
        if (!disposed) setResult({ scope, attempt, error: cause instanceof Error ? cause.message : "Không đọc được health API." });
      } finally {
        clearTimeout(timeout);
        if (!disposed) timer = window.setTimeout(() => { void refresh(); }, 5000);
      }
    }
    void refresh();
    return () => { disposed = true; controller?.abort(); clearTimeout(timer); };
  }, [attempt, scope]);
  const current = result?.attempt === attempt && result.scope === scope ? result : undefined;
  const health = current?.health;
  const sync = health?.context?.sync;
  const stale = sync?.status === "lagging" || (sync?.lagSeconds != null && BigInt(sync.lagSeconds) > 30n);
  const entries = [
    { label: "API", value: !apiBaseUrl ? "Không cấu hình" : current?.error ? "Unavailable" : health?.data.status === "ok" ? "Connected" : health?.data.status === "degraded" ? "Degraded" : health?.data.status === "unavailable" ? "Unavailable" : "Đang kiểm tra", kind: !apiBaseUrl ? "neutral" : current?.error || health?.data.status === "unavailable" ? "bad" : health?.data.status === "ok" ? "good" : health?.data.status === "degraded" ? "warn" : "neutral" },
    { label: "Database", value: health?.data.database ?? "Chưa xác định", kind: health?.data.database === "up" ? "good" : health?.data.database === "down" ? "bad" : "neutral" },
    { label: "Indexer", value: sync?.status ?? health?.data.indexer ?? "Chưa xác định", kind: sync?.status === "synced" ? "good" : sync?.status === "lagging" ? "warn" : sync?.status === "not_ready" ? "bad" : "neutral" },
    { label: "Publication", value: health?.data.publication ?? "Chưa xác định", kind: health?.data.publication === "ready" ? "good" : health?.data.publication ? "bad" : "neutral" },
    { label: "Wallet", value: account ? "Connected" : "Disconnected", kind: account ? "good" : "neutral" },
    { label: "Network", value: !deployment ? "Chưa cấu hình mạng đích" : !account ? "Chưa kiểm tra" : chainId === deployment.chainId ? "Correct" : "Wrong network", kind: !deployment || !account ? "neutral" : chainId === deployment.chainId ? "good" : "bad" },
  ];
  return <section className="api-health" aria-label="Tình trạng hệ thống">
    <div className="api-health__heading"><div><h2>System status</h2><p>API, dữ liệu xuất bản và kết nối ví</p></div>{apiBaseUrl && <button type="button" className="button-secondary" onClick={() => setAttempt((value) => value + 1)}>Kiểm tra lại</button>}</div>
    <div className="api-health__grid">{entries.map((entry) => <div key={entry.label} className="api-health__item"><span>{entry.label}</span><strong className={`system-state system-state--${entry.kind}`}>{entry.value}</strong></div>)}</div>
    {current?.error && <p className="wallet-error" role="alert">{current.error}</p>}
    {!apiBaseUrl && <p className="muted">Đang xem fixture; chưa có tín hiệu health từ API, database hoặc indexer.</p>}
    {health?.context?.sync?.lagBlocks != null && <p>Độ trễ indexer: {health.context.sync.lagBlocks} block. Độ trễ projection: {health.data.projectionLagBlocks ?? "chưa xác định"} block.</p>}
    {stale && <p className="notice" role="alert">Dữ liệu có thể đã cũ: pipeline chưa xác minh hoặc publication đang trễ. Độ trễ theo dõi: {sync?.lagSeconds ?? "chưa xác định"} giây. Trang tự kiểm tra lại để cập nhật khi indexer phục hồi.</p>}
    {health?.data.rawDecodeComplete === false && <p className="notice">Có raw event chưa giải mã đầy đủ; kiểm tra indexer trước khi dùng số liệu.</p>}
    {health?.data.status === "degraded" && <p className="notice">Pipeline có cảnh báo. Health BE05 không thăm dò RPC; không đồng nghĩa RPC đang down.</p>}
  </section>;
}
