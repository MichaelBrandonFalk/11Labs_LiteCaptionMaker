"""Build native Windows ZIP or Linux Mint DEB from the shared PyInstaller spec."""

from hashlib import sha256
from pathlib import Path
import shutil
import subprocess
import sys

from elevenlabs_helper import __version__


ROOT = Path(__file__).resolve().parents[1]
APP = "ElevenLabs Helper"


def main() -> None:
    if sys.platform not in ("win32", "linux"):
        raise SystemExit("Build on Windows or Linux; use build_dmg.sh for macOS.")
    subprocess.run(
        [sys.executable, "-m", "PyInstaller", "--clean", "--noconfirm",
         "packaging/elevenlabs_helper.spec"], cwd=ROOT, check=True,
    )
    output = ROOT / "out"
    output.mkdir(exist_ok=True)
    bundle = ROOT / "dist" / APP
    if sys.platform == "win32":
        archive = shutil.make_archive(
            str(output / "ElevenLabs-Helper-windows-x86_64"),
            "zip", root_dir=bundle.parent, base_dir=bundle.name,
        )
        artifact = Path(archive)
    else:
        stage = ROOT / "build" / "deb"
        if stage.exists():
            shutil.rmtree(stage)
        app_dir = stage / "opt" / "elevenlabs-helper"
        app_dir.parent.mkdir(parents=True)
        shutil.copytree(bundle, app_dir)
        control = stage / "DEBIAN"
        control.mkdir()
        (control / "control").write_text(
            "Package: elevenlabs-helper\n"
            f"Version: {__version__}\n"
            "Section: sound\nPriority: optional\nArchitecture: amd64\n"
            "Maintainer: Michael Brandon Falk <MichaelBrandonFalk@users.noreply.github.com>\n"
            "Depends: libc6 (>= 2.35), libstdc++6, libgcc-s1, libglib2.0-0, "
            "libgl1, libegl1, libfontconfig1, libdbus-1-3, libx11-6, "
            "libx11-xcb1, libxext6, libxrender1, libxi6, libxkbcommon0, "
            "libxkbcommon-x11-0, libxcb1, libxcb-cursor0, libxcb-icccm4, "
            "libxcb-image0, libxcb-keysyms1, libxcb-randr0, libxcb-render0, "
            "libxcb-render-util0, libxcb-shape0, libxcb-shm0, libxcb-sync1, "
            "libxcb-xfixes0, libxcb-xinerama0, libxcb-xkb1, gnome-keyring\n"
            "Homepage: https://michaelbrandonfalk.github.io/11Labs_LiteCaptionMaker/\n"
            "Description: ElevenLabs Lite Caption Maker\n"
            " Desktop MP3 transcription queue with SRT, VTT, and DOCX exports.\n"
        )
        applications = stage / "usr" / "share" / "applications"
        applications.mkdir(parents=True)
        (applications / "elevenlabs-helper.desktop").write_text(
            "[Desktop Entry]\nType=Application\n"
            "Name=ElevenLabs Lite Caption Maker\n"
            'Exec="/opt/elevenlabs-helper/ElevenLabs Helper"\n'
            "Icon=audio-input-microphone\nTerminal=false\n"
            "Categories=AudioVideo;Audio;\nStartupNotify=true\n"
        )
        artifact = output / "ElevenLabs-Helper-linux-amd64.deb"
        subprocess.run(
            ["dpkg-deb", "--build", "--root-owner-group", str(stage), str(artifact)],
            check=True,
        )
    artifact.with_suffix(artifact.suffix + ".sha256").write_text(
        f"{sha256(artifact.read_bytes()).hexdigest()}  {artifact.name}\n", newline="\n"
    )
    print(artifact)


if __name__ == "__main__":
    main()
