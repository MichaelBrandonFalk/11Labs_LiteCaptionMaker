"""validate_key + friendly_error coverage (UX F3/F7)."""

from __future__ import annotations

import pytest

from elevenlabs_helper.engine.elevenlabs.client import friendly_error, validate_key


def test_validate_key_valid(mock_elevenlabs):
    status, _ = validate_key("good-key", base_url=mock_elevenlabs.base_url)
    assert status == "valid"


def test_validate_key_invalid(mock_elevenlabs):
    status, msg = validate_key("", base_url=mock_elevenlabs.base_url)
    assert status == "invalid"
    assert msg


def test_validate_key_rejects_definitively_bad_key(mock_elevenlabs):
    mock_elevenlabs.get_status = 401
    mock_elevenlabs.get_body = {"detail": {"status": "invalid_api_key", "message": "bad"}}
    status, _ = validate_key("totally-wrong", base_url=mock_elevenlabs.base_url)
    assert status == "invalid"


def test_validate_key_accepts_scoped_key(mock_elevenlabs):
    # A speech-to-text-scoped key authenticates but can't read /v1/user.
    mock_elevenlabs.get_status = 401
    mock_elevenlabs.get_body = {
        "detail": {"status": "missing_permissions", "message": "missing the permission user_read"}
    }
    status, _ = validate_key("scoped-stt-key", base_url=mock_elevenlabs.base_url)
    assert status == "valid"


def test_validate_key_unverified_when_unreachable():
    # Nothing is listening on this port -> connection error -> unverified.
    status, _ = validate_key("k", base_url="http://127.0.0.1:1", timeout=0.5)
    assert status == "unverified"


@pytest.mark.parametrize("http_status", [400, 401, 403])
def test_validate_key_permission_error_across_statuses(mock_elevenlabs, http_status):
    mock_elevenlabs.get_status = http_status
    mock_elevenlabs.get_body = {"detail": {"status": "missing_permissions", "message": "user_read required"}}
    status, message = validate_key("scoped-key", base_url=mock_elevenlabs.base_url)
    assert status == "valid"
    assert "scoped" in message


def test_validate_key_bad_request_explains_reason_without_echoing_key(mock_elevenlabs):
    mock_elevenlabs.get_status = 400
    mock_elevenlabs.get_body = {"detail": {"code": "invalid_request", "message": "Request blocked for private-key"}}
    status, message = validate_key("private-key", base_url=mock_elevenlabs.base_url)
    assert status == "unverified"
    assert "Request blocked" in message
    assert "private-key" not in message


def test_validate_key_400_can_reject_key(mock_elevenlabs):
    mock_elevenlabs.get_status = 400
    mock_elevenlabs.get_body = {"detail": {"status": "invalid_api_key"}}
    status, _ = validate_key("wrong", base_url=mock_elevenlabs.base_url)
    assert status == "invalid"


@pytest.mark.parametrize(
    "raw,expected_substr",
    [
        ("HTTP 401: {'status': 'invalid_api_key'}", "Invalid API key"),
        ("No ElevenLabs API key found.", "Add your ElevenLabs API key"),
        ("HTTP 429: rate limited", "Rate-limited"),
        ("Network error after 4 retries", "Network problem"),
        ("File not found: /tmp/x.mp3", "not found"),
        ("File too large for ElevenLabs (over the size limit).", "too large"),
    ],
)
def test_friendly_error_mapping(raw, expected_substr):
    assert expected_substr.lower() in friendly_error(raw).lower()
