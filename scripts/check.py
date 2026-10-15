"""Read-only verification of the compiler ABI and the shared synthetic fixture."""
import json
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

def cast(*args):
    return subprocess.check_output(["cast", *args], text=True).strip()

def canonical(abi):
    return sorted(abi, key=lambda item: (item["type"], item.get("name", "")))

artifact = json.loads((ROOT / "out/ITreasury.sol/ITreasury.json").read_text())
shared = json.loads((ROOT / "shared/abi/ITreasury.json").read_text())
assert canonical(artifact["abi"]) == canonical(shared), "Shared ABI differs from compiler ABI"
f = json.loads((ROOT / "fixtures/sc01/disbursement-v1.json").read_text())
assert f["targets"] == [f["treasury"]] and f["values"] == ["0"]
assert f["calldatas"] == [cast("calldata", "disburse(bytes32,address,uint256)", f["requestId"], f["recipient"], f["amount"])]
assert f["descriptionHash"] == cast("keccak", f["description"])
encoded = cast("abi-encode", "f(address[],uint256[],bytes[],bytes32)", "[" + f["treasury"] + "]", "[0]", "[" + f["calldatas"][0] + "]", f["descriptionHash"])
assert f["proposalId"] == str(int(cast("keccak", encoded), 16))
description = json.loads(f["description"])
assert description["version"] == 1
assert 5 <= len(description["title"]) <= 120
assert 20 <= len(description["body"]) <= 2000
assert int(f["amount"]) == 1000 * 10**18
print("SC01 OK: compiler ABI, calldata, descriptionHash and proposalId agree")
