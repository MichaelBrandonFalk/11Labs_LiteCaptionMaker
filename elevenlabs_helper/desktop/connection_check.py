"""Check API access without blocking the desktop UI or uploading audio."""

from PySide6.QtCore import QThread, Signal

from ..engine.elevenlabs.client import validate_key


class ConnectionCheck(QThread):
    result = Signal(str, str)

    def __init__(self, api_key: str, parent=None):
        super().__init__(parent)
        self._api_key = api_key

    def run(self) -> None:
        try:
            status, message = validate_key(self._api_key)
            if status == "valid":
                message = (
                    "ElevenLabs is reachable; this key is restricted. "
                    "Speech-to-text permission was not verified."
                    if "scoped" in message else
                    "Connection successful. API key verified. No audio uploaded."
                )
            self.result.emit(status, message)
        except Exception:
            self.result.emit("unverified", "Could not verify the connection. Please try again.")
        finally:
            self._api_key = ""
