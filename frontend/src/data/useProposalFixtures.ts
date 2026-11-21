import { useEffect, useState } from "react";
import { useSearchParams } from "react-router";
import { loadProposalFixtures, type ProposalCollection } from "./proposals";

type LoadState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "success"; collection: ProposalCollection };

export function useProposalFixtures() {
  const [searchParams] = useSearchParams();
  const simulateError = import.meta.env.DEV && searchParams.get("fixture") === "error";
  const [attempt, setAttempt] = useState(0);
  const [loaded, setLoaded] = useState<{ simulateError: boolean; attempt: number; state: LoadState }>();
  const state: LoadState = loaded?.simulateError === simulateError && loaded.attempt === attempt
    ? loaded.state : { status: "loading" };

  useEffect(() => {
    let active = true;
    loadProposalFixtures(simulateError).then(
      (collection) => { if (active) setLoaded({ simulateError, attempt, state: { status: "success", collection } }); },
      (error: unknown) => { if (active) setLoaded({ simulateError, attempt, state: { status: "error", message: error instanceof Error ? error.message : "Không tải được dữ liệu." } }); },
    );
    return () => { active = false; };
  }, [simulateError, attempt]);

  const retry = () => setAttempt((value) => value + 1);
  return { state, retry, simulateError };
}
