#!/usr/bin/env python3
"""Validate VT-062 raw load samples and calculate nearest-rank latency summaries."""

import argparse
import csv
import hashlib
import json
import math
from collections import Counter, defaultdict
from pathlib import Path


def rank(values: list[float], fraction: float) -> float | None:
    if not values:
        return None
    ordered = sorted(values)
    return ordered[math.ceil(fraction * len(ordered)) - 1]


def stats(rows: list[dict]) -> dict:
    by_outcome = {}
    for outcome in ("receipt_success", "blocked_inflight", "cached_result", "unexpected_null", "wrong_receipt", "error"):
        values = [float(row["latency_ms"]) for row in rows if row["outcome"] == outcome]
        by_outcome[outcome] = {
            "count": len(values), "p50_ms": rank(values, 0.50),
            "p95_ms": rank(values, 0.95), "max_ms": max(values, default=None),
        }
    return {"samples": len(rows), "outcomes": by_outcome,
            "error_count": sum(row["outcome"] in ("unexpected_null", "wrong_receipt", "error") for row in rows)}


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", type=Path, required=True)
    args = parser.parse_args()
    source = args.input
    all_rows = []
    summaries = []
    raw_sha256 = {}
    for run in (1, 2, 3):
        raw_path = source / f"raw-run-{run}.csv"
        summary_path = source / f"summary-run-{run}.json"
        raw_sha256[str(run)] = hashlib.sha256(raw_path.read_bytes()).hexdigest()
        with raw_path.open(newline="") as stream:
            rows = list(csv.DictReader(stream))
        all_rows.extend(rows)
        summary = json.loads(summary_path.read_text())
        summaries.append(summary)
        assert summary["run"] == run
        assert summary["tasks_per_wave"] == 60
        assert summary["warmup_waves_per_workload"] == 10
        assert summary["measured_waves_per_workload"] == 100
        assert len(rows) == 2 * (10 + 100) * 60
        assert all(int(row["run"]) == run for row in rows)

    assert len({summary["source_head"] for summary in summaries}) == 1
    assert len({json.dumps(summary["source_sha256"], sort_keys=True) for summary in summaries}) == 1
    grouped = defaultdict(list)
    for row in all_rows:
        grouped[(int(row["run"]), row["workload"], row["phase"], int(row["wave"]))].append(row)
        assert row["error"] == ""
        assert float(row["latency_ms"]) >= 0
        assert int(row["peak_logical_inflight"]) == 60
        if row["outcome"] == "receipt_success":
            assert row["actual_hash"] == row["expected_hash"]
            assert int(row["task_send_calls"]) == 1
        elif row["outcome"] == "blocked_inflight":
            assert row["actual_hash"] == ""
            assert int(row["task_send_calls"]) == 0
        else:
            raise AssertionError(f"Unexpected outcome: {row['outcome']}")

    assert len(grouped) == 3 * 2 * 110
    for (run, workload, phase, wave), rows in grouped.items():
        assert len(rows) == 60
        assert Counter(int(row["task"]) for row in rows) == Counter(range(60))
        assert phase == ("warmup" if wave <= 10 else "measured")
        assert len({row["identity"] for row in rows}) == (1 if workload == "DUPLICATE" else 60)
        assert {int(row["peak_receipt_waiters"]) for row in rows} == ({1} if workload == "DUPLICATE" else {60})
        outcomes = Counter(row["outcome"] for row in rows)
        assert outcomes == (Counter({"receipt_success": 1, "blocked_inflight": 59}) if workload == "DUPLICATE" else Counter({"receipt_success": 60}))
        assert sum(int(row["task_send_calls"]) for row in rows) == (1 if workload == "DUPLICATE" else 60)

    measured = [row for row in all_rows if row["phase"] == "measured"]
    warmup = [row for row in all_rows if row["phase"] == "warmup"]
    assert len(measured) == 36_000 and len(warmup) == 3_600
    results = {}
    for workload in ("DUPLICATE", "DISTINCT"):
        selected = [row for row in measured if row["workload"] == workload]
        run_stats = {str(run): stats([row for row in selected if int(row["run"]) == run]) for run in (1, 2, 3)}
        results[workload] = {
            "combined": stats(selected), "by_run": run_stats,
            "send_count": sum(int(row["task_send_calls"]) for row in selected),
            "peak_logical_inflight": 60,
            "peak_receipt_waiters": 1 if workload == "DUPLICATE" else 60,
        }

    aggregate = {
        "source_head_during_runs": summaries[0]["source_head"],
        "source_sha256": summaries[0]["source_sha256"],
        "raw_sha256": raw_sha256,
        "runs": 3, "warmup_waves_per_run_workload": 10, "measured_waves_per_run_workload": 100,
        "tasks_per_wave": 60, "warmup_samples": len(warmup), "measured_samples": len(measured),
        "latency_boundary": "performance.now() immediately before production useTransaction.run through its Promise settlement; fake receipt released at waiter barrier, no fixed delay",
        "nearest_rank": "sorted latency[ceil(p*N)-1] with 0-based index; rounded raw CSV values (6 decimal places)",
        "target_ms": 2000, "results": results,
    }
    (source / "aggregate.json").write_text(json.dumps(aggregate, indent=2, ensure_ascii=False) + "\n")
    print(json.dumps({"measured_samples": len(measured), "results": {key: value["combined"] for key, value in results.items()}}, indent=2))


if __name__ == "__main__":
    main()
