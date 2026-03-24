// John64 - Scriptable Habit Tracker

// ==== USER CONFIGURATION ====
const HABIT_NAME = "English";
const FOLDER_NAME = "Habits";
const YEAR = 2026;

// 0 = January, 1 = February, ..., 11 = December
const START_DATE = new Date(YEAR, 2, 24);
const END_DATE = new Date(YEAR, 4, 24);

// Widget sizes in points for your device (pre-set for iPhone 13).
const DEVICE_WIDGET_SIZES = {
  small:  { w: 158, h: 158 },
  medium: { w: 348, h: 158 },
  large:  { w: 348, h: 354 },
};

// STYLE
const BACKGROUND_COLOR = "#000617";
const BACKGROUND_OPACITY = 0.5;
const TEXT_COLOR = new Color("#FFFFFF");

const GRID_COLOR_TODAY = new Color("#FFFFFF");
const GRID_COLOR_FILLED = new Color("#ffb135");
const GRID_COLOR_MISSED = new Color("#002738");
const GRID_COLOR_UNFILLED = new Color("#FFFFFF", 0.2);

const FONT_REGULAR = new Font("Menlo", 12);
const FONT_BOLD = new Font("Menlo-Bold", 12);

// 0 = YYYY-MM-DD | 1 = MM/DD/YYYY | 2 = DD/MM/YYYY
const USER_DATE_FORMAT = 2; 

// ==== END USER CONFIGURATION ====

// Widget family detection
const FAMILY = config.widgetFamily ?? "medium";

// Use device sizes defined above; fall back to medium if family is unknown
const { w: WIDGET_WIDTH, h: WIDGET_HEIGHT } =
  DEVICE_WIDGET_SIZES[FAMILY] ?? DEVICE_WIDGET_SIZES.medium;

// Padding — tight but safe for rounded corners
const PADDING_TOP = FAMILY === "small" ? 5 : 6;
const PADDING_BOTTOM = FAMILY === "small" ? 5 : 6;
const PADDING_HORIZONTAL = FAMILY === "small" ? 14 : 20;
const HEADER_TO_GRID_GAP = 3;
const HEADER_HEIGHT = 14;

// Spacing between squares
const MIN_SPACING = FAMILY === "small" ? 1.5 : 2;

// File management
const FILE_NAME = `${HABIT_NAME} ${YEAR}.json`;
const FM = FileManager.iCloud();
const HABITS_DIR = FM.joinPath(FM.documentsDirectory(), FOLDER_NAME);

if (!FM.fileExists(HABITS_DIR)) FM.createDirectory(HABITS_DIR);

const FILE_PATH = FM.joinPath(HABITS_DIR, FILE_NAME);

// Helpers
function formatDate(date) {
  const y = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  if (USER_DATE_FORMAT === 0) return `${y}-${mm}-${dd}`;
  if (USER_DATE_FORMAT === 1) return `${mm}/${dd}/${y}`;
  return `${dd}/${mm}/${y}`;
}

function getTodayKey() {
  return formatDate(new Date());
}

function loadHabitData() {
  if (FM.fileExists(FILE_PATH)) {
    const raw = FM.readString(FILE_PATH);
    try {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed))
        return parsed;
    } catch {
      FM.writeString(FILE_PATH + ".backup", raw);
    }
  }
  return {};
}

function saveHabitData(data) {
  FM.writeString(FILE_PATH, JSON.stringify(data, null, 2));
}

function getHabitStats(habitData, startDate) {
  const start = new Date(startDate);
  start.setHours(0, 0, 0, 0);

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const MS = 86400000;
  const daysElapsed = Math.max(1, Math.floor((today - start) / MS) + 1);

  let filledCount = 0;
  let tempStreak = 0;
  let maxStreak = 0;

  for (let i = 0; i < daysElapsed; i++) {
    const d = new Date(start.getTime() + i * MS);
    const key = formatDate(d);
    const filled = habitData[key] === true;

    if (filled) {
      filledCount++;
      tempStreak++;
      if (tempStreak > maxStreak) maxStreak = tempStreak;
    } else {
      if (d.getTime() < today.getTime()) tempStreak = 0;
    }
  }

  return { currentStreak: tempStreak, maxStreak, filledCount, daysElapsed };
}

// Auto-size: find the column count that yields the largest square.
function bestLayout(totalDays, usableW, usableH, spacing) {
  let bestSize = 0;
  let bestCols = 1;

  for (let c = 1; c <= totalDays; c++) {
    const r = Math.ceil(totalDays / c);
    const sw = (usableW - (c - 1) * spacing) / c;
    const sh = (usableH - (r - 1) * spacing) / r;
    const size = Math.min(sw, sh);

    if (size > bestSize) {
      bestSize = size;
      bestCols = c;
    }
  }

  return {
    columns: bestCols,
    rows: Math.ceil(totalDays / bestCols),
    elementSize: Math.min(bestSize, 28),
  };
}

// ==== INTERACTIVE MODE ====
if (!config.runsInWidget) {
  const data = loadHabitData();
  const today = getTodayKey();

  if (data[today] === true) {
    const alert = new Alert();
    alert.title = "Already registered";
    alert.message = "Do you want to remove today's progress?";
    alert.addAction("Keep it");
    alert.addDestructiveAction("Remove");
    const r = await alert.present();
    if (r === 1) { data[today] = false; saveHabitData(data); }
  } else {
    data[today] = true;
    saveHabitData(data);
  }

  Script.complete();
  return;
}

// Widget rendering
const HABIT_DATA = loadHabitData();
const TODAY_KEY = getTodayKey();
const NOW = new Date();
const MS_PER_DAY = 86400000;
const DAYS_TOTAL = Math.round((END_DATE - START_DATE) / MS_PER_DAY) + 1;

if (!(TODAY_KEY in HABIT_DATA)) {
  HABIT_DATA[TODAY_KEY] = false;
  saveHabitData(HABIT_DATA);
}

// Available space for the grid
const USABLE_W = WIDGET_WIDTH - PADDING_HORIZONTAL * 2;
const USABLE_H = WIDGET_HEIGHT - PADDING_TOP - PADDING_BOTTOM - HEADER_HEIGHT - HEADER_TO_GRID_GAP;

// Small safety buffer so floating-point sizes never cause the grid to overflow
const SAFE_W = USABLE_W - 2;
const SAFE_H = USABLE_H - 2;

const { columns: COLUMNS, rows: ROWS, elementSize: ELEMENT_SIZE } =
  bestLayout(DAYS_TOTAL, SAFE_W, SAFE_H, MIN_SPACING);

// Corner radius scales with square size (~25%)
const ELEMENT_RADIUS = Math.max(1, Math.round(ELEMENT_SIZE * 0.25));

// Build widget
const widget = new ListWidget();
widget.setPadding(PADDING_TOP, PADDING_HORIZONTAL, PADDING_BOTTOM, PADDING_HORIZONTAL);

const overlay = new LinearGradient();
overlay.locations = [0, 1];
overlay.colors = [
  new Color(BACKGROUND_COLOR, BACKGROUND_OPACITY),
  new Color(BACKGROUND_COLOR, BACKGROUND_OPACITY),
];
widget.backgroundGradient = overlay;

const stats = getHabitStats(HABIT_DATA, START_DATE);

// Header
const header = widget.addStack();
header.layoutHorizontally();
header.centerAlignContent();

// Wrap each element in its own stack for consistent vertical alignment
const leftWrap = header.addStack();
leftWrap.centerAlignContent();
const streakText = leftWrap.addText(`${stats.currentStreak}/${stats.maxStreak}`);
streakText.font = FONT_REGULAR;
streakText.textColor = new Color(TEXT_COLOR.hex, 0.6);

// Flexible spacers push the title to the exact center
header.addSpacer();
const centerWrap = header.addStack();
centerWrap.centerAlignContent();
const titleText = centerWrap.addText(HABIT_NAME);
titleText.font = FONT_BOLD;
titleText.textColor = TEXT_COLOR;
header.addSpacer();

const rightWrap = header.addStack();
rightWrap.centerAlignContent();
const progressText = rightWrap.addText(`${stats.filledCount}/${stats.daysElapsed}`);
progressText.font = FONT_REGULAR;
progressText.textColor = new Color(TEXT_COLOR.hex, 0.6);

// Fixed gap: header → grid
widget.addSpacer(HEADER_TO_GRID_GAP);

// Grid
const todayMidnight = new Date(NOW);
todayMidnight.setHours(0, 0, 0, 0);

// Compute exact grid width and derive a precise fixed margin.
const GRID_W = COLUMNS * ELEMENT_SIZE + (COLUMNS - 1) * MIN_SPACING;
const SIDE_MARGIN = Math.max(0, (USABLE_W - GRID_W) / 2);

const gridContainer = widget.addStack();
gridContainer.layoutHorizontally();
gridContainer.addSpacer(SIDE_MARGIN);

const gridStack = gridContainer.addStack();
gridStack.layoutVertically();
gridStack.spacing = MIN_SPACING;

for (let row = 0; row < ROWS; row++) {
  const rowStack = gridStack.addStack();
  rowStack.layoutHorizontally();
  rowStack.spacing = MIN_SPACING;

  for (let col = 0; col < COLUMNS; col++) {
    const dayIndex = row * COLUMNS + col;

    if (dayIndex >= DAYS_TOTAL) {
      // Invisible placeholder — keeps last row aligned
      const ph = rowStack.addStack();
      ph.size = new Size(ELEMENT_SIZE, ELEMENT_SIZE);
      continue;
    }

    const dayDate = new Date(START_DATE.getTime() + dayIndex * MS_PER_DAY);
    const key = formatDate(dayDate);
    const filled = HABIT_DATA[key] === true;
    const isToday = dayDate.toDateString() === NOW.toDateString();
    const isPast = dayDate < todayMidnight;

    const square = rowStack.addStack();
    square.size = new Size(ELEMENT_SIZE, ELEMENT_SIZE);
    square.cornerRadius = ELEMENT_RADIUS;

    if (filled) square.backgroundColor = GRID_COLOR_FILLED;
    else if (isToday) square.backgroundColor = GRID_COLOR_TODAY;
    else if (isPast) square.backgroundColor = GRID_COLOR_MISSED;
    else square.backgroundColor = GRID_COLOR_UNFILLED;
  }
}

gridContainer.addSpacer(SIDE_MARGIN);

// Absorbs leftover vertical space on large widgets
widget.addSpacer();

Script.setWidget(widget);
Script.complete();