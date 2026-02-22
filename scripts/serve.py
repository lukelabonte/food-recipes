#!/usr/bin/env python3
"""Local dev server that mimics GitHub Pages' extensionless URL routing.

Usage: python3 scripts/serve.py [port]

Serves the repo root with these behaviors:
  /admin        → admin.html
  /upload       → upload.html
  /desserts/foo → desserts/foo.html
  /             → index.html
  /assets/x.css → assets/x.css (exact match, no .html fallback)

Dev-only features (never deployed):
  - Theme toggle button (bottom-right) cycles System → Light → Dark
"""

import io
import os
import sys
from http.server import HTTPServer, SimpleHTTPRequestHandler

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# Injected into every HTML response — provides a floating theme toggle button.
# Uses attribute selectors on <html> to override the media-query-based tokens.
THEME_TOGGLE_SNIPPET = """
<!-- Dev-only theme toggle (injected by serve.py) -->
<style>
html[data-theme="light"] {
    --color-bg: #faf8f5;
    --color-surface: #ffffff;
    --color-surface-alt: #f0ece6;
    --color-text: #3d3d3d;
    --color-text-muted: #999999;
    --color-accent: #9a7b5b;
    --color-accent-hover: #7a5f43;
    --color-accent-bg: #f5f0ea;
    --color-border: #e0d6c8;
    --color-shadow: rgba(0, 0, 0, 0.06);
    --color-accent-focus: rgba(154, 123, 91, 0.12);
    --color-success: #3a7d3a;
    --color-error: #c44444;
    color-scheme: light;
}
html[data-theme="dark"] {
    --color-bg: #1c1a17;
    --color-surface: #2a2725;
    --color-surface-alt: #332f2b;
    --color-text: #e8e4df;
    --color-text-muted: #888888;
    --color-accent: #c4a882;
    --color-accent-hover: #d4bc9a;
    --color-accent-bg: #3b3632;
    --color-border: #4a4540;
    --color-shadow: rgba(0, 0, 0, 0.4);
    --color-accent-focus: rgba(196, 168, 130, 0.15);
    --color-success: #6abf6a;
    --color-error: #e06060;
    color-scheme: dark;
}
html[data-theme="dark"] .status-success { background: #1a2e1a; }
html[data-theme="light"] .status-success { background: #f0f9f0; }
html[data-theme="dark"] .status-error { background: #2e1a1a; }
html[data-theme="light"] .status-error { background: #fdf0f0; }
html[data-theme="dark"] .status-processing { background: #2a2725; }
html[data-theme="light"] .status-processing { background: #f5f3f0; }
#dev-theme-toggle {
    position: fixed;
    bottom: 1rem;
    right: 1rem;
    z-index: 99999;
    display: flex;
    align-items: center;
    gap: 0.4rem;
    padding: 0.4rem 0.7rem;
    border-radius: 8px;
    border: 1px solid var(--color-border);
    background: var(--color-surface);
    color: var(--color-text);
    font: 600 0.75rem/1 -apple-system, BlinkMacSystemFont, sans-serif;
    cursor: pointer;
    box-shadow: 0 2px 8px var(--color-shadow);
    opacity: 0.85;
    transition: opacity 0.15s;
    -webkit-tap-highlight-color: transparent;
}
#dev-theme-toggle:hover { opacity: 1; }
</style>
<button id="dev-theme-toggle" title="Cycle: System → Light → Dark">
    <span id="dev-theme-icon">💻</span>
    <span id="dev-theme-label">System</span>
</button>
<script>
(function() {
    var modes = ['system', 'light', 'dark'];
    var icons = { system: '💻', light: '☀️', dark: '🌙' };
    var idx = modes.indexOf(localStorage.getItem('dev-theme') || 'system');
    if (idx < 0) idx = 0;
    function apply() {
        var mode = modes[idx];
        localStorage.setItem('dev-theme', mode);
        if (mode === 'system') {
            document.documentElement.removeAttribute('data-theme');
        } else {
            document.documentElement.setAttribute('data-theme', mode);
        }
        document.getElementById('dev-theme-icon').textContent = icons[mode];
        document.getElementById('dev-theme-label').textContent = mode.charAt(0).toUpperCase() + mode.slice(1);
    }
    apply();
    document.getElementById('dev-theme-toggle').addEventListener('click', function() {
        idx = (idx + 1) % modes.length;
        apply();
    });
})();
</script>
"""


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
            return self._serve_with_toggle(super().do_GET, fs_path)

        # If directory, let default handler serve index.html
        if os.path.isdir(fs_path):
            index_path = os.path.join(fs_path, "index.html")
            return self._serve_with_toggle(super().do_GET, index_path)

        # Try appending .html (GitHub Pages extensionless routing)
        if os.path.isfile(fs_path + ".html"):
            self.path = path + ".html"
            return self._serve_with_toggle(super().do_GET, fs_path + ".html")

        # 404
        return super().do_GET()

    def _serve_with_toggle(self, handler, fs_path):
        """Inject theme toggle into HTML responses."""
        if not fs_path.endswith(".html"):
            return handler()

        # Read the HTML file and inject the toggle before </body>
        try:
            with open(fs_path, "r", encoding="utf-8") as f:
                html = f.read()
        except (OSError, UnicodeDecodeError):
            return handler()

        html = html.replace("</body>", THEME_TOGGLE_SNIPPET + "</body>")
        encoded = html.encode("utf-8")

        self.send_response(200)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Content-Length", str(len(encoded)))
        self.end_headers()
        self.wfile.write(encoded)


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8000
    server = HTTPServer(("localhost", port), GitHubPagesHandler)
    print(f"Serving {ROOT} at http://localhost:{port}")
    print("Theme toggle injected — click button in bottom-right to cycle System/Light/Dark")
    print("Press Ctrl+C to stop")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nStopped")
