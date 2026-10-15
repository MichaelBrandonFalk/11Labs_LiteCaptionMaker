"""Offline checks run against frozen release binaries on their native OS."""

from pathlib import Path
from importlib import import_module
import os
import sys
from tempfile import TemporaryDirectory


def main(result_path: str) -> int:
    from docx import Document
    from PySide6.QtWidgets import QApplication

    from ..engine.service import Engine
    from .bridge import EngineBridge
    from .widgets.key_dialog import KeyDialog
    from .windows.main_window import MainWindow

    with TemporaryDirectory() as temporary:
        os.environ["XDG_DATA_HOME"] = temporary
        os.environ["APPDATA"] = temporary
        os.environ["ELEVENLABS_API_KEY"] = "offline-smoke-test"
        backend = {
            "win32": "keyring.backends.Windows.WinVaultKeyring",
            "linux": "keyring.backends.SecretService.Keyring",
            "darwin": "keyring.backends.macOS.Keyring",
        }[sys.platform]
        module, _, name = backend.rpartition(".")
        assert getattr(import_module(module), name)
        app = QApplication([])
        bridge = EngineBridge()
        engine = Engine(on_update=bridge.push)
        window = MainWindow(engine, bridge)
        dialog = KeyDialog(window)
        window.show()
        app.processEvents()
        assert not window.grab().isNull()
        assert dialog.field.text() == "offline-smoke-test"
        document = Document()
        document.add_paragraph("Offline package check")
        output = Path(temporary) / "check.docx"
        document.save(output)
        assert Document(output).paragraphs[0].text == "Offline package check"
        window.close()
        Path(result_path).write_text("GUI, credential backend, SQLite, and DOCX: OK\n")
    return 0
