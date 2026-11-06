import { useEffect, useState } from "react";
import { apiBaseUrl, deployment } from "../chain/config";
import { useWallet } from "../chain/wallet";
import { loadHealth, type Health } from "../data/api";

export default function ApiHealth() {
  const { account, chainId } = useWallet();
  const [attempt, setAttempt] = useState(0);
  const scope = `${apiBaseUrl}:${deployment?.chainId}:${deployment?.deploymentId}:${account}:${chainId}`;
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
  if (!apiBaseUrl) return null;
  const current = result?.attempt === attempt && result.scope === scope ? result : undefined;
  const health = current?.health;
  const sync = health?.context?.sync;
  const stale = sync?.status === "lagging" || (sync?.lagSeconds != null && BigInt(sync.lagSeconds) > 30n);
  return <section className="api-health" aria-label="Tình trạng API">
    <p role="status">{current?.error ?? (health ? `API: ${health.data.status} · DB: ${health.data.database} · Indexer: ${health.data.indexer} · Publication: ${health.data.publication}` : "Đang kiểm tra API…")}</p>
    {health?.context?.sync?.lagBlocks != null && <p>Độ trễ indexer: {health.context.sync.lagBlocks} block. Độ trễ projection: {health.data.projectionLagBlocks ?? "chưa xác định"} block.</p>}
    {stale && <p className="notice" role="alert">Dữ liệu có thể đã cũ: pipeline chưa xác minh hoặc publication đang trễ. Độ trễ theo dõi: {sync?.lagSeconds ?? "chưa xác định"} giây. Trang tự kiểm tra lại để cập nhật khi indexer phục hồi.</p>}
    {health?.data.rawDecodeComplete === false && <p className="notice">Có raw event chưa giải mã đầy đủ; kiểm tra indexer trước khi dùng số liệu.</p>}
    {health?.data.status === "degraded" && <p className="notice">Pipeline có cảnh báo. Health BE05 không thăm dò RPC; không đồng nghĩa RPC đang down.</p>}
    <button type="button" className="button-secondary" onClick={() => setAttempt((value) => value + 1)}>Kiểm tra API</button>
  </section>;
}
