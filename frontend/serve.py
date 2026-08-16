#!/usr/bin/env python3
import os
import http.server
import socketserver
from pathlib import Path

PORT = 5173
DIST_DIR = Path(__file__).parent / "dist"

class SPAHandler(http.server.SimpleHTTPRequestHandler):
    def do_GET(self):
        # Try to serve the requested file
        path = self.translate_path(self.path.split('?')[0])  # Remove query string
        if os.path.isfile(path):
            return super().do_GET()
        # If file not found, serve index.html (for SPA routing)
        self.path = "/index.html"
        return super().do_GET()
    
    def end_headers(self):
        self.send_header("Cache-Control", "no-store, must-revalidate")
        self.send_header("Access-Control-Allow-Origin", "*")
        super().end_headers()

os.chdir(DIST_DIR)

with socketserver.TCPServer(("", PORT), SPAHandler) as httpd:
    print(f"Serving frontend on http://localhost:{PORT}")
    httpd.serve_forever()
