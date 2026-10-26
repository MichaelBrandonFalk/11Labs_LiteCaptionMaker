"""Drag-and-drop target for media files."""

from __future__ import annotations

from PySide6.QtCore import Qt, Signal
from PySide6.QtWidgets import QFileDialog, QFrame, QLabel, QPushButton, QVBoxLayout

from ...engine.media.inspect import SUPPORTED_SUFFIXES


class DropArea(QFrame):
    filesDropped = Signal(list)   # list[str] of accepted media paths
    filesRejected = Signal(int)   # count of dropped items that were ignored

    def __init__(self, parent=None):
        super().__init__(parent)
        self.setObjectName("DropArea")
        self.setAcceptDrops(True)
        self.setMinimumHeight(120)
        self.setStyleSheet(
            "#DropArea { border: 2px dashed #888; border-radius: 10px; }"
            "#DropArea[hover='true'] { border-color: #2d7ff9; background: rgba(45,127,249,0.08); }"
        )
        layout = QVBoxLayout(self)
        layout.setAlignment(Qt.AlignCenter)
        label = QLabel(
            "Drop MP3 or WAV files to stage — then press Run to transcribe\n"
            "(export audio first — video & auto-conversion are on the roadmap)"
        )
        label.setAlignment(Qt.AlignCenter)
        browse = QPushButton("Add files…")
        browse.setMaximumWidth(160)
        browse.clicked.connect(self._browse)
        layout.addWidget(label)
        layout.addWidget(browse, alignment=Qt.AlignCenter)

    def _set_hover(self, on: bool) -> None:
        self.setProperty("hover", "true" if on else "false")
        self.style().unpolish(self)
        self.style().polish(self)

    def dragEnterEvent(self, event):  # noqa: N802
        if event.mimeData().hasUrls():
            event.acceptProposedAction()
            self._set_hover(True)

    def dragLeaveEvent(self, event):  # noqa: N802
        self._set_hover(False)

    def dropEvent(self, event):  # noqa: N802
        self._set_hover(False)
        dropped = [u.toLocalFile() for u in event.mimeData().urls() if u.isLocalFile()]
        self._emit_files(dropped)

    def _emit_files(self, paths: list[str]) -> None:
        accepted = [p for p in paths if self._is_media(p)]
        rejected = len(paths) - len(accepted)
        if accepted:
            self.filesDropped.emit(accepted)
        if rejected:
            self.filesRejected.emit(rejected)

    def _browse(self) -> None:
        paths, _ = QFileDialog.getOpenFileNames(
            self, "Select audio files", "", "MP3 and WAV (*.mp3 *.wav *.MP3 *.WAV);;All files (*)"
        )
        if paths:
            self._emit_files(paths)

    @staticmethod
    def _is_media(path: str) -> bool:
        from pathlib import Path

        return Path(path).suffix.lower() in SUPPORTED_SUFFIXES
