import { useEffect, useState } from "react";
import { useSearchParams } from "react-router";
import { type ProposalCollection } from "./proposals";
import { loadProposals } from "./api";
import { apiBaseUrl } from "../chain/config";

type LoadState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "success"; collection: ProposalCollection };

export function useProposalFixtures() {
  const [searchParams] = useSearchParams();
  const simulateError = import.meta.env.DEV && !apiBaseUrl && searchParams.get("fixture") === "error";
  const [attempt, setAttempt] = useState(0);
  const [loaded, setLoaded] = useState<{ simulateError: boolean; attempt: number; state: LoadState }>();
  const sameSource = loaded?.simulateError === simulateError;
  const refreshing = sameSource && loaded.attempt !== attempt && loaded.state.status === "success";
  const state: LoadState = sameSource && (loaded.attempt === attempt || refreshing)
    ? loaded.state : { status: "loading" };

  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    (simulateError ? Promise.reject(new Error("Lỗi tải dữ liệu mô phỏng để kiểm tra giao diện.")) : loadProposals(controller.signal)).then(
      (collection) => { if (active) setLoaded({ simulateError, attempt, state: { status: "success", collection } }); },
      (error: unknown) => { if (active) setLoaded({ simulateError, attempt, state: { status: "error", message: error instanceof Error ? error.message : "Không tải được dữ liệu." } }); },
    );
    return () => { active = false; controller.abort(); };
  }, [simulateError, attempt]);

  const retry = () => setAttempt((value) => value + 1);
  return { state, retry, simulateError, refreshing };
}
