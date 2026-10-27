# RuView — WiFi Spatial Intelligence Dashboard

Mobile-friendly PWA for the RuView WiFi scanner. Shows detected devices,
presence, vitals-style waveforms, a radar view and CSI signal bars.

## Run modes

- **With the scanner server** (real data): serve this folder from the RuView
  backend on port 8742. The page connects over WebSocket and shows LIVE data.
- **Standalone** (e.g. GitHub Pages): without a backend the app falls back to
  clearly-labelled SIMULATED data.

## Settings

- **Scan Interval** — update rate of the UI loop (50/100/200 ms).
- **Detection Sensitivity** — minimum signal strength for a device to count;
  higher sensitivity keeps weaker detections.
- **Simulated Data** — force simulated mode on/off; follows the automatic
  fallback when the backend is unreachable.
- **Dark Mode / Show Animations** — display preferences.

## Tests

Node 18+, no dependencies (DOM and WebSocket are stubbed):

```bash
node --test
```

Covers the settings wiring (scan interval, sensitivity, simulated toggle) and
the sub-path-safe PWA paths in `sw.js` / `manifest.json`.
