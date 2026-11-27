#!/usr/bin/env python3
"""Pull a verified Dev release; deploy API/indexer only. Never execute fetched source."""
import argparse
import datetime
import fcntl
import hashlib
import io
import json
import os
from pathlib import Path
import re
import subprocess
import tempfile
import urllib.request
import zipfile

REPOSITORY = "SE2026-21-1/dao-budget-simulator"
WORKFLOW = ".github/workflows/ci.yml"
# A changed CI policy requires a reviewed agent update, not automatic acceptance.
TRUSTED_WORKFLOW_BLOB = "e97ca24b6d91a8898cc7c949a201ea73ca26b237"
SHA = re.compile(r"[0-9a-f]{40}")
HASH = re.compile(r"[0-9a-f]{64}")


class Rejected(RuntimeError):
    pass


def require(condition, message):
    if not condition:
        raise Rejected(message)


def atomic_write(path, data):
    path = Path(path)
    fd, temporary = tempfile.mkstemp(prefix=".dao-cd-", dir=path.parent)
    try:
        with os.fdopen(fd, "wb") as handle:
            handle.write(data)
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(temporary, path)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)


def validate_manifest(value, sha, run_id):
    require(set(value) == {"schemaVersion", "repository", "sha", "runId", "images", "migrationSet"}, "Unexpected manifest fields")
    require(value["schemaVersion"] == 1 and value["repository"] == REPOSITORY, "Wrong manifest repository/version")
    require(value["sha"] == sha and value["runId"] == str(run_id), "Manifest does not match trusted CI run")
    require(isinstance(value["migrationSet"], str) and HASH.fullmatch(value["migrationSet"]), "Invalid migration fingerprint")
    require(set(value["images"]) == {"frontend", "api", "indexer"}, "Incomplete release")
    for service, image in value["images"].items():
        prefix = "ghcr.io/" + REPOSITORY.lower() + "/" + service + "@sha256:"
        require(isinstance(image, str) and image.startswith(prefix) and HASH.fullmatch(image[len(prefix):]), "Invalid image digest")
    return value


def decode_artifact(archive, digest, sha, run_id):
    require(len(archive) <= 1024 * 1024, "Release artifact too large")
    require(digest == "sha256:" + hashlib.sha256(archive).hexdigest(), "Artifact digest mismatch")
    with zipfile.ZipFile(io.BytesIO(archive)) as source:
        require(source.namelist() == ["manifest.json"], "Unexpected archive members")
        require(source.getinfo("manifest.json").file_size <= 16384, "Manifest too large")
        value = json.loads(source.read("manifest.json"))
    return validate_manifest(value, sha, run_id)


def replace_images(original, images):
    lines, seen = [], set()
    for line in original.decode().splitlines():
        key = line.partition("=")[0]
        if key in {"API_IMAGE", "INDEXER_IMAGE"}:
            require(key not in seen, "Duplicate Compose image variable")
            line = key + "=" + images[key.removesuffix("_IMAGE").lower()]
            seen.add(key)
        lines.append(line)
    require(seen == {"API_IMAGE", "INDEXER_IMAGE"}, "Missing Compose image variables")
    return ("\n".join(lines) + "\n").encode()


class Agent:
    def __init__(self, root, compose_env, compose_file):
        self.root = Path(root).resolve()
        self.env = Path(compose_env).resolve()
        self.compose_file = Path(compose_file).resolve()
        self.state = self.root / "cd"
        self.state.mkdir(mode=0o700, parents=True, exist_ok=True)

    def command(self, args, label, timeout=120, binary=False):
        try:
            result = subprocess.run(args, capture_output=True, timeout=timeout, check=False)
        except (OSError, subprocess.TimeoutExpired) as error:
            raise Rejected(label + " could not complete") from error
        # Never emit command stdout/stderr: GH credentials and backend secrets must not enter logs.
        require(result.returncode == 0, label + " failed (exit " + str(result.returncode) + ")")
        return result.stdout if binary else result.stdout.decode().strip()

    def api(self, endpoint, binary=False):
        result = self.command(["gh", "api", "--hostname", "github.com", "repos/" + REPOSITORY + "/" + endpoint], "GitHub API", binary=binary)
        return result if binary else json.loads(result)

    def head(self):
        sha = self.api("branches/Dev")["commit"]["sha"]
        require(isinstance(sha, str) and SHA.fullmatch(sha), "Invalid Dev SHA")
        return sha

    def discover(self):
        sha = self.head()
        blob = self.api("contents/" + WORKFLOW + "?ref=" + sha)
        require(blob.get("sha") == TRUSTED_WORKFLOW_BLOB, "CI workflow changed; operator review required")
        runs = self.api("actions/workflows/ci.yml/runs?branch=Dev&event=push&status=success&head_sha=" + sha + "&per_page=20")
        candidates = [r for r in runs["workflow_runs"] if r.get("head_sha") == sha]
        require(candidates, "Current Dev has no successful release yet")
        run = self.api("actions/runs/" + str(candidates[0]["id"]))
        require(run.get("status") == "completed" and run.get("conclusion") == "success", "CI is not successful")
        require(run.get("head_sha") == sha and run.get("head_branch") == "Dev" and run.get("event") == "push", "Untrusted CI event")
        require(run.get("path") == WORKFLOW and run.get("name") == "TV4 CI", "Wrong workflow")
        require(run.get("head_repository", {}).get("full_name") == REPOSITORY, "Wrong source repository")
        artifacts = self.api("actions/runs/" + str(run["id"]) + "/artifacts?per_page=100")["artifacts"]
        matches = [a for a in artifacts if a.get("name") == "release-" + sha and not a.get("expired")]
        require(len(matches) == 1, "Exactly one unexpired release artifact is required")
        artifact = matches[0]
        require(artifact.get("size_in_bytes", 0) <= 1024 * 1024, "Release artifact too large")
        archive = self.api("actions/artifacts/" + str(artifact["id"]) + "/zip", binary=True)
        return decode_artifact(archive, artifact.get("digest"), sha, run["id"])

    def docker(self, args, label, timeout=120):
        return self.command(["sudo", "-n", "docker", *args], label, timeout=timeout)

    def compose(self):
        return ["compose", "--env-file", str(self.env), "-f", str(self.compose_file)]

    def start_apps(self):
        self.docker(self.compose() + ["up", "-d", "--no-deps", "--pull", "never", "--wait", "--wait-timeout", "180", "indexer", "api"], "Compose app update", timeout=240)

    def snapshot(self):
        result = {}
        for endpoint in ("health", "summary"):
            url = "http://127.0.0.1:3000/api/" + endpoint + "?chainId=31337&deploymentId=dao-demo-anvil"
            with urllib.request.urlopen(url, timeout=15) as response:
                result[endpoint] = json.load(response)
        health = result["health"]
        require(health["data"]["database"] == "up" and health["data"]["publication"] == "ready", "Database/publication not ready")
        require(health["data"]["indexer"] == "synced", "Indexer not synced")
        for value in result.values():
            require(value["context"]["chainId"] == "31337" and value["context"]["deploymentId"] == "dao-demo-anvil" and value["context"]["dataKind"] == "chain", "Wrong API context")
        return result

    def verify_images(self, manifest):
        for service in ("api", "indexer"):
            expected = self.docker(["image", "inspect", manifest["images"][service], "--format", "{{.Id}}"], "Inspect candidate image")
            actual = self.docker(["container", "inspect", "dao-demo-" + service, "--format", "{{.Image}}"], "Inspect running image")
            require(actual == expected, "Running image does not match release")

    def running_images(self):
        return {service: self.docker(["container", "inspect", "dao-demo-" + service, "--format", "{{.Image}}"], "Inspect rollback image") for service in ("api", "indexer")}

    def verify_data(self, before, after):
        for endpoint in ("health", "summary"):
            old, new = before[endpoint]["context"], after[endpoint]["context"]
            require(int(new["asOfBlock"]) >= int(old["asOfBlock"]), "Publication moved backwards")
            require(new["snapshotRevision"] == old["snapshotRevision"], "Snapshot revision changed unexpectedly")
            if new["asOfBlock"] == old["asOfBlock"]:
                require(new["asOfBlockHash"] == old["asOfBlockHash"], "Canonical block hash changed")
                if endpoint == "summary":
                    require(before[endpoint]["data"]["treasury"] == after[endpoint]["data"]["treasury"], "Treasury changed at unchanged H")
                    require(before[endpoint]["data"]["proposalCounts"] == after[endpoint]["data"]["proposalCounts"], "Proposals changed at unchanged H")
        old_issues, new_issues = before["health"]["data"]["rawDecodeIssues"], after["health"]["data"]["rawDecodeIssues"]
        for key in ("unknownTopics", "decodeErrors"):
            require(new_issues[key] <= old_issues[key], "Raw decode issues increased")

    def apply(self, manifest, retry_failed=False):
        pending = self.state / "pending.json"
        require(not pending.exists(), "Interrupted deployment detected; operator must inspect pending.json before another apply")
        failed = self.state / "failed.json"
        if failed.exists() and json.loads(failed.read_text()).get("sha") == manifest["sha"]:
            require(retry_failed, "Release previously failed; use --retry-failed after diagnosis")
        directory = Path(tempfile.mkdtemp(prefix=manifest["sha"][:12] + "-", dir=self.state))
        manifest_path = directory / "manifest.json"
        atomic_write(manifest_path, json.dumps(manifest).encode())
        original = self.env.read_bytes()
        atomic_write(directory / "compose-before.env", original)
        replacement = replace_images(original, manifest["images"])
        changed = False
        try:
            if replacement == original:
                self.verify_images(manifest)
                self.snapshot()
                print("ALREADY_CURRENT " + manifest["sha"])
                return
            before = self.snapshot()
            previous_images = self.running_images()
            atomic_write(directory / "before.json", json.dumps(before).encode())
            for service in ("api", "indexer"):
                self.docker(["pull", manifest["images"][service]], "Pull " + service, timeout=300)
            self.docker(["run", "--rm", "--network", "dao-demo-db", "--env-file", str(self.root / "config/runtime.env"),
                         "--mount", "type=bind,src=" + str(self.root / "config") + ",dst=/run/dao,readonly",
                         "--mount", "type=bind,src=" + str(directory) + ",dst=/run/release,readonly",
                         "--entrypoint", "node", manifest["images"]["indexer"], "/app/deploy/preflight.mjs",
                         "--manifest", "/run/release/manifest.json"], "Schema/metadata/RPC preflight")
            require(self.head() == manifest["sha"], "Dev advanced during preparation; retry next cycle")
            atomic_write(pending, json.dumps({"sha": manifest["sha"], "evidence": str(directory), "previousImages": previous_images}).encode())
            atomic_write(self.env, replacement)
            changed = True
            self.docker(self.compose() + ["config", "--quiet"], "Compose validation")
            self.start_apps()
            self.verify_images(manifest)
            after = self.snapshot()
            self.verify_data(before, after)
            atomic_write(directory / "after.json", json.dumps(after).encode())
            atomic_write(self.state / "applied.json", json.dumps({"sha": manifest["sha"], "runId": manifest["runId"], "images": manifest["images"], "at": datetime.datetime.now(datetime.timezone.utc).isoformat()}).encode())
            if failed.exists():
                failed.unlink()
            pending.unlink()
            print("RELEASE_UPDATE_OK " + manifest["sha"])
        except Exception as error:
            reason = str(error) if isinstance(error, Rejected) else "runtime/data validation failed"
            atomic_write(failed, json.dumps({"sha": manifest["sha"], "reason": reason, "evidence": str(directory)}).encode())
            if changed:
                atomic_write(self.env, original)
                try:
                    self.start_apps()
                    after = self.snapshot()
                    self.verify_data(before, after)
                    require(self.running_images() == previous_images, "Rollback did not restore previous image IDs")
                    pending.unlink()
                    print("ROLLBACK_OK")
                except Exception as rollback_error:
                    raise Rejected("ROLLBACK_FAILED; operator intervention required. Evidence: " + str(directory)) from rollback_error
            elif pending.exists():
                pending.unlink()
            raise Rejected("Release rejected: " + reason + "; evidence: " + str(directory)) from error


def main():
    parser = argparse.ArgumentParser()
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument("--check", action="store_true", help="Verify CI/artifact only; do not pull/deploy")
    mode.add_argument("--apply", action="store_true")
    parser.add_argument("--retry-failed", action="store_true")
    args = parser.parse_args()
    agent = Agent(os.environ["DAO_CD_ROOT"], os.environ["DAO_CD_COMPOSE_ENV"], os.environ["DAO_CD_COMPOSE_FILE"])
    with (agent.state / "deploy.lock").open("a") as lock:
        try:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            print("SKIPPED another deployment is running")
            return
        manifest = agent.discover()
        if args.check:
            print("CHECK_OK trusted CI/artifact " + manifest["sha"] + "; image/schema checks run only with --apply")
        else:
            agent.apply(manifest, retry_failed=args.retry_failed)


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        # Only controlled errors are safe for journal output.
        print("CD_FAILED: " + (str(error) if isinstance(error, Rejected) else "check local configuration, GitHub access and service availability"))
        raise SystemExit(1)
