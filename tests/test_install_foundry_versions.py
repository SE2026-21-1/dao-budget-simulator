"""Exercise the installer's real version gate, without downloads or Docker."""
import os
from pathlib import Path
import subprocess
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]
VERIFY = ROOT / ".github/actions/install-foundry/verify-versions.sh"
TOOLS = ("forge", "cast", "anvil")


class InstalledVersionTests(unittest.TestCase):
    def verify(self, bad_tool=None, bad_version=None):
        with tempfile.TemporaryDirectory() as directory:
            for tool in TOOLS:
                version = bad_version if tool == bad_tool else "1.8.5"
                executable = Path(directory) / tool
                executable.write_text(
                    "#!/bin/sh\n"
                    f"printf '%s\\n' '{tool} Version: {version}' 'Commit SHA: example'\n"
                )
                executable.chmod(0o755)
            return subprocess.run(
                ["bash", str(VERIFY)],
                env={**os.environ, "PATH": directory + os.pathsep + os.environ["PATH"]},
                capture_output=True,
                text=True,
                check=False,
            )

    def test_accepts_exact_versions_with_multiline_metadata(self):
        result = self.verify()
        self.assertEqual(result.returncode, 0, result.stderr)
        for tool in TOOLS:
            self.assertIn(f"{tool} Version: 1.8.5\n", result.stdout)

    def test_rejects_prefix_collision_and_other_versions_for_every_tool(self):
        for tool in TOOLS:
            for version in ("1.8.50", "1.8.51", "1.8.4", "1.8.5-nightly", "1.8.5+other"):
                with self.subTest(tool=tool, version=version):
                    result = self.verify(tool, version)
                    self.assertNotEqual(result.returncode, 0)
                    self.assertIn(f"Expected exactly {tool} Version: 1.8.5", result.stderr)


if __name__ == "__main__":
    unittest.main()
