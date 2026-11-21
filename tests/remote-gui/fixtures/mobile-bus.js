import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createInterface } from 'node:readline';

const allowed = new Set([
    'org.freedesktop.DBus.Hello',
    'org.freedesktop.DBus.GetNameOwner',
    'org.freedesktop.DBus.GetConnectionUnixProcessID',
    'org.freedesktop.DBus.Properties.Get',
    'org.a11y.atspi.Accessible.GetChildren',
    'org.a11y.atspi.Accessible.GetRoleName',
    'org.a11y.atspi.Accessible.GetState',
    'org.a11y.atspi.Accessible.GetAttributes',
    'org.a11y.atspi.Component.GetExtents',
]);

export async function monitorMobileBus(sessionID) {
    const monitor = spawn('dbus-monitor', ['--profile', '--address', 'unix:abstract=remote-gui-a11y-' + sessionID],
        { stdio: ['ignore', 'pipe', 'inherit'] });
    const calls = [];
    const lines = createInterface({ input: monitor.stdout });
    const closed = once(lines, 'close');
    const finished = new Promise(resolve => monitor.once('close', (code, signal) => resolve({ code, signal })));
    lines.on('line', line => {
        const [type, , , sender, , path, iface, member] = line.split('\t');
        if (type === 'mc') calls.push({ sender, path, method: iface + '.' + member });
    });
    await once(monitor, 'spawn');
    return async () => {
        if (monitor.exitCode === null && monitor.signalCode === null) monitor.kill('SIGTERM');
        const [{ code, signal }] = await Promise.all([finished, closed]);
        assert.equal(signal, 'SIGTERM', 'private accessibility monitor exited early: ' + code);
        return calls;
    };
}

export function checkMobileBus(calls) {
    const pidQueries = new Set(
        calls.filter(call => call.method === 'org.freedesktop.DBus.GetConnectionUnixProcessID').map(call => call.sender));
    // Registry and Chromium clients can ask for peer PIDs too. The helper also enumerates the accessibility root.
    const helperSenders = new Set(calls.filter(call => pidQueries.has(call.sender)
        && call.path === '/org/a11y/atspi/accessible/root'
        && call.method === 'org.a11y.atspi.Accessible.GetChildren').map(call => call.sender));
    const methods = calls.filter(call => helperSenders.has(call.sender)).map(call => call.method);
    assert.ok(methods.includes('org.a11y.atspi.Accessible.GetAttributes'), 'no editable attribute lookup was observed');
    assert.deepEqual([...new Set(methods.filter(method => !allowed.has(method)))], [],
        'the focus helper made an unexpected accessibility call or subscription');
}
