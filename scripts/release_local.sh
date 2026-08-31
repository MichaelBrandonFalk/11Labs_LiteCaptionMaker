#!/usr/bin/env bash
# Build a versioned unsigned macOS DMG for local distribution.
#
# Usage:
#   scripts/release_local.sh 0.1.7
#
# The script updates project version strings, builds the DMG, copies it into
# releases/vX.Y.Z/, and writes a checksum. Commit the version bump and release
# folder, then tag the same version.
set -euo pipefail

if [ $# -ne 1 ]; then
  echo "usage: scripts/release_local.sh <version-without-v>" >&2
  exit 2
fi

VERSION="${1#v}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

python scripts/set_version.py "$VERSION"

python -m pip install -e ".[gui]" pyinstaller
bash packaging/build_dmg.sh

ARCH="$(uname -m)"
RELEASE_DIR="releases/v${VERSION}"
mkdir -p "$RELEASE_DIR"
cp "dist/ElevenLabs Helper.dmg" "$RELEASE_DIR/ElevenLabs-Helper-v${VERSION}-${ARCH}.dmg"
(
  cd "$RELEASE_DIR"
  shasum -a 256 "ElevenLabs-Helper-v${VERSION}-${ARCH}.dmg" \
    | tee "ElevenLabs-Helper-v${VERSION}-${ARCH}.dmg.sha256"
)

echo "Local release prepared in $RELEASE_DIR"
echo "Next:"
echo "  git add -A"
echo "  git commit -m \"Release v${VERSION}\""
echo "  git tag v${VERSION}"
echo "  git push origin main --tags"
