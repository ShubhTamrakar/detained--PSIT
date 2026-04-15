# Detained? v2.0 — Feature Implementation Plan

## Features to Build

| # | Feature | Where |
|---|---|---|
| 1 | Color-coded Status Badge (🟢🟡🔴) | `content.js` inline bar |
| 2 | Slide-in Toast Alert on page load | `content.js` |
| 3 | Recovery Mode Calculator | `content.js` dropdown |
| 4 | Daily Lectures Configurator | `content.js` dropdown |
| 5 | Streak Counter 🔥 | `content.js` inline bar |
| 6 | Holiday Exclusions | `content.js` dropdown |
| 7 | Attendance Trend Graph + Predicted Curve | `content.js` dropdown |
| 8 | ~~Share My Stats Card~~ | ~~Removed~~ |
| 9 | ~~Popup Dashboard~~ | ~~Removed~~ |
| 10 | Smart Notifications | `background.js` |

## Files to Create/Modify

- `manifest.json` — Add background service worker, alarms + notifications + storage permissions
- `content.js` — Major rewrite with features 1–7, 10
- `background.js` — New file (chrome.alarms for notifications)
