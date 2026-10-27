// Regression tests for the Settings wiring and sub-path-safe PWA paths.
// The app is a browser script, so we run it in a vm with a tiny DOM stub.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const APP_JS = path.join(__dirname, '..', 'js', 'app.js');

function makeEl(id) {
    return {
        id,
        value: '',
        checked: false,
        textContent: '',
        className: '',
        innerHTML: '',
        style: {},
        listeners: {},
        classList: { toggle() {}, add() {}, remove() {}, contains() { return false; } },
        addEventListener(ev, fn) { (this.listeners[ev] ||= []).push(fn); },
        removeEventListener() {},
        appendChild() {},
        getContext() { return new Proxy({}, { get: (t, p) => () => {}, set: () => true }); },
        fire(ev) { (this.listeners[ev] || []).forEach(f => f({ target: this })); },
    };
}

function boot(opts = {}) {
    const elements = {};
    const getEl = id => (elements[id] ||= makeEl(id));
    const intervals = [];
    let nextTimer = 1;
    const docListeners = {};
    const ctx = {
        console,
        location: { protocol: 'https:', hostname: 'sourav-bwn.github.io', port: '' },
        navigator: {},
        document: {
            getElementById: getEl,
            querySelector: () => null,
            querySelectorAll: () => [],
            addEventListener(ev, fn) { (docListeners[ev] ||= []).push(fn); },
            body: makeEl('body'),
        },
        WebSocket: opts.WebSocket || class {
            constructor() { this.readyState = 0; }
            close() {}
        },
        setInterval(fn, ms) { const id = nextTimer++; intervals.push({ id, fn, ms }); return id; },
        clearInterval(id) {
            const i = intervals.findIndex(x => x.id === id);
            if (i >= 0) intervals.splice(i, 1);
        },
        setTimeout() { return 0; },
        clearTimeout() {},
    };
    ctx.window = ctx;
    vm.createContext(ctx);
    vm.runInContext(fs.readFileSync(APP_JS, 'utf8'), ctx);
    vm.runInContext('this.APP = APP; this.updateFromDevices = updateFromDevices; this.startMainLoop = startMainLoop;', ctx);
    (docListeners['DOMContentLoaded'] || []).forEach(f => f());
    vm.runInContext('this.APP = APP; this.updateFromDevices = updateFromDevices; this.startMainLoop = startMainLoop;', ctx);
    return { ctx, elements, intervals };
}

test('main loop interval comes from the scanInterval setting', () => {
    const { ctx, intervals } = boot();
    assert.strictEqual(intervals.length, 1);
    assert.strictEqual(intervals[0].ms, ctx.APP.state.scanInterval);
    ctx.APP.state.scanInterval = 300;
    ctx.startMainLoop();
    assert.strictEqual(intervals[intervals.length - 1].ms, 300);
});

test('changing scanInterval restarts the loop at the new rate', () => {
    const { ctx, elements, intervals } = boot();
    elements.scanInterval.value = '500';
    elements.scanInterval.fire('change');
    assert.strictEqual(ctx.APP.state.scanInterval, 500);
    assert.strictEqual(intervals.length, 1, 'old loop timer cleared');
    assert.strictEqual(intervals[0].ms, 500);
});

test('simulated toggle drives simulated mode', () => {
    const { ctx, elements } = boot();
    assert.strictEqual(ctx.APP.state.simulated, false);
    elements.simulatedToggle.checked = true;
    elements.simulatedToggle.fire('change');
    assert.strictEqual(ctx.APP.state.simulated, true);
    elements.simulatedToggle.checked = false;
    elements.simulatedToggle.fire('change');
    assert.strictEqual(ctx.APP.state.simulated, false);
});

test('auto fallback to simulated keeps the toggle in sync', () => {
    class DeadWebSocket { constructor() { throw new Error('unreachable'); } }
    const { ctx, elements } = boot({ WebSocket: DeadWebSocket });
    assert.strictEqual(ctx.APP.state.simulated, true, 'fell back to simulated');
    assert.strictEqual(elements.simulatedToggle.checked, true, 'toggle follows the fallback');
});

test('sensitivity setting filters weak detections', () => {
    const { ctx } = boot();
    const strong = { ip: '192.168.1.50', signal: { score: 80, quality: 'good' } };
    const weak = { ip: '192.168.1.51', signal: { score: 20, quality: 'poor' } };
    ctx.APP.state.devices = [strong, weak];
    ctx.APP.state.lastScan = { localIP: '192.168.1.99' };

    ctx.APP.state.sensitivity = 0.5; // threshold 50
    ctx.updateFromDevices();
    assert.strictEqual(strong.presenceConfidence, 80, 'strong device kept');
    assert.strictEqual(weak.presenceConfidence, undefined, 'weak device dropped');

    ctx.APP.state.sensitivity = 0.9; // threshold 10
    ctx.updateFromDevices();
    assert.strictEqual(weak.presenceConfidence, 20, 'higher sensitivity keeps weak device');
});

test('service worker caches app files relative to its scope', () => {
    const sw = fs.readFileSync(path.join(__dirname, '..', 'sw.js'), 'utf8');
    const m = sw.match(/const ASSETS = \[([\s\S]*?)\]/);
    assert.ok(m, 'ASSETS list found');
    const entries = [...m[1].matchAll(/'([^']+)'/g)].map(x => x[1]);
    assert.ok(entries.length > 0, 'assets listed');
    for (const e of entries) {
        assert.ok(!e.startsWith('/'), `asset path must not be absolute: ${e}`);
    }
});

test('manifest start_url works from a sub-path install', () => {
    const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'manifest.json'), 'utf8'));
    assert.ok(manifest.start_url && !manifest.start_url.startsWith('/'), 'start_url must be relative');
});
