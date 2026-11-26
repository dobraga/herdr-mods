"""Tiny stand-in for the Claude usage endpoint, so the status bar shows mock numbers."""

import json
from datetime import datetime, timedelta, timezone
from http.server import BaseHTTPRequestHandler, HTTPServer


class Handler(BaseHTTPRequestHandler):
    """Answer every GET with a fixed usage payload."""

    def do_GET(self) -> None:  # noqa: N802
        """Return five-hour and weekly utilization."""
        now = datetime.now(timezone.utc)
        body = {
            "five_hour": {"utilization": 42, "resets_at": (now + timedelta(hours=3)).isoformat()},
            "seven_day": {"utilization": 18, "resets_at": (now + timedelta(days=4)).isoformat()},
            "limits": [],
            "spend": {"enabled": False},
        }
        data = json.dumps(body).encode()
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def log_message(self, *args: object) -> None:
        """Stay quiet."""


if __name__ == "__main__":
    HTTPServer(("127.0.0.1", 8799), Handler).serve_forever()
