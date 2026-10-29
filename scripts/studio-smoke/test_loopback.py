"""Real local HTTP regression; no credentials, remote backend or transport patches."""
import contextlib
import http.client
import io
import json
from pathlib import Path
import sys
import threading
import unittest

sys.dont_write_bytecode = True
from loopback import CONTENT, Handler, ThreadingHTTPServer

BODY = json.dumps({'messages': [{'content': 'Synthetic'}, {'content': json.dumps({'markdown': 'Synthetic source'})}]}).encode()
OBSERVATIONS = []


class LoopbackTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.server = ThreadingHTTPServer(('127.0.0.1', 0), Handler)
        cls.thread = threading.Thread(target=cls.server.serve_forever, daemon=True)
        cls.thread.start()

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()
        cls.server.server_close()
        cls.thread.join()

    def request(self, case, authorization=None, path='/v1/chat/completions', body=BODY, expected=200):
        output = io.StringIO()
        with contextlib.redirect_stdout(output), contextlib.redirect_stderr(output):
            connection = http.client.HTTPConnection(*self.server.server_address, timeout=3)
            connection.request('POST', path, body, {} if authorization is None else {'Authorization': authorization})
            response = connection.getresponse()
            raw = response.read().decode()
            self.assertEqual(response.status, expected)
            if expected == 200:
                self.assertEqual(json.loads(raw)['choices'][0]['message']['content'], CONTENT)
            else:
                self.assertNotIn('synthetic-rejected-marker', raw)
            connection.close()
        self.assertEqual(output.getvalue(), '')
        OBSERVATIONS.append({'case': case, 'status': expected, 'requestAndCredentialLogs': False})

    def test_no_authorization(self):
        self.request('absent-header')

    def test_production_ollama_empty_key(self):
        self.request('exact-ollama-sentinel', 'Bearer ollama')

    def test_other_authorization(self):
        for value in ['Bearer synthetic-rejected-marker', 'bearer ollama', 'Bearer ollama ', '']:
            with self.subTest(value=value):
                self.request('non-exact-authorization', value, expected=400)

    def test_invalid_path(self):
        self.request('invalid-path', path='/v1/other', expected=400)

    def test_invalid_json(self):
        self.request('invalid-json', body=b'{broken', expected=400)

    def test_invalid_structure(self):
        self.request('invalid-structure', body=b'{"messages":[]}', expected=400)

    def test_size_limit(self):
        self.request('oversize', body=b'x' * 300001, expected=400)


if __name__ == '__main__':
    result = unittest.TextTestRunner(verbosity=2).run(unittest.defaultTestLoader.loadTestsFromTestCase(LoopbackTests))
    if len(sys.argv) > 1:
        Path(sys.argv[1]).write_text(json.dumps({'status': 'PASS' if result.wasSuccessful() else 'FAIL', 'network': '127.0.0.1 only', 'cases': OBSERVATIONS}, indent=2) + '\n')
    sys.exit(0 if result.wasSuccessful() else 1)
