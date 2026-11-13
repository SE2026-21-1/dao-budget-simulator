import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router";
import { type ProposalCollection } from "./proposals";
import { ApiError, loadProposals } from "./api";
import { apiBaseUrl } from "../chain/config";

type LoadState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "success"; collection: ProposalCollection };

export function useProposalFixtures() {
  const [searchParams] = useSearchParams();
  const simulateError = import.meta.env.DEV && !apiBaseUrl && searchParams.get("fixture") === "error";
  const [attempt, setAttempt] = useState(0);
  const writes = useRef<AbortController | null>(null);
  const [loaded, setLoaded] = useState<{ simulateError: boolean; attempt: number; state: LoadState; snapshotSignal?: AbortSignal; refreshError?: string }>();
  const sameSource = loaded?.simulateError === simulateError;
  const refreshing = sameSource && loaded.attempt !== attempt && loaded.state.status === "success";
  const state: LoadState = sameSource && (loaded.attempt === attempt || refreshing)
    ? loaded.state : { status: "loading" };
  const refreshError = sameSource && loaded.attempt === attempt ? loaded.refreshError : undefined;

  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    (simulateError ? Promise.reject(new Error("Lỗi tải dữ liệu mô phỏng để kiểm tra giao diện.")) : loadProposals(controller.signal)).then(
      (collection) => {
        if (!active) return;
        writes.current?.abort();
        writes.current = new AbortController();
        setLoaded({ simulateError, attempt, state: { status: "success", collection }, snapshotSignal: writes.current.signal });
      },
      (error: unknown) => {
        if (!active) return;
        const message = error instanceof Error ? error.message : "Không tải được dữ liệu.";
        if (error instanceof ApiError && (error.status === 409 || error.status === 503)) {
          // Revoke synchronously, including sends already awaiting RPC. Retry
          // cannot revive this lease; only a complete canonical load replaces it.
          writes.current?.abort(new Error("Snapshot không còn hợp lệ hoặc API chưa sẵn sàng. Tải dữ liệu canonical mới trước khi thao tác."));
        }
        setLoaded((previous) => previous?.simulateError === simulateError && previous.state.status === "success"
          ? { simulateError, attempt, state: previous.state, snapshotSignal: previous.snapshotSignal, refreshError: message }
          : { simulateError, attempt, state: { status: "error", message } });
      },
    );
    return () => { active = false; controller.abort(); };
  }, [simulateError, attempt]);

  const invalidateSnapshot = useCallback((error: unknown) => {
    if (!(error instanceof ApiError) || (error.status !== 409 && error.status !== 503)) return;
    writes.current?.abort(new Error("Snapshot không còn hợp lệ hoặc API chưa sẵn sàng. Tải dữ liệu canonical mới trước khi thao tác."));
    setLoaded((previous) => previous?.state.status === "success"
      ? { ...previous, refreshError: error.message } : previous);
  }, []);
  const retry = () => setAttempt((value) => value + 1);
  return { state, retry, simulateError, refreshing, refreshError, invalidateSnapshot, snapshotSignal: sameSource ? loaded.snapshotSignal : undefined };
}
