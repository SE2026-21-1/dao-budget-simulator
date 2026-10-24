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
  const simulateError = import.meta.env.DEV && searchParams.get("fixture") === "error";
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<LoadState>({ status: "loading" });

  useEffect(() => {
    let active = true;
    (simulateError && !apiBaseUrl ? Promise.reject(new Error("Lỗi tải dữ liệu mô phỏng để kiểm tra giao diện.")) : loadProposals()).then(
      (collection) => { if (active) setState({ status: "success", collection }); },
      (error: unknown) => { if (active) setState({ status: "error", message: error instanceof Error ? error.message : "Không tải được dữ liệu." }); },
    );
    return () => { active = false; };
  }, [simulateError, attempt]);

  const retry = () => { setState({ status: "loading" }); setAttempt((value) => value + 1); };
  return { state, retry, simulateError };
}
