#!/usr/bin/env python3
"""Local dev server that mimics GitHub Pages' extensionless URL routing.

Usage: python3 scripts/serve.py [port]

Serves the repo root with these behaviors:
  /admin        → admin.html
  /upload       → upload.html
  /desserts/foo → desserts/foo.html
  /             → index.html
  /assets/x.css → assets/x.css (exact match, no .html fallback)
"""

import os
import sys
from http.server import HTTPServer, SimpleHTTPRequestHandler

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


class GitHubPagesHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=ROOT, **kwargs)

    def do_GET(self):
        # Strip query string for file lookup
        path = self.path.split("?")[0].split("#")[0]

        # Build filesystem path
        fs_path = os.path.join(ROOT, path.lstrip("/"))

        # If exact file exists, serve it (handles .css, .js, .json, images, .html)
        if os.path.isfile(fs_path):
            return super().do_GET()

        # If directory, let default handler serve index.html
        if os.path.isdir(fs_path):
            return super().do_GET()

        # Try appending .html (GitHub Pages extensionless routing)
        if os.path.isfile(fs_path + ".html"):
            self.path = path + ".html"
            return super().do_GET()

        # 404
        return super().do_GET()


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8000
    server = HTTPServer(("localhost", port), GitHubPagesHandler)
    print(f"Serving {ROOT} at http://localhost:{port}")
    print("Press Ctrl+C to stop")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nStopped")
