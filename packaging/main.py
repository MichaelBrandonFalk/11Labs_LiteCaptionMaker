"""PyInstaller entry script — launches the desktop GUI."""

import sys

if __name__ == "__main__":
    if len(sys.argv) == 3 and sys.argv[1] == "--smoke-test":
        from pathlib import Path
        import traceback

        try:
            from elevenlabs_helper.desktop.smoke import main

            result = main(sys.argv[2])
        except Exception:
            Path(sys.argv[2]).write_text(traceback.format_exc())
            result = 1
        raise SystemExit(result)
    else:
        from elevenlabs_helper.desktop.app import main

        raise SystemExit(main())
