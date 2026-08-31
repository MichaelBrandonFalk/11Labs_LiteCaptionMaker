#!/usr/bin/env python3
"""Update project version strings before making a tagged release."""

from __future__ import annotations

import argparse
import re
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def replace(path: Path, pattern: str, repl: str) -> None:
    text = path.read_text()
    new = re.sub(pattern, repl, text, count=1, flags=re.MULTILINE)
    if new == text:
        raise SystemExit(f"version pattern not found in {path}")
    path.write_text(new)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("version", help="Semantic version without a leading v, e.g. 0.1.7")
    args = parser.parse_args()
    version = args.version.strip().lstrip("v")
    if not re.fullmatch(r"\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?", version):
        raise SystemExit("version must look like 0.1.7")

    replace(ROOT / "pyproject.toml", r'^version = ".+"$', f'version = "{version}"')
    replace(
        ROOT / "elevenlabs_helper" / "__init__.py",
        r'^__version__ = ".+"$',
        f'__version__ = "{version}"',
    )
    print(f"Updated project version to {version}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
