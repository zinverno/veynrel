"""Native-test observer: inherit the shipped responder unchanged; record safe header categories only."""
import importlib.util
import json
from pathlib import Path
import sys

sys.dont_write_bytecode = True
kit, receipt = Path(sys.argv[1]), Path(sys.argv[2])
spec = importlib.util.spec_from_file_location('shipped_loopback', kit / 'loopback.py')
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class ObservedHandler(module.Handler):
    def respond(self, status, value):
        headers = self.headers.get_all('Authorization', [])
        category = 'ollama-sentinel' if headers == ['Bearer ollama'] else 'absent' if not headers else 'other'
        with receipt.open('a') as file:
            file.write(json.dumps({'status': status, 'authorization': category, 'expectedPath': self.path == '/v1/chat/completions'}) + '\n')
        super().respond(status, value)


server = module.ThreadingHTTPServer(('127.0.0.1', 0), ObservedHandler)
print(server.server_address[1], flush=True)
try:
    server.serve_forever()
finally:
    server.server_close()
