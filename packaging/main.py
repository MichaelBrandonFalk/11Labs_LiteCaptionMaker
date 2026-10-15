"""PyInstaller entry script — launches the desktop GUI."""

import sys

if __name__ == "__main__":
    if len(sys.argv) == 3 and sys.argv[1] == "--smoke-test":
        from elevenlabs_helper.desktop.smoke import main

        raise SystemExit(main(sys.argv[2]))
    else:
        from elevenlabs_helper.desktop.app import main

        raise SystemExit(main())
