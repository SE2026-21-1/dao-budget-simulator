"""Failure-boundary tests. Docker/GitHub are simulated; no live deployment claimed."""
import copy
import hashlib
import importlib.util
import io
import json
from pathlib import Path
import tempfile
import unittest
import zipfile

spec = importlib.util.spec_from_file_location("agent", Path(__file__).with_name("agent.py"))
agent = importlib.util.module_from_spec(spec)
spec.loader.exec_module(agent)
SHA = "a" * 40


def manifest():
    return {"schemaVersion": 1, "repository": agent.REPOSITORY, "sha": SHA,
            "runId": "12", "migrationSet": "b" * 64,
            "images": {s: "ghcr.io/" + agent.REPOSITORY.lower() + "/" + s + "@sha256:" + "c" * 64
                       for s in ("frontend", "api", "indexer")}}


def snapshot():
    context = {"chainId": "31337", "deploymentId": "dao-demo-anvil", "dataKind": "chain",
               "asOfBlock": "19", "asOfBlockHash": "0x123", "snapshotRevision": "revision"}
    return {"health": {"context": copy.deepcopy(context), "data": {
                "database": "up", "publication": "ready", "indexer": "synced",
                "rawDecodeIssues": {"unknownTopics": 16, "decodeErrors": 0}}},
            "summary": {"context": copy.deepcopy(context), "data": {
                "treasury": {"balance": "10000"}, "proposalCounts": {"total": 0}}}}


class FakeAgent(agent.Agent):
    def __init__(self, root):
        self.env_path = Path(root) / "compose.env"
        self.env_path.write_text("API_IMAGE=old-api\nINDEXER_IMAGE=old-indexer\n")
        super().__init__(root, self.env_path, Path(root) / "compose.yml")
        self.initial = self.env.read_bytes()
        self.calls = []
        self.starts = 0
        self.current = {"api": "old-api", "indexer": "old-indexer"}
        self.fail_preflight = False
        self.bad_data = False
        self.stale_head = False

    def docker(self, args, label, timeout=120):
        self.calls.append((args, label))
        if self.fail_preflight and "preflight" in label:
            raise agent.Rejected("schema mismatch")
        return ""

    def head(self):
        return "d" * 40 if self.stale_head else SHA

    def running_images(self):
        return dict(self.current)

    def verify_images(self, value):
        for service in ("api", "indexer"):
            agent.require(self.current[service] == value["images"][service], "wrong image")

    def start_apps(self):
        self.starts += 1
        values = dict(line.split("=", 1) for line in self.env.read_text().splitlines())
        self.current = {s: values[s.upper() + "_IMAGE"] for s in ("api", "indexer")}

    def snapshot(self):
        result = snapshot()
        if self.bad_data and self.current["api"] != "old-api":
            result["summary"]["data"]["treasury"]["balance"] = "0"
        return result


class SafetyTests(unittest.TestCase):
    def test_artifact_digest_and_members_fail_closed(self):
        buffer = io.BytesIO()
        with zipfile.ZipFile(buffer, "w") as archive:
            archive.writestr("manifest.json", json.dumps(manifest()))
        data = buffer.getvalue()
        digest = "sha256:" + hashlib.sha256(data).hexdigest()
        self.assertEqual(agent.decode_artifact(data, digest, SHA, 12), manifest())
        with self.assertRaises(agent.Rejected):
            agent.decode_artifact(data, "sha256:" + "0" * 64, SHA, 12)
        with self.assertRaises(agent.Rejected):
            agent.decode_artifact(data, digest, "d" * 40, 12)
        buffer = io.BytesIO()
        with zipfile.ZipFile(buffer, "w") as archive:
            archive.writestr("../manifest.json", json.dumps(manifest()))
        data = buffer.getvalue()
        with self.assertRaises(agent.Rejected):
            agent.decode_artifact(data, "sha256:" + hashlib.sha256(data).hexdigest(), SHA, 12)

    def test_untrusted_event_and_changed_workflow_rejected(self):
        with tempfile.TemporaryDirectory() as root:
            worker = FakeAgent(root)
            calls = []
            def api(endpoint, binary=False):
                calls.append(endpoint)
                if endpoint == "branches/Dev":
                    return {"commit": {"sha": SHA}}
                if endpoint.startswith("contents/"):
                    return {"sha": "wrong"}
                self.fail("Should reject before reading runs/artifacts")
            worker.api = api
            with self.assertRaises(agent.Rejected):
                worker.discover()
            self.assertTrue(all(not call.startswith("actions/") for call in calls))

            def api(endpoint, binary=False):
                if endpoint == "branches/Dev":
                    return {"commit": {"sha": SHA}}
                if endpoint.startswith("contents/"):
                    return {"sha": agent.TRUSTED_WORKFLOW_BLOB}
                if endpoint.startswith("actions/workflows/"):
                    return {"workflow_runs": [{"id": 12, "head_sha": SHA}]}
                if endpoint == "actions/runs/12":
                    return {"status": "completed", "conclusion": "success", "head_sha": SHA,
                            "head_branch": "Dev", "event": "pull_request"}
                self.fail("Must not download artifact from a PR")
            worker.api = api
            with self.assertRaises(agent.Rejected):
                worker.discover()

    def test_schema_failure_and_stale_head_never_restart_apps(self):
        for failure in ("fail_preflight", "stale_head"):
            with self.subTest(failure=failure), tempfile.TemporaryDirectory() as root:
                worker = FakeAgent(root)
                setattr(worker, failure, True)
                with self.assertRaises(agent.Rejected):
                    worker.apply(manifest())
                self.assertEqual(worker.starts, 0)
                self.assertEqual(worker.env.read_bytes(), worker.initial)

    def test_bad_postcheck_restores_env_and_old_images_and_blocks_retry(self):
        with tempfile.TemporaryDirectory() as root:
            worker = FakeAgent(root)
            worker.bad_data = True
            with self.assertRaises(agent.Rejected):
                worker.apply(manifest())
            self.assertEqual(worker.starts, 2)
            self.assertEqual(worker.env.read_bytes(), worker.initial)
            self.assertEqual(worker.current, {"api": "old-api", "indexer": "old-indexer"})
            self.assertFalse((worker.state / "pending.json").exists())
            with self.assertRaises(agent.Rejected):
                worker.apply(manifest())
            self.assertEqual(worker.starts, 2)

    def test_success_records_release_and_only_targets_apps(self):
        with tempfile.TemporaryDirectory() as root:
            worker = FakeAgent(root)
            worker.apply(manifest())
            self.assertEqual(worker.starts, 1)
            self.assertEqual(json.loads((worker.state / "applied.json").read_text())["sha"], SHA)
            self.assertFalse((worker.state / "pending.json").exists())
            calls = len(worker.calls)
            worker.apply(manifest())
            self.assertEqual(worker.starts, 1)
            self.assertEqual(len(worker.calls), calls)

    def test_interrupted_update_requires_operator_inspection(self):
        with tempfile.TemporaryDirectory() as root:
            worker = FakeAgent(root)
            (worker.state / "pending.json").write_text("{}")
            with self.assertRaises(agent.Rejected):
                worker.apply(manifest())
            self.assertEqual(worker.calls, [])
            self.assertEqual(worker.env.read_bytes(), worker.initial)

    def test_rollout_command_excludes_dependencies_and_pulls(self):
        with tempfile.TemporaryDirectory() as root:
            worker = FakeAgent(root)
            agent.Agent.start_apps(worker)
            arguments = worker.calls[-1][0]
            self.assertIn("--no-deps", arguments)
            self.assertEqual(arguments[-2:], ["indexer", "api"])
            self.assertEqual(arguments[arguments.index("--pull") + 1], "never")

    def test_failed_rollback_retains_pending_marker(self):
        with tempfile.TemporaryDirectory() as root:
            worker = FakeAgent(root)
            worker.bad_data = True
            start = worker.start_apps
            def fail_second_start():
                if worker.starts:
                    raise agent.Rejected("rollback startup failed")
                start()
            worker.start_apps = fail_second_start
            with self.assertRaisesRegex(agent.Rejected, "ROLLBACK_FAILED"):
                worker.apply(manifest())
            self.assertEqual(worker.env.read_bytes(), worker.initial)
            self.assertTrue((worker.state / "pending.json").exists())
            self.assertTrue((worker.state / "failed.json").exists())


if __name__ == "__main__":
    unittest.main()
