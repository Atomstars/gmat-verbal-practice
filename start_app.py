#!/usr/bin/env python3
"""GMAT Verbal Trainer launcher.

Serves this folder over HTTP and opens the app in your browser.
Why this exists: the app loads questions via fetch(), which browsers block
over file://. The app must be reached at http://localhost:<port>, not by
double-clicking index.html. This launcher handles that for you and auto-picks
a free port if the default one is busy.
"""

import http.server
import os
import socket
import socketserver
import threading
import webbrowser

PREFERRED_PORT = 8000
PORT_RANGE = 20  # try 8000..8019


def find_free_port(start: int, span: int) -> int:
    for port in range(start, start + span):
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            if s.connect_ex(("127.0.0.1", port)) != 0:  # nothing listening
                return port
    # fall back to an OS-assigned free port
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.bind(("", 0))
        return s.getsockname()[1]


def main() -> None:
    # Serve the folder this script lives in, regardless of where it's launched.
    os.chdir(os.path.dirname(os.path.abspath(__file__)))

    port = find_free_port(PREFERRED_PORT, PORT_RANGE)
    url = f"http://localhost:{port}/index.html"

    class Handler(http.server.SimpleHTTPRequestHandler):
        def end_headers(self):
            # Match the app's no-cache intent so regenerated JSON isn't stale.
            self.send_header("Cache-Control", "no-cache, no-store, must-revalidate")
            super().end_headers()

        def log_message(self, *args):
            pass  # keep the console quiet

    socketserver.TCPServer.allow_reuse_address = True
    with socketserver.TCPServer(("", port), Handler) as httpd:
        print("=" * 56)
        print("  GMAT Verbal Trainer is running.")
        print(f"  Open:  {url}")
        print("  Leave this window open while you study.")
        print("  Close it (or press Ctrl+C) to stop the server.")
        print("=" * 56)
        threading.Timer(1.0, lambda: webbrowser.open(url)).start()
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\nStopped. You can close this window.")


if __name__ == "__main__":
    main()
