import argparse
from pathlib import Path

import uvicorn

from app.core.config import settings


def main() -> None:
    parser = argparse.ArgumentParser(description="Run the RequestOps API server.")
    parser.add_argument("--reload", action="store_true", help="Enable auto-reload for local development.")
    parser.add_argument("--host", default="0.0.0.0", help="Host interface to bind.")
    args = parser.parse_args()

    backend_dir = Path(__file__).resolve().parent
    uvicorn.run(
        "main:app",
        app_dir=str(backend_dir),
        host=args.host,
        port=settings.port,
        reload=args.reload,
    )


if __name__ == "__main__":
    main()
