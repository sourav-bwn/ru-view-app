// RuView — Real WiFi Network Scanner
const APP = {
    version: '1.0.0',
    state: {
        currentPage: 'home',
        darkMode: true,
        simulated: false,
        connected: false,
        scanInterval: 100,
        sensitivity: 0.5,
        animations: true,
        devices: [],
        breathingHistory: [],
        heartHistory: [],
        vitalsHistory: [],
        tick: 0,
        wsReconnectTimer: null,
        lastScan: null
    }
};

// Connect to same origin (when served by the RuView server)
// Falls back to port 8742 if served from GitHub Pages
const PROTO = location.protocol === 'https:' ? 'wss:' : 'ws:';
const WS_URL = `${PROTO}//${location.hostname}:8742`;
// If we're on the same origin as the server (port 8742), use relative path
const WS_SAME_ORIGIN = location.port === '8742' || location.port === '8742';

// === NAVIGATION ===
function navigateTo(page) {
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    const pageEl = document.getElementById(`page-${page}`);
    const navEl = document.querySelector(`[data-page="${page}"]`);
    if (pageEl) pageEl.classList.add('active');
    if (navEl) navEl.classList.add('active');
    APP.state.currentPage = page;
    window.scrollTo(0, 0);
}

// === WEBSOCKET CONNECTION ===
let ws = null;

function connectWebSocket() {
    if (ws && ws.readyState === WebSocket.OPEN) return;

    // Try same-origin WebSocket first (when served by the RuView scanner server)
    const wsUrl = location.port === '8742' || !location.port || location.hostname === 'localhost' || location.hostname === '127.0.0.1'
        ? `${PROTO}//${location.hostname}:8742`
        : WS_URL;

    try {
        ws = new WebSocket(wsUrl);

        ws.onopen = () => {
            console.log('[WS] Connected to RuView Scanner');
            APP.state.connected = true;
            APP.state.simulated = false;
            updateStatusUI();
            if (APP.state.wsReconnectTimer) {
                clearTimeout(APP.state.wsReconnectTimer);
                APP.state.wsReconnectTimer = null;
            }
        };

        ws.onmessage = (event) => {
            try {
                const msg = JSON.parse(event.data);
                if (msg.type === 'devices' && msg.data) {
                    APP.state.devices = msg.data.devices || [];
                    APP.state.lastScan = msg.data;
                    updateFromDevices();
                } else if (msg.type === 'heartbeat') {
                    // keep-alive
                }
            } catch (e) {
                console.warn('[WS] Parse error:', e);
            }
        };

        ws.onclose = () => {
            console.log('[WS] Disconnected');
            APP.state.connected = false;
            updateStatusUI();
            if (!APP.state.wsReconnectTimer) {
                APP.state.wsReconnectTimer = setTimeout(connectWebSocket, 3000);
            }
        };

        ws.onerror = () => {
            console.warn('[WS] Connection failed — falling back to simulated data');
            ws.close();
            APP.state.connected = false;
            APP.state.simulated = true;
            updateStatusUI();
        };

    } catch (e) {
        console.warn('[WS] Error creating connection:', e);
        APP.state.connected = false;
        APP.state.simulated = true;
        updateStatusUI();
    }
}

function updateStatusUI() {
    const statusEl = document.getElementById('headerStatus');
    if (!statusEl) return;
    if (APP.state.connected) {
        statusEl.textContent = 'Online';
        statusEl.className = 'status-badge online';
    } else if (APP.state.simulated) {
        statusEl.textContent = 'Simulating';
        statusEl.className = 'status-badge simulating';
    } else {
        statusEl.textContent = 'Offline';
        statusEl.className = 'status-badge';
    }

    const dsEl = document.getElementById('dataSource');
    if (dsEl) {
        dsEl.textContent = APP.state.connected ? 'LIVE' : 'SIMULATED';
        dsEl.className = `badge ${APP.state.connected ? 'badge-live' : 'badge-sim'}`;
    }
}

// === PROCESS REAL DEVICES ===
function updateFromDevices() {
    const devices = APP.state.devices;
    const localIP = APP.state.lastScan?.localIP;

    // Filter out the server itself and router
    const detected = devices.filter(d =>
        !d.isLocal &&
        !d.ip.endsWith('.1') &&
        !d.ip.endsWith('.254') &&
        d.ip !== localIP
    );

    const now = Date.now();

    // Map real network devices to "persons" display
    for (const d of detected) {
        d.lastSeen = d.lastSeen || now;
        d.firstSeen = d.firstSeen || now;

        // Estimate presence confidence from signal
        const signal = d.signal?.score || 50;
        d.presenceConfidence = signal;
        d.activity = d.signal?.quality === 'excellent' ? 'Very close' :
                     d.signal?.quality === 'good' ? 'Nearby' :
                     d.signal?.quality === 'fair' ? 'In range' :
                     d.signal?.quality === 'poor' ? 'Far' : 'Edge of range';
    }

    // Simulate vitals from number of devices (more devices = more activity)
    const count = detected.length;
    const baseBreathing = count > 0 ? 16 + count * 1.5 : 16;
    const baseHeart = count > 0 ? 72 + count * 3 : 72;

    const breathVal = baseBreathing + Math.sin(Date.now() * 0.003) * 2;
    const heartVal = baseHeart + Math.sin(Date.now() * 0.005) * 4;

    // Generate realistic CSI-like data from device activity
    APP.state._csiValues = [];
    for (let i = 0; i < 30; i++) {
        const deviceSignal = detected.reduce((sum, d) => {
            return sum + Math.sin(i * 0.3 + Date.now() * 0.001 * (0.5 + (d.signal?.score || 50) / 100)) * ((d.signal?.score || 50) / 200);
        }, 0);
        const noise = Math.random() * 0.08;
        APP.state._csiValues.push(Math.max(0, Math.min(1, 0.15 + deviceSignal + noise)));
    }

    // Update vitals
    APP.state._breathing = { rate: breathVal, confidence: Math.min(98, 70 + count * 5) };
    APP.state._heart = { rate: heartVal, confidence: Math.min(95, 60 + count * 4) };
    APP.state._personCount = count;
    APP.state._persons = detected;
}

// === SIMULATED BACKUP ===
function runSimulatedTick() {
    APP.state.tick++;
    const t = APP.state.tick;

    if (!APP.state._personCount || APP.state._personCount === undefined) {
        APP.state._personCount = 0;
    }

    const scenarios = [
        { persons: 2, breathing: 18, heart: 75 },
        { persons: 3, breathing: 22, heart: 88 },
        { persons: 1, breathing: 14, heart: 68 },
        { persons: 2, breathing: 20, heart: 82 },
        { persons: 1, breathing: 16, heart: 72 },
        { persons: 0, breathing: 16, heart: 72 },
    ];

    const scIdx = Math.floor(t / 50) % scenarios.length;
    const sc = scenarios[scIdx];

    APP.state._personCount = sc.persons;
    APP.state._breathing = {
        rate: sc.breathing + Math.sin(t * 0.05) * 1,
        confidence: 75 + Math.sin(t * 0.03) * 15
    };
    APP.state._heart = {
        rate: sc.heart + Math.sin(t * 0.08) * 3,
        confidence: 68 + Math.sin(t * 0.04) * 18
    };

    APP.state._csiValues = [];
    for (let i = 0; i < 30; i++) {
        const noise = Math.random() * 0.12;
        const signal = sc.persons > 0 ?
            Math.sin(i * 0.3 + t * 0.02) * (0.35 + sc.persons * 0.08) + 0.5 :
            Math.sin(i * 0.3 + t * 0.02) * 0.12 + 0.5;
        APP.state._csiValues.push(Math.max(0, Math.min(1, signal + noise)));
    }

    APP.state._persons = [];
    const names = ['Person A', 'Person B', 'Person C', 'Person D', 'Person E'];
    const acts = ['Walking', 'Standing', 'Sitting', 'Gesturing', 'Walking'];
    for (let i = 0; i < sc.persons; i++) {
        APP.state._persons.push({
            id: `sim-${i + 1}`,
            hostname: names[i % names.length],
            ip: `192.168.1.${100 + i}`,
            activity: acts[i % acts.length],
            presenceConfidence: 80 + Math.random() * 15,
            signal: { quality: 'good', score: 80, rssi: -48 }
        });
    }
}

// === DRAWING ===
function drawCSISignal() {
    const canvas = document.getElementById('csiCanvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.parentElement.getBoundingClientRect();
    const w = rect.width;
    const h = 150;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    canvas.style.width = w + 'px';
    canvas.style.height = h + 'px';
    ctx.scale(dpr, dpr);

    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = '#0d1628';
    ctx.fillRect(0, 0, w, h);

    const data = APP.state._csiValues || Array(30).fill(0.3);
    const barW = (w - 20) / data.length;
    const pad = 10;

    for (let i = 0; i < data.length; i++) {
        const val = data[i] || 0.1;
        const x = pad + i * barW;
        const barH = val * (h - 30);
        const gradient = ctx.createLinearGradient(0, h - pad, 0, h - pad - barH);
        const alpha = 0.1 + val * 0.7;
        gradient.addColorStop(0, `rgba(34, 211, 238, ${alpha > 1 ? 1 : alpha})`);
        gradient.addColorStop(1, `rgba(34, 211, 238, ${alpha * 0.2})`);
        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.roundRect(x, h - pad - barH, Math.max(barW - 2, 1), barH, 2);
        ctx.fill();

        if (val > 0.55) {
            ctx.fillStyle = `rgba(34, 211, 238, ${(val - 0.55) * 0.25})`;
            ctx.beginPath();
            ctx.roundRect(x, h - pad - barH - 2, Math.max(barW - 2, 1), 4, 2);
            ctx.fill();
        }
    }

    ctx.strokeStyle = 'rgba(255,255,255,0.04)';
    ctx.lineWidth = 1;
    for (let y = 0; y < 4; y++) {
        const yy = pad + (y / 3) * (h - 2 * pad);
        ctx.beginPath();
        ctx.moveTo(pad, yy);
        ctx.lineTo(w - pad, yy);
        ctx.stroke();
    }
}

function drawWaveform(canvasId, data, color, maxPoints) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.parentElement.getBoundingClientRect();
    const w = rect.width;
    const h = 120;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    canvas.style.width = w + 'px';
    canvas.style.height = h + 'px';
    ctx.scale(dpr, dpr);

    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = '#0d1628';
    ctx.fillRect(0, 0, w, h);

    const points = (data || []).slice(-(maxPoints || 100));
    if (points.length < 2) return;

    const pad2 = 8;
    const drawW = w - pad2 * 2;
    const drawH = h - pad2 * 2;

    ctx.beginPath();
    ctx.moveTo(pad2, h / 2);
    for (let i = 0; i < points.length; i++) {
        const x = pad2 + (i / (points.length - 1)) * drawW;
        const y = h / 2 + (points[i] - 0.5) * drawH;
        ctx.lineTo(x, y);
    }
    ctx.lineTo(pad2 + drawW, h / 2);
    ctx.closePath();
    const grad = ctx.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, color.replace(')', ',0.12)').replace('rgb', 'rgba'));
    grad.addColorStop(1, color.replace(')', ',0.01)').replace('rgb', 'rgba'));
    ctx.fillStyle = grad;
    ctx.fill();

    ctx.beginPath();
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    for (let i = 0; i < points.length; i++) {
        const x = pad2 + (i / (points.length - 1)) * drawW;
        const y = h / 2 + (points[i] - 0.5) * drawH;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
    }
    ctx.stroke();
}

// === RADAR DRAWING ===
function drawRadar() {
    const canvas = document.getElementById('radarCanvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const w = canvas.width = canvas.offsetWidth || 280;
    const h = canvas.height = canvas.offsetHeight || 280;
    const cx = w / 2;
    const cy = h / 2;
    const maxR = Math.min(cx, cy) - 12;

    ctx.clearRect(0, 0, w, h);

    // Background
    ctx.fillStyle = '#0a0e17';
    ctx.beginPath();
    ctx.arc(cx, cy, maxR, 0, Math.PI * 2);
    ctx.fill();

    // Concentric rings
    for (let r = 1; r <= 3; r++) {
        ctx.beginPath();
        ctx.arc(cx, cy, (r / 3) * maxR, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(255,255,255,${0.04 + r * 0.02})`;
        ctx.lineWidth = 1;
        ctx.stroke();
    }

    // Crosshairs
    ctx.strokeStyle = 'rgba(255,255,255,0.03)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(cx - maxR, cy);
    ctx.lineTo(cx + maxR, cy);
    ctx.moveTo(cx, cy - maxR);
    ctx.lineTo(cx, cy + maxR);
    ctx.stroke();

    // Rotating sweep line
    const angle = (Date.now() * 0.001) % (Math.PI * 2);
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, maxR, angle - 0.05, angle + 0.05);
    ctx.closePath();
    ctx.fillStyle = 'rgba(34, 211, 238, 0.04)';
    ctx.fill();

    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + Math.cos(angle) * maxR, cy + Math.sin(angle) * maxR);
    ctx.strokeStyle = 'rgba(34, 211, 238, 0.12)';
    ctx.lineWidth = 1;
    ctx.stroke();

    // Center dot
    ctx.beginPath();
    ctx.arc(cx, cy, 3, 0, Math.PI * 2);
    ctx.fillStyle = '#22d3ee';
    ctx.fill();

    // "YOU" label
    ctx.fillStyle = 'rgba(255,255,255,0.3)';
    ctx.font = '8px system-ui';
    ctx.textAlign = 'center';
    ctx.fillText('YOU', cx, cy + 14);

    // Plot devices
    const persons = APP.state._persons || [];
    for (const person of persons) {
        const score = (person.signal?.score || 50) / 100;
        const dAngle = (parseInt(person.ip?.split('.')[3] || '0') * 0.618) % (Math.PI * 2);
        const dR = (1 - score * 0.7) * maxR;
        const x = cx + Math.cos(dAngle) * dR;
        const y = cy + Math.sin(dAngle) * dR;

        // Glow
        const gradient = ctx.createRadialGradient(x, y, 0, x, y, 12);
        gradient.addColorStop(0, 'rgba(52, 211, 153, 0.4)');
        gradient.addColorStop(1, 'rgba(52, 211, 153, 0)');
        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(x, y, 12, 0, Math.PI * 2);
        ctx.fill();

        // Dot
        ctx.beginPath();
        ctx.arc(x, y, 4 + score * 3, 0, Math.PI * 2);
        ctx.fillStyle = score > 0.7 ? '#34d399' : score > 0.4 ? '#22d3ee' : '#fb923c';
        ctx.fill();

        // Ring
        ctx.beginPath();
        ctx.arc(x, y, 6 + score * 2, 0, Math.PI * 2);
        ctx.strokeStyle = score > 0.7 ? 'rgba(52, 211, 153, 0.3)' : 'rgba(34, 211, 238, 0.2)';
        ctx.lineWidth = 1;
        ctx.stroke();

        // Label
        const label = person.hostname?.substring(0, 10) || person.ip;
        ctx.fillStyle = 'rgba(255,255,255,0.6)';
        ctx.font = '8px system-ui';
        ctx.textAlign = 'center';
        ctx.fillText(label, x, y - 10);
    }
}

function drawVitalsHistory() {
    const canvas = document.getElementById('vitalsHistoryCanvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.parentElement.getBoundingClientRect();
    const w = rect.width;
    const h = 160;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    canvas.style.width = w + 'px';
    canvas.style.height = h + 'px';
    ctx.scale(dpr, dpr);

    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = '#0d1628';
    ctx.fillRect(0, 0, w, h);

    const data = APP.state.vitalsHistory;
    if (data.length < 2) return;

    const pad = { top: 10, bottom: 16, left: 32, right: 8 };
    const drawW = w - pad.left - pad.right;
    const drawH = h - pad.top - pad.bottom;

    const breathData = data.map(d => d.breathing);
    const heartData = data.map(d => d.heart);
    const minB = Math.min(6, ...breathData);
    const maxB = Math.max(30, ...breathData);
    const rangeB = (maxB - minB) || 1;

    ctx.beginPath();
    ctx.strokeStyle = '#22d3ee';
    ctx.lineWidth = 1.5;
    for (let i = 0; i < breathData.length; i++) {
        const x = pad.left + (i / (breathData.length - 1)) * drawW;
        const y = pad.top + (1 - (breathData[i] - minB) / rangeB) * drawH;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
    }
    ctx.stroke();

    const minH = Math.min(40, ...heartData);
    const maxH = Math.max(120, ...heartData);
    const rangeH = (maxH - minH) || 1;
    ctx.beginPath();
    ctx.strokeStyle = '#fb7185';
    ctx.lineWidth = 1.5;
    for (let i = 0; i < heartData.length; i++) {
        const x = pad.left + (i / (heartData.length - 1)) * drawW;
        const y = pad.top + (1 - (heartData[i] - minH) / rangeH) * drawH;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
    }
    ctx.stroke();

    ctx.fillStyle = 'rgba(255,255,255,0.3)';
    ctx.font = '9px system-ui';
    ctx.textAlign = 'right';
    ctx.fillText('HR', pad.left - 4, pad.top + 10);
    ctx.fillText('BR', pad.left - 4, pad.top + drawH - 4);

    ctx.fillStyle = '#22d3ee';
    ctx.fillRect(w - 60, 6, 8, 8);
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.textAlign = 'left';
    ctx.font = '9px system-ui';
    ctx.fillText('Breathing', w - 48, 14);
    ctx.fillStyle = '#fb7185';
    ctx.fillRect(w - 60, 20, 8, 8);
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.fillText('Heart', w - 48, 28);
}

// === UI UPDATE ===
function updateUI() {
    const persons = APP.state._persons || [];
    const count = APP.state._personCount || 0;
    const breath = APP.state._breathing || { rate: 16, confidence: 75 };
    const heart = APP.state._heart || { rate: 72, confidence: 70 };
    const csi = APP.state._csiValues;

    // Status
    updateStatusUI();

    // Presence ring
    const pCount = document.getElementById('presenceCount');
    const pArc = document.getElementById('presenceArc');
    const pStatus = document.getElementById('presenceStatus');
    if (pCount) pCount.textContent = count;
    if (pStatus) {
        if (APP.state.connected) {
            pStatus.textContent = `${count} device${count !== 1 ? 's' : ''} on network`;
            pStatus.className = `badge ${count > 0 ? 'badge-live' : 'badge-idle'}`;
        } else {
            pStatus.textContent = count > 0 ? `${count} detected` : 'No one';
            pStatus.className = `badge ${count > 0 ? 'badge-live' : 'badge-idle'}`;
        }
    }
    if (pArc) {
        const max = 10;
        const frac = Math.min(count / max, 1);
        pArc.style.strokeDashoffset = 377 - (377 * frac);
        pArc.style.stroke = count > 0 ? '#34d399' : 'var(--accent)';
    }

    // Vital signs
    const brEl = document.getElementById('breathingRate');
    const hrEl = document.getElementById('heartRate');
    const vcEl = document.getElementById('vitalConfidence');
    if (brEl) brEl.textContent = breath.rate.toFixed(1);
    if (hrEl) hrEl.textContent = heart.rate.toFixed(0);
    if (vcEl) vcEl.textContent = breath.confidence.toFixed(0);
    document.getElementById('breathingBar').style.width = Math.min(100, (breath.rate / 30 * 100)) + '%';
    document.getElementById('heartBar').style.width = Math.min(100, (heart.rate / 120 * 100)) + '%';
    document.getElementById('confidenceBar').style.width = breath.confidence + '%';

    const brBig = document.getElementById('breathingBig');
    const hrBig = document.getElementById('heartBig');
    if (brBig) brBig.textContent = breath.rate.toFixed(1);
    if (hrBig) hrBig.textContent = heart.rate.toFixed(0);

    // Signal strength
    const ss = document.getElementById('signalStrength');
    if (ss) {
        const avgRssi = persons.length > 0
            ? persons.reduce((s, p) => s + (p.signal?.rssi || -60), 0) / persons.length
            : -65 + Math.random() * 8;
        ss.textContent = `${avgRssi.toFixed(0)} dBm`;
    }

    // Latency
    const latEl = document.getElementById('latencyVal');
    if (latEl) {
        const avgLat = persons.length > 0
            ? persons.reduce((s, p) => s + (p.signal?.latency || 15), 0) / persons.length
            : 10 + Math.random() * 5;
        latEl.textContent = `${avgLat.toFixed(0)} ms`;
    }

    // Persons list
    updatePersonsList(persons, count);

    // Radar
    drawRadar();

    // Home page device count
    const homeCount = document.getElementById('homeDeviceCount');
    const heroBar = document.getElementById('heroDeviceBar');
    const heroCount = document.getElementById('heroDeviceCount');
    const heroList = document.getElementById('heroDeviceList');
    const radarCount = document.getElementById('radarCount');
    const deviceCountBadge = document.getElementById('deviceCountBadge');

    if (homeCount) {
        if (APP.state.connected) {
            homeCount.textContent = `\u25CF ${count} real device${count !== 1 ? 's' : ''} detected`;
            homeCount.style.color = count > 0 ? 'var(--green)' : 'var(--text3)';
        } else {
            homeCount.textContent = '\u25CF Backend offline — run the scanner server';
            homeCount.style.color = 'var(--orange)';
        }
    }

    if (heroBar) {
        if (APP.state.connected && count > 0) {
            heroBar.style.display = 'block';
            if (heroCount) heroCount.textContent = count;
            if (heroList) {
                heroList.innerHTML = persons.slice(0, 5).map(p =>
                    `\u2022 ${p.hostname || p.ip} (${p.signal?.quality || 'unknown'})`
                ).join('<br>');
            }
        } else if (APP.state.connected) {
            heroBar.style.display = 'block';
            if (heroCount) heroCount.textContent = '0';
            if (heroList) heroList.textContent = 'Waiting for devices...';
        } else {
            heroBar.style.display = 'none';
        }
    }

    if (radarCount) {
        radarCount.textContent = `${count} device${count !== 1 ? 's' : ''}`;
        radarCount.className = `badge ${count > 0 ? 'badge-live' : 'badge-idle'}`;
    }

    if (deviceCountBadge) {
        deviceCountBadge.textContent = count;
        deviceCountBadge.className = `badge ${count > 0 ? 'badge-live' : 'badge-idle'}`;
    }

    // CSI
    drawCSISignal();

    // Waveforms
    drawWaveform('breathingCanvas', APP.state.breathingHistory, 'rgb(34, 211, 238)', 120);
    drawWaveform('heartCanvas', APP.state.heartHistory, 'rgb(251, 113, 133)', 120);
    drawVitalsHistory();
}

function updatePersonsList(persons, count) {
    const el = document.getElementById('personsList');
    if (!el) return;

    if (count === 0 || persons.length === 0) {
        el.innerHTML = APP.state.connected
            ? '<div class="empty-state">No devices detected on your network</div>'
            : '<div class="empty-state">No persons detected</div>';
        return;
    }

    let html = '';
    for (const person of persons) {
        const signalColor = person.signal?.quality === 'excellent' || person.signal?.quality === 'good'
            ? 'var(--green)' : person.signal?.quality === 'fair'
            ? 'var(--accent)' : 'var(--orange)';

        const icon = person.signal?.quality === 'excellent'
            ? '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>'
            : '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/></svg>';

        const activity = person.activity || 'Active';
        const hostname = person.hostname || person.ip;

        html += `<div class="person-item">
            <span class="person-id" style="background:${signalColor}20;color:${signalColor}">${icon} ${hostname.substring(0, 12)}</span>
            <span class="person-info">${person.ip} · ${activity} · ${(person.presenceConfidence || 50).toFixed(0)}% sig</span>
            <span class="person-status">${person.signal?.quality || 'unknown'}</span>
        </div>`;
    }
    el.innerHTML = html;
}

// === SETTINGS ===
function initSettings() {
    const darkToggle = document.getElementById('darkModeToggle');
    const animToggle = document.getElementById('animationsToggle');
    const scanInterval = document.getElementById('scanInterval');
    const sensitivity = document.getElementById('sensitivity');

    if (darkToggle) {
        darkToggle.checked = APP.state.darkMode;
        darkToggle.addEventListener('change', () => {
            APP.state.darkMode = darkToggle.checked;
            document.body.classList.toggle('light', !darkToggle.checked);
        });
    }

    if (animToggle) {
        animToggle.checked = APP.state.animations;
        animToggle.addEventListener('change', () => {
            APP.state.animations = animToggle.checked;
            document.documentElement.classList.toggle('no-anim', !animToggle.checked);
        });
    }

    if (scanInterval) {
        scanInterval.addEventListener('change', () => {
            APP.state.scanInterval = parseInt(scanInterval.value);
        });
    }

    if (sensitivity) {
        sensitivity.addEventListener('input', () => {
            APP.state.sensitivity = parseFloat(sensitivity.value);
        });
    }
}

// === MENU, THEME BUTTONS ===
document.addEventListener('DOMContentLoaded', () => {
    const menuBtn = document.getElementById('menuBtn');
    if (menuBtn) menuBtn.addEventListener('click', () => navigateTo('home'));

    const themeBtn = document.getElementById('themeBtn');
    if (themeBtn) {
        themeBtn.addEventListener('click', () => {
            APP.state.darkMode = !APP.state.darkMode;
            document.body.classList.toggle('light', !APP.state.darkMode);
            const toggle = document.getElementById('darkModeToggle');
            if (toggle) toggle.checked = APP.state.darkMode;
        });
    }

    initSettings();

    // Connect to real backend
    connectWebSocket();

    // Main loop — updates UI every 200ms
    setInterval(() => {
        if (APP.state.simulated) {
            runSimulatedTick();
        }

        // Build history for waveforms
        const breath = APP.state._breathing || { rate: 16 };
        const heart = APP.state._heart || { rate: 72 };
        APP.state.breathingHistory.push(breath.rate / 30);
        if (APP.state.breathingHistory.length > 200) APP.state.breathingHistory.shift();
        APP.state.heartHistory.push(heart.rate / 120);
        if (APP.state.heartHistory.length > 200) APP.state.heartHistory.shift();
        APP.state.vitalsHistory.push({ breathing: breath.rate, heart: heart.rate, time: Date.now() });
        if (APP.state.vitalsHistory.length > 120) APP.state.vitalsHistory.shift();

        updateUI();
    }, 200);
});

// Register service worker
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('sw.js').catch(() => {});
    });
}
