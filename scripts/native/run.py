#!/usr/bin/env python3
"""Run an allowlisted native harness on a private Xvfb/Openbox session by default."""
import argparse
import ctypes
import json
import os
from pathlib import Path
import shutil
import secrets
import select
import signal
import socket
import subprocess
import sys
import tempfile
import time
import uuid

REPO = Path(__file__).resolve().parents[2]
SUITES = {
    'overview': ('veynrel-overview-native-', 'scripts/native/overview.mjs'),
    'ux': ('veynrel-ux-native-', 'scripts/native/product-ux.mjs'),
    'map': ('veynrel-map-native-', 'scripts/r06-map-native.mjs'),
    'registry': ('veynrel-registry-native-', 'scripts/r05-3-registry-native.mjs'),
    'local-notes': ('veynrel-local-notes-native-', 'scripts/r05-2-local-notes-native.mjs'),
    'actions': ('veynrel-actions-native-', 'scripts/r05-actions-native.mjs'),
    'organization-open': ('veynrel-organization-open-', 'scripts/r04-modal-lifecycle-native.mjs'),
    'organization': ('veynrel-organization-native-', 'scripts/r04-organization-native.mjs'),
    'smoke': ('veynrel-smoke-native-', 'scripts/native/smoke.mjs'),
    'studio': ('veynrel-studio-native-', 'scripts/studio-source-preservation-native.mjs'),
    'recall': ('veynrel-recall-native-', 'scripts/recall-topics-native.mjs'),
    'community': ('veynrel-community-native-', 'scripts/studio-community-native.mjs'),
}


def worker(spec_path):
    spec = json.loads(Path(spec_path).read_text())
    control = Path(spec_path).parent
    assert os.environ.get('VEYNREL_NATIVE_CONTROL') == str(control)
    wm = xvfb = None
    try:
        if not spec['desktop']:
            authority = control / 'Xauthority'; authority.touch(mode=0o600)
            cookie = secrets.token_hex(16)
            subprocess.run(['xauth', '-f', str(authority), 'add', ':0', '.', cookie], check=True, capture_output=True)
            read_fd, write_fd = os.pipe()
            try:
                with (control / 'xvfb.log').open('w') as log:
                    xvfb = subprocess.Popen(['Xvfb', '-displayfd', str(write_fd), '-auth', str(authority), '-screen', '0', '1600x1000x24', '-nolisten', 'tcp', '-noreset'], pass_fds=(write_fd,), stdout=log, stderr=log)
                os.close(write_fd); write_fd = None
                assert select.select([read_fd], [], [], 10)[0], 'Xvfb startup timed out'
                number = os.read(read_fd, 32).decode().strip()
                assert number.isdigit() and xvfb.poll() is None, 'Xvfb did not allocate a display'
            finally:
                os.close(read_fd)
                if write_fd is not None:
                    os.close(write_fd)
            display = ':' + number
            assert display != spec['parentDisplay'], 'Must not reuse the working display'
            subprocess.run(['xauth', '-f', str(authority), 'add', display, '.', cookie], check=True, capture_output=True)
            os.environ.update(DISPLAY=display, XAUTHORITY=str(authority))
            config = control / 'openbox.xml'
            config.write_text('<openbox_config xmlns="http://openbox.org/3.4/rc"><focus><focusNew>yes</focusNew><followMouse>no</followMouse></focus><desktops><number>1</number></desktops></openbox_config>')
            with (control / 'openbox.log').open('w') as log:
                wm = subprocess.Popen(['openbox', '--sm-disable', '--config-file', str(config)], stdout=log, stderr=log)
            for _ in range(100):
                assert wm.poll() is None, 'Openbox exited before readiness'
                check = subprocess.run(['xprop', '-root', '_NET_SUPPORTING_WM_CHECK'], capture_output=True, text=True)
                if check.returncode == 0 and 'window id #' in check.stdout:
                    break
                time.sleep(.05)
            else:
                raise RuntimeError('Openbox did not register with the private X server')
        display = os.environ.get('DISPLAY', '')
        assert display
        (control / 'environment.json').write_text(json.dumps({
            'backend': 'desktop' if spec['desktop'] else 'xvfb-openbox',
            'display': display, 'privateDisplay': not spec['desktop'],
            'waylandDisplayRemoved': 'WAYLAND_DISPLAY' not in os.environ,
            'privateDbus': 'dbus-run-session per harness',
            'wmPid': wm.pid if wm else None, 'gpu': 'disabled', 'frame': 'native',
        }, indent=2) + '\n')
        # No activation directories: do not start the user's keyring, portals or desktop services.
        bus = control / 'dbus.conf'
        bus.write_text('<busconfig><type>session</type><listen>unix:tmpdir=' + str(control) + '</listen><auth>EXTERNAL</auth><policy context="default"><allow send_destination="*" eavesdrop="true"/><allow receive_sender="*" eavesdrop="true"/><allow own="*"/></policy></busconfig>')
        return subprocess.call(['dbus-run-session', '--config-file=' + str(bus), '--', *spec['command']], cwd=REPO)
    finally:
        if wm and wm.poll() is None:
            wm.terminate()
            try:
                wm.wait(timeout=2)
            except subprocess.TimeoutExpired:
                wm.kill(); wm.wait()
        if xvfb and xvfb.poll() is None:
            xvfb.terminate(); xvfb.wait(timeout=3)


def group_alive(pgid):
    try:
        os.killpg(pgid, 0)
        return True
    except ProcessLookupError:
        return False


def run(command, root, timeout=180, desktop=False):
    """The caller supplies only a fresh synthetic root; command is an argv list."""
    root = Path(root).absolute()
    assert root.parent == Path('/tmp') and root.name.startswith('veynrel-') and not root.exists()
    assert 1 <= timeout <= 900
    for tool in ['node', 'dbus-run-session', 'xprop'] + ([] if desktop else ['Xvfb', 'openbox', 'xauth']):
        if not shutil.which(tool):
            raise RuntimeError(f'Missing native test dependency: {tool}')
    # Reap orphaned grandchildren as well as the wrapper after terminating our process group.
    assert ctypes.CDLL(None).prctl(36, 1, 0, 0, 0) == 0  # PR_SET_CHILD_SUBREAPER (Linux)
    control = Path(tempfile.mkdtemp(prefix='veynrel-native-control-'))
    env = os.environ.copy()
    for key in ['WAYLAND_DISPLAY', 'DBUS_SESSION_BUS_ADDRESS', 'SESSION_MANAGER', 'DESKTOP_STARTUP_ID', 'XDG_ACTIVATION_TOKEN', 'GNOME_KEYRING_CONTROL']:
        env.pop(key, None)
    for key in ['XDG_CONFIG_HOME', 'XDG_CACHE_HOME', 'XDG_DATA_HOME', 'XDG_RUNTIME_DIR']:
        path = control / key.lower(); path.mkdir(mode=0o700); env[key] = str(path)
    env.update(VEYNREL_NATIVE_CONTROL=str(control), VEYNREL_NATIVE_ROOT=str(root), COMMUNITY_PUBLIC='0')
    spec = {'desktop': desktop, 'parentDisplay': os.environ.get('DISPLAY'), 'command': command}
    (control / 'spec.json').write_text(json.dumps(spec))
    argv = [sys.executable, str(Path(__file__).resolve()), '--worker', str(control / 'spec.json')]
    if not desktop:
        env.pop('DISPLAY', None)
        env.pop('XAUTHORITY', None)
    elif not env.get('DISPLAY'):
        raise RuntimeError('--desktop needs an explicitly available DISPLAY')
    result = {'command': command, 'timeoutSeconds': timeout, 'startedAt': time.time(), 'exitCode': None}
    child = None
    old_handlers = {}
    def interrupted(signum, _frame):
        raise InterruptedError(signum)
    try:
        for sig in [signal.SIGTERM, signal.SIGINT]:
            old_handlers[sig] = signal.signal(sig, interrupted)
        with (control / 'harness.log').open('w') as log:
            child = subprocess.Popen(argv, cwd=REPO, env=env, stdin=subprocess.DEVNULL, stdout=log, stderr=log, start_new_session=True)
        result['exitCode'] = child.wait(timeout=timeout)
    except subprocess.TimeoutExpired:
        result.update(exitCode=124, failure='TIMEOUT')
    except InterruptedError as error:
        result.update(exitCode=128 + error.args[0], failure='INTERRUPTED')
    except Exception as error:
        result.update(exitCode=1, failure=str(error))
    finally:
        # No global pkill: only the group created above, including Electron/DBus/Xvfb.
        for sig in old_handlers:
            signal.signal(sig, signal.SIG_IGN)
        if child:
            if group_alive(child.pid):
                os.killpg(child.pid, signal.SIGTERM)
            try:
                child.wait(timeout=3)
            except subprocess.TimeoutExpired:
                pass
            if group_alive(child.pid):
                os.killpg(child.pid, signal.SIGKILL)
            child.wait()
            for _ in range(100):
                try:
                    while os.waitpid(-1, os.WNOHANG)[0]:
                        pass
                except ChildProcessError:
                    break
                time.sleep(.02)
            result['processGroupClean'] = not group_alive(child.pid)
        root.mkdir(exist_ok=True)
        sessions = root / 'native-sessions.jsonl'
        ports = [json.loads(line)['port'] for line in sessions.read_text().splitlines()] if sessions.exists() else []
        result['cdpPorts'] = ports
        result['cdpClosed'] = True
        for port in ports:
            with socket.socket() as probe:
                probe.settimeout(.3)
                result['cdpClosed'] &= probe.connect_ex(('127.0.0.1', port)) != 0
        if not result.get('processGroupClean', False) or not result['cdpClosed']:
            result.update(exitCode=1, cleanupFailure=True)
        result['seconds'] = round(time.time() - result['startedAt'], 3)
        evidence = root / 'isolation'; evidence.mkdir()
        for path in control.iterdir():
            if path.suffix in ['.log', '.json'] and path.name != 'spec.json':
                shutil.copy2(path, evidence / path.name)
        (evidence / 'result.json').write_text(json.dumps(result, indent=2) + '\n')
        shutil.rmtree(control)
        for sig, handler in old_handlers.items():
            signal.signal(sig, handler)
    print(json.dumps({'root': str(root), **result}), flush=True)
    return result['exitCode']


if __name__ == '__main__':
    if len(sys.argv) == 3 and sys.argv[1] == '--worker':
        sys.exit(worker(sys.argv[2]))
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('suite', choices=SUITES)
    parser.add_argument('--output', type=Path)
    parser.add_argument('--timeout', type=int, default=180)
    parser.add_argument('--desktop', action='store_true', help='Explicit visible comparison; never used by default')
    parser.add_argument('harness_args', nargs='*', help='Existing harness arguments after its disposable root')
    args = parser.parse_args()
    prefix, script = SUITES[args.suite]
    root = args.output or Path('/tmp') / (prefix + uuid.uuid4().hex[:12])
    assert root.name.startswith(prefix), f'Output must use {prefix}'
    sys.exit(run(['node', str(REPO / script), str(root), *args.harness_args], root, args.timeout, args.desktop))
