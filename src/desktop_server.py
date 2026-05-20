from __future__ import annotations

import os
import sys
from pathlib import Path

import uvicorn


def _extend_pythonpath() -> None:
    root = Path(__file__).resolve().parent.parent
    src_dir = root / "src"
    src_path = str(src_dir)
    if src_path not in sys.path:
        sys.path.insert(0, src_path)


_extend_pythonpath()

from api.main import app  # noqa: E402


def main() -> None:
    host = os.environ.get("FSM_DESKTOP_HOST", "127.0.0.1")
    port = int(os.environ.get("FSM_DESKTOP_PORT", "38123"))
    log_level = os.environ.get("FSM_DESKTOP_LOG_LEVEL", "warning")

    uvicorn.run(
        app,
        host=host,
        port=port,
        log_level=log_level,
        access_log=False,
    )


if __name__ == "__main__":
    main()
