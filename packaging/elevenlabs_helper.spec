# PyInstaller spec for ElevenLabs Helper (macOS .app bundle).
#
# Build:  pyinstaller packaging/elevenlabs_helper.spec
# Produces dist/ElevenLabs Helper.app
#
# Universal build: set TARGET_ARCH=universal2 (requires universal2 wheels for all
# native deps). If a dependency lacks universal2, build per-arch on each Mac and
# ship both .dmgs — see README.

import os
import sys
from pathlib import Path

from PyInstaller.utils.hooks import collect_data_files

from elevenlabs_helper import __version__

ROOT = Path(os.getcwd())

# V1 bundles no external binaries (no FFmpeg) — uploads audio as-is.
binaries = []

# python-docx ships a default template + XML parts as package data; PyInstaller
# won't pick them up automatically, and Document() fails at runtime without them.
datas = collect_data_files("docx")

target_arch = os.environ.get("TARGET_ARCH") or None  # e.g. "universal2"

block_cipher = None

a = Analysis(
    [str(ROOT / "packaging" / "main.py")],
    pathex=[str(ROOT)],
    binaries=binaries,
    datas=datas,
    # Credential backends and audio readers are imported lazily.
    hiddenimports=[
        {"darwin": "keyring.backends.macOS", "win32": "keyring.backends.Windows"}.get(
            sys.platform, "keyring.backends.SecretService"
        ),
        "mutagen", "mutagen.mp3", "mutagen.wave",
    ],
    hookspath=[],
    excludes=["tkinter"],
    cipher=block_cipher,
)
pyz = PYZ(a.pure, a.zipped_data, cipher=block_cipher)

exe = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,
    name="ElevenLabs Helper",
    console=False,
    target_arch=target_arch,
)
coll = COLLECT(
    exe,
    a.binaries,
    a.datas,
    name="ElevenLabs Helper",
)
if sys.platform == "darwin":
    app = BUNDLE(
        coll,
        name="ElevenLabs Helper.app",
        icon=None,
        bundle_identifier="com.elevenlabshelper.app",
        info_plist={
            "CFBundleShortVersionString": __version__,
            "CFBundleVersion": __version__,
            "NSHighResolutionCapable": True,
        },
    )
