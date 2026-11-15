"""Real X-server/process lifecycle tests; these are not Obsidian acceptance claims."""
import importlib.util
import json
import os
from pathlib import Path
import signal
import subprocess
import sys
import time
import unittest
import uuid

MODULE = Path(__file__).with_name('run.py')
spec = importlib.util.spec_from_file_location('native_runner', MODULE)
runner = importlib.util.module_from_spec(spec); spec.loader.exec_module(runner)


class RunnerTests(unittest.TestCase):
    def root(self):
        return Path('/tmp') / ('veynrel-infra-test-' + uuid.uuid4().hex[:12])

    def result(self, root):
        data = json.loads((root / 'isolation/result.json').read_text())
        self.assertTrue(data['processGroupClean']); self.assertTrue(data['cdpClosed'])
        env = json.loads((root / 'isolation/environment.json').read_text())
        self.assertEqual(env['backend'], 'xvfb-openbox'); self.assertTrue(env['waylandDisplayRemoved'])
        self.assertNotEqual(env['display'], os.environ.get('DISPLAY'))
        return data

    def test_failure_cleans_descendants_and_keeps_exit_status(self):
        root = self.root()
        command = [sys.executable, '-c', 'import subprocess,sys; subprocess.Popen([sys.executable,"-c","import time;time.sleep(60)"]);sys.exit(7)']
        self.assertEqual(runner.run(command, root, timeout=15), 7)
        self.assertEqual(self.result(root)['exitCode'], 7)

    def test_timeout_cleans_process_group(self):
        root = self.root()
        self.assertEqual(runner.run([sys.executable, '-c', 'import time;time.sleep(60)'], root, timeout=3), 124)
        self.assertEqual(self.result(root)['failure'], 'TIMEOUT')

    def test_sigterm_cleans_process_group(self):
        root = self.root()
        harness = "import time,sys;from pathlib import Path;p=Path(sys.argv[1]);p.mkdir();(p/'ready').touch();time.sleep(60)"
        code = f'import sys;sys.path.insert(0,sys.argv[1]);from run import run;raise SystemExit(run([sys.executable,"-c",{harness!r},sys.argv[2]],sys.argv[2],30))'
        proc = subprocess.Popen([sys.executable, '-c', code, str(MODULE.parent), str(root)])
        try:
            # Wait for the actual harness to start, without a desktop/Obsidian instance.
            deadline = time.monotonic() + 10
            while not (root / 'ready').exists() and time.monotonic() < deadline:
                self.assertIsNone(proc.poll()); time.sleep(.05)
            self.assertTrue((root / 'ready').exists())
            proc.send_signal(signal.SIGTERM); self.assertEqual(proc.wait(timeout=10), 143)
            self.assertEqual(self.result(root)['failure'], 'INTERRUPTED')
        finally:
            if proc.poll() is None: proc.kill(); proc.wait()


if __name__ == '__main__':
    unittest.main()
