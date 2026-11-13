"""SC06 checker regression: stale ABI/catalog must fail, entry reordering may pass."""
import contextlib
import importlib.util
import io
import json
from pathlib import Path
import tempfile
import unittest
import sys

sys.dont_write_bytecode = True

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("sc06", ROOT / "scripts/check_sc06_abi.py")
sc06 = importlib.util.module_from_spec(spec)
spec.loader.exec_module(sc06)


class AbiCompatibilityTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        (self.root / "shared/abi").mkdir(parents=True)
        (self.root / "docs").mkdir()
        for name in sc06.CONTRACTS:
            path = Path("out") / (name + ".sol") / (name + ".json")
            (self.root / path).parent.mkdir(parents=True)
            abi = json.loads((ROOT / path).read_text())["abi"]
            (self.root / path).write_text(json.dumps({"abi": abi}))
        with contextlib.redirect_stdout(io.StringIO()):
            sc06.run(self.root, write=True)

    def check(self):
        with contextlib.redirect_stdout(io.StringIO()):
            sc06.run(self.root)

    def change(self, name, edit):
        path = self.root / "shared/abi" / (name + ".json")
        abi = json.loads(path.read_text())
        edit(abi)
        path.write_text(json.dumps(abi))

    def test_reordering_entries_is_compatible(self):
        self.change("Treasury", lambda abi: abi.reverse())
        self.check()

    def test_changed_indexed_flag_is_rejected(self):
        def edit(abi):
            event = next(i for i in abi if i.get("name") == "BudgetDisbursed")
            event["inputs"][0]["indexed"] = False
        self.change("Treasury", edit)
        with self.assertRaisesRegex(ValueError, "differs from compiler ABI"):
            self.check()

    def test_old_one_argument_error_is_rejected(self):
        def edit(abi):
            error = next(i for i in abi if i.get("name") == "InvalidActionCount")
            error["inputs"] = error["inputs"][:1]
        self.change("BudgetGovernor", edit)
        with self.assertRaises(ValueError):
            self.check()

    def test_missing_token_function_is_rejected(self):
        self.change("GovernanceToken", lambda abi: abi.remove(next(i for i in abi if i.get("name") == "delegate")))
        with self.assertRaises(ValueError):
            self.check()

    def test_stale_catalog_is_rejected(self):
        path = self.root / sc06.CATALOG
        path.write_text(path.read_text().replace("indexed requestId", "requestId"))
        with self.assertRaisesRegex(ValueError, "stale"):
            self.check()

    def test_timelock_shared_when_present_is_checked_not_overwritten(self):
        path = self.root / "shared/abi/TimelockController.json"
        path.write_text("[]\n")
        with self.assertRaises(ValueError):
            with contextlib.redirect_stdout(io.StringIO()):
                sc06.run(self.root, write=True)
        self.assertEqual(path.read_text(), "[]\n")


if __name__ == "__main__":
    unittest.main()
