const pomodoro = document.getElementById("pomodoro-timer");
const short = document.getElementById("short-timer");
const long = document.getElementById("long-timer");
const timers = document.querySelectorAll(".timer-display");
const session = document.getElementById("pomodoro-session");
const shortBreak = document.getElementById("short-break");
const longBreak = document.getElementById("long-break");
const startBtn = document.getElementById("start");
const stopBtn = document.getElementById("stop");
const timerMsg = document.getElementById("timer-message");

const tabTimer = document.getElementById("tab-timer");
const tabStats = document.getElementById("tab-stats");
const timerView = document.getElementById("timer-view");
const statsView = document.getElementById("stats-view");

const musicToggleBtn = document.getElementById("music-toggle");
const alarmSelect = document.getElementById("alarm-select");
const previewAlarmBtn = document.getElementById("preview-alarm");
const toggleTimerVisibilityBtn = document.getElementById(
  "toggle-timer-visibility",
);
const timerMain = document.getElementById("timer-main");

const weeklyUsageElement = document.getElementById("weekly-usage");
const monthlyUsageElement = document.getElementById("monthly-usage");
const statsHistoryElement = document.getElementById("stats-history");

const STORAGE_KEYS = {
  selectedAlarm: "pomodoro_selected_alarm",
  usageLog: "pomodoro_usage_log",
};

const SOUND_IDS = {
  background: "rYbAiMwDVXs",
  alarms: {
    fart: "vAuA4E83ZzE",
    vine: "Oc7Cin_87H4",
    bell: "w0MIJnSlRyo",
  },
};

let currentTimer = null;
let myInterval = null;
let endTimestamp = null;
let activeTimerSessionStart = null;

let isMusicMuted = false;
let isTimerHidden = false;

let bgMusicPlayer = null;
let alarmPlayer = null;

function getTimerMinutes(timerDisplay) {
  return Number.parseFloat(timerDisplay.getAttribute("data-duration")) || 0;
}

function getTimeElement(timerDisplay) {
  return timerDisplay.querySelector(".time");
}

function setTimerDisplayValue(timerDisplay, value) {
  const timeElement = getTimeElement(timerDisplay);
  if (timeElement) {
    timeElement.textContent = value;
  }
}

function formatTime(msRemaining) {
  const safeValue = Math.max(msRemaining, 0);
  const minutes = Math.floor(safeValue / 60000);
  const seconds = Math.floor((safeValue % 60000) / 1000);
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

function getTodayDateKey(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

function getStoredUsageLog() {
  const raw = localStorage.getItem(STORAGE_KEYS.usageLog);
  if (!raw) {
    return {};
  }

  try {
    const parsed = JSON.parse(raw);
    return typeof parsed === "object" && parsed !== null ? parsed : {};
  } catch (_error) {
    return {};
  }
}

function saveUsageLog(log) {
  localStorage.setItem(STORAGE_KEYS.usageLog, JSON.stringify(log));
}

function addUsage(seconds) {
  if (!Number.isFinite(seconds) || seconds <= 0) {
    return;
  }

  const usageLog = getStoredUsageLog();
  const key = getTodayDateKey();
  const currentValue = Number(usageLog[key]) || 0;
  usageLog[key] = currentValue + seconds;
  saveUsageLog(usageLog);
}

function formatSecondsToDuration(totalSeconds) {
  const minutes = Math.floor(totalSeconds / 60);
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;

  if (hours > 0) {
    return `${hours}h ${remainingMinutes}m`;
  }

  return `${minutes}m`;
}

function calculateWeeklyAndMonthlyUsage(usageLog) {
  const now = new Date();
  const startOfWeek = new Date(now);
  const day = startOfWeek.getDay();
  const diffToMonday = day === 0 ? 6 : day - 1;
  startOfWeek.setDate(startOfWeek.getDate() - diffToMonday);
  startOfWeek.setHours(0, 0, 0, 0);

  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth();

  let weeklySeconds = 0;
  let monthlySeconds = 0;

  Object.entries(usageLog).forEach(([dateString, seconds]) => {
    const date = new Date(`${dateString}T00:00:00`);
    const numericSeconds = Number(seconds) || 0;

    if (date >= startOfWeek && date <= now) {
      weeklySeconds += numericSeconds;
    }

    if (
      date.getFullYear() === currentYear &&
      date.getMonth() === currentMonth
    ) {
      monthlySeconds += numericSeconds;
    }
  });

  return { weeklySeconds, monthlySeconds };
}

function renderHistoryRows(usageLog) {
  const rows = Object.entries(usageLog)
    .sort((a, b) => new Date(b[0]) - new Date(a[0]))
    .slice(0, 30);

  statsHistoryElement.innerHTML = "";

  if (rows.length === 0) {
    const emptyRow = document.createElement("tr");
    emptyRow.innerHTML = "<td colspan='2'>No usage yet.</td>";
    statsHistoryElement.appendChild(emptyRow);
    return;
  }

  rows.forEach(([dateString, seconds]) => {
    const row = document.createElement("tr");
    row.innerHTML = `<td>${dateString}</td><td>${formatSecondsToDuration(Number(seconds) || 0)}</td>`;
    statsHistoryElement.appendChild(row);
  });
}

function renderStats() {
  const usageLog = getStoredUsageLog();
  const { weeklySeconds, monthlySeconds } =
    calculateWeeklyAndMonthlyUsage(usageLog);

  weeklyUsageElement.textContent = formatSecondsToDuration(weeklySeconds);
  monthlyUsageElement.textContent = formatSecondsToDuration(monthlySeconds);

  renderHistoryRows(usageLog);
}

function showDefaultTimer() {
  pomodoro.style.display = "block";
  short.style.display = "none";
  long.style.display = "none";
}

function hideAll() {
  timers.forEach((timer) => {
    timer.style.display = "none";
  });
}

function ensureMusicPlaying() {
  if (!bgMusicPlayer || isMusicMuted) {
    return;
  }

  const state =
    typeof bgMusicPlayer.getPlayerState === "function"
      ? bgMusicPlayer.getPlayerState()
      : null;
  if (state !== window.YT?.PlayerState?.PLAYING) {
    bgMusicPlayer.playVideo();
  }
}

function stopAndRecordSession() {
  if (myInterval) {
    clearInterval(myInterval);
    myInterval = null;
  }

  if (activeTimerSessionStart) {
    const elapsedSeconds = Math.floor(
      (Date.now() - activeTimerSessionStart) / 1000,
    );
    addUsage(elapsedSeconds);
    activeTimerSessionStart = null;
    renderStats();
  }
}

function playSelectedAlarm() {
  const selectedAlarm = alarmSelect.value;
  const selectedAlarmId =
    SOUND_IDS.alarms[selectedAlarm] || SOUND_IDS.alarms.fart;

  if (alarmPlayer && typeof alarmPlayer.loadVideoById === "function") {
    alarmPlayer.loadVideoById(selectedAlarmId);
    alarmPlayer.playVideo();
  }
}

function startTimer(timerDisplay) {
  if (!timerDisplay) {
    return;
  }

  stopAndRecordSession();

  const durationMinutes = getTimerMinutes(timerDisplay);
  const durationInMilliseconds = durationMinutes * 60 * 1000;

  if (durationInMilliseconds <= 0) {
    return;
  }

  endTimestamp = Date.now() + durationInMilliseconds;
  activeTimerSessionStart = Date.now();

  ensureMusicPlaying();

  myInterval = setInterval(() => {
    const timeRemaining = endTimestamp - Date.now();

    if (timeRemaining <= 0) {
      stopAndRecordSession();
      setTimerDisplayValue(timerDisplay, "00:00");
      playSelectedAlarm();
      return;
    }

    setTimerDisplayValue(timerDisplay, formatTime(timeRemaining));
  }, 1000);
}

function resetVisibleTimerToDefaultDuration() {
  const defaultMinutes = getTimerMinutes(currentTimer);
  const defaultTime = formatTime(defaultMinutes * 60 * 1000);
  setTimerDisplayValue(currentTimer, defaultTime);
}

function showTimerTab() {
  tabTimer.classList.add("active");
  tabStats.classList.remove("active");
  timerView.classList.remove("hidden-view");
  statsView.classList.add("hidden-view");
}

function showStatsTab() {
  tabTimer.classList.remove("active");
  tabStats.classList.add("active");
  timerView.classList.add("hidden-view");
  statsView.classList.remove("hidden-view");
  renderStats();
}

function saveSelectedAlarm() {
  localStorage.setItem(STORAGE_KEYS.selectedAlarm, alarmSelect.value);
}

function loadSelectedAlarm() {
  const savedAlarm = localStorage.getItem(STORAGE_KEYS.selectedAlarm);
  if (savedAlarm && SOUND_IDS.alarms[savedAlarm]) {
    alarmSelect.value = savedAlarm;
  }
}

function setMusicMuted(muted) {
  isMusicMuted = muted;

  if (!bgMusicPlayer) {
    musicToggleBtn.textContent = muted ? "Unmute Music" : "Mute Music";
    return;
  }

  if (muted) {
    bgMusicPlayer.mute();
    musicToggleBtn.textContent = "Unmute Music";
  } else {
    bgMusicPlayer.unMute();
    bgMusicPlayer.playVideo();
    musicToggleBtn.textContent = "Mute Music";
  }
}

function toggleTimerVisibility() {
  isTimerHidden = !isTimerHidden;

  if (isTimerHidden) {
    timerMain.classList.add("timer-hidden");
    toggleTimerVisibilityBtn.textContent = "Show Timer";
  } else {
    timerMain.classList.remove("timer-hidden");
    toggleTimerVisibilityBtn.textContent = "Hide Timer";
  }
}

window.onYouTubeIframeAPIReady = function onYouTubeIframeAPIReady() {
  bgMusicPlayer = new window.YT.Player("bg-music-player", {
    height: "1",
    width: "1",
    videoId: SOUND_IDS.background,
    playerVars: {
      autoplay: 0,
      controls: 0,
      loop: 1,
      modestbranding: 1,
      rel: 0,
      playlist: SOUND_IDS.background,
    },
    events: {
      onReady: () => {
        if (isMusicMuted) {
          bgMusicPlayer.mute();
        }
      },
    },
  });

  alarmPlayer = new window.YT.Player("alarm-player", {
    height: "1",
    width: "1",
    videoId: SOUND_IDS.alarms.fart,
    playerVars: {
      autoplay: 0,
      controls: 0,
      modestbranding: 1,
      rel: 0,
    },
  });
};

showDefaultTimer();
loadSelectedAlarm();
renderStats();

session.addEventListener("click", () => {
  hideAll();
  pomodoro.style.display = "block";

  session.classList.add("active");
  shortBreak.classList.remove("active");
  longBreak.classList.remove("active");

  currentTimer = pomodoro;
});

shortBreak.addEventListener("click", () => {
  hideAll();
  short.style.display = "block";

  session.classList.remove("active");
  shortBreak.classList.add("active");
  longBreak.classList.remove("active");

  currentTimer = short;
});

longBreak.addEventListener("click", () => {
  hideAll();
  long.style.display = "block";

  session.classList.remove("active");
  shortBreak.classList.remove("active");
  longBreak.classList.add("active");

  currentTimer = long;
});

startBtn.addEventListener("click", () => {
  if (currentTimer) {
    timerMsg.style.display = "none";
    startTimer(currentTimer);
  } else {
    timerMsg.style.display = "block";
  }
});

stopBtn.addEventListener("click", () => {
  if (!currentTimer) {
    return;
  }

  stopAndRecordSession();
  resetVisibleTimerToDefaultDuration();
});

musicToggleBtn.addEventListener("click", () => {
  setMusicMuted(!isMusicMuted);
});

previewAlarmBtn.addEventListener("click", () => {
  playSelectedAlarm();
});

alarmSelect.addEventListener("change", () => {
  saveSelectedAlarm();
});

toggleTimerVisibilityBtn.addEventListener("click", () => {
  toggleTimerVisibility();
});

tabTimer.addEventListener("click", showTimerTab);

tabStats.addEventListener("click", showStatsTab);
