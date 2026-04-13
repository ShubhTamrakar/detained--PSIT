(function () {
  const INLINE_ID = "psit-inline-attendance-tools";
  const POPUP_ID = "psit-inline-attendance-popup";
  const DEFAULT_LECTURES_PER_DAY = 8;
  const SAFE_THRESHOLD_PERCENT = 75;
  const THRESHOLD_STORAGE_KEY = "psit_attendance_goal_threshold";
  const LAST_DAY_STORAGE_KEY = "psit_attendance_last_academic_day";
  const SATURDAY_STORAGE_KEY = "psit_attendance_open_saturdays";

  function getBodyText() {
    return document.body && document.body.innerText
      ? document.body.innerText.replace(/\s+/g, " ").trim()
      : "";
  }

  function findSummaryValue(labelText) {
    const escapedLabel = labelText
      .replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
      .replace(/\s+/g, "\\s*");

    const regex = new RegExp(`${escapedLabel}\\s*:?\\s*(-?\\d+(?:\\.\\d+)?)`, "i");
    const match = getBodyText().match(regex);
    return match ? Number.parseFloat(match[1]) : null;
  }

  function normalizeGoalPercent(value) {
    const parsed = Number.parseInt(String(value), 10);
    if (Number.isNaN(parsed)) {
      return SAFE_THRESHOLD_PERCENT;
    }
    return Math.max(1, parsed);
  }

  function getStoredGoalPercent() {
    try {
      const raw = window.localStorage.getItem(THRESHOLD_STORAGE_KEY);
      if (raw === null) {
        return SAFE_THRESHOLD_PERCENT;
      }
      return normalizeGoalPercent(Number.parseInt(raw, 10));
    } catch (error) {
      return SAFE_THRESHOLD_PERCENT;
    }
  }

  function setStoredGoalPercent(value) {
    try {
      window.localStorage.setItem(THRESHOLD_STORAGE_KEY, String(normalizeGoalPercent(value)));
    } catch (error) {
      // Ignore storage errors and continue with in-memory value.
    }
  }

  function getTodayAtMidnight() {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), now.getDate());
  }

  function toIsoDate(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  function parseIsoDate(value) {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || ""));
    if (!match) {
      return null;
    }
    const year = Number.parseInt(match[1], 10);
    const month = Number.parseInt(match[2], 10) - 1;
    const day = Number.parseInt(match[3], 10);
    return new Date(year, month, day);
  }

  function getStoredLastAcademicDay() {
    try {
      const raw = window.localStorage.getItem(LAST_DAY_STORAGE_KEY);
      if (!raw) {
        return "";
      }
      return raw;
    } catch (error) {
      return "";
    }
  }

  function setStoredLastAcademicDay(value) {
    try {
      if (!value) {
        window.localStorage.removeItem(LAST_DAY_STORAGE_KEY);
        return;
      }
      window.localStorage.setItem(LAST_DAY_STORAGE_KEY, value);
    } catch (error) {
      // Ignore storage failures.
    }
  }

  function getStoredOpenSaturdays() {
    try {
      const raw = window.localStorage.getItem(SATURDAY_STORAGE_KEY);
      if (!raw) {
        return {};
      }
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object") {
        return parsed;
      }
      return {};
    } catch (error) {
      return {};
    }
  }

  function setStoredOpenSaturdays(map) {
    try {
      window.localStorage.setItem(SATURDAY_STORAGE_KEY, JSON.stringify(map || {}));
    } catch (error) {
      // Ignore storage failures.
    }
  }

  function listSaturdaysBetween(startDate, endDate) {
    const saturdays = [];
    if (!startDate || !endDate || endDate < startDate) {
      return saturdays;
    }
    const cursor = new Date(startDate);
    while (cursor <= endDate) {
      if (cursor.getDay() === 6) {
        saturdays.push(new Date(cursor));
      }
      cursor.setDate(cursor.getDate() + 1);
    }
    return saturdays;
  }

  function countScheduledClassDays(startDate, endDate, openSaturdaysSet) {
    if (!startDate || !endDate || endDate < startDate) {
      return 0;
    }
    let count = 0;
    const cursor = new Date(startDate);
    while (cursor <= endDate) {
      const day = cursor.getDay();
      const iso = toIsoDate(cursor);
      const isWeekday = day >= 1 && day <= 5;
      const isOpenSaturday = day === 6 && openSaturdaysSet.has(iso);
      if (isWeekday || isOpenSaturday) {
        count += 1;
      }
      cursor.setDate(cursor.getDate() + 1);
    }
    return count;
  }

  function findAttendanceContainer() {
    const strongCandidates = Array.from(document.querySelectorAll("span.text-inverse strong, strong"));
    const strongMatch = strongCandidates.find((element) => {
      const text = element.textContent ? element.textContent.replace(/\s+/g, " ").trim() : "";
      return text.includes("Attendance % with PF");
    });

    if (strongMatch) {
      return strongMatch;
    }

    const fallbackCandidates = Array.from(document.querySelectorAll("div, td, p, span"));
    return fallbackCandidates.find((element) => {
      const text = element.textContent ? element.textContent.replace(/\s+/g, " ").trim() : "";
      return text.includes("Attendance % with PF");
    }) || null;
  }

  function getCurrentAttended(totalLectures, totalAbsent) {
    const oaAttendance = findSummaryValue("O.A. Attendance");
    const effectiveAbsent = Math.max(0, totalAbsent - (oaAttendance || 0));
    return Math.max(0, totalLectures - effectiveAbsent);
  }

  function getLeaveAllowance(totalLectures, totalAbsent, goalPercent) {
    const attended = getCurrentAttended(totalLectures, totalAbsent);
    const threshold = normalizeGoalPercent(goalPercent);
    const maxMissableLectures = Math.max(
      0,
      Math.floor((attended * 100) / threshold - totalLectures)
    );
    const days = Math.floor(maxMissableLectures / DEFAULT_LECTURES_PER_DAY);
    const lectures = maxMissableLectures % DEFAULT_LECTURES_PER_DAY;

    return {
      maxMissableLectures,
      days,
      lectures
    };
  }

  function createInfoChip(labelText, valueText) {
    const chip = document.createElement("span");
    chip.style.display = "inline-flex";
    chip.style.alignItems = "center";
    chip.style.gap = "6px";
    chip.style.padding = "6px 10px";
    chip.style.borderRadius = "999px";
    chip.style.background = "#fff";
    chip.style.border = "1px solid #fed7aa";
    chip.style.color = "#9a3412";
    chip.style.fontWeight = "700";
    chip.style.fontSize = "14px";

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
    chip.style.display = "inline-flex";
    chip.style.alignItems = "center";
    chip.style.gap = "4px";
    chip.style.padding = "6px 8px";
    chip.style.borderRadius = "999px";
    chip.style.fontWeight = "700";
    chip.style.fontSize = "12px";
    chip.style.border = isPositive ? "1px solid #86efac" : "1px solid #fca5a5";
    chip.style.background = isPositive ? "#dcfce7" : "#fee2e2";
    chip.style.color = isPositive ? "#166534" : "#991b1b";
    chip.textContent = text;
    return chip;
  }

  function createPopupNumberInput(defaultValue, minValue, maxValue) {
    const input = document.createElement("input");
    input.type = "number";
    input.inputMode = "decimal";
    input.autocomplete = "off";
    input.spellcheck = false;
    if (typeof minValue === "number") {
      input.min = String(minValue);
    }
    if (typeof maxValue === "number") {
      input.max = String(maxValue);
    }
    input.step = "1";
    input.value = String(defaultValue);
    input.style.width = "76px";
    input.style.padding = "6px 8px";
    input.style.borderRadius = "8px";
    input.style.border = "1px solid #cbd5e1";
    input.style.background = "#fff";
    input.style.color = "#111827";
    input.style.fontSize = "13px";
    input.style.fontWeight = "700";
    input.addEventListener("keydown", (event) => {
      event.stopPropagation();
    });
    return input;
  }

  function parseNonNegativeInt(rawValue, fallbackValue) {
    const digitsOnly = String(rawValue || "").replace(/[^\d]/g, "");
    if (!digitsOnly) {
      return fallbackValue;
    }
    return Math.max(0, Number.parseInt(digitsOnly, 10));
  }

  function createPopupField(labelText, input) {
    const row = document.createElement("label");
    row.style.display = "flex";
    row.style.alignItems = "center";
    row.style.justifyContent = "space-between";
    row.style.gap = "10px";
    row.style.fontSize = "13px";
    row.style.fontWeight = "700";
    row.style.color = "#9a3412";

    const label = document.createElement("span");
    label.textContent = labelText;
    row.appendChild(label);
    row.appendChild(input);
    return row;
  }

  function formatLeaveMessage(allowance) {
    const dayWord = allowance.days === 1 ? "day" : "days";
    const lectureWord = allowance.lectures === 1 ? "Lecture" : "Lectures";

    if (allowance.days > 0 && allowance.lectures > 0) {
      return `can leave ${allowance.days} ${dayWord} ${allowance.lectures} ${lectureWord}`;
    }

    if (allowance.days > 0) {
      return `can leave ${allowance.days} ${dayWord}`;
    }

    return `can leave ${allowance.lectures} ${lectureWord}`;
  }

  function allowanceFromLectureCount(lectureCount) {
    const safeLectures = Math.max(0, lectureCount);
    return {
      maxMissableLectures: safeLectures,
      days: Math.floor(safeLectures / DEFAULT_LECTURES_PER_DAY),
      lectures: safeLectures % DEFAULT_LECTURES_PER_DAY
    };
  }

  function renderInlineTools(container, totalLectures, totalAbsent, currentPercent) {
    const existing = document.getElementById(INLINE_ID);
    if (existing) {
      existing.remove();
    }
    const oldPopup = document.getElementById(POPUP_ID);
    if (oldPopup) {
      oldPopup.remove();
    }

    const wrapper = document.createElement("div");
    wrapper.id = INLINE_ID;
    wrapper.style.display = "inline-flex";
    wrapper.style.flexDirection = "row";
    wrapper.style.flexWrap = "nowrap";
    wrapper.style.alignItems = "center";
    wrapper.style.justifyContent = "center";
    wrapper.style.gap = "10px";
    wrapper.style.marginLeft = "8px";
    wrapper.style.marginTop = "0";
    wrapper.style.padding = "6px 10px";
    wrapper.style.borderRadius = "12px";
    wrapper.style.background = "#fff7ed";
    wrapper.style.border = "1px solid #fdba74";
    wrapper.style.verticalAlign = "top";
    wrapper.style.whiteSpace = "nowrap";
    wrapper.style.position = "relative";

    const storedGoalPercent = getStoredGoalPercent();
    const allowance = getLeaveAllowance(totalLectures, totalAbsent, storedGoalPercent);
    const leaveChip = createInfoChip("", formatLeaveMessage(allowance));
    const attendedNow = getCurrentAttended(totalLectures, totalAbsent);
    const basePercent = (attendedNow / totalLectures) * 100;
    const attendOnePercent = ((attendedNow + 1) / (totalLectures + 1)) * 100;
    const missOnePercent = (attendedNow / (totalLectures + 1)) * 100;
    const upDelta = attendOnePercent - basePercent;
    const downDelta = missOnePercent - basePercent;
    const upChip = createDeltaChip(`▲ +${upDelta.toFixed(2)}%`, true);
    const downChip = createDeltaChip(`▼ ${downDelta.toFixed(2)}%`, false);
    const toggleButton = document.createElement("button");
    toggleButton.type = "button";
    toggleButton.textContent = "▼";
    toggleButton.style.width = "24px";
    toggleButton.style.height = "24px";
    toggleButton.style.border = "1px solid #fdba74";
    toggleButton.style.borderRadius = "999px";
    toggleButton.style.background = "#fff";
    toggleButton.style.color = "#9a3412";
    toggleButton.style.fontWeight = "800";
    toggleButton.style.fontSize = "12px";
    toggleButton.style.cursor = "pointer";
    toggleButton.style.display = "inline-flex";
    toggleButton.style.alignItems = "center";
    toggleButton.style.justifyContent = "center";

    const popup = document.createElement("div");
    popup.id = POPUP_ID;
    popup.style.position = "absolute";
    popup.style.top = "calc(100% + 8px)";
    popup.style.right = "0";
    popup.style.minWidth = "220px";
    popup.style.padding = "10px";
    popup.style.borderRadius = "12px";
    popup.style.border = "1px solid #fdba74";
    popup.style.background = "#fff7ed";
    popup.style.boxShadow = "0 8px 24px rgba(0,0,0,0.12)";
    popup.style.display = "none";
    popup.style.zIndex = "2147483647";

    const sectionA = document.createElement("div");
    sectionA.style.border = "1px solid #fed7aa";
    sectionA.style.borderRadius = "10px";
    sectionA.style.padding = "8px";
    sectionA.style.background = "#fff";
    sectionA.style.marginBottom = "8px";

    const sectionATitle = document.createElement("div");
    sectionATitle.textContent = "Scenario Simulator";
    sectionATitle.style.fontSize = "12px";
    sectionATitle.style.fontWeight = "800";
    sectionATitle.style.color = "#9a3412";
    sectionATitle.style.marginBottom = "6px";

    const sectionB = document.createElement("div");
    sectionB.style.border = "1px solid #fed7aa";
    sectionB.style.borderRadius = "10px";
    sectionB.style.padding = "8px";
    sectionB.style.background = "#fff";

    const sectionBTitle = document.createElement("div");
    sectionBTitle.textContent = "Academic Planner";
    sectionBTitle.style.fontSize = "12px";
    sectionBTitle.style.fontWeight = "800";
    sectionBTitle.style.color = "#9a3412";
    sectionBTitle.style.marginBottom = "6px";

    const goalInput = createPopupNumberInput(storedGoalPercent);
    const storedLastDay = getStoredLastAcademicDay();
    const todayIso = toIsoDate(getTodayAtMidnight());
    const lastDayInput = document.createElement("input");
    lastDayInput.type = "date";
    lastDayInput.value = storedLastDay || todayIso;
    lastDayInput.style.width = "130px";
    lastDayInput.style.padding = "6px 8px";
    lastDayInput.style.borderRadius = "8px";
    lastDayInput.style.border = "1px solid #cbd5e1";
    lastDayInput.style.background = "#fff";
    lastDayInput.style.color = "#111827";
    lastDayInput.style.fontSize = "13px";
    lastDayInput.style.fontWeight = "700";

    const saturdayToggle = document.createElement("button");
    saturdayToggle.type = "button";
    saturdayToggle.textContent = "Saturdays v";
    saturdayToggle.style.padding = "6px 8px";
    saturdayToggle.style.borderRadius = "8px";
    saturdayToggle.style.border = "1px solid #fdba74";
    saturdayToggle.style.background = "#fff";
    saturdayToggle.style.color = "#9a3412";
    saturdayToggle.style.fontSize = "12px";
    saturdayToggle.style.fontWeight = "700";
    saturdayToggle.style.cursor = "pointer";

    const saturdayList = document.createElement("div");
    saturdayList.style.display = "none";
    saturdayList.style.maxHeight = "120px";
    saturdayList.style.overflow = "auto";
    saturdayList.style.border = "1px solid #fed7aa";
    saturdayList.style.borderRadius = "8px";
    saturdayList.style.padding = "6px";
    saturdayList.style.background = "#fff";

    const daysInput = createPopupNumberInput(0, 0);
    const lecturesInput = createPopupNumberInput(0, 0);

    const outputPredicted = document.createElement("div");
    outputPredicted.style.fontSize = "13px";
    outputPredicted.style.fontWeight = "700";
    outputPredicted.style.color = "#7c2d12";

    const outputRemaining = document.createElement("div");
    outputRemaining.style.fontSize = "13px";
    outputRemaining.style.fontWeight = "700";
    outputRemaining.style.color = "#7c2d12";
    outputRemaining.style.marginTop = "6px";

    const outputNoAbsentPercent = document.createElement("div");
    outputNoAbsentPercent.style.fontSize = "13px";
    outputNoAbsentPercent.style.fontWeight = "700";
    outputNoAbsentPercent.style.color = "#7c2d12";
    outputNoAbsentPercent.style.marginTop = "6px";

    const outputLeavePossible = document.createElement("div");
    outputLeavePossible.style.fontSize = "13px";
    outputLeavePossible.style.fontWeight = "700";
    outputLeavePossible.style.color = "#7c2d12";
    outputLeavePossible.style.marginTop = "6px";

    const outputClassDays = document.createElement("div");
    outputClassDays.style.fontSize = "12px";
    outputClassDays.style.fontWeight = "700";
    outputClassDays.style.color = "#92400e";
    outputClassDays.style.marginTop = "6px";

    function getOpenSaturdaysSet(lastDayIso) {
      const map = getStoredOpenSaturdays();
      const dates = Array.isArray(map[lastDayIso]) ? map[lastDayIso] : [];
      return new Set(dates);
    }

    function saveOpenSaturdaysSet(lastDayIso, set) {
      const map = getStoredOpenSaturdays();
      map[lastDayIso] = Array.from(set);
      setStoredOpenSaturdays(map);
    }

    function rebuildSaturdayList() {
      saturdayList.innerHTML = "";
      const lastDayDate = parseIsoDate(lastDayInput.value);
      const today = getTodayAtMidnight();
      if (!lastDayDate || lastDayDate < today) {
        const empty = document.createElement("div");
        empty.textContent = "No Saturdays in range";
        empty.style.fontSize = "12px";
        empty.style.color = "#7c2d12";
        saturdayList.appendChild(empty);
        return;
      }

      const sats = listSaturdaysBetween(today, lastDayDate);
      if (!sats.length) {
        const none = document.createElement("div");
        none.textContent = "No Saturdays in range";
        none.style.fontSize = "12px";
        none.style.color = "#7c2d12";
        saturdayList.appendChild(none);
        return;
      }

      const selectedSet = getOpenSaturdaysSet(lastDayInput.value);
      sats.forEach((dateObj) => {
        const iso = toIsoDate(dateObj);
        const item = document.createElement("label");
        item.style.display = "flex";
        item.style.alignItems = "center";
        item.style.gap = "8px";
        item.style.fontSize = "12px";
        item.style.color = "#7c2d12";
        item.style.marginBottom = "4px";

        const checkbox = document.createElement("input");
        checkbox.type = "checkbox";
        checkbox.checked = selectedSet.has(iso);
        checkbox.addEventListener("change", () => {
          if (checkbox.checked) {
            selectedSet.add(iso);
          } else {
            selectedSet.delete(iso);
          }
          saveOpenSaturdaysSet(lastDayInput.value, selectedSet);
          updatePopupCalculations(false);
        });

        const text = document.createElement("span");
        text.textContent = iso;

        item.appendChild(checkbox);
        item.appendChild(text);
        saturdayList.appendChild(item);
      });
    }

    function updatePopupCalculations(commitGoalValue) {
      const rawGoal = String(goalInput.value || "").trim();
      const goal = rawGoal ? normalizeGoalPercent(rawGoal) : storedGoalPercent;
      if (commitGoalValue) {
        goalInput.value = String(goal);
        setStoredGoalPercent(goal);
      }
      const lastIso = String(lastDayInput.value || "").trim();
      const lastDayDate = parseIsoDate(lastIso);
      if (commitGoalValue) {
        setStoredLastAcademicDay(lastIso);
      }

      const days = parseNonNegativeInt(daysInput.value, 0);
      const lectures = parseNonNegativeInt(lecturesInput.value, 0);
      daysInput.value = String(days);
      lecturesInput.value = String(lectures);

      const attended = getCurrentAttended(totalLectures, totalAbsent);
      const plannedMissed = days * DEFAULT_LECTURES_PER_DAY + lectures;

      // Scenario Simulator is independent from Academic Planner.
      // It only uses current attendance + user-entered days/lectures.
      const predictedPercentScenario = (attended / (totalLectures + plannedMissed)) * 100;
      const maxAtGoalScenario = getLeaveAllowance(totalLectures, totalAbsent, goal).maxMissableLectures;
      const goalOnlyAllowance = allowanceFromLectureCount(maxAtGoalScenario);
      const remainingScenarioLectures = Math.max(0, maxAtGoalScenario - plannedMissed);
      const remainingScenarioAllowance = allowanceFromLectureCount(remainingScenarioLectures);

      const today = getTodayAtMidnight();
      const openSaturdaySet = getOpenSaturdaysSet(lastIso);
      const classDaysTillLast = countScheduledClassDays(today, lastDayDate, openSaturdaySet);
      const futureLecturesTillLast = classDaysTillLast * DEFAULT_LECTURES_PER_DAY;

      const predictedNoAbsentPercent = (
        (attended + futureLecturesTillLast) /
        (totalLectures + futureLecturesTillLast)
      ) * 100;

      const maxAtGoal = Math.max(
        0,
        Math.floor(
          attended + futureLecturesTillLast - (goal / 100) * (totalLectures + futureLecturesTillLast)
        )
      );
      const cappedMaxAtGoal = Math.min(maxAtGoal, futureLecturesTillLast);
      const leavePossible = allowanceFromLectureCount(cappedMaxAtGoal);

      // Keep the inline summary synced with user-selected goal and plan.
      leaveChip.textContent = formatLeaveMessage(goalOnlyAllowance);
      outputPredicted.textContent = `Percentage: ${predictedPercentScenario.toFixed(2)}%`;
      outputRemaining.textContent = `Remaining: ${formatLeaveMessage(remainingScenarioAllowance)} (goal ${goal}%)`;
      outputNoAbsentPercent.textContent = `Till last day (no new absence): ${predictedNoAbsentPercent.toFixed(2)}%`;
      outputLeavePossible.textContent = `Leave possible: ${formatLeaveMessage(leavePossible)}`;
      outputClassDays.textContent = `Class days till last date: ${classDaysTillLast} (${futureLecturesTillLast} lectures)`;
    }

    goalInput.addEventListener("input", () => updatePopupCalculations(false));
    goalInput.addEventListener("change", () => updatePopupCalculations(true));
    goalInput.addEventListener("blur", () => updatePopupCalculations(true));

    lastDayInput.addEventListener("change", () => {
      setStoredLastAcademicDay(lastDayInput.value);
      rebuildSaturdayList();
      updatePopupCalculations(true);
    });

    saturdayToggle.addEventListener("click", (event) => {
      event.preventDefault();
      const opening = saturdayList.style.display === "none";
      saturdayList.style.display = opening ? "block" : "none";
      saturdayToggle.textContent = opening ? "Saturdays ^" : "Saturdays v";
    });

    [daysInput, lecturesInput].forEach((input) => {
      input.addEventListener("input", () => updatePopupCalculations(false));
      input.addEventListener("change", () => updatePopupCalculations(true));
      input.addEventListener("blur", () => updatePopupCalculations(true));
    });

    sectionA.appendChild(sectionATitle);
    sectionA.appendChild(createPopupField("Goal %", goalInput));
    sectionA.appendChild(createPopupField("Days", daysInput));
    sectionA.appendChild(createPopupField("Lectures", lecturesInput));
    sectionA.appendChild(outputPredicted);
    sectionA.appendChild(outputRemaining);

    sectionB.appendChild(sectionBTitle);
    const lastDayRow = document.createElement("div");
    lastDayRow.style.display = "flex";
    lastDayRow.style.alignItems = "center";
    lastDayRow.style.justifyContent = "space-between";
    lastDayRow.style.gap = "6px";
    lastDayRow.style.marginTop = "8px";
    lastDayRow.appendChild(createPopupField("Last day", lastDayInput));
    lastDayRow.appendChild(saturdayToggle);
    sectionB.appendChild(lastDayRow);
    sectionB.appendChild(saturdayList);
    sectionB.appendChild(outputNoAbsentPercent);
    sectionB.appendChild(outputLeavePossible);
    sectionB.appendChild(outputClassDays);

    popup.appendChild(sectionA);
    popup.appendChild(sectionB);
    const signature = document.createElement("div");
    signature.textContent = "~$hubhT24-28";
    signature.style.fontSize = "10px";
    signature.style.fontWeight = "600";
    signature.style.color = "#9ca3af";
    signature.style.textAlign = "right";
    signature.style.marginTop = "6px";
    popup.appendChild(signature);
    rebuildSaturdayList();
    updatePopupCalculations(true);

    toggleButton.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      const opening = popup.style.display === "none";
      popup.style.display = opening ? "block" : "none";
      toggleButton.textContent = opening ? "^" : "v";
    });

    document.addEventListener("click", (event) => {
      if (popup.style.display === "none") {
        return;
      }
      if (popup.contains(event.target) || toggleButton.contains(event.target)) {
        return;
      }
      popup.style.display = "none";
      toggleButton.textContent = "v";
    });

    wrapper.appendChild(leaveChip);
    wrapper.appendChild(upChip);
    wrapper.appendChild(downChip);
    toggleButton.textContent = "v";
    wrapper.appendChild(toggleButton);
    wrapper.appendChild(popup);

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

    // Keep desktop inline, but make mobile readable and non-overflowing.
    if (window.matchMedia("(max-width: 480px)").matches) {
      host.style.display = "block";
      host.style.flexDirection = "initial";
      host.style.flexWrap = "initial";
      host.style.alignItems = "initial";
      host.style.gap = "0";

      wrapper.style.display = "flex";
      wrapper.style.flexWrap = "wrap";
      wrapper.style.whiteSpace = "normal";
      wrapper.style.width = "100%";
      wrapper.style.boxSizing = "border-box";
      wrapper.style.justifyContent = "flex-start";
      wrapper.style.gap = "8px";
      wrapper.style.marginLeft = "0";
      wrapper.style.marginTop = "8px";
      wrapper.style.padding = "8px";

      [leaveChip].forEach((chip) => {
        chip.style.fontSize = "13px";
        chip.style.padding = "5px 8px";
      });
      [upChip, downChip].forEach((chip) => {
        chip.style.fontSize = "11px";
        chip.style.padding = "4px 6px";
      });
      popup.style.minWidth = "200px";
      popup.style.left = "0";
      popup.style.right = "auto";
    }

    host.appendChild(wrapper);
  }

  function injectInlinePredictor() {
    const totalLectures = findSummaryValue("Total Lecture");
    const totalAbsent = findSummaryValue("Total Absent + OAA");
    const currentPercent = findSummaryValue("Attendance % with PF");
    const attendanceContainer = findAttendanceContainer();

    if (
      totalLectures === null ||
      totalAbsent === null ||
      currentPercent === null ||
      !attendanceContainer
    ) {
      return false;
    }

    renderInlineTools(attendanceContainer, totalLectures, totalAbsent, currentPercent);
    return true;
  }

  function waitForSummary() {
    if (injectInlinePredictor()) {
      return;
    }

    const observer = new MutationObserver(() => {
      if (injectInlinePredictor()) {
        observer.disconnect();
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true
    });

    window.setTimeout(() => observer.disconnect(), 20000);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", waitForSummary, { once: true });
  } else {
    waitForSummary();
  }
})();
