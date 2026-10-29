#!/usr/bin/env python3
"""Local synthetic Markdown responder. No remote backend, credentials or request logs."""
import argparse
import json
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

CONTENT = Path(__file__).with_name('synthetic-response.md').read_text(encoding='utf-8')

class Handler(BaseHTTPRequestHandler):
    def log_message(self, *_):
        pass

    def respond(self, status, value):
        body = json.dumps(value, ensure_ascii=False).encode('utf-8')
        self.send_response(status)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        self.respond(404, {'error': 'Only synthetic Markdown POST is supported'})

    def do_POST(self):
        authorization = self.headers.get_all('Authorization', [])
        if self.path != '/v1/chat/completions' or authorization not in ([], ['Bearer ollama']):
            self.respond(400, {'error': 'Use the loopback endpoint with an empty key'})
            return
        try:
            length = int(self.headers.get('Content-Length', '0'))
            if not 0 < length <= 300000:
                raise ValueError()
            request = json.loads(self.rfile.read(length))
            messages = request['messages']
            if not isinstance(messages, list) or len(messages) != 2 or request.get('stream'):
                raise ValueError()
            if not isinstance(json.loads(messages[1]['content'])['markdown'], str):
                raise ValueError()
        except (ValueError, KeyError, TypeError, IndexError):
            self.respond(400, {'error': 'Invalid bounded synthetic request'})
            return
        self.respond(200, {'choices': [{'message': {'role': 'assistant', 'content': CONTENT}, 'finish_reason': 'stop'}]})

if __name__ == '__main__':
    args = argparse.ArgumentParser(description=__doc__)
    args.add_argument('--port', type=int, default=8766)
    port = args.parse_args().port
    server = ThreadingHTTPServer(('127.0.0.1', port), Handler)
    print(f'Synthetic-only endpoint: http://127.0.0.1:{server.server_address[1]}/v1', flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()
