(function () {
  // ─── IDs ──────────────────────────────────────────────────────────────────────
  const INLINE_ID = "psit-inline-attendance-tools";
  const POPUP_ID = "psit-inline-attendance-popup";
  const BIG_GRAPH_ID = "psit-big-attendance-graph";

  // ─── Defaults ─────────────────────────────────────────────────────────────────
  const DEFAULT_LECTURES_PER_DAY = 8;
  const SAFE_THRESHOLD_PERCENT = 75;
  const MAX_HISTORY_ENTRIES = 30;

  // ─── localStorage Keys ────────────────────────────────────────────────────────
  const K_THRESHOLD = "psit_attendance_goal_threshold";
  const K_LAST_DAY = "psit_attendance_last_academic_day";
  const K_SATURDAYS = "psit_attendance_open_saturdays";
  const K_LPD = "psit_lectures_per_day";         // lectures per day
  const K_HOLIDAYS = "psit_holidays";                  // Set of ISO date strings

  const K_HISTORY = "psit_history";
  const K_STREAK = "psit_streak";
  const K_CUSTOM_LPD = "psit_custom_lectures"; // Object: { "ISO-DATE": NumberOfLectures }
  const K_LAST_TOTAL = "psit_last_total_lectures"; // last seen totalLectures — for semester reset detection

  const K_UPDATE_DISMISSED = "detained_update_dismissed_v";


  // ═══════════════════════════════════════════════════════════════════════════════
  // SECTION 0 — UPDATE CHECKER
  // ═══════════════════════════════════════════════════════════════════════════════
  function isNewerVersion(remote, current) {
    const parse = v => v.split(".").map(Number);
    const [rMaj, rMin, rPatch] = parse(remote);
    const [cMaj, cMin, cPatch] = parse(current);
    if (rMaj !== cMaj) return rMaj > cMaj;
    if (rMin !== cMin) return rMin > cMin;
    return rPatch > cPatch;
  }

  function showUpdateBanner(popup, version, releaseUrl) {
    if (popup.querySelector("#detained-update-banner")) return;
    const banner = document.createElement("div");
    banner.id = "detained-update-banner";
    Object.assign(banner.style, {
      display: "flex", alignItems: "center", justifyContent: "space-between",
      background: "#fef3c7", border: "1px solid #fcd34d", borderRadius: "8px",
      padding: "6px 10px", marginBottom: "8px",
      fontSize: "12px", fontWeight: "700", color: "#92400e"
    });
    const msg = document.createElement("span");
    msg.innerHTML = `🆕 v${version} is out! <a href="${releaseUrl}" target="_blank" style="color:#9a3412;text-decoration:underline;cursor:pointer;">Download →</a>`;
    const closeBtn = document.createElement("button");
    closeBtn.textContent = "×";
    Object.assign(closeBtn.style, {
      background: "none", border: "none", cursor: "pointer",
      fontSize: "16px", color: "#92400e", fontWeight: "800", lineHeight: "1", padding: "0 2px"
    });
    closeBtn.addEventListener("click", () => {
      sessionStorage.setItem(K_UPDATE_DISMISSED + version, "1");
      banner.remove();
    });
    banner.appendChild(msg);
    banner.appendChild(closeBtn);
    popup.insertBefore(banner, popup.firstChild);
  }

  function checkForUpdate(popup) {
    if (popup.querySelector("#detained-update-banner")) return;
    const currentVersion = chrome.runtime.getManifest().version;
    const url = "https://whydetained.pages.dev/version.json";
    const xhr = new XMLHttpRequest();
    xhr.open("GET", url, true);
    xhr.onload = () => {
      try {
        const data = JSON.parse(xhr.responseText);
        console.log("[Detained?] Remote version:", data.version, "| Installed:", currentVersion);
        if (isNewerVersion(data.version, currentVersion) &&
            !sessionStorage.getItem(K_UPDATE_DISMISSED + data.version)) {
          showUpdateBanner(popup, data.version, data.releaseUrl);
        }
      } catch (e) { console.warn("[Detained?] Update parse failed:", e); }
    };
    xhr.onerror = () => console.warn("[Detained?] Update check failed");
    xhr.send();
  }

  // ═══════════════════════════════════════════════════════════════════════════════
  // SECTION 1 — TEXT SCRAPING
  // ═══════════════════════════════════════════════════════════════════════════════
  function getBodyText() {
    return document.body && document.body.innerText
      ? document.body.innerText.replace(/\s+/g, " ").trim()
      : "";
  }

  function findSummaryValue(labelText) {
    const escaped = labelText
      .replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
      .replace(/\s+/g, "\\s*");
    const regex = new RegExp(`${escaped}\\s*:?\\s*(-?\\d+(?:\\.\\d+)?)`, "i");
    const match = getBodyText().match(regex);
    return match ? Number.parseFloat(match[1]) : null;
  }

  // ═══════════════════════════════════════════════════════════════════════════════
  // SECTION 1.5 — TABLE PARSING
  // ═══════════════════════════════════════════════════════════════════════════════
  function parseAttendanceTable(totalLecturesSummary, totalAttendedSummary) {
    const table = document.getElementById("data-table-buttons");
    if (!table) return [];

    const rows = Array.from(table.querySelectorAll("tbody tr"));
    if (rows.length === 0) return [];

    // First pass: Calculate total lectures and attended in the VISIBLE table
    let tableTotalLectures = 0;
    let tableTotalAttended = 0;
    const rowStats = rows.map(row => {
      const cells = row.querySelectorAll("td");
      if (cells.length < 11) return null;
      let dayLectures = 0;
      let dayAttended = 0;
      for (let i = 2; i <= 10; i++) {
        const text = cells[i].textContent.trim().toUpperCase();
        const innerHTML = cells[i].innerHTML.toUpperCase();
        const isAbsent = text.includes("ABS") || innerHTML.includes("ABS");
        const isPresent = text === "M" || text === "P" || (text.length > 0 && !isAbsent);
        if (isAbsent) dayLectures++;
        else if (isPresent) { dayLectures++; dayAttended++; }
      }
      tableTotalLectures += dayLectures;
      tableTotalAttended += dayAttended;
      return { date: cells[1].textContent.trim(), dayLectures, dayAttended };
    }).filter(s => s !== null);

    // Calculate baseline (lectures occurred before the first row of the table)
    let cumulativeLectures = Math.max(0, (totalLecturesSummary || 0) - tableTotalLectures);
    let cumulativeAttended = Math.max(0, (totalAttendedSummary || 0) - tableTotalAttended);

    // If the table seems to contain the full history or summary is missing, start from 0
    if (totalLecturesSummary == null) {
      cumulativeLectures = 0;
      cumulativeAttended = 0;
    }

    const history = [];
    rowStats.forEach(stat => {
      if (stat.dayLectures > 0) {
        cumulativeLectures += stat.dayLectures;
        cumulativeAttended += stat.dayAttended;
        const percent = (cumulativeAttended / cumulativeLectures) * 100;
        history.push({ date: stat.date, percent });
      }
    });

    return history;
  }

  // Counts consecutive days (most-recent first) where student had zero absences
  function getStreakFromTable() {
    const table = document.getElementById("data-table-buttons");
    if (!table) return 0;
    const rows = Array.from(table.querySelectorAll("tbody tr"));

    // Find the most recent row that has an absence
    let lastAbsentDate = null;
    for (let i = rows.length - 1; i >= 0; i--) {
      const cells = rows[i].querySelectorAll("td");
      if (cells.length < 11) continue;
      for (let j = 2; j <= 10; j++) {
        const text = cells[j].textContent.trim().toUpperCase();
        const html = cells[j].innerHTML.toUpperCase();
        if (text.includes("ABS") || html.includes("ABS")) {
          // Parse date from cells[1], format: YYYY-MM-DD or DD-MM-YYYY
          const raw = cells[1].textContent.trim();
          const parts = raw.split(/[-\/]/);
          if (parts.length === 3) {
            // Detect YYYY-MM-DD vs DD-MM-YYYY
            const d = parts[0].length === 4
              ? new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]))
              : new Date(Number(parts[2]), Number(parts[1]) - 1, Number(parts[0]));
            if (!isNaN(d)) lastAbsentDate = d;
          }
          break;
        }
      }
      if (lastAbsentDate) break;
    }

    // Streak = calendar days from (lastAbsentDate + 1) to today
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    if (!lastAbsentDate) {
      // No absence ever — streak is total days since first entry
      const firstRow = rows.find(r => r.querySelectorAll("td").length >= 2);
      if (!firstRow) return 0;
      const raw = firstRow.querySelectorAll("td")[1].textContent.trim();
      const parts = raw.split(/[-\/]/);
      if (parts.length !== 3) return 0;
      const first = parts[0].length === 4
        ? new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]))
        : new Date(Number(parts[2]), Number(parts[1]) - 1, Number(parts[0]));
      first.setHours(0, 0, 0, 0);
      return Math.max(0, Math.floor((today - first) / 86400000) + 1);
    }

    lastAbsentDate.setHours(0, 0, 0, 0);
    const diff = Math.floor((today - lastAbsentDate) / 86400000);
    return Math.max(0, diff); // days since last absent (not counting the absent day itself)
  }
  // ═══════════════════════════════════════════════════════════════════════════════
  function normalizeGoalPercent(value) {
    const p = Number.parseInt(String(value), 10);
    return Number.isNaN(p) ? SAFE_THRESHOLD_PERCENT : Math.min(100, Math.max(1, p));
  }

  function getStoredGoalPercent() {
    try {
      const raw = window.localStorage.getItem(K_THRESHOLD);
      return raw === null ? SAFE_THRESHOLD_PERCENT : normalizeGoalPercent(raw);
    } catch { return SAFE_THRESHOLD_PERCENT; }
  }

  function setStoredGoalPercent(value) {
    try { window.localStorage.setItem(K_THRESHOLD, String(normalizeGoalPercent(value))); } catch { }
  }

  function getStoredLecturesPerDay() {
    try {
      const raw = window.localStorage.getItem(K_LPD);
      if (!raw) return DEFAULT_LECTURES_PER_DAY;
      const n = Number.parseInt(raw, 10);
      return Number.isNaN(n) || n < 1 || n > 30 ? DEFAULT_LECTURES_PER_DAY : n;
    } catch { return DEFAULT_LECTURES_PER_DAY; }
  }

  function setStoredLecturesPerDay(value) {
    try {
      const n = Number.parseInt(String(value), 10);
      if (!Number.isNaN(n) && n >= 1 && n <= 30) {
        window.localStorage.setItem(K_LPD, String(n));
      }
    } catch { }
  }

  function getStoredLastAcademicDay() {
    try { return window.localStorage.getItem(K_LAST_DAY) || ""; } catch { return ""; }
  }

  function setStoredLastAcademicDay(value) {
    try {
      if (!value) { window.localStorage.removeItem(K_LAST_DAY); return; }
      window.localStorage.setItem(K_LAST_DAY, value);
    } catch { }
  }

  function getStoredOpenSaturdays() {
    try {
      const raw = window.localStorage.getItem(K_SATURDAYS);
      if (!raw) return {};
      const p = JSON.parse(raw);
      return p && typeof p === "object" ? p : {};
    } catch { return {}; }
  }

  function setStoredOpenSaturdays(map) {
    try { window.localStorage.setItem(K_SATURDAYS, JSON.stringify(map || {})); } catch { }
  }

  function getStoredHolidays() {
    try {
      const raw = window.localStorage.getItem(K_HOLIDAYS);
      if (!raw) return new Set();
      const arr = JSON.parse(raw);
      return Array.isArray(arr) ? new Set(arr) : new Set();
    } catch { return new Set(); }
  }

  function setStoredHolidays(set) {
    try { window.localStorage.setItem(K_HOLIDAYS, JSON.stringify([...set])); } catch { }
  }

  function getStoredCustomLectures() {
    try {
      const raw = window.localStorage.getItem(K_CUSTOM_LPD);
      if (!raw) return {};
      const p = JSON.parse(raw);
      return p && typeof p === "object" ? p : {};
    } catch { return {}; }
  }

  function setStoredCustomLectures(map) {
    try { window.localStorage.setItem(K_CUSTOM_LPD, JSON.stringify(map || {})); } catch { }
  }

  function saveHistoryAndCurrent(percent, goalPercent, totalLectures) {
    const today = toIsoDate(getTodayAcademicDay());
    try {
      // Semester reset detection: if totalLectures dropped to ≤ 8 from a previously high value, clear history
      const lastTotal = Number.parseInt(window.localStorage.getItem(K_LAST_TOTAL) || "0", 10);
      if (totalLectures != null && lastTotal > 8 && totalLectures <= 8) {
        window.localStorage.removeItem(K_HISTORY);
        window.localStorage.removeItem(K_STREAK);
      }
      if (totalLectures != null) {
        window.localStorage.setItem(K_LAST_TOTAL, String(totalLectures));
      }
      const historyRaw = window.localStorage.getItem(K_HISTORY);
      const history = historyRaw ? JSON.parse(historyRaw) : [];
      const last = history[history.length - 1];

      if (last && last.date === today) {
        history[history.length - 1].percent = percent;
      } else {
        history.push({ date: today, percent });
        if (history.length > MAX_HISTORY_ENTRIES) {
          history.splice(0, history.length - MAX_HISTORY_ENTRIES);
        }
      }

      // Calculate streak: consecutive days where % didn't drop
      let streak = 0;
      for (let i = history.length - 1; i > 0; i--) {
        if (history[i].percent >= history[i - 1].percent) streak++;
        else break;
      }

      window.localStorage.setItem(K_HISTORY, JSON.stringify(history));
      window.localStorage.setItem(K_STREAK, String(streak));
    } catch (e) { console.error("Detained? storage error:", e); }
  }

  function loadHistory(cb) {
    try {
      const historyRaw = window.localStorage.getItem(K_HISTORY);
      const streakRaw = window.localStorage.getItem(K_STREAK);
      const history = historyRaw ? JSON.parse(historyRaw) : [];
      const streak = streakRaw ? Number.parseInt(streakRaw, 10) : 0;
      cb(history, isNaN(streak) ? 0 : streak);
    } catch (e) {
      cb([], 0);
    }
  }



  // ═══════════════════════════════════════════════════════════════════════════════
  // SECTION 4 — DATE UTILITIES
  // ═══════════════════════════════════════════════════════════════════════════════
  function getTodayAtMidnight() {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), now.getDate());
  }

  // Academic day boundary: shifts to next day at 09:25 AM (first class time)
  function getTodayAcademicDay() {
    const now = new Date();
    const hours = now.getHours();
    const minutes = now.getMinutes();
    
    // Before 09:25 AM, return yesterday's date
    if (hours < 9 || (hours === 9 && minutes < 25)) {
      const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
      return yesterday;
    }
    
    // 09:25 AM or later, return today's date
    return new Date(now.getFullYear(), now.getMonth(), now.getDate());
  }

  // Get count of lectures already completed today (0-8)
  function getCompletedLecturesToday() {
    const now = new Date();
    const hours = now.getHours();
    const minutes = now.getMinutes();
    const totalMinutes = hours * 60 + minutes;

    // Class schedule (in minutes from midnight):
    // 1st: 09:25-10:15 (565-615)
    // 2nd: 10:15-11:05 (615-665)
    // 3rd: 11:15-12:05 (675-725)
    // 4th: 12:05-12:55 (725-775)
    // 5th: 01:45-02:30 (105-150, but 13:45-14:30 = 825-870 in 24h)
    // 6th: 02:30-03:15 (150-195, but 14:30-15:15 = 870-915)
    // 7th: 03:25-04:10 (205-250, but 15:25-16:10 = 925-970)
    // 8th: 04:10-04:55 (250-295, but 16:10-16:55 = 970-1015)
    
    const lectureEndTimes = [
      615,   // 1st: 10:15
      665,   // 2nd: 11:05
      725,   // 3rd: 12:05
      775,   // 4th: 12:55
      870,   // 5th: 14:30
      915,   // 6th: 15:15
      970,   // 7th: 16:10
      1015   // 8th: 16:55
    ];

    let completed = 0;
    for (let i = 0; i < lectureEndTimes.length; i++) {
      if (totalMinutes >= lectureEndTimes[i]) {
        completed++;
      } else {
        break;
      }
    }

    return completed;
  }

  function toIsoDate(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }

  function parseIsoDate(value) {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || ""));
    if (!match) return null;
    return new Date(
      Number.parseInt(match[1], 10),
      Number.parseInt(match[2], 10) - 1,
      Number.parseInt(match[3], 10)
    );
  }

  function listSaturdaysBetween(startDate, endDate) {
    const saturdays = [];
    if (!startDate || !endDate || endDate < startDate) return saturdays;
    const cursor = new Date(startDate);
    while (cursor <= endDate) {
      if (cursor.getDay() === 6) saturdays.push(new Date(cursor));
      cursor.setDate(cursor.getDate() + 1);
    }
    return saturdays;
  }

  // ═══════════════════════════════════════════════════════════════════════════════
  // SECTION 5 — CLASS DAY COUNTING (now supports custom lecture overrides)
  // ═══════════════════════════════════════════════════════════════════════════════
  function calculateTotalFutureLectures(startDate, endDate, openSaturdaysSet, holidaysSet, customLecturesMap, defaultLpd) {
    if (!startDate || !endDate || endDate < startDate) return 0;
    let total = 0;
    const cursor = new Date(startDate);
    const hols = holidaysSet || new Set();
    const customs = customLecturesMap || {};
    while (cursor <= endDate) {
      const day = cursor.getDay();
      const iso = toIsoDate(cursor);
      const isWeekday = day >= 1 && day <= 5;
      const isOpenSat = day === 6 && openSaturdaysSet.has(iso);
      if ((isWeekday || isOpenSat) && !hols.has(iso)) {
        total += (customs[iso] !== undefined) ? customs[iso] : defaultLpd;
      }
      cursor.setDate(cursor.getDate() + 1);
    }
    return total;
  }

  function countScheduledClassDays(startDate, endDate, openSaturdaysSet, holidaysSet) {
    if (!startDate || !endDate || endDate < startDate) return 0;
    let count = 0;
    const cursor = new Date(startDate);
    const hols = holidaysSet || new Set();
    while (cursor <= endDate) {
      const day = cursor.getDay();
      const iso = toIsoDate(cursor);
      const isWeekday = day >= 1 && day <= 5;
      const isOpenSat = day === 6 && openSaturdaysSet.has(iso);
      if ((isWeekday || isOpenSat) && !hols.has(iso)) count++;
      cursor.setDate(cursor.getDate() + 1);
    }
    return count;
  }

  // ═══════════════════════════════════════════════════════════════════════════════
  // SECTION 6 — ATTENDANCE CALCULATIONS
  // ═══════════════════════════════════════════════════════════════════════════════
  function getCurrentAttended(totalLectures, totalAbsent) {
    const oaAttendance = findSummaryValue("O.A. Attendance");
    const effectiveAbsent = Math.max(0, totalAbsent - (oaAttendance || 0));
    return Math.max(0, totalLectures - effectiveAbsent);
  }

  function getLeaveAllowance(totalLectures, totalAbsent, goalPercent, lecturesPerDay) {
    const attended = getCurrentAttended(totalLectures, totalAbsent);
    const threshold = normalizeGoalPercent(goalPercent);
    const lpd = lecturesPerDay || getStoredLecturesPerDay();
    const maxMissableLectures = Math.max(
      0,
      Math.floor((attended * 100) / threshold - totalLectures)
    );
    return {
      maxMissableLectures,
      days: Math.floor(maxMissableLectures / lpd),
      lectures: maxMissableLectures % lpd
    };
  }

  function getRecoveryLectures(totalLectures, totalAbsent, goalPercent) {
    const attended = getCurrentAttended(totalLectures, totalAbsent);
    const g = normalizeGoalPercent(goalPercent) / 100;
    const currentPct = (attended / totalLectures) * 100;
    if (currentPct >= goalPercent) return null; // Already safe
    if (g >= 1) return Infinity; // 100% goal is impossible if any absences exist
    // Solve: (attended + n) / (totalLectures + n) >= g
    const n = Math.ceil((g * totalLectures - attended) / (1 - g));
    return Math.max(0, n);
  }

  function allowanceFromLectureCount(count, lecturesPerDay) {
    const lpd = lecturesPerDay || getStoredLecturesPerDay();
    const safe = Math.max(0, count);
    return { maxMissableLectures: safe, days: Math.floor(safe / lpd), lectures: safe % lpd };
  }

  function parseNonNegativeInt(rawValue, fallback) {
    const digits = String(rawValue || "").replace(/[^\d]/g, "");
    if (!digits) return fallback;
    return Math.max(0, Number.parseInt(digits, 10));
  }

  // ═══════════════════════════════════════════════════════════════════════════════
  // SECTION 7 — STATUS / BADGE / TOAST
  // ═══════════════════════════════════════════════════════════════════════════════
  function getStatusInfo(percent, goalPercent) {
    const diff = percent - goalPercent;
    if (diff >= 5) return { emoji: "🟢", label: "SAFE", color: "#16a34a", bg: "#dcfce7", border: "#86efac" };
    if (diff >= 0) return { emoji: "🟡", label: "CLOSE", color: "#b45309", bg: "#fef9c3", border: "#fde047" };
    return { emoji: "🔴", label: "BELOW GOAL", color: "#dc2626", bg: "#fee2e2", border: "#fca5a5" };
  }

  function createStatusBadge(percent, goalPercent) {
    const s = getStatusInfo(percent, goalPercent);
    const b = document.createElement("span");
    Object.assign(b.style, {
      display: "inline-flex", alignItems: "center", gap: "3px",
      padding: "3px 8px", borderRadius: "999px", fontSize: "11px", fontWeight: "800",
      color: s.color, background: s.bg, border: `1px solid ${s.border}`,
      whiteSpace: "nowrap", flexShrink: "0"
    });
    b.textContent = `${s.emoji} ${s.label}`;
    return b;
  }

  function createStreakBadge(streak) {
    if (!streak || streak <= 0) return null;
    const b = document.createElement("span");
    Object.assign(b.style, {
      display: "inline-flex", alignItems: "center", gap: "3px",
      padding: "3px 8px", borderRadius: "999px", fontSize: "11px", fontWeight: "800",
      color: "#c2410c", background: "#fff7ed", border: "1px solid #fdba74",
      whiteSpace: "nowrap"
    });
    b.textContent = `🔥 ${streak}d streak`;
    return b;
  }

  function showToastAlert(msg, type) {
    const existing = document.getElementById("psit-toast");
    if (existing) existing.remove();

    if (!document.getElementById("psit-keyframes")) {
      const style = document.createElement("style");
      style.id = "psit-keyframes";
      style.textContent = `
        @keyframes psit-slide-in  { from { transform: translateX(120%); opacity:0; } to { transform: translateX(0); opacity:1; } }
        @keyframes psit-slide-out { from { transform: translateX(0); opacity:1; } to { transform: translateX(120%); opacity:0; } }
      `;
      document.head.appendChild(style);
    }

    const colors = {
      danger: { bg: "#fee2e2", border: "#fca5a5", text: "#991b1b" },
      warning: { bg: "#fef9c3", border: "#fde047", text: "#854d0e" },
      success: { bg: "#dcfce7", border: "#86efac", text: "#166534" }
    };
    const c = colors[type] || colors.danger;

    const toast = document.createElement("div");
    toast.id = "psit-toast";
    Object.assign(toast.style, {
      position: "fixed", bottom: "24px", right: "24px", zIndex: "2147483647",
      padding: "12px 16px", borderRadius: "12px", maxWidth: "310px",
      background: c.bg, border: `1px solid ${c.border}`, color: c.text,
      fontSize: "13px", fontWeight: "700", fontFamily: "system-ui,sans-serif",
      boxShadow: "0 8px 24px rgba(0,0,0,0.15)",
      animation: "psit-slide-in 0.35s cubic-bezier(0.175,0.885,0.32,1.275) forwards",
      cursor: "pointer"
    });
    toast.textContent = msg;
    toast.addEventListener("click", () => toast.remove());
    document.body.appendChild(toast);

    setTimeout(() => {
      if (!toast.isConnected) return;
      toast.style.animation = "psit-slide-out 0.3s ease-in forwards";
      setTimeout(() => toast.remove(), 320);
    }, 5500);
  }

  // ═══════════════════════════════════════════════════════════════════════════════
  // SECTION 8 — CANVAS GRAPH DRAWING
  // ═══════════════════════════════════════════════════════════════════════════════
  function drawAttendanceGraph(canvas, history, goalPercent, attendedNow, totalNow, lastDayDate, lecturesPerDay, openSatSet, holidaysSet, customLpdMap, plannedMissedLectures) {
    const ctx = canvas.getContext("2d");
    const W = canvas.width;
    const H = canvas.height;
    const PAD = { top: 32, right: 20, bottom: 54, left: 46 };

    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, W, H);

    // Build predicted points — one per future class day
    // If plannedMissedLectures > 0, spread those absences evenly from the start
    const predictedPoints = [];
    if (lastDayDate && attendedNow != null && totalNow != null) {
      const today = getTodayAcademicDay();
      if (lastDayDate > today) {
        const customs = customLpdMap || {};
        const hols = holidaysSet || new Set();
        const missed = Math.max(0, plannedMissedLectures || 0);
        const completedToday = getCompletedLecturesToday();
        let accAttended = attendedNow;
        let accTotal = totalNow;
        let missedLeft = missed;
        // Start from today (inclusive) to match planner — subtract already-completed lectures
        const cursor = new Date(today);
        while (cursor <= lastDayDate) {
          const iso = toIsoDate(cursor);
          const dow = cursor.getDay();
          const isWeekday = dow >= 1 && dow <= 5;
          const isOpenSat = dow === 6 && openSatSet.has(iso);
          if ((isWeekday || isOpenSat) && !hols.has(iso)) {
            let lec = (customs[iso] !== undefined) ? customs[iso] : lecturesPerDay;
            // For today, only count remaining (not-yet-completed) lectures
            if (iso === toIsoDate(today)) lec = Math.max(0, lec - completedToday);
            if (lec > 0) {
              accTotal += lec;
              const absent = Math.min(lec, missedLeft);
              missedLeft -= absent;
              accAttended += (lec - absent);
              predictedPoints.push({ date: iso, percent: Math.min(100, (accAttended / accTotal) * 100) });
            }
          }
          cursor.setDate(cursor.getDate() + 1);
        }
      }
    }

    const allPercents = [
      ...history.map(h => h.percent),
      ...predictedPoints.map(p => p.percent),
      goalPercent
    ];
    if (allPercents.length === 0) return [];

    const minY = Math.max(0, Math.min(...allPercents) - 4);
    const maxY = Math.min(100, Math.max(...allPercents) + 3);
    const range = maxY - minY || 1;

    const plotW = W - PAD.left - PAD.right;
    const plotH = H - PAD.top - PAD.bottom;

    // All renderable points with global index
    const allPoints = [
      ...history.map((h, i) => ({ date: h.date, percent: h.percent, idx: i, isPredicted: false })),
      ...predictedPoints.map((p, i) => ({ date: p.date, percent: p.percent, idx: history.length + i, isPredicted: true }))
    ];
    const totalCount = allPoints.length;
    if (totalCount === 0) return [];

    function xPos(idx) {
      if (totalCount === 1) return PAD.left + plotW / 2;
      return PAD.left + (idx / (totalCount - 1)) * plotW;
    }
    function yPos(p) {
      return PAD.top + (1 - (p - minY) / range) * plotH;
    }

    // ── Y grid + labels ──
    const yStep = range > 30 ? 10 : range > 12 ? 5 : 2;
    ctx.strokeStyle = "rgba(253,186,116,0.25)";
    ctx.lineWidth = 0.5;
    ctx.setLineDash([]);
    ctx.fillStyle = "#9ca3af";
    ctx.font = "9px system-ui";
    ctx.textAlign = "right";
    for (let y = Math.ceil(minY / yStep) * yStep; y <= maxY; y += yStep) {
      const py = yPos(y);
      ctx.beginPath(); ctx.moveTo(PAD.left, py); ctx.lineTo(W - PAD.right, py); ctx.stroke();
      ctx.fillText(`${Math.round(y)}%`, PAD.left - 4, py + 3);
    }

    // ── X grid (vertical lines at label positions) ──
    const maxXLabels = Math.max(2, Math.floor(plotW / 58));
    const xStep = Math.max(1, Math.ceil(totalCount / maxXLabels));
    const xLabelIndices = new Set();
    for (let i = 0; i < totalCount; i += xStep) xLabelIndices.add(i);
    xLabelIndices.add(0);
    xLabelIndices.add(totalCount - 1);

    ctx.strokeStyle = "rgba(253,186,116,0.18)";
    ctx.lineWidth = 0.5;
    for (const i of xLabelIndices) {
      const px = xPos(i);
      ctx.beginPath(); ctx.moveTo(px, PAD.top); ctx.lineTo(px, H - PAD.bottom); ctx.stroke();
    }

    // ── Goal line ──
    const thY = yPos(goalPercent);
    ctx.save();
    ctx.strokeStyle = "#f59e0b";
    ctx.lineWidth = 1.5;
    ctx.setLineDash([5, 4]);
    ctx.beginPath(); ctx.moveTo(PAD.left, thY); ctx.lineTo(W - PAD.right, thY); ctx.stroke();
    ctx.restore();
    ctx.setLineDash([]);
    ctx.fillStyle = "#b45309";
    ctx.font = "bold 9px system-ui";
    ctx.textAlign = "left";
    ctx.fillText(`Goal ${goalPercent}%`, PAD.left + 4, thY - 3);

    // ── History area fill ──
    if (history.length >= 2) {
      ctx.beginPath();
      ctx.moveTo(xPos(0), H - PAD.bottom);
      history.forEach((h, i) => ctx.lineTo(xPos(i), yPos(h.percent)));
      ctx.lineTo(xPos(history.length - 1), H - PAD.bottom);
      ctx.closePath();
      const grad = ctx.createLinearGradient(0, PAD.top, 0, H - PAD.bottom);
      grad.addColorStop(0, "rgba(8,145,178,0.18)");
      grad.addColorStop(1, "rgba(8,145,178,0)");
      ctx.fillStyle = grad;
      ctx.fill();
    }

    // ── History line ──
    if (history.length >= 1) {
      ctx.save();
      ctx.strokeStyle = "#0891b2";
      ctx.lineWidth = 2;
      ctx.lineJoin = "round";
      ctx.lineCap = "round";
      ctx.setLineDash([]);
      ctx.beginPath();
      history.forEach((h, i) => {
        if (i === 0) ctx.moveTo(xPos(i), yPos(h.percent));
        else ctx.lineTo(xPos(i), yPos(h.percent));
      });
      ctx.stroke();
      ctx.restore();

      // Dots for every history point
      history.forEach((h, i) => {
        const x = xPos(i);
        const y = yPos(h.percent);
        const isLast = i === history.length - 1;
        ctx.beginPath();
        ctx.arc(x, y, isLast ? 4.5 : 3, 0, Math.PI * 2);
        ctx.fillStyle = "#0891b2";
        ctx.fill();
        ctx.strokeStyle = "#fff";
        ctx.lineWidth = 1.2;
        ctx.stroke();
      });
    }

    // ── Predicted line ──
    if (predictedPoints.length > 0) {
      const startX = xPos(history.length > 0 ? history.length - 1 : 0);
      const startY = history.length > 0 ? yPos(history[history.length - 1].percent) : yPos(predictedPoints[0].percent);
      ctx.save();
      ctx.strokeStyle = "#e11d48";
      ctx.lineWidth = 1.5;
      ctx.setLineDash([6, 4]);
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(startX, startY);
      predictedPoints.forEach((p, i) => ctx.lineTo(xPos(history.length + i), yPos(p.percent)));
      ctx.stroke();
      ctx.restore();

      // Dots for every predicted point
      predictedPoints.forEach((p, i) => {
        const x = xPos(history.length + i);
        const y = yPos(p.percent);
        const isLast = i === predictedPoints.length - 1;
        ctx.beginPath();
        ctx.arc(x, y, isLast ? 4.5 : 2.5, 0, Math.PI * 2);
        ctx.fillStyle = "#e11d48";
        ctx.fill();
        ctx.strokeStyle = "#fff";
        ctx.lineWidth = 1;
        ctx.stroke();
      });

      // End value label
      const lastPred = predictedPoints[predictedPoints.length - 1];
      const endX = xPos(history.length + predictedPoints.length - 1);
      const endY = yPos(lastPred.percent);
      ctx.setLineDash([]);
      ctx.fillStyle = "#be123c";
      ctx.font = "bold 9px system-ui";
      ctx.textAlign = "right";
      ctx.fillText(`${lastPred.percent.toFixed(1)}%`, endX - 2, endY - 8);
    }

    // ── Axes ──
    ctx.strokeStyle = "#fdba74";
    ctx.lineWidth = 1.5;
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.moveTo(PAD.left, PAD.top - 4);
    ctx.lineTo(PAD.left, H - PAD.bottom);
    ctx.lineTo(W - PAD.right, H - PAD.bottom);
    ctx.stroke();

    // ── X-axis date labels (rotated) ──
    for (const i of xLabelIndices) {
      const pt = allPoints[i];
      if (!pt || !pt.date) continue;
      const px = xPos(i);
      const label = pt.date.slice(5); // MM-DD
      ctx.save();
      ctx.translate(px, H - PAD.bottom + 5);
      ctx.rotate(-Math.PI / 4);
      ctx.textAlign = "right";
      ctx.font = "9px system-ui";
      ctx.fillStyle = pt.isPredicted ? "#e11d48" : "#6b7280";
      ctx.fillText(label, 0, 0);
      ctx.restore();
    }

    // ── Legend ──
    ctx.setLineDash([]);
    ctx.font = "bold 8px system-ui";
    ctx.textAlign = "left";
    ctx.fillStyle = "#0891b2";
    ctx.fillRect(PAD.left, 14, 14, 3);
    ctx.fillStyle = "#374151";
    ctx.fillText("Actual", PAD.left + 18, 17);
    if (predictedPoints.length > 0) {
      ctx.save();
      ctx.strokeStyle = "#e11d48";
      ctx.lineWidth = 1.5;
      ctx.setLineDash([4, 3]);
      ctx.beginPath();
      ctx.moveTo(PAD.left + 62, 13);
      ctx.lineTo(PAD.left + 76, 13);
      ctx.stroke();
      ctx.restore();
      ctx.setLineDash([]);
      ctx.fillStyle = "#374151";
      ctx.fillText(plannedMissedLectures > 0 ? `Predicted (${plannedMissedLectures} lec absent)` : "Predicted (no absences)", PAD.left + 80, 17);
    }

    // Return hit-test points for hover tooltip
    return allPoints.map(pt => ({
      x: xPos(pt.idx),
      y: yPos(pt.percent),
      date: pt.date || "",
      percent: pt.percent,
      isPredicted: pt.isPredicted
    }));
  }

  // ═══════════════════════════════════════════════════════════════════════════════
  // SECTION 9 — SMALL UI BUILDERS
  // ═══════════════════════════════════════════════════════════════════════════════
  function createInfoChip(labelText, valueText) {
    const chip = document.createElement("span");
    Object.assign(chip.style, {
      display: "inline-flex", alignItems: "center", gap: "6px",
      padding: "6px 10px", borderRadius: "999px", background: "#fff",
      border: "1px solid #fed7aa", color: "#9a3412", fontWeight: "700", fontSize: "14px",
      minWidth: "160px", justifyContent: "center", flexShrink: "0"
    });
    const value = document.createElement("span");
    value.textContent = valueText;
    value.style.color = "#111827";
    if (labelText) {
      const label = document.createElement("span");
      label.textContent = labelText;
      chip.appendChild(label);
    }
    chip.appendChild(value);
    return chip;
  }

  function createDeltaChip(text, isPositive) {
    const chip = document.createElement("span");
    Object.assign(chip.style, {
      display: "inline-flex", alignItems: "center", gap: "4px",
      padding: "6px 8px", borderRadius: "999px", fontWeight: "700", fontSize: "12px",
      border: isPositive ? "1px solid #86efac" : "1px solid #fca5a5",
      background: isPositive ? "#dcfce7" : "#fee2e2",
      color: isPositive ? "#166534" : "#991b1b",
      flexShrink: "0"
    });
    chip.textContent = text;
    return chip;
  }

  function createPopupNumberInput(defaultValue, minValue, maxValue) {
    const input = document.createElement("input");
    input.type = "number";
    input.inputMode = "decimal";
    input.autocomplete = "off";
    input.spellcheck = false;
    if (typeof minValue === "number") input.min = String(minValue);
    if (typeof maxValue === "number") input.max = String(maxValue);
    input.step = "1";
    input.value = String(defaultValue);
    Object.assign(input.style, {
      width: "70px", padding: "6px 8px", borderRadius: "8px",
      border: "1px solid #cbd5e1", background: "#fff", color: "#111827",
      fontSize: "13px", fontWeight: "700"
    });
    input.addEventListener("keydown", e => e.stopPropagation());
    return input;
  }

  function createPopupField(labelText, input) {
    const row = document.createElement("label");
    Object.assign(row.style, {
      display: "flex", alignItems: "center", justifyContent: "space-between",
      gap: "10px", fontSize: "13px", fontWeight: "700", color: "#9a3412"
    });
    const label = document.createElement("span");
    label.textContent = labelText;
    row.appendChild(label);
    row.appendChild(input);
    return row;
  }

  function formatLeaveMessage(allowance) {
    const dw = allowance.days === 1 ? "day" : "days";
    const lw = allowance.lectures === 1 ? "Lecture" : "Lectures";
    if (allowance.days > 0 && allowance.lectures > 0) return `can leave ${allowance.days} ${dw} ${allowance.lectures} ${lw}`;
    if (allowance.days > 0) return `can leave ${allowance.days} ${dw}`;
    if (allowance.lectures > 0) return `can leave ${allowance.lectures} ${lw}`;
    return "no more leaves";
  }

  function findAttendanceContainer() {
    const strongs = Array.from(document.querySelectorAll("span.text-inverse strong, strong"));
    const match = strongs.find(el => (el.textContent || "").replace(/\s+/g, " ").trim().includes("Attendance % with PF"));
    if (match) return match;
    const all = Array.from(document.querySelectorAll("div, td, p, span"));
    return all.find(el => (el.textContent || "").replace(/\s+/g, " ").trim().includes("Attendance % with PF")) || null;
  }

  // ═══════════════════════════════════════════════════════════════════════════════
  // SECTION 10 — MAIN RENDER
  // ═══════════════════════════════════════════════════════════════════════════════
  function renderInlineTools(container, totalLectures, totalAbsent, currentPercent) {
    let graphNeedsRedraw = true;
    const existing = document.getElementById(INLINE_ID);
    if (existing) existing.remove();
    const oldPopup = document.getElementById(POPUP_ID);
    if (oldPopup) oldPopup.remove();

    const sig = document.createElement("div");
    sig.innerHTML = `DET<span style="color:#f97316">AINED?</span> — $hubh`;
    Object.assign(sig.style, {
      marginTop: "12px", borderTop: "1px solid #fed7aa", paddingTop: "8px",
      fontSize: "10px", fontWeight: "800", color: "#9ca3af",
      textAlign: "right", letterSpacing: "0.5px"
    });

    const storedGoalPercent = getStoredGoalPercent();
    const storedLpd = getStoredLecturesPerDay();
    const attended = getCurrentAttended(totalLectures, totalAbsent);
    const basePercent = (attended / totalLectures) * 100;
    const allowance = getLeaveAllowance(totalLectures, totalAbsent, storedGoalPercent, storedLpd);
    const recoveryNeeded = getRecoveryLectures(totalLectures, totalAbsent, storedGoalPercent);

    const upDelta = ((attended + 1) / (totalLectures + 1)) * 100 - basePercent;
    const downDelta = (attended / (totalLectures + 1)) * 100 - basePercent;

    // ── Wrapper (inline bar) ──
    const wrapper = document.createElement("div");
    wrapper.id = INLINE_ID;
    Object.assign(wrapper.style, {
      display: "inline-flex", flexDirection: "row", flexWrap: "nowrap",
      alignItems: "center", justifyContent: "center", gap: "8px",
      marginLeft: "8px", marginTop: "0",
      padding: "6px 10px", borderRadius: "12px",
      background: "#fff7ed", border: "1px solid #fdba74",
      verticalAlign: "top", whiteSpace: "nowrap", position: "relative",
      width: "630px", flexShrink: "0", overflow: "visible"
    });

    const statusBadge = createStatusBadge(basePercent, storedGoalPercent);
    const leaveChip = createInfoChip("", formatLeaveMessage(allowance));
    const upChip = createDeltaChip(`▲ +${upDelta.toFixed(2)}%`, true);
    const downChip = createDeltaChip(`▼ ${downDelta.toFixed(2)}%`, false);

    // Streak from ERP table directly
    const streak = getStreakFromTable();
    const streakBadge = createStreakBadge(streak);

    loadHistory((history, _streak) => {
      // Trigger toast on page load
      if (basePercent < storedGoalPercent) {
        const rl = recoveryNeeded;
        showToastAlert(
          `🔴 You're at ${basePercent.toFixed(1)}% — below ${storedGoalPercent}%. ` +
          (rl != null ? `Attend next ${rl} lecture${rl === 1 ? "" : "s"} to recover.` : ""),
          "danger"
        );
      } else if (basePercent - storedGoalPercent < 5) {
        showToastAlert(
          `🟡 Cutting it close at ${basePercent.toFixed(1)}%. Only ${(basePercent - storedGoalPercent).toFixed(1)}% above goal!`,
          "warning"
        );
      }

      // Draw graph once dropdown is opened for the first time
      graphNeedsRedraw = true;
    });

    // ── Toggle button ──
    const toggleBtn = document.createElement("button");
    toggleBtn.type = "button";
    toggleBtn.textContent = "▼";
    Object.assign(toggleBtn.style, {
      width: "24px", height: "24px", border: "1px solid #fdba74",
      borderRadius: "999px", background: "#fff", color: "#9a3412",
      fontWeight: "800", fontSize: "12px", cursor: "pointer",
      display: "inline-flex", alignItems: "center", justifyContent: "center"
    });

    // ─────────────────────────────────────────────────────────────────────────────
    // DROPDOWN POPUP
    // ─────────────────────────────────────────────────────────────────────────────
    const popup = document.createElement("div");
    popup.id = POPUP_ID;
    Object.assign(popup.style, {
      position: "absolute", top: "calc(100% + 8px)", left: "0",
      width: "100%", padding: "10px", borderRadius: "12px",
      border: "1px solid #fdba74", background: "#fff7ed", boxSizing: "border-box",
      boxShadow: "0 8px 24px rgba(0,0,0,0.12)", display: "none", zIndex: "2147483647"
    });

    checkForUpdate(popup);

    function sectionBox(title) {
      const box = document.createElement("div");
      Object.assign(box.style, {
        border: "1px solid #fed7aa", borderRadius: "10px",
        padding: "8px", background: "#fff", marginBottom: "8px"
      });
      if (title) {
        const h = document.createElement("div");
        h.textContent = title;
        Object.assign(h.style, { fontSize: "12px", fontWeight: "800", color: "#9a3412", marginBottom: "6px" });
        box.appendChild(h);
      }
      return box;
    }

    function outputDiv() {
      const d = document.createElement("div");
      Object.assign(d.style, { fontSize: "13px", fontWeight: "700", color: "#7c2d12", marginTop: "6px" });
      return d;
    }

    // ── Stored values ──
    const storedLastDay = getStoredLastAcademicDay();
    const todayIso = toIsoDate(getTodayAcademicDay());

    // Returns the minimum selectable ISO date for all calendars/inputs.
    // After all lectures are done (>= 4:55 PM), today itself is not selectable.
    function getMinSelectableIso() {
      const lpd0 = getStoredLecturesPerDay();
      const clpd0 = getStoredCustomLectures();
      const tLpd = (clpd0 && clpd0[todayIso] !== undefined) ? clpd0[todayIso] : lpd0;
      const allDone = getCompletedLecturesToday() >= tLpd;
      if (allDone) {
        const d = new Date(getTodayAcademicDay());
        d.setDate(d.getDate() + 1);
        return toIsoDate(d);
      }
      return todayIso;
    }

    // ── Section A: Scenario Simulator ──
    const secA = sectionBox("Scenario Simulator");

    const goalInput = createPopupNumberInput(storedGoalPercent, 1, 100);
    const daysInput = createPopupNumberInput(0, 0);
    const lecturesInput = createPopupNumberInput(0, 0);

    const outPredicted = outputDiv();
    const outRemaining = outputDiv();
    const outRecovery = outputDiv();

    secA.appendChild(createPopupField("Goal %", goalInput));
    secA.appendChild(createPopupField("Days to skip", daysInput));
    secA.appendChild(createPopupField("lectures to skip", lecturesInput));
    secA.appendChild(outPredicted);
    secA.appendChild(outRemaining);
    secA.appendChild(outRecovery);

    // ── Section B: Academic Planner ──
    const secB = sectionBox("Academic Planner");

    const lastDayInput = document.createElement("input");
    lastDayInput.type = "date";
    lastDayInput.min = getMinSelectableIso();
    lastDayInput.value = storedLastDay || todayIso;
    Object.assign(lastDayInput.style, {
      width: "130px", padding: "6px 8px", borderRadius: "8px",
      border: "1px solid #cbd5e1", background: "#fff", color: "#111827",
      fontSize: "13px", fontWeight: "700"
    });

    const satToggle = document.createElement("button");
    satToggle.type = "button";
    satToggle.textContent = "Saturdays ▾";
    Object.assign(satToggle.style, {
      padding: "6px 7px", borderRadius: "8px", border: "1px solid #fdba74",
      background: "#fff", color: "#9a3412", fontSize: "11px",
      fontWeight: "700", cursor: "pointer", height: "32px", minWidth: "80px", flexShrink: "0"
    });

    const satList = document.createElement("div");
    Object.assign(satList.style, {
      display: "none", maxHeight: "100px", overflowY: "auto",
      border: "1px solid #fed7aa", borderRadius: "8px",
      padding: "6px", background: "#fff", marginTop: "4px"
    });

    // ── Holiday Exclusions ──
    const holToggle = document.createElement("button");
    holToggle.type = "button";
    holToggle.textContent = "Holidays ▾";
    Object.assign(holToggle.style, {
      padding: "6px 7px", borderRadius: "8px", border: "1px solid #fdba74",
      background: "#fff", color: "#9a3412", fontSize: "11px",
      fontWeight: "700", cursor: "pointer", height: "32px", minWidth: "75px", flexShrink: "0"
    });

    const holSection = document.createElement("div");
    Object.assign(holSection.style, {
      display: "none", marginTop: "4px"
    });

    const holDateInput = document.createElement("input");
    holDateInput.type = "date";
    holDateInput.min = getMinSelectableIso();
    holDateInput.value = getMinSelectableIso();
    Object.assign(holDateInput.style, {
      width: "120px", padding: "5px 7px", borderRadius: "8px",
      border: "1px solid #cbd5e1", background: "#fff", color: "#111827",
      fontSize: "12px", fontWeight: "700"
    });

    const holAddBtn = document.createElement("button");
    holAddBtn.type = "button";
    holAddBtn.textContent = "+ Add";
    Object.assign(holAddBtn.style, {
      padding: "5px 8px", borderRadius: "8px", border: "1px solid #86efac",
      background: "#dcfce7", color: "#166534", fontSize: "12px",
      fontWeight: "700", cursor: "pointer", marginLeft: "4px"
    });

    const holList = document.createElement("div");
    Object.assign(holList.style, {
      maxHeight: "80px", overflowY: "auto", marginTop: "4px"
    });

    const holRow = document.createElement("div");
    Object.assign(holRow.style, { display: "flex", alignItems: "center", gap: "4px", marginTop: "4px" });
    holRow.appendChild(holDateInput);
    holRow.appendChild(holAddBtn);
    holSection.appendChild(holRow);
    holSection.appendChild(holList);

    const outNoAbsent = outputDiv();
    const outLeaveTill = outputDiv();
    const outClassDays = outputDiv();

    const modifyToggle = document.createElement("button");
    modifyToggle.type = "button";
    modifyToggle.textContent = "Modify ▾";
    Object.assign(modifyToggle.style, {
      padding: "6px 7px", borderRadius: "8px", border: "1px solid #fdba74",
      background: "#fff", color: "#9a3412", fontSize: "11px",
      fontWeight: "700", cursor: "pointer", height: "32px", minWidth: "65px", flexShrink: "0"
    });

    const modifySection = document.createElement("div");
    Object.assign(modifySection.style, {
      display: "none", marginTop: "4px"
    });

    // ── Inline Calendar ──
    let calYear = getTodayAcademicDay().getFullYear();
    let calMonth = getTodayAcademicDay().getMonth();
    let calFrom = null;   // Date object
    let calTo   = null;   // Date object

    const calWrap = document.createElement("div");
    Object.assign(calWrap.style, {
      background: "#fff", border: "1px solid #fdba74", borderRadius: "10px",
      padding: "8px", marginBottom: "6px", userSelect: "none"
    });

    // Navigation row: ‹  [Month1 Year]  [Month2 Year]  ›
    const calNavRow = document.createElement("div");
    Object.assign(calNavRow.style, {
      display: "flex", alignItems: "center", justifyContent: "space-between",
      marginBottom: "6px"
    });
    const calPrev = document.createElement("div");
    calPrev.textContent = "‹";
    Object.assign(calPrev.style, {
      cursor: "pointer", fontWeight: "800", fontSize: "16px",
      color: "#9a3412", padding: "0 6px", borderRadius: "4px", flexShrink: "0"
    });
    const calNext = document.createElement("div");
    calNext.textContent = "›";
    Object.assign(calNext.style, {
      cursor: "pointer", fontWeight: "800", fontSize: "16px",
      color: "#9a3412", padding: "0 6px", borderRadius: "4px", flexShrink: "0"
    });
    const calTitlesRow = document.createElement("div");
    Object.assign(calTitlesRow.style, {
      display: "flex", flex: "1", justifyContent: "space-around"
    });
    const calMonthYear1 = document.createElement("div");
    Object.assign(calMonthYear1.style, {
      fontWeight: "800", fontSize: "12px", color: "#7c2d12", textAlign: "center", flex: "1"
    });
    const calMonthYear2 = document.createElement("div");
    Object.assign(calMonthYear2.style, {
      fontWeight: "800", fontSize: "12px", color: "#7c2d12", textAlign: "center", flex: "1"
    });
    calTitlesRow.appendChild(calMonthYear1);
    calTitlesRow.appendChild(calMonthYear2);
    calNavRow.appendChild(calPrev);
    calNavRow.appendChild(calTitlesRow);
    calNavRow.appendChild(calNext);

    // Two month tables side by side
    const calTablesRow = document.createElement("div");
    Object.assign(calTablesRow.style, { display: "flex", gap: "6px" });

    function buildCalTable() {
      const container = document.createElement("div");
      Object.assign(container.style, { flex: "1", minWidth: "0" });
      const table = document.createElement("table");
      Object.assign(table.style, { width: "100%", borderCollapse: "collapse", fontSize: "11px" });
      const thead = document.createElement("thead");
      const headRow = document.createElement("tr");
      ["Su","Mo","Tu","We","Th","Fr","Sa"].forEach(d => {
        const th = document.createElement("th");
        th.textContent = d;
        Object.assign(th.style, {
          textAlign: "center", padding: "3px 0", color: "#9a3412",
          fontWeight: "700", fontSize: "10px"
        });
        headRow.appendChild(th);
      });
      thead.appendChild(headRow);
      table.appendChild(thead);
      const tbody = document.createElement("tbody");
      table.appendChild(tbody);
      container.appendChild(table);
      return { container, tbody };
    }

    const calLeft  = buildCalTable();
    const calRight = buildCalTable();
    calTablesRow.appendChild(calLeft.container);
    calTablesRow.appendChild(calRight.container);

    // Range label
    const calRangeLabel = document.createElement("div");
    Object.assign(calRangeLabel.style, {
      fontSize: "10px", color: "#9a3412", marginTop: "4px", textAlign: "center",
      minHeight: "14px"
    });

    function isoOf(d) {
      if (!d) return null;
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, "0");
      const dd = String(d.getDate()).padStart(2, "0");
      return `${y}-${m}-${dd}`;
    }

    function renderMonth(tbody, year, month) {
      const minIso = getMinSelectableIso();
      const fromIso  = isoOf(calFrom);
      const toIso    = isoOf(calTo);
      tbody.innerHTML = "";

      const firstDay    = new Date(year, month, 1).getDay();
      const daysInMonth = new Date(year, month + 1, 0).getDate();

      let row = document.createElement("tr");
      for (let i = 0; i < firstDay; i++) {
        row.appendChild(document.createElement("td"));
      }

      for (let day = 1; day <= daysInMonth; day++) {
        const cellDate = new Date(year, month, day);
        const cellIso  = isoOf(cellDate);
        const isPast   = cellIso < minIso;
        const isFrom   = cellIso === fromIso;
        const isTo     = cellIso === toIso;
        const inRange  = fromIso && toIso && cellIso > fromIso && cellIso < toIso;
        const isToday  = cellIso === todayIso && cellIso >= minIso;

        const td = document.createElement("td");
        td.textContent = String(day);

        if (isPast) {
          Object.assign(td.style, {
            textAlign: "center", padding: "4px 2px",
            cursor: "default", color: "#d1d5db", pointerEvents: "none"
          });
        } else {
          Object.assign(td.style, {
            textAlign: "center", padding: "4px 2px", cursor: "pointer",
            borderRadius: isFrom || isTo ? "50%" : "0",
            background: isFrom || isTo ? "#9a3412" : inRange ? "#fed7aa" : "transparent",
            color: isFrom || isTo ? "#fff" : isToday ? "#9a3412" : "#111827",
            fontWeight: isFrom || isTo || isToday ? "800" : "400",
            outline: isToday && !isFrom && !isTo ? "1px solid #9a3412" : "none",
            outlineOffset: "-1px"
          });

          td.addEventListener("mouseenter", () => {
            if (!isFrom && !isTo) td.style.background = "#fef3c7";
          });
          td.addEventListener("mouseleave", () => {
            if (!isFrom && !isTo && !inRange) td.style.background = "transparent";
            else if (!isFrom && !isTo && inRange) td.style.background = "#fed7aa";
          });

          td.addEventListener("click", () => {
            if (!calFrom || (calFrom && calTo)) {
              calFrom = cellDate;
              calTo   = null;
            } else {
              if (cellDate < calFrom) {
                calTo   = calFrom;
                calFrom = cellDate;
              } else {
                calTo = cellDate;
              }
            }
            updateRangeLabel();
            renderCalendar();
          });
        }

        row.appendChild(td);
        if ((firstDay + day) % 7 === 0 || day === daysInMonth) {
          tbody.appendChild(row);
          row = document.createElement("tr");
        }
      }
    }

    function renderCalendar() {
      const months = ["January","February","March","April","May","June",
                      "July","August","September","October","November","December"];
      let nextMonth = calMonth + 1;
      let nextYear  = calYear;
      if (nextMonth > 11) { nextMonth = 0; nextYear++; }

      calMonthYear1.textContent = `${months[calMonth]} ${calYear}`;
      calMonthYear2.textContent = `${months[nextMonth]} ${nextYear}`;

      renderMonth(calLeft.tbody, calYear, calMonth);
      renderMonth(calRight.tbody, nextYear, nextMonth);
    }

    function updateRangeLabel() {
      if (calFrom && calTo) {
        calRangeLabel.textContent = `${isoOf(calFrom)}  →  ${isoOf(calTo)}`;
      } else if (calFrom) {
        calRangeLabel.textContent = `From: ${isoOf(calFrom)} — pick end date`;
      } else {
        calRangeLabel.textContent = "Click to select start date";
      }
    }
    updateRangeLabel();

    calPrev.addEventListener("click", () => {
      calMonth--;
      if (calMonth < 0) { calMonth = 11; calYear--; }
      renderCalendar();
    });
    calNext.addEventListener("click", () => {
      calMonth++;
      if (calMonth > 11) { calMonth = 0; calYear++; }
      renderCalendar();
    });

    calWrap.appendChild(calNavRow);
    calWrap.appendChild(calTablesRow);
    calWrap.appendChild(calRangeLabel);
    renderCalendar();

    // ── Lecture count + Set Range ──
    const modCountInput = createPopupNumberInput(storedLpd, 0, 30);
    modCountInput.style.width = "40px";

    const modAddBtn = document.createElement("button");
    modAddBtn.type = "button";
    modAddBtn.textContent = "+ Set Range";
    Object.assign(modAddBtn.style, {
      padding: "5px 8px", borderRadius: "8px", border: "1px solid #86efac",
      background: "#dcfce7", color: "#166534", fontSize: "12px",
      fontWeight: "700", cursor: "pointer"
    });

    const modList = document.createElement("div");
    Object.assign(modList.style, {
      maxHeight: "80px", overflowY: "auto", marginTop: "4px"
    });

    const modRow2 = document.createElement("div");
    Object.assign(modRow2.style, { display: "flex", alignItems: "center", justifyContent: "space-between", gap: "4px", marginTop: "4px" });
    const lecLabel = document.createElement("span"); lecLabel.textContent = "Lectures:"; lecLabel.style.fontSize = "11px";
    modRow2.appendChild(lecLabel);
    modRow2.appendChild(modCountInput);
    modRow2.appendChild(modAddBtn);

    modifySection.appendChild(calWrap);
    modifySection.appendChild(modRow2);
    modifySection.appendChild(modList);

    const lastDayRow = document.createElement("div");
    Object.assign(lastDayRow.style, {
      display: "flex", alignItems: "center", justifyContent: "flex-start",
      gap: "8px", marginBottom: "8px", flexWrap: "wrap"
    });
    
    // Group inputs for better spacing
    const lastDayField = createPopupField("Last day", lastDayInput);
    lastDayField.style.flex = "0 0 auto";
    lastDayField.style.justifyContent = "flex-start";
    lastDayField.style.gap = "8px";

    lastDayRow.appendChild(lastDayField);
    lastDayRow.appendChild(modifyToggle);
    lastDayRow.appendChild(satToggle);
    lastDayRow.appendChild(holToggle);
    
    secB.appendChild(lastDayRow);
    secB.appendChild(modifySection);
    secB.appendChild(satList);
    secB.appendChild(holSection);
    
    const summaryBox = document.createElement("div");
    Object.assign(summaryBox.style, {
      borderTop: "1px dashed #fed7aa", marginTop: "10px", paddingTop: "8px"
    });
    summaryBox.appendChild(outNoAbsent);
    summaryBox.appendChild(outLeaveTill);
    summaryBox.appendChild(outClassDays);
    secB.appendChild(summaryBox);

    popup.appendChild(secA);
    popup.appendChild(secB);
    popup.appendChild(sig);

    // ─────────────────────────────────────────────────────────────────────────────
    // MODIFY (CUSTOM LECTURES) LIST RENDERING
    // ─────────────────────────────────────────────────────────────────────────────
    function renderModifyList() {
      modList.innerHTML = "";
      const customs = getStoredCustomLectures();
      const minIso = getMinSelectableIso();
      // Auto-remove past modifications from storage
      let modChanged = false;
      Object.keys(customs).forEach(iso => { if (iso < minIso) { delete customs[iso]; modChanged = true; } });
      if (modChanged) setStoredCustomLectures(customs);
      const dates = Object.keys(customs).sort();
      if (dates.length === 0) {
        const empty = document.createElement("div");
        empty.textContent = "No modifications.";
        Object.assign(empty.style, { fontSize: "11px", color: "#9ca3af" });
        modList.appendChild(empty);
        return;
      }
      
      const clearAll = document.createElement("div");
      clearAll.textContent = "🗑 Clear All";
      Object.assign(clearAll.style, {
        fontSize: "10px", color: "#dc2626", cursor: "pointer",
        textAlign: "right", fontWeight: "700", marginBottom: "4px"
      });
      clearAll.onclick = () => {
        setStoredCustomLectures({});
        renderModifyList();
        updateCalculations(false);
      };
      modList.appendChild(clearAll);

      dates.forEach(iso => {
        const item = document.createElement("div");
        Object.assign(item.style, {
          display: "flex", alignItems: "center", justifyContent: "space-between",
          fontSize: "11px", color: "#7c2d12", marginBottom: "3px"
        });
        item.textContent = `${iso}: ${customs[iso]} lec`;
        const removeBtn = document.createElement("button");
        removeBtn.type = "button";
        removeBtn.textContent = "✕";
        Object.assign(removeBtn.style, {
          marginLeft: "6px", background: "none", border: "none",
          color: "#dc2626", cursor: "pointer", fontSize: "11px", fontWeight: "700"
        });
        removeBtn.addEventListener("click", () => {
          const m = getStoredCustomLectures();
          delete m[iso];
          setStoredCustomLectures(m);
          renderModifyList();
          updateCalculations(false);
        });
        item.appendChild(removeBtn);
        modList.appendChild(item);
      });
    }

    modAddBtn.addEventListener("click", () => {
      const fromDate = calFrom;
      const toDate   = calTo || calFrom;
      const count = Number.parseInt(modCountInput.value, 10);
      if (!fromDate || isNaN(count)) return;
      const minIso = getMinSelectableIso();
      const m = getStoredCustomLectures();
      const cursor = new Date(fromDate);
      while (cursor <= toDate) {
        const iso = toIsoDate(cursor);
        if (iso >= minIso) m[iso] = count;
        cursor.setDate(cursor.getDate() + 1);
      }
      setStoredCustomLectures(m);
      // Reset selection
      calFrom = null;
      calTo = null;
      updateRangeLabel();
      renderCalendar();
      renderModifyList();
      updateCalculations(false);
    });

    modifyToggle.addEventListener("click", (e) => {
      e.preventDefault();
      const opening = modifySection.style.display === "none";
      modifySection.style.display = opening ? "block" : "none";
      modifyToggle.textContent = opening ? "Modify ▴" : "Modify ▾";
      if (opening) {
        // Close other dropdowns
        holSection.style.display = "none";
        satList.style.display = "none";
        holToggle.textContent = "Holidays ▾";
        satToggle.textContent = "Saturdays ▾";
        renderModifyList();
      }
    });

    // ─────────────────────────────────────────────────────────────────────────────
    // HOLIDAY LIST RENDERING
    // ─────────────────────────────────────────────────────────────────────────────
    function renderHolidayList() {
      holList.innerHTML = "";
      const minIso = getMinSelectableIso();
      const holidays = getStoredHolidays();
      // Auto-remove any past holidays from storage
      let changed = false;
      [...holidays].forEach(iso => { if (iso < minIso) { holidays.delete(iso); changed = true; } });
      if (changed) setStoredHolidays(holidays);
      if (holidays.size === 0) {
        const empty = document.createElement("div");
        empty.textContent = "No holidays added.";
        Object.assign(empty.style, { fontSize: "11px", color: "#9ca3af" });
        holList.appendChild(empty);
        return;
      }
      [...holidays].sort().forEach(iso => {
        const item = document.createElement("div");
        Object.assign(item.style, {
          display: "flex", alignItems: "center", justifyContent: "space-between",
          fontSize: "11px", color: "#7c2d12", marginBottom: "3px"
        });
        item.textContent = iso;
        const removeBtn = document.createElement("button");
        removeBtn.type = "button";
        removeBtn.textContent = "✕";
        Object.assign(removeBtn.style, {
          marginLeft: "6px", background: "none", border: "none",
          color: "#dc2626", cursor: "pointer", fontSize: "11px", fontWeight: "700"
        });
        removeBtn.addEventListener("click", () => {
          const h = getStoredHolidays();
          h.delete(iso);
          setStoredHolidays(h);
          renderHolidayList();
          updateCalculations(false);
        });
        item.appendChild(removeBtn);
        holList.appendChild(item);
      });
    }

    holAddBtn.addEventListener("click", () => {
      const date = holDateInput.value;
      if (!date || date < getMinSelectableIso()) return;
      const h = getStoredHolidays();
      h.add(date);
      setStoredHolidays(h);
      renderHolidayList();
      updateCalculations(false);
    });

    holToggle.addEventListener("click", (e) => {
      e.preventDefault();
      const opening = holSection.style.display === "none";
      holSection.style.display = opening ? "block" : "none";
      holToggle.textContent = opening ? "Holidays ▴" : "Holidays ▾";
      if (opening) {
        // Close other dropdowns
        modifySection.style.display = "none";
        satList.style.display = "none";
        modifyToggle.textContent = "Modify ▾";
        satToggle.textContent = "Saturdays ▾";
        renderHolidayList();
      }
    });

    // ─────────────────────────────────────────────────────────────────────────────
    // SATURDAY LIST RENDERING
    // ─────────────────────────────────────────────────────────────────────────────
    function getOpenSatSet(lastDayIso) {
      const map = getStoredOpenSaturdays();
      return new Set(Array.isArray(map[lastDayIso]) ? map[lastDayIso] : []);
    }

    function saveOpenSatSet(lastDayIso, set) {
      const map = getStoredOpenSaturdays();
      map[lastDayIso] = [...set];
      setStoredOpenSaturdays(map);
    }

    function rebuildSatList() {
      satList.innerHTML = "";
      const lastDayDate = parseIsoDate(lastDayInput.value);
      const minIso = getMinSelectableIso();
      const minDate = parseIsoDate(minIso);

      // Auto-purge any past Saturdays from the stored set
      const storedMap = getStoredOpenSaturdays();
      const lastIsoKey = lastDayInput.value;
      if (Array.isArray(storedMap[lastIsoKey])) {
        const cleaned = storedMap[lastIsoKey].filter(iso => iso >= minIso);
        if (cleaned.length !== storedMap[lastIsoKey].length) {
          storedMap[lastIsoKey] = cleaned;
          setStoredOpenSaturdays(storedMap);
        }
      }

      if (!lastDayDate || lastDayDate < minDate) {
        const empty = document.createElement("div");
        empty.textContent = "No Saturdays in range";
        Object.assign(empty.style, { fontSize: "12px", color: "#7c2d12" });
        satList.appendChild(empty);
        return;
      }
      const sats = listSaturdaysBetween(minDate, lastDayDate);
      if (!sats.length) {
        const none = document.createElement("div");
        none.textContent = "No Saturdays in range";
        Object.assign(none.style, { fontSize: "12px", color: "#7c2d12" });
        satList.appendChild(none);
        return;
      }
      const selectedSet = getOpenSatSet(lastDayInput.value);
      sats.forEach(dateObj => {
        const iso = toIsoDate(dateObj);
        const item = document.createElement("label");
        Object.assign(item.style, {
          display: "flex", alignItems: "center", gap: "8px",
          fontSize: "12px", color: "#7c2d12", marginBottom: "4px"
        });
        const cb = document.createElement("input");
        cb.type = "checkbox";
        cb.checked = selectedSet.has(iso);
        cb.addEventListener("change", () => {
          if (cb.checked) selectedSet.add(iso);
          else selectedSet.delete(iso);
          saveOpenSatSet(lastDayInput.value, selectedSet);
          updateCalculations(false);
        });
        const txt = document.createElement("span");
        txt.textContent = iso;
        item.appendChild(cb);
        item.appendChild(txt);
        satList.appendChild(item);
      });
    }

    satToggle.addEventListener("click", (e) => {
      e.preventDefault();
      const opening = satList.style.display === "none";
      satList.style.display = opening ? "block" : "none";
      satToggle.textContent = opening ? "Saturdays ▴" : "Saturdays ▾";
      if (opening) {
        // Close other dropdowns
        modifySection.style.display = "none";
        holSection.style.display = "none";
        modifyToggle.textContent = "Modify ▾";
        holToggle.textContent = "Holidays ▾";
        rebuildSatList();
      }
    });

    lastDayInput.addEventListener("change", () => {
      setStoredLastAcademicDay(lastDayInput.value);
      rebuildSatList();
      updateCalculations(true);
    });

    // ─────────────────────────────────────────────────────────────────────────────
    // GRAPH STATE
    // ─────────────────────────────────────────────────────────────────────────────
    let graphHitPoints = [];  // { x, y, date, percent, isPredicted }

    function redrawGraph() {
      if (!bigGraphCanvas) return;

      const lastDayDate = parseIsoDate(lastDayInput.value);
      const openSatSet = getOpenSatSet(String(lastDayInput.value));
      const holidays = getStoredHolidays();
      const customLpdMap = getStoredCustomLectures();
      const lpd = storedLpd;

      // Ensure canvas pixels match its display size
      const tableWrapper = document.getElementById("data-table-buttons_wrapper");
      if (tableWrapper) {
        const rect = tableWrapper.getBoundingClientRect();
        bigGraphCanvas.width = rect.width;
        bigGraphCanvas.height = 350;
      }

      // Use parsed history from table as primary source, fallback to localStorage
      let history = parseAttendanceTable(totalLectures, attended);
      if (history.length === 0) {
        const storedHistoryRaw = window.localStorage.getItem(K_HISTORY);
        history = storedHistoryRaw ? JSON.parse(storedHistoryRaw) : [];
      }

      const pts = drawAttendanceGraph(
        bigGraphCanvas, history,
        normalizeGoalPercent(String(goalInput.value || storedGoalPercent)),
        attended, totalLectures,
        lastDayDate, lpd, openSatSet, holidays, customLpdMap,
        parseNonNegativeInt(daysInput.value, 0) * lpd + parseNonNegativeInt(lecturesInput.value, 0)
      );
      graphHitPoints = pts || [];
    }

    // ─────────────────────────────────────────────────────────────────────────────
    // ── Host layout ──
    const host = container.parentElement || container;
    host.style.display = "inline-flex";
    host.style.flexDirection = "row";
    host.style.flexWrap = "nowrap";
    host.style.alignItems = "center";
    host.style.gap = "8px";

    wrapper.style.position = "relative";
    wrapper.style.transform = "none";
    wrapper.style.marginLeft = "10px";
    wrapper.style.marginTop = "0";

    // ── Inject Big Graph Below Wrapper ──
    const tableWrapper = document.getElementById("data-table-buttons_wrapper");
    let bigGraphCanvas = null;
    if (tableWrapper) {
      let bigGraphBox = document.getElementById(BIG_GRAPH_ID);
      if (!bigGraphBox) {
        bigGraphBox = document.createElement("div");
        bigGraphBox.id = BIG_GRAPH_ID;
        Object.assign(bigGraphBox.style, {
          marginTop: "20px", marginBottom: "20px", padding: "20px",
          background: "#fff7ed", border: "1px solid #fdba74", borderRadius: "16px",
          boxShadow: "0 4px 12px rgba(0,0,0,0.05)", clear: "both"
        });

        const graphHeader = document.createElement("div");
        graphHeader.textContent = "Attendance Trend & Projections";
        Object.assign(graphHeader.style, {
          fontSize: "18px", fontWeight: "800", color: "#9a3412", marginBottom: "12px",
          display: "flex", alignItems: "center", gap: "8px"
        });
        bigGraphBox.appendChild(graphHeader);

        // Canvas wrapper for positioning the tooltip
        const canvasWrap = document.createElement("div");
        Object.assign(canvasWrap.style, { position: "relative", display: "block" });

        const canvas = document.createElement("canvas");
        Object.assign(canvas.style, {
          display: "block", width: "100%", height: "300px", background: "#fff",
          borderRadius: "12px", border: "1px solid #fed7aa", cursor: "crosshair"
        });
        canvasWrap.appendChild(canvas);

        // Hover tooltip div
        const tooltip = document.createElement("div");
        Object.assign(tooltip.style, {
          position: "absolute", pointerEvents: "none", display: "none",
          background: "rgba(255,255,255,0.97)", border: "1px solid #fdba74",
          borderRadius: "8px", padding: "6px 10px", fontSize: "11px",
          fontWeight: "700", color: "#374151", boxShadow: "0 2px 8px rgba(0,0,0,0.12)",
          whiteSpace: "nowrap", zIndex: "10", lineHeight: "1.6"
        });
        canvasWrap.appendChild(tooltip);
        bigGraphBox.appendChild(canvasWrap);

        // Crosshair dot on canvas
        const crossDot = document.createElement("div");
        Object.assign(crossDot.style, {
          position: "absolute", pointerEvents: "none", display: "none",
          width: "9px", height: "9px", borderRadius: "50%",
          border: "2px solid #fff", transform: "translate(-50%,-50%)", zIndex: "9"
        });
        canvasWrap.appendChild(crossDot);

        // Mousemove on canvas → find nearest point → show tooltip
        canvas.addEventListener("mousemove", e => {
          if (!graphHitPoints || graphHitPoints.length === 0) return;
          const rect = canvas.getBoundingClientRect();
          const scaleX = canvas.width / rect.width;
          const scaleY = canvas.height / rect.height;
          const mx = (e.clientX - rect.left) * scaleX;
          const my = (e.clientY - rect.top) * scaleY;

          let best = null, bestDist = Infinity;
          for (const pt of graphHitPoints) {
            const dx = pt.x - mx, dy = pt.y - my;
            const d = dx * dx + dy * dy;
            if (d < bestDist) { bestDist = d; best = pt; }
          }

          const HIT_RADIUS_PX = 30 * scaleX;
          if (!best || Math.sqrt(bestDist) > HIT_RADIUS_PX) {
            tooltip.style.display = "none";
            crossDot.style.display = "none";
            return;
          }

          // Position tooltip
          const dotX = best.x / scaleX;
          const dotY = best.y / scaleY;
          tooltip.innerHTML = `<span style="color:${best.isPredicted ? '#e11d48' : '#0891b2'}">${best.isPredicted ? "Predicted" : "Actual"}</span><br>` +
            `Date: <b>${best.date || "—"}</b><br>` +
            `Attendance: <b>${best.percent.toFixed(2)}%</b>`;

          const tipW = 150, tipH = 60;
          let tx = dotX + 12, ty = dotY - tipH - 6;
          if (tx + tipW > rect.width) tx = dotX - tipW - 12;
          if (ty < 0) ty = dotY + 12;
          tooltip.style.left = `${tx}px`;
          tooltip.style.top = `${ty}px`;
          tooltip.style.display = "block";

          crossDot.style.left = `${dotX}px`;
          crossDot.style.top = `${dotY}px`;
          crossDot.style.background = best.isPredicted ? "#e11d48" : "#0891b2";
          crossDot.style.display = "block";
        });

        canvas.addEventListener("mouseleave", () => {
          tooltip.style.display = "none";
          crossDot.style.display = "none";
        });

        const footer = document.createElement("div");
        footer.textContent = "DetAINED?";
        Object.assign(footer.style, {
          fontSize: "12px", color: "#9ca3af", marginTop: "10px", textAlign: "right",
          fontStyle: "italic"
        });
        bigGraphBox.appendChild(footer);

        tableWrapper.insertAdjacentElement("afterend", bigGraphBox);

        // Listen for window resize to fix graph width
        window.addEventListener("resize", () => {
          if (document.getElementById(BIG_GRAPH_ID)) {
            redrawGraph();
          }
        });
      }
      bigGraphCanvas = bigGraphBox.querySelector("canvas");
    }

    // Streak badge already added in inline bar assembly above

    // ─────────────────────────────────────────────────────────────────────────────
    // UNIFIED CALCULATION UPDATE
    // ─────────────────────────────────────────────────────────────────────────────
    function updateCalculations(commit) {
      const rawGoal = String(goalInput.value || "").trim();
      const goal = rawGoal ? normalizeGoalPercent(rawGoal) : storedGoalPercent;
      if (commit) { goalInput.value = String(goal); setStoredGoalPercent(goal); }

      const lpd = storedLpd;

      const lastIso = String(lastDayInput.value || "").trim();
      const lastDayDate = parseIsoDate(lastIso);
      if (commit) setStoredLastAcademicDay(lastIso);

      const days2skip = parseNonNegativeInt(daysInput.value, 0);
      const lec2skip = parseNonNegativeInt(lecturesInput.value, 0);
      daysInput.value = String(days2skip);
      lecturesInput.value = String(lec2skip);

      // Academic Planner data (computed early — used by both simulator and planner)
      const openSatSet = getOpenSatSet(lastIso);
      const holidays = getStoredHolidays();
      const customLpdMap = getStoredCustomLectures();
      const todayAcademic = getTodayAcademicDay();
      const completedToday = getCompletedLecturesToday();
      const todayLpd = (customLpdMap && customLpdMap[toIsoDate(todayAcademic)] !== undefined)
        ? customLpdMap[toIsoDate(todayAcademic)] : lpd;
      const allTodayDone = completedToday >= todayLpd;
      const classDayStart = allTodayDone
        ? new Date(todayAcademic.getFullYear(), todayAcademic.getMonth(), todayAcademic.getDate() + 1)
        : todayAcademic;
      const classDays = countScheduledClassDays(classDayStart, lastDayDate, openSatSet, holidays);
      let futureLec = calculateTotalFutureLectures(todayAcademic, lastDayDate, openSatSet, holidays, customLpdMap, lpd);
      if (completedToday > 0) futureLec -= completedToday;

      // Scenario Simulator
      const plannedMissed = days2skip * lpd + lec2skip;
      const effectiveMissed = Math.min(plannedMissed, futureLec);
      const predictedPct = (attended / (totalLectures + plannedMissed)) * 100;
      const maxAtGoal = getLeaveAllowance(totalLectures, totalAbsent, goal, lpd);
      const goalAllowance = allowanceFromLectureCount(maxAtGoal.maxMissableLectures, lpd);
      const remLec = Math.max(0, maxAtGoal.maxMissableLectures - plannedMissed);
      const remAllowance = allowanceFromLectureCount(remLec, lpd);

      const leaveValueSpan = leaveChip.querySelector("span") || leaveChip;
      leaveValueSpan.textContent = formatLeaveMessage(goalAllowance);
      outPredicted.textContent = `Percentage%: ${predictedPct.toFixed(2)}%`;
      outRemaining.textContent = `Remaining: ${formatLeaveMessage(remAllowance)} (goal ${goal}%)`;

      // Update inline status badge
      const newStatus = getStatusInfo(basePercent, goal);
      statusBadge.textContent = `${newStatus.emoji} ${newStatus.label}`;
      statusBadge.style.color = newStatus.color;
      statusBadge.style.background = newStatus.bg;
      statusBadge.style.border = `1px solid ${newStatus.border}`;

      // Recovery mode
      const recovery = getRecoveryLectures(totalLectures, totalAbsent, goal);
      if (recovery === null) {
        outRecovery.textContent = "✅ Above goal — no recovery needed.";
        outRecovery.style.color = "#16a34a";
      } else if (!isFinite(recovery)) {
        outRecovery.textContent = "💀 100% is impossible";
        outRecovery.style.color = "#7c3aed";
      } else {
        const recDays = Math.ceil(recovery / lpd);
        outRecovery.textContent = `⚠️ Recover: attend next ${recovery} lecture${recovery === 1 ? "" : "s"} (~${recDays}d)`;
        outRecovery.style.color = "#dc2626";
      }

      // Academic Planner
      const noAbsentPct = ((attended + futureLec) / (totalLectures + futureLec)) * 100;
      const maxLeaveAbs = Math.min(
        futureLec,
        Math.max(0, Math.floor(attended + futureLec - (goal / 100) * (totalLectures + futureLec)))
      );
      const leaveAllowTill = allowanceFromLectureCount(maxLeaveAbs, lpd);

      if (plannedMissed === 0) {
        outNoAbsent.textContent = `Percentage%(No more absences): ${noAbsentPct.toFixed(2)}%`;
      } else {
        const plannerAbsentPct = ((attended + futureLec - effectiveMissed) / (totalLectures + futureLec)) * 100;
        const absentDesc = days2skip > 0 && lec2skip > 0
          ? `${days2skip}d + ${lec2skip} lec absent`
          : days2skip > 0 ? `${days2skip} day${days2skip > 1 ? "s" : ""} absent`
          : `${lec2skip} lecture${lec2skip > 1 ? "s" : ""} absent`;
        outNoAbsent.textContent = `Percentage%(${absentDesc}): ${plannerAbsentPct.toFixed(2)}%`;
      }

      if (plannedMissed === 0) {
        outLeaveTill.textContent = `Leave possible till last day: ${formatLeaveMessage(leaveAllowTill)}`;
      } else {
        const remainingLeave = allowanceFromLectureCount(Math.max(0, maxLeaveAbs - effectiveMissed), lpd);
        const skipDesc = days2skip > 0 && lec2skip > 0
          ? `${days2skip}d + ${lec2skip} lec skipped`
          : days2skip > 0 ? `${days2skip} day${days2skip > 1 ? "s" : ""} skipped`
          : `${lec2skip} lec skipped`;
        outLeaveTill.innerHTML =
          `Leave possible till last day: <b>${formatLeaveMessage(leaveAllowTill)}</b><br>` +
          `After ${skipDesc}: <b>${formatLeaveMessage(remainingLeave)}</b>`;
      }
      outClassDays.textContent = `Class days remaining: ${classDays} (${futureLec} lectures)`;

      if (graphNeedsRedraw) {
        graphNeedsRedraw = false;
        redrawGraph();
      }
    }

    // ── Input listeners ──
    goalInput.addEventListener("input",  () => updateCalculations(false));
    goalInput.addEventListener("change", () => {
      graphNeedsRedraw = true;
      updateCalculations(true);
    });
    goalInput.addEventListener("blur",   () => {
      graphNeedsRedraw = true;
      updateCalculations(true);
    });
    [daysInput, lecturesInput].forEach(inp => {
      inp.addEventListener("input", () => { graphNeedsRedraw = true; updateCalculations(false); });
      inp.addEventListener("change", () => { graphNeedsRedraw = true; updateCalculations(true); });
      inp.addEventListener("blur", () => { graphNeedsRedraw = true; updateCalculations(true); });
    });

    // ── Dropdown toggle ──
    toggleBtn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      const opening = popup.style.display === "none";
      popup.style.display = opening ? "block" : "none";
      toggleBtn.textContent = opening ? "▲" : "▼";
      if (opening) {
        updateCalculations(false);
        checkForUpdate(popup);
      }
    });

    document.addEventListener("click", (e) => {
      if (popup.style.display === "none") return;
      if (popup.contains(e.target) || toggleBtn.contains(e.target)) return;
      popup.style.display = "none";
      toggleBtn.textContent = "▼";
    });

    popup.addEventListener("click", (e) => {
      e.stopPropagation();
    });

    // ── Assemble inline bar ──
    wrapper.appendChild(statusBadge);
    if (streakBadge) wrapper.appendChild(streakBadge);
    wrapper.appendChild(leaveChip);
    wrapper.appendChild(upChip);
    wrapper.appendChild(downChip);
    wrapper.appendChild(toggleBtn);
    wrapper.appendChild(popup);

    host.appendChild(wrapper);

    // Initial calculation
    updateCalculations(true);

    // ─────────────────────────────────────────────────────────────────────────────
    // TABLE OBSERVER (for pagination/searching)
    // ─────────────────────────────────────────────────────────────────────────────
    const tableElement = document.getElementById("data-table-buttons");
    if (tableElement) {
      const tableObserver = new MutationObserver(() => {
        graphNeedsRedraw = true;
        updateCalculations(false);
      });
      tableObserver.observe(tableElement, { childList: true, subtree: true });
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════════
  // SECTION 11 — INJECTION LOGIC
  // ═══════════════════════════════════════════════════════════════════════════════
  function injectInlinePredictor() {
    const totalLectures = findSummaryValue("Total Lecture");
    const totalAbsent = findSummaryValue("Total Absent + OAA");
    const currentPercent = findSummaryValue("Attendance % with PF");
    const attendanceContainer = findAttendanceContainer();

    if (totalLectures === null || totalAbsent === null || currentPercent === null || !attendanceContainer) {
      return false;
    }

    // Save to chrome.storage for background.js notification context
    saveHistoryAndCurrent(currentPercent, getStoredGoalPercent(), totalLectures);

    renderInlineTools(attendanceContainer, totalLectures, totalAbsent, currentPercent);
    return true;
  }

  function waitForSummary() {
    if (injectInlinePredictor()) return;

    const observer = new MutationObserver(() => {
      if (injectInlinePredictor()) observer.disconnect();
    });

    observer.observe(document.body, { childList: true, subtree: true });
    window.setTimeout(() => observer.disconnect(), 20000);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", waitForSummary, { once: true });
  } else {
    waitForSummary();
  }
})();
