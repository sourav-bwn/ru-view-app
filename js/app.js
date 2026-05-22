// RuView — WiFi Spatial Intelligence
const APP = {
    version: '1.0.0',
    state: {
        currentPage: 'home',
        darkMode: true,
        simulated: true,
        scanInterval: 100,
        sensitivity: 0.5,
        animations: true,
        persons: [],
        breathingHistory: [],
        heartHistory: [],
        vitalsHistory: [],
        csiData: [],
        connected: false,
        demoRunning: true,
        tick: 0
    }
};

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

// === SENSING ENGINE ===
class SensingEngine {
    constructor() {
        this.personCount = 0;
        this.breathing = { rate: 16, confidence: 0 };
        this.heart = { rate: 72, confidence: 0 };
        this.presence = false;
        this.csiValues = Array(30).fill(0);
        this.targets = { persons: 0, breathing: 16, heart: 72 };
    }

    tick() {
        APP.state.tick++;
        const t = APP.state.tick;

        // Simulate presence
        this.personCount = this.targets.persons;

        // Simulate breathing wave (0.1-0.5 Hz)
        const br = this.targets.breathing;
        const breathWave = Math.sin(t * (br / 60) * Math.PI * 2 * 0.05) * 0.5 + 0.5;
        this.breathing.rate = br + (Math.random() - 0.5) * 0.5;
        this.breathing.confidence = Math.min(95, 70 + breathWave * 25 + Math.random() * 5);

        // Simulate heart wave (0.8-2.0 Hz)
        const hr = this.targets.heart;
        const heartWave = Math.sin(t * (hr / 60) * Math.PI * 2 * 0.05 + 1) * 0.5 + 0.5;
        this.heart.rate = hr + (Math.random() - 0.5) * 1.5;
        this.heart.confidence = Math.min(92, 60 + heartWave * 30 + Math.random() * 2);

        // Simulate CSI data
        for (let i = 0; i < 30; i++) {
            const noise = Math.random() * 0.15;
            const signal = this.personCount > 0 ?
                Math.sin(i * 0.3 + t * 0.02) * (0.4 + this.personCount * 0.1) + 0.5 :
                Math.sin(i * 0.3 + t * 0.02) * 0.15 + 0.5;
            this.csiValues[i] = Math.max(0, Math.min(1, signal + noise));
        }

        // Update presence
        this.presence = this.personCount > 0;
    }

    setPersons(n) { this.targets.persons = n; }
    setBreathing(n) { this.targets.breathing = Math.max(6, Math.min(30, n)); }
    setHeart(n) { this.targets.heart = Math.max(40, Math.min(120, n)); }
}

const engine = new SensingEngine();

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

    // Background
    ctx.fillStyle = '#0d1628';
    ctx.fillRect(0, 0, w, h);

    const data = engine.csiValues;
    const barW = (w - 20) / data.length;
    const pad = 10;

    for (let i = 0; i < data.length; i++) {
        const val = data[i];
        const x = pad + i * barW;
        const barH = val * (h - 30);
        const gradient = ctx.createLinearGradient(0, h - pad, 0, h - pad - barH);
        gradient.addColorStop(0, `rgba(34, 211, 238, ${0.2 + val * 0.6})`);
        gradient.addColorStop(1, `rgba(34, 211, 238, ${0.05 + val * 0.3})`);
        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.roundRect(x, h - pad - barH, barW - 2, barH, 2);
        ctx.fill();

        // Active subcarriers glow
        if (val > 0.6) {
            ctx.fillStyle = `rgba(34, 211, 238, ${(val - 0.6) * 0.3})`;
            ctx.beginPath();
            ctx.roundRect(x, h - pad - barH - 2, barW - 2, 4, 2);
            ctx.fill();
        }
    }

    // Grid lines
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

    const points = data.slice(-maxPoints || 100);
    if (points.length < 2) return;

    const pad = 8;
    const drawW = w - pad * 2;
    const drawH = h - pad * 2;

    // Fill
    ctx.beginPath();
    ctx.moveTo(pad, h / 2);
    for (let i = 0; i < points.length; i++) {
        const x = pad + (i / (points.length - 1)) * drawW;
        const y = h / 2 + (points[i] - 0.5) * drawH;
        ctx.lineTo(x, y);
    }
    ctx.lineTo(pad + drawW, h / 2);
    ctx.closePath();
    const grad = ctx.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, color.replace(')', ',0.15)').replace('rgb', 'rgba'));
    grad.addColorStop(1, color.replace(')', ',0.02)').replace('rgb', 'rgba'));
    ctx.fillStyle = grad;
    ctx.fill();

    // Line
    ctx.beginPath();
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    for (let i = 0; i < points.length; i++) {
        const x = pad + (i / (points.length - 1)) * drawW;
        const y = h / 2 + (points[i] - 0.5) * drawH;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
    }
    ctx.stroke();
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
    if (data.length < 2) {
        ctx.fillStyle = 'rgba(255,255,255,0.15)';
        ctx.font = '12px system-ui';
        ctx.textAlign = 'center';
        ctx.fillText('Collecting data...', w / 2, h / 2);
        return;
    }

    const pad = { top: 10, bottom: 16, left: 32, right: 8 };
    const drawW = w - pad.left - pad.right;
    const drawH = h - pad.top - pad.bottom;

    // Y-axis labels (breathing 6-30, heart 40-120)
    const breathData = data.map(d => d.breathing);
    const heartData = data.map(d => d.heart);
    const maxB = Math.max(30, ...breathData);
    const minB = Math.min(6, ...breathData);
    const rangeB = maxB - minB || 1;

    // Breathing line
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

    // Heart rate line
    const maxH = Math.max(120, ...heartData);
    const minH = Math.min(40, ...heartData);
    const rangeH = maxH - minH || 1;

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

    // Labels
    ctx.fillStyle = 'rgba(255,255,255,0.3)';
    ctx.font = '9px system-ui';
    ctx.textAlign = 'right';
    ctx.fillText('HR', pad.left - 4, pad.top + 10);
    ctx.fillText('BR', pad.left - 4, pad.top + drawH - 4);

    // Legend
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
    const s = APP.state;
    const eng = engine;

    // Status
    const statusEl = document.getElementById('headerStatus');
    if (statusEl) {
        if (s.simulated) {
            statusEl.textContent = 'Simulating';
            statusEl.className = 'status-badge simulating';
        } else if (s.connected) {
            statusEl.textContent = 'Online';
            statusEl.className = 'status-badge online';
        } else {
            statusEl.textContent = 'Offline';
            statusEl.className = 'status-badge';
        }
    }

    // Data source badge
    const dsEl = document.getElementById('dataSource');
    if (dsEl) {
        dsEl.textContent = s.simulated ? 'SIMULATED' : 'LIVE';
        dsEl.className = `badge ${s.simulated ? 'badge-sim' : 'badge-live'}`;
    }

    // Presence
    const pCount = document.getElementById('presenceCount');
    const pArc = document.getElementById('presenceArc');
    const pStatus = document.getElementById('presenceStatus');
    if (pCount) pCount.textContent = eng.personCount;
    if (pStatus) {
        pStatus.textContent = eng.presence ? `${eng.personCount} detected` : 'No one';
        pStatus.className = `badge ${eng.presence ? 'badge-live' : 'badge-idle'}`;
    }
    if (pArc) {
        const max = 6;
        const frac = Math.min(eng.personCount / max, 1);
        pArc.style.strokeDashoffset = 377 - (377 * frac);
        pArc.style.stroke = eng.presence ? 'var(--green)' : 'var(--accent)';
    }

    // Vital signs
    document.getElementById('breathingRate').textContent = eng.breathing.rate.toFixed(1);
    document.getElementById('heartRate').textContent = eng.heart.rate.toFixed(0);
    document.getElementById('vitalConfidence').textContent = eng.breathing.confidence.toFixed(0);
    document.getElementById('breathingBar').style.width = (eng.breathing.rate / 30 * 100) + '%';
    document.getElementById('heartBar').style.width = (eng.heart.rate / 120 * 100) + '%';
    document.getElementById('confidenceBar').style.width = eng.breathing.confidence + '%';

    // Large vitals
    document.getElementById('breathingBig').textContent = eng.breathing.rate.toFixed(1);
    document.getElementById('heartBig').textContent = eng.heart.rate.toFixed(0);

    // Signal strength
    const ss = document.getElementById('signalStrength');
    if (ss) {
        const rssi = -(40 + Math.random() * 15);
        ss.textContent = `${rssi.toFixed(0)} dBm`;
    }

    // Latency
    document.getElementById('latencyVal').textContent = `${(8 + Math.random() * 8).toFixed(0)} ms`;

    // Persons list
    updatePersonsList();

    // CSI Canvas
    drawCSISignal();

    // Waveforms
    drawWaveform('breathingCanvas', APP.state.breathingHistory, 'rgb(34, 211, 238)', 120);
    drawWaveform('heartCanvas', APP.state.heartHistory, 'rgb(251, 113, 133)', 120);
    drawVitalsHistory();
}

function updatePersonsList() {
    const el = document.getElementById('personsList');
    if (!el) return;
    const count = engine.personCount;

    if (count === 0) {
        el.innerHTML = '<div class="empty-state">No persons detected</div>';
        return;
    }

    const names = ['Person A', 'Person B', 'Person C', 'Person D', 'Person E'];
    const activities = ['Walking', 'Standing', 'Sitting', 'Gesturing', 'Walking'];
    const confs = [92, 87, 78, 94, 71];

    let html = '';
    for (let i = 0; i < count; i++) {
        const idx = i % names.length;
        html += `<div class="person-item">
            <span class="person-id">#${i + 1}</span>
            <span class="person-info">${names[idx]} · ${activities[idx]} · ${confs[idx]}% conf</span>
            <span class="person-status">active</span>
        </div>`;
    }
    el.innerHTML = html;
}

// === SETTINGS ===
function initSettings() {
    const simToggle = document.getElementById('simulatedToggle');
    const darkToggle = document.getElementById('darkModeToggle');
    const animToggle = document.getElementById('animationsToggle');
    const scanInterval = document.getElementById('scanInterval');
    const sensitivity = document.getElementById('sensitivity');

    if (simToggle) {
        simToggle.checked = APP.state.simulated;
        simToggle.addEventListener('change', () => {
            APP.state.simulated = simToggle.checked;
        });
    }

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
        scanInterval.value = APP.state.scanInterval;
        scanInterval.addEventListener('change', () => {
            APP.state.scanInterval = parseInt(scanInterval.value);
        });
    }

    if (sensitivity) {
        sensitivity.value = APP.state.sensitivity;
        sensitivity.addEventListener('input', () => {
            APP.state.sensitivity = parseFloat(sensitivity.value);
        });
    }
}

// === SCENARIO SIMULATION ===
function runScenario() {
    const scenarios = [
        { persons: 0, breathing: 16, heart: 72, dur: 4000 },
        { persons: 1, breathing: 18, heart: 75, dur: 5000 },
        { persons: 2, breathing: 20, heart: 85, dur: 4000 },
        { persons: 1, breathing: 14, heart: 68, dur: 3000 },
        { persons: 3, breathing: 22, heart: 90, dur: 4000 },
        { persons: 0, breathing: 16, heart: 72, dur: 3000 },
    ];

    let idx = 0;
    setInterval(() => {
        const sc = scenarios[idx % scenarios.length];
        engine.setPersons(sc.persons);
        engine.setBreathing(sc.breathing);
        engine.setHeart(sc.heart);
        idx++;
    }, 6000);
}

// === MENU TOGGLE ===
document.addEventListener('DOMContentLoaded', () => {
    const menuBtn = document.getElementById('menuBtn');
    if (menuBtn) {
        menuBtn.addEventListener('click', () => navigateTo('home'));
    }

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
    runScenario();

    // Main loop
    setInterval(() => {
        engine.tick();

        // Store data for history
        APP.state.breathingHistory.push(engine.breathing.rate / 30);
        if (APP.state.breathingHistory.length > 200) APP.state.breathingHistory.shift();

        APP.state.heartHistory.push(engine.heart.rate / 120);
        if (APP.state.heartHistory.length > 200) APP.state.heartHistory.shift();

        APP.state.vitalsHistory.push({
            breathing: engine.breathing.rate,
            heart: engine.heart.rate,
            time: Date.now()
        });
        if (APP.state.vitalsHistory.length > 120) APP.state.vitalsHistory.shift();

        updateUI();
    }, 100);
});

// Register service worker
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('sw.js').catch(() => {});
    });
}
