// @vitest-environment happy-dom
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { performance } from "node:perf_hooks";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { expect, it, vi } from "vitest";
import type { Hash, TransactionReceipt } from "viem";

const boundary = vi.hoisted(() => ({ waitForReceipt: vi.fn() }));
vi.mock("../src/chain/transactions", () => ({
  ReceiptTerminalError: class ReceiptTerminalError extends Error {
    readonly kind: "reverted" | "cancelled";
    constructor(kind: "reverted" | "cancelled", message: string) { super(message); this.kind = kind; }
  },
  transactionErrorMessage: (cause: unknown) => cause instanceof Error ? cause.message : String(cause),
  waitForReceipt: boundary.waitForReceipt,
}));

import { useTransaction } from "../src/chain/useTransaction";

type Workload = "DUPLICATE" | "DISTINCT";
type Phase = "warmup" | "measured";
type Outcome = "receipt_success" | "blocked_inflight" | "unexpected_null" | "wrong_receipt" | "error";
type Sample = {
  workload: Workload; phase: Phase; run: number; wave: number; task: number;
  identity: string; latency_ms: number; outcome: Outcome; error: string;
  expected_hash: Hash; actual_hash: string; task_send_calls: number; wave_send_count_at_outcome: number;
  peak_logical_inflight: number; peak_receipt_waiters: number;
};

const TASKS = 60;
const run = Number(process.env.VT062_LOAD_RUN ?? "1");
const warmupWaves = Number(process.env.VT062_LOAD_WARMUP ?? "10");
const measuredWaves = Number(process.env.VT062_LOAD_WAVES ?? "100");
const outputDir = resolve(process.env.VT062_LOAD_OUTPUT ?? "../docs/evidence/vt062/load");
if (![run, warmupWaves, measuredWaves].every(Number.isSafeInteger) || run < 1 || warmupWaves < 0 || measuredWaves < 1) {
  throw new Error("Invalid VT062 load run/wave settings.");
}

const samples: Sample[] = [];
const waveStats: Array<Record<string, number | string>> = [];
const receiptFor = (hash: Hash) => ({ transactionHash: hash, status: "success", logs: [] }) as unknown as TransactionReceipt;
const hashFor = (workload: Workload, wave: number, task: number) =>
  ("0x" + (BigInt(run) * 1_000_000n + BigInt(wave) * 1000n + BigInt(task) + (workload === "DISTINCT" ? 500_000n : 0n)).toString(16).padStart(64, "0")) as Hash;

function probe(id: number, hooks: Array<ReturnType<typeof useTransaction>>) {
  return function HookProbe() {
    hooks[id] = useTransaction();
    return null;
  };
}

async function mountHooks() {
  const hooks: Array<ReturnType<typeof useTransaction>> = [];
  const roots: Root[] = [];
  const nodes: HTMLDivElement[] = [];
  await act(async () => {
    for (let id = 0; id < TASKS; id += 1) {
      const node = document.createElement("div");
      document.body.append(node);
      const root = createRoot(node);
      roots.push(root);
      nodes.push(node);
      root.render(probeElement(id, hooks));
    }
  });
  expect(hooks).toHaveLength(TASKS);
  return { hooks, async unmount() { await act(async () => { roots.forEach((root) => root.unmount()); }); nodes.forEach((node) => node.remove()); } };
}

function probeElement(id: number, hooks: Array<ReturnType<typeof useTransaction>>) {
  const HookProbe = probe(id, hooks);
  return <HookProbe />;
}

function nearestRank(values: number[], fraction: number) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.ceil(fraction * sorted.length) - 1];
}

async function executeWave(workload: Workload, phase: Phase, wave: number, hooks: Array<ReturnType<typeof useTransaction>>) {
  const expectedWaiters = workload === "DUPLICATE" ? 1 : TASKS;
  let waitersEntered = 0;
  let releaseStarted!: () => void;
  const allWaitersEntered = new Promise<void>((resolvePromise) => { releaseStarted = resolvePromise; });
  const waiters: Array<{ hash: Hash; resolve: (receipt: TransactionReceipt) => void }> = [];
  boundary.waitForReceipt.mockReset().mockImplementation((hash: Hash) => {
    waitersEntered += 1;
    const pending = new Promise<TransactionReceipt>((resolvePromise) => { waiters.push({ hash, resolve: resolvePromise }); });
    if (waitersEntered === expectedWaiters) releaseStarted();
    return pending;
  });

  let logicalInFlight = 0;
  let peakLogicalInFlight = 0;
  let waveSendCount = 0;
  let callbackCount = 0;
  const waveSamples: Sample[] = [];
  const promises: Array<Promise<void>> = [];
  await act(async () => {
    for (let task = 0; task < TASKS; task += 1) {
      const actualTask = workload === "DUPLICATE" ? 0 : task;
      const identity = `account=vt062-r${run}-t${actualTask}|chain=31337|deployment=vt062-load|payload=w${wave}`;
      const expectedHash = hashFor(workload, wave, actualTask);
      let taskSendCalls = 0;
      const send = async () => { taskSendCalls += 1; waveSendCount += 1; return expectedHash; };
      const started = performance.now();
      logicalInFlight += 1;
      peakLogicalInFlight = Math.max(peakLogicalInFlight, logicalInFlight);
      const transaction = hooks[actualTask];
      const outcome = transaction.run(send, () => { callbackCount += 1; }, identity).then(
        (receipt): void => {
          const actualHash = receipt?.transactionHash ?? "";
          let kind: Outcome;
          if (receipt && actualHash === expectedHash && receipt.status === "success") kind = "receipt_success";
          else if (receipt) kind = "wrong_receipt";
          else if (workload === "DUPLICATE" && task > 0) kind = "blocked_inflight";
          else kind = "unexpected_null";
          logicalInFlight -= 1;
          waveSamples.push({ workload, phase, run, wave, task, identity, latency_ms: performance.now() - started,
            outcome: kind, error: "", expected_hash: expectedHash, actual_hash: actualHash,
            task_send_calls: taskSendCalls, wave_send_count_at_outcome: waveSendCount,
            peak_logical_inflight: 0, peak_receipt_waiters: 0 });
        },
        (cause): void => {
          logicalInFlight -= 1;
          waveSamples.push({ workload, phase, run, wave, task, identity, latency_ms: performance.now() - started,
            outcome: "error", error: cause instanceof Error ? cause.message : String(cause), expected_hash: expectedHash,
            actual_hash: "", task_send_calls: taskSendCalls, wave_send_count_at_outcome: waveSendCount,
            peak_logical_inflight: 0, peak_receipt_waiters: 0 });
        },
      );
      promises.push(outcome);
    }
    await allWaitersEntered;
    for (const waiter of waiters) waiter.resolve(receiptFor(waiter.hash));
    await Promise.all(promises);
  });

  for (const sample of waveSamples) {
    sample.peak_logical_inflight = peakLogicalInFlight;
    sample.peak_receipt_waiters = waitersEntered;
  }
  samples.push(...waveSamples);
  waveStats.push({ workload, phase, run, wave, task_count: waveSamples.length,
    peak_logical_inflight: peakLogicalInFlight, peak_receipt_waiters: waitersEntered,
    send_count: waveSendCount, callback_count: callbackCount,
    receipt_success: waveSamples.filter((sample) => sample.outcome === "receipt_success").length,
    blocked_inflight: waveSamples.filter((sample) => sample.outcome === "blocked_inflight").length,
    error_count: waveSamples.filter((sample) => ["error", "unexpected_null", "wrong_receipt"].includes(sample.outcome)).length });

  expect(peakLogicalInFlight).toBe(TASKS);
  expect(waitersEntered).toBe(expectedWaiters);
  expect(waveSendCount).toBe(expectedWaiters);
  expect(callbackCount).toBe(expectedWaiters);
  expect(waveSamples).toHaveLength(TASKS);
  expect(waveSamples.filter((sample) => sample.outcome === "receipt_success")).toHaveLength(expectedWaiters);
  expect(waveSamples.filter((sample) => sample.outcome === "blocked_inflight")).toHaveLength(TASKS - expectedWaiters);
  expect(waveSamples.filter((sample) => ["error", "unexpected_null", "wrong_receipt"].includes(sample.outcome))).toHaveLength(0);
}

function csvCell(value: string | number) {
  const str = String(value);
  return /[",\r\n]/.test(str) ? `"${str.replaceAll('"', '""')}"` : str;
}

function saveEvidence() {
  mkdirSync(outputDir, { recursive: true });
  const columns: Array<keyof Sample> = ["workload", "phase", "run", "wave", "task", "identity", "latency_ms", "outcome", "error", "expected_hash", "actual_hash", "task_send_calls", "wave_send_count_at_outcome", "peak_logical_inflight", "peak_receipt_waiters"];
  const raw = [columns.join(","), ...samples.map((sample) => columns.map((column) => csvCell(column === "latency_ms" ? sample.latency_ms.toFixed(6) : sample[column])).join(","))].join("\n") + "\n";
  writeFileSync(resolve(outputDir, `raw-run-${run}.csv`), raw);
  const groups = ["DUPLICATE", "DISTINCT"].map((workload) => {
    const measured = samples.filter((sample) => sample.phase === "measured" && sample.workload === workload);
    const outcomes = ["receipt_success", "blocked_inflight", "cached_result", "unexpected_null", "wrong_receipt", "error"].map((outcome) => {
      const values = measured.filter((sample) => sample.outcome === outcome).map((sample) => sample.latency_ms);
      return { outcome, count: values.length, p50_ms: nearestRank(values, 0.5), p95_ms: nearestRank(values, 0.95), max_ms: values.length ? Math.max(...values) : null };
    });
    const waves = waveStats.filter((item) => item.phase === "measured" && item.workload === workload);
    return { workload, waves: waves.length, samples: measured.length, outcomes,
      error_count: measured.filter((sample) => ["unexpected_null", "wrong_receipt", "error"].includes(sample.outcome)).length,
      send_count: waves.reduce((sum, item) => sum + Number(item.send_count), 0),
      callback_count: waves.reduce((sum, item) => sum + Number(item.callback_count), 0),
      peak_logical_inflight: Math.max(...waves.map((item) => Number(item.peak_logical_inflight))),
      peak_receipt_waiters: Math.max(...waves.map((item) => Number(item.peak_receipt_waiters))) };
  });
  const repoRoot = resolve("..");
  const sha256 = (file: string) => createHash("sha256").update(readFileSync(resolve(repoRoot, file))).digest("hex");
  const summary = { run, tasks_per_wave: TASKS, warmup_waves_per_workload: warmupWaves, measured_waves_per_workload: measuredWaves,
    timing_boundary: "performance.now() before useTransaction.run through Promise settlement; receipt fake released when expected waiters enter; no fixed latency",
    source_head: execFileSync("git", ["rev-parse", "HEAD"], { cwd: repoRoot, encoding: "utf8" }).trim(),
    source_sha256: { hook: sha256("frontend/src/chain/useTransaction.ts"), page: sha256("frontend/src/pages/CreateProposalPage.tsx") },
    node: process.version, groups, wave_stats: waveStats };
  writeFileSync(resolve(outputDir, `summary-run-${run}.json`), JSON.stringify(summary, null, 2) + "\n");
  console.log(JSON.stringify({ run, groups }, null, 2));
}

it("measures 60 overlapping calls through the production useTransaction hook", async () => {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  const mounted = await mountHooks();
  try {
    for (const workload of ["DUPLICATE", "DISTINCT"] as const) {
      for (let wave = 1; wave <= warmupWaves; wave += 1) await executeWave(workload, "warmup", wave, mounted.hooks);
      for (let wave = warmupWaves + 1; wave <= warmupWaves + measuredWaves; wave += 1) await executeWave(workload, "measured", wave, mounted.hooks);
    }
    saveEvidence();
  } finally { await mounted.unmount(); }
});
