import { useEffect, useState } from "react";
import { apiBaseUrl } from "../chain/config";
import { loadHealth, type Health } from "../data/api";

export default function ApiHealth() {
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<{ attempt: number; health?: Health; error?: string }>();
  useEffect(() => {
    if (!apiBaseUrl) return;
    const controller = new AbortController();
    loadHealth(controller.signal).then(
      (health) => { if (!controller.signal.aborted) setResult({ attempt, health }); },
      (cause: unknown) => { if (!controller.signal.aborted) setResult({ attempt, error: cause instanceof Error ? cause.message : "Không đọc được health API." }); },
    );
    return () => controller.abort();
  }, [attempt]);
  if (!apiBaseUrl) return null;
  const current = result?.attempt === attempt ? result : undefined;
  const health = current?.health;
  return <section className="api-health" aria-label="Tình trạng API">
    <p role="status">{current?.error ?? (health ? `API: ${health.data.status} · DB: ${health.data.database} · Indexer: ${health.data.indexer} · Publication: ${health.data.publication}` : "Đang kiểm tra API…")}</p>
    {health?.context?.sync?.lagBlocks != null && <p>Độ trễ indexer: {health.context.sync.lagBlocks} block. Độ trễ projection: {health.data.projectionLagBlocks ?? "chưa xác định"} block.</p>}
    {health?.data.rawDecodeComplete === false && <p className="notice">Có raw event chưa giải mã đầy đủ; kiểm tra indexer trước khi dùng số liệu.</p>}
    {health?.data.status === "degraded" && <p className="notice">Pipeline có cảnh báo. Health BE05 không thăm dò RPC; không đồng nghĩa RPC đang down.</p>}
    <button type="button" className="button-secondary" onClick={() => setAttempt((value) => value + 1)}>Kiểm tra API</button>
  </section>;
}
