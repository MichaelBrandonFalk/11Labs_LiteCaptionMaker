# ElevenLabs Lite Caption Maker

Forked from [Jason Britton's 11Labs_Helper](https://github.com/jasonbritton12/11Labs_Helper).


Upload an audio file to **ElevenLabs Speech-to-Text (Scribe)**, monitor a batch
queue, and collect transcript deliverables (SRT / VTT / DOCX). Ships as a
lightweight Windows, Linux Mint, and macOS desktop app and a public browser wrapper over a **reusable,
headless engine** that also runs as a CLI/container for cloud supply-chain
workflows (e.g. SDVI Rally).

**V1 scope:** you supply a ready-to-upload **`.mp3`** (no conversion). FFmpeg-based
conversion, video input, segmentation of very long files, and dubbing are on the
roadmap (see below).

## Architecture

```
elevenlabs_helper/
  engine/      # PURE, UI-free core — reuse anywhere (CLI, container, SDVI Rally)
    media/inspect.py   # size (stat) + duration (mutagen) + limit warnings — no ffmpeg
    elevenlabs/        # Scribe HTTP client (streamed upload, retries) + response models
    exporters/         # canonical transcript -> SRT/VTT/DOCX (+ raw JSON)
    processors/        # pluggable feature interface (V1: speech_to_text; future: dubbing)
    jobs/              # Job model, SQLite store, sequential queue w/ retry
    cli.py             # headless entry point
    service.py         # Engine facade (store + queue wiring)
  desktop/     # PySide6 GUI — a thin shell that imports the engine
  packaging/   # PyInstaller spec, dmg build, Dockerfile
  docs/        # GitHub Pages download/docs site + browser caption maker
```

The GUI never contains business logic — it drives `engine.service.Engine`. The
same engine powers the CLI and the Docker image.

## Key behaviors

- **No conversion (V1):** the audio file is uploaded as-is, **streamed from disk**
  (never loaded fully into memory).
- **Oversize gate:** before queueing, the file's size (via `stat`) and duration
  (via the pure-Python `mutagen` header reader) are checked against ElevenLabs'
  limits (5 GB / ~10 h). If either is exceeded you get a **warning that requires
  acknowledgement** (GUI confirm; CLI `--force`) before it's attempted.
- **Scribe defaults:** diarization, word timestamps, audio-event tagging, and
  auto-detect language all on (toggleable in Settings or per queued job).
- **Deliverables:** SRT, VTT, DOCX; the raw JSON response is always kept as the
  canonical source of truth (`<stem>.raw.json`).
- **Staged, intentional runs:** dropped files are **staged** — nothing is
  transcribed until you press **Run**, so an accidental drop never spends credits.
  Files dropped while a batch runs also stage and wait for the next Run; an
  interrupted job re-stages on restart (never auto-runs).
- **Batch queue:** sequential processing, persistent history (SQLite),
  **auto-retry** of transient failures (429/5xx/network) with backoff.
- **Graceful failures:** every failure point is classified permanent (no retry:
  missing file, invalid key, oversize-unacknowledged, 413, output-write error) or
  transient (retried), each with human-readable status copy.
- **Output:** `…/<source-stem>/` next to each source (or a chosen root).

## Authentication

ElevenLabs has **no browser/OAuth login** for its API — only API keys. On first
run the app links to the ElevenLabs API-keys page and stores your pasted key in
the **system credential store** (macOS Keychain, Windows Credential Manager, or
Linux Secret Service / GNOME Keyring; validated against the API on save). Headless/cloud runs
read `ELEVENLABS_API_KEY` instead.

**Suspected key compromise (rotation runbook):** revoke/rotate the key in the
**ElevenLabs dashboard → API keys**, then open **Settings → API Key** in the app
and paste the new key (it replaces the Keychain entry; the old one stops working
immediately once revoked upstream). For headless/CI, update the
`ELEVENLABS_API_KEY` secret. The app never logs the key.

## Data at rest & privacy

- Audio you add is **uploaded to ElevenLabs** for transcription (third-party AI
  vendor); it is processed under **ElevenLabs' own terms**. ElevenLabs is SOC 2
  Type II / ISO 27001 certified with a published DPA, but its strongest data
  controls (**no-training, Zero-Retention Mode, data residency**) are
  **Enterprise-only**. On non-Enterprise tiers (e.g. **Scale**), **enable the
  training opt-out** in your ElevenLabs account and assume uploads are retained up
  to ~3 years — treat the app as suited to **general/non-confidential** audio.
  See the DPA checklist in [ROADMAP.md](ROADMAP.md) before sending regulated content.
- Transcripts are **AI-generated and may contain errors** — verify before relying
  on them. DOCX deliverables carry an "AI-generated" disclosure line.
- **Deliverables** you choose (SRT/VTT/DOCX, and optionally a JSON copy) are
  written **in cleartext** to your output folder (defaults: **SRT + VTT**). For
  sensitive content keep output on a **FileVault**-encrypted volume.
- **Transcript history:** the canonical JSON is also kept **silently in the app
  history space** (`~/Library/Application Support/ElevenLabsHelper/history/`),
  separate from your outputs, so you can **re-export deliverables for free (no API
  cost)** if you delete/move them. **Retention default: kept until you delete it**
  (Remove/Clear only hide from the list). For data-minimization, set **Settings →
  Auto-delete history after N days**, or turn off **Keep transcript history**
  entirely (zero local retention; disables re-export).
- **Re-export & recovery:** completed jobs have a **Re-export** button (pick which
  formats to regenerate — no API cost). **Remove**/**Clear completed** only *archive*
  a job (hide it from the list) — they **keep** the recovery copy. Use **History…**
  to search past transcripts, re-export, or **Delete permanently** (the only action
  that discards the recovery copy). CLI equivalents: `elevenlabs-helper history` and
  `elevenlabs-helper reexport <job-id-or-json> [--formats …]`.
- The app writes a redacted local audit log (`…/ElevenLabsHelper/logs/`) of job
  lifecycle + upload destination host — never the API key or transcript content.

## Develop / run

```bash
python3.12 -m venv .venv && source .venv/bin/activate
pip install -e ".[gui,dev]"
# Reproducible install (verifies hashes):
#   pip install --require-hashes -r requirements.lock
# Release check:
#   python -m pip_audit -r requirements.lock

# Desktop app
python -m elevenlabs_helper.desktop.app

# CLI
elevenlabs-helper inspect clip.mp3
ELEVENLABS_API_KEY=sk-... elevenlabs-helper transcribe clip.mp3 --out ./out --formats srt,vtt,docx
# add --force to proceed past size/duration limits

# Tests
pytest

# Live end-to-end check against the REAL Scribe API (spends credits; use a short clip).
# Reads the key from the Keychain or ELEVENLABS_API_KEY; never prints it.
python scripts/live_check.py path/to/clip_with_speech.mp3 --out ./out
```

> Use Python 3.12/3.13 (PySide6-supported). The engine alone (no `gui` extra)
> needs only Python — no system binaries.

## Build the Mac app (unsigned)

### Local build (current architecture)

```bash
pip install pyinstaller
./packaging/build_dmg.sh        # -> dist/ElevenLabs Helper.dmg (+ printed SHA-256)
```

For a version-controlled local distribution, use:

```bash
scripts/release_local.sh 0.1.7
```

That updates the project version, builds the unsigned DMG, and stores the
versioned artifact/checksum in `releases/v0.1.7/`.

Builds for the machine's own architecture (Apple Silicon on an M-series Mac,
Intel on an Intel Mac). A true `universal2` build (`TARGET_ARCH=universal2`)
requires universal2 wheels for every compiled dependency — notably
`pydantic-core` — which the default arm64/x86_64 wheels are not, so prefer
**per-arch builds** (below) over `universal2`.

### Both architectures via CI (recommended)

`.github/workflows/build-macos.yml` builds on **macos-14 (Apple Silicon)** and
**macos-15-intel (Intel)** native runners and produces `ElevenLabs-Helper-arm64.dmg` and
`ElevenLabs-Helper-x86_64.dmg` (each with a `.sha256`). It runs on a version tag
and attaches both to the GitHub Release:

```bash
git init && git add -A && git commit -m "ElevenLabs Helper v0.1.7"
git remote add origin git@github.com:<you>/<repo>.git && git push -u origin main
git tag v0.1.7 && git push origin v0.1.7      # triggers the dual-arch build
```

- **First launch (unsigned):** right-click the app → **Open** to clear Gatekeeper.
- **Sign + notarize later (optional):** `codesign --deep --options runtime --sign
  "Developer ID Application: …" "dist/ElevenLabs Helper.app"`, then `xcrun
  notarytool submit … --wait` and `xcrun stapler staple`.

## Windows and Linux Mint distributions

Download **v0.1.7** from the [download page](https://michaelbrandonfalk.github.io/11Labs_LiteCaptionMaker/#downloads)
or [GitHub Release](https://github.com/MichaelBrandonFalk/11Labs_LiteCaptionMaker/releases/tag/v0.1.7).
Python is bundled; no terminal is needed to install or run these desktop builds.

- **Windows 10 (1809+) / 11, x86_64:** extract the whole
  `ElevenLabs-Helper-windows-x86_64.zip`, then double-click `ElevenLabs Helper.exe`.
  Keep the `_internal` folder beside the executable. Builds are unsigned.
- **Linux Mint 21.x / 22.x, amd64:** open `ElevenLabs-Helper-linux-amd64.deb`
  in Package Installer, install, then launch **ElevenLabs Lite Caption Maker**
  from the application menu. The package installs desktop-library dependencies
  and GNOME Keyring. Unlock the login keyring in **Passwords and Keys** before
  saving an API key. Mint 20, LMDE, and ARM are outside this package's scope.

To update, replace the extracted Windows folder or install the newer DEB.
Settings/history are retained in `%APPDATA%/ElevenLabsHelper` on Windows and
`${XDG_DATA_HOME:-~/.local/share}/ElevenLabsHelper` on Linux.
Uninstall the DEB through Mint's Software Manager; remove the extracted folder
on Windows. Neither removes your user data or saved API key.

`.github/workflows/build-desktop.yml` builds natively on Windows Server 2022
and Ubuntu 22.04 with Python 3.12, PySide6 6.8.3, and PyInstaller 6.16.0. The
older Linux build baseline supports both Mint 21's Ubuntu 22.04 base and
Mint 22's Ubuntu 24.04 base. CI runs the engine tests, launches the frozen app,
checks the GUI, SQLite, credential backend imports, and DOCX resources, and
installs/launches the DEB on both Ubuntu bases. Checks are offline and spend no
ElevenLabs credits. Actual Mint desktop/keyring interaction needs a user session.
Each version tag publishes packages and SHA-256 checksums to its own release.

For a native developer build on Windows or Linux:

```bash
python -m pip install ".[gui]" "PySide6==6.8.3" "pyinstaller==6.16.0"
python packaging/build_desktop.py
```

On Linux, install the desktop libraries listed in the workflow first; DEB
creation also requires `dpkg-deb`. Build each OS on that OS; PyInstaller does
not cross-compile. Use `scripts/set_version.py X.Y.Z` before tagging a new release.

## Public page and browser version

GitHub Pages serves the static site from `docs/`. It includes:

- links to the latest GitHub Release downloads;
- install and privacy documentation;
- a browser caption maker that calls ElevenLabs directly with the user's pasted
  API key and downloads SRT, VTT, DOCX, and raw JSON locally.

The browser version is useful for quick jobs, but the desktop app is still the
recommended path for repeat work because it has a persistent queue, system credential
storage, local transcript history, retries, and free re-export.

## Cloud / SDVI Rally reuse

```bash
docker build -f packaging/Dockerfile -t elevenlabs-helper .
docker run --rm -e ELEVENLABS_API_KEY=sk-... \
    -v "$PWD/in:/in" -v "$PWD/out:/out" \
    elevenlabs-helper transcribe /in/clip.mp3 --out /out --formats srt,vtt,docx
```

The image is the engine + CLI (no GUI, no ffmpeg), so a Rally action can invoke
it directly.

## Roadmap

See **[ROADMAP.md](ROADMAP.md)** for the full plan: V1.1 review follow-ups (minor
eng/UX fixes), the **vendor data-rights / DPA checklist** (the one remaining
security gate, for regulated use), and V2 capability work below.

### Out of scope for V1

- **FFmpeg conversion module:** accept MOV/MP4/WAV/etc., transcode to a compact
  upload, with estimated size/duration.
- **Segmentation + stitching** of files beyond the API limits (transcribe in
  chunks, re-merge with corrected timecodes).
- **Higher-quality / lossless audio** options for dubbing-grade workflows.
- **Dubbing / Dubbing Studio** (a new `processors/dubbing.py` implementing the
  same `Processor` interface).
- Optional TXT/JSON/HTML/PDF user-facing exports (JSON already retained),
  webhook/async transcription, code-signing automation.
```
