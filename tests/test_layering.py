"""Domain and data modules import the standard library only (D3).

This is the architecture enforced as a test, not a convention: rules,
service, store, adapters and friends must run with no web server, no
network and no voice platform.
"""
import ast
import sys
import unittest
from pathlib import Path

PURE = ["rules", "service", "registry", "quality", "store", "adapters",
        "normalise", "signature"]
APP = Path(__file__).resolve().parent.parent / "app"


class Layering(unittest.TestCase):
    def test_pure_modules_use_stdlib_only(self):
        for name in PURE:
            tree = ast.parse((APP / f"{name}.py").read_text())
            mods = set()
            for n in ast.walk(tree):
                if isinstance(n, ast.Import):
                    mods |= {a.name.split(".")[0] for a in n.names}
                elif isinstance(n, ast.ImportFrom) and n.level == 0:
                    mods.add(n.module.split(".")[0])
            self.assertEqual(mods - set(sys.stdlib_module_names) - {"app"}, set(), name)
