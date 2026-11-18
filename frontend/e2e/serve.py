"""Static file server for testing the built site under a sub-path (like GitHub Pages) with the real _headers CSP applied.
Usage: python3 e2e/serve.py <dist-dir> [port]"""
import http.server, os, sys
ROOT = os.path.abspath(sys.argv[1]); PORT = int(sys.argv[2]) if len(sys.argv) > 2 else 4173
PREFIX = '/Data-Engineering-Lab'
csp = ''
for line in open(os.path.join(ROOT, '_headers'), encoding='utf-8'):
    if line.strip().startswith('Content-Security-Policy:'):
        csp = line.split(':', 1)[1].strip()

class H(http.server.SimpleHTTPRequestHandler):
    def translate_path(self, path):
        if not path.startswith(PREFIX):
            return os.path.join(ROOT, '__nope__')
        return super().translate_path(path[len(PREFIX):] or '/')
    def log_message(self, *a): pass
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')
        if csp: self.send_header('Content-Security-Policy', csp)
        super().end_headers()

H.extensions_map.update({'.js': 'text/javascript', '.mjs': 'text/javascript', '.wasm': 'application/wasm'})
os.chdir(ROOT)
http.server.ThreadingHTTPServer(('127.0.0.1', PORT), H).serve_forever()
