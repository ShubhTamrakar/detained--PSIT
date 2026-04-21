<div align="center">

<img src="assets/banner.png" width="800" alt="Detained? Banner">

# 💀 DETAINED?

**The ultimate vibe check for your PSIT attendance.**

[![License](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![Version](https://img.shields.io/badge/Version-2.0.2-purple.svg)]()
[![Platform](https://img.shields.io/badge/Platform-Chrome%20%7C%20Edge%20%7C%20Brave-orange.svg)]()

---

### **"Am I getting detained?"**
Stop doing attendance math in your head. This extension does it for you — live, accurate, and right inside the PSIT ERP.

</div>

## 🚀 What's New in v2.0.2

- 📈 **Attendance Trend Graph** — per-day history + predicted projection line with hover tooltips
- 🗓️ **Dual-Month Calendar** — smart date picker for the Academic Planner (past dates disabled)
- 🎯 **Goal-aware status** — SAFE / CLOSE / BELOW GOAL (replaces misleading "DETAINED" label)
- 📊 **Accurate projections** — graph, simulator, and planner all use consistent formulas
- 💀 **Impossible goal detection** — 100% goal with existing absences shows a 💀 warning
- 🏖️ **Holidays & open Saturdays** — fully respected by graph and planner
- ⚡ **Real-time updates** — all chips, badges, and graph update instantly on goal/input changes
- 📍 **Today's label** — academic date + completed lectures shown near the gear icon
- ⚠️ **Scenario recovery** — recovery reflects planned skips and live assumed rectifications

---

## ✨ Features

<table>
  <tr>
    <td width="50%">
      <h3>📊 Real-Time Stats Bar</h3>
      Live attendance %, SAFE/CLOSE/BELOW GOAL badge, leave allowance chip, and +/- delta chips — injected right next to the ERP attendance header.
    </td>
    <td width="50%">
      <h3>🟢 Bunk Buddy</h3>
      Tells you exactly how many days and lectures you can skip against your personal goal %. Updates live.
    </td>
  </tr>
  <tr>
    <td width="50%">
      <h3>🎯 Scenario Simulator</h3>
      Set your goal %, days to skip, and lectures to skip. See projected % instantly — before you commit to that trip.
    </td>
    <td width="50%">
      <h3>📅 Academic Planner</h3>
      Set your last academic day. Get projected end-of-semester %, max leaves, class days remaining — with custom Saturdays and holidays.
    </td>
  </tr>
  <tr>
    <td width="50%">
      <h3>📈 Attendance Trend Graph</h3>
      A canvas graph with a data point for every class day. Actual history (blue) + predicted projection (red dashed). Hover any point for date and %.
    </td>
    <td width="50%">
      <h3>🗓️ Smart Inline Calendar</h3>
      Dual-month calendar for setting custom lecture ranges. Click start → end date. Past dates are disabled. Today is highlighted.
    </td>
  </tr>
  <tr>
    <td width="50%">
      <h3>🔥 Streak Badge</h3>
      Tracks your consecutive attendance streak and shows it as a fire badge.
    </td>
    <td width="50%">
      <h3>⚠️ Smart Alerts</h3>
      Toast notifications when you're close to your goal, below goal, or when 100% is literally impossible (💀).
    </td>
  </tr>
  <tr>
    <td width="50%">
      <h3>🎨 Theme Switcher</h3>
      4 beautiful themes — Sunset Glow, Midnight Glass, Cherry Blossom, Cyber Emerald. Click the palette icon to cycle through and customize your vibe.
    </td>
    <td width="50%">
      <h3>📚 Interactive Help Tooltips</h3>
      Hover over any UI element for instant contextual help. Smart 0.5s idle trigger ensures help doesn't interfere while interacting.
    </td>
  </tr>
  <tr>
    <td width="50%">
      <h3>🔔 Auto Update Checker</h3>
      Automatically checks for new versions. Banner notification appears when an update is available — stay current effortlessly.
    </td>
    <td width="50%">
      <h3>⚙️ History & Data Manager</h3>
      Gear icon access to view and manage all historical data — saved Saturdays, holidays, attendance snapshots, and more.
    </td>
  </tr>
</table>

---

## 💻 Tech Stack

<div align="center">
  <img src="https://img.shields.io/badge/Vanilla_JS-F7DF1E?style=for-the-badge&logo=javascript&logoColor=black">
  <img src="https://img.shields.io/badge/Chrome_Extension_MV3-4285F4?style=for-the-badge&logo=google-chrome&logoColor=white">
  <img src="https://img.shields.io/badge/Canvas_API-E34F26?style=for-the-badge&logo=html5&logoColor=white">
  <img src="https://img.shields.io/badge/LocalStorage-1572B6?style=for-the-badge&logo=css3&logoColor=white">
</div>

---

## 📥 Quick Install (Chrome / Edge / Brave)

> No Chrome Web Store listing — manual install keeps it free and open.

1. **Download & Unzip**
   Download the latest `detained-v2.0.0.zip` from the [Releases Page](../../releases/latest) and extract it.

2. **Enable Dev Mode**
   Go to `chrome://extensions` (or `edge://extensions`) and toggle **Developer Mode** on.

3. **Load Unpacked**
   Click **Load unpacked** and select the extracted folder.

4. **Open ERP**
   Go to your [Attendance Page](https://erp.psit.ac.in/Student/MyAttendanceDetail) — the extension activates automatically.

---

## 🔒 Privacy & Safety

> [!IMPORTANT]
> **Zero data leaves your browser.**
> All calculations happen locally using data already on the page you're viewing. No API calls, no servers, no tracking. Settings are saved in `localStorage` only.

---

<div align="center">

Made with 🚩 by **$hubh'24-'28**

[🌐 Website](https://whydetained.pages.dev) • [⭐ Star on GitHub](../../stargazers) • [🐛 Report a Bug](../../issues)

</div>

