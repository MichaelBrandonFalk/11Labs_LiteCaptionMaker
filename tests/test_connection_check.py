"""Offline API checks return useful results without freezing the Qt event loop."""

import pytest

pytest.importorskip("PySide6")
from PySide6.QtCore import QCoreApplication, QEventLoop, QTimer

from elevenlabs_helper.desktop.connection_check import ConnectionCheck


@pytest.mark.parametrize(
    "response,expected",
    [
        (("valid", "Key verified."), "Connection successful"),
        (("valid", "Key accepted (scoped key)."), "permission was not verified"),
        (("invalid", "ElevenLabs rejected this key."), "rejected"),
        (("unverified", "Network unavailable."), "Network unavailable"),
    ],
)
def test_connection_check_reports_result(monkeypatch, response, expected):
    app = QCoreApplication.instance() or QCoreApplication([])
    checked_keys = []

    def validate(key):
        checked_keys.append(key)
        return response

    monkeypatch.setattr("elevenlabs_helper.desktop.connection_check.validate_key", validate)
    worker = ConnectionCheck("test-key")
    loop = QEventLoop()
    results = []
    worker.result.connect(lambda status, message: results.append((status, message)))
    worker.finished.connect(loop.quit)
    QTimer.singleShot(2000, loop.quit)
    worker.start()
    loop.exec()
    worker.wait()
    app.processEvents()
    assert checked_keys == ["test-key"]
    assert results[0][0] == response[0]
    assert expected in results[0][1]
    assert worker._api_key == ""
