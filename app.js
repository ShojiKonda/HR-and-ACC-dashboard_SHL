const state = {
  activeTab: 'resting-tab',
  rest: {
    rows: [],
    ids: [],
    selectedId: '',
    loadedFiles: [],
    failedFiles: [],
  },
  exercise: {
    folders: [],
    folderLabelMap: new Map(),
    selectedFolder: '',
    selectedId: '',
    rowsByFolder: new Map(),
    loadedByFolder: new Map(),
    failedByFolder: new Map(),
    loadingFolders: new Set(),
    timeStart: null,
    timeEnd: null,
  },
  hover: null,
};

const CONFIG = {
  repoFullName: 'ShojiKonda/HR-and-ACC-dashboard_SHL',
  branch: 'main',
  dataRoot: 'data',
  restFolder: 'data/2026_05_25',
  restDate: '2026-05-25',
  exercisePreferredFolder: 'data/2026_06_01',
  restStartSecond: 11 * 3600 + 20 * 60,
  restEndSecond: 11 * 3600 + 45 * 60,
  histogramBinWidth: 5,
  phaseWindows: [
    { key: 'walkHr', label: '歩行', timeLabel: '11:24〜11:28', start: 11 * 3600 + 24 * 60, end: 11 * 3600 + 28 * 60 },
    { key: 'standHr', label: '立位', timeLabel: '11:32〜11:33', start: 11 * 3600 + 32 * 60, end: 11 * 3600 + 33 * 60 },
    { key: 'sitHr', label: '座位', timeLabel: '11:34〜11:35', start: 11 * 3600 + 34 * 60, end: 11 * 3600 + 35 * 60 },
    { key: 'supineHr', label: '臥位', timeLabel: '11:36〜11:40', start: 11 * 3600 + 36 * 60, end: 11 * 3600 + 40 * 60 },
  ],
  summaryWindows: [
    { key: 'standHr', canvasId: 'standHistogramCanvas', label: '立位', timeLabel: '11:32〜11:33', start: 11 * 3600 + 32 * 60, end: 11 * 3600 + 33 * 60 },
    { key: 'sitHr', canvasId: 'sitHistogramCanvas', label: '座位', timeLabel: '11:34〜11:35', start: 11 * 3600 + 34 * 60, end: 11 * 3600 + 35 * 60 },
    { key: 'supineHr', canvasId: 'supineHistogramCanvas', label: '臥位', timeLabel: '11:36〜11:40', start: 11 * 3600 + 36 * 60, end: 11 * 3600 + 40 * 60 },
  ],
};

const COLORS = {
  ink: '#ffffff',
  muted: '#cbd5e1',
  grid: 'rgba(255, 255, 255, 0.24)',
  axis: '#ffffff',
  chartBg: '#111827',
  orange: '#fb923c',
  classLine: '#e5edf7',
  blue: '#60a5fa',
  cyan: '#22d3ee',
  yellow: '#facc15',
  green: '#34d399',
  red: '#f87171',
  accX: '#f87171',
  accY: '#34d399',
  accZ: '#60a5fa',
};

const CHART_FONT_FAMILY = '"Noto Sans JP", "Hiragino Sans", "Yu Gothic", "Yu Gothic UI", Meiryo, sans-serif';
const chartFont = (weight, size) => `${weight} ${size}px ${CHART_FONT_FAMILY}`;
const el = (id) => document.getElementById(id);
const contentsApiUrl = (path) => `https://api.github.com/repos/${CONFIG.repoFullName}/contents/${path}?ref=${CONFIG.branch}`;
const rawUrl = (path) => `https://raw.githubusercontent.com/${CONFIG.repoFullName}/${CONFIG.branch}/${path}`;

function parseNumber(value) {
  if (value === null || value === undefined) return NaN;
  const cleaned = String(value).replace(/,/g, '').trim();
  if (cleaned === '') return NaN;
  return Number(cleaned);
}

function fmtNumber(value, digits = 0) {
  if (!Number.isFinite(value)) return '-';
  return Number(value).toLocaleString('ja-JP', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

function mean(values) {
  const good = values.filter(Number.isFinite);
  return good.length ? good.reduce((a, b) => a + b, 0) / good.length : NaN;
}

function splitCsvLine(line) {
  const cells = [];
  let current = '';
  let quote = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (quote && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        quote = !quote;
      }
    } else if (ch === ',' && !quote) {
      cells.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  cells.push(current);
  return cells.map((x) => x.trim());
}

function parseCsv(text) {
  return text
    .replace(/^\uFEFF/, '')
    .split(/\r?\n/)
    .filter((line) => line.trim() !== '')
    .map(splitCsvLine);
}

async function fetchText(path) {
  const res = await fetch(path, { cache: 'no-store' });
  if (!res.ok) throw new Error(`Cannot fetch ${path}`);
  return await res.text();
}

async function listFolder(path) {
  const res = await fetch(contentsApiUrl(path), {
    cache: 'no-store',
    headers: { Accept: 'application/vnd.github+json' },
  });
  if (!res.ok) throw new Error(`Cannot list ${path}`);
  const items = await res.json();
  if (!Array.isArray(items)) throw new Error(`${path} の一覧を取得できません。`);
  return items;
}

async function listCsvFilesInFolder(folder) {
  const items = await listFolder(folder);
  return items
    .filter((item) => item.type === 'file')
    .filter((item) => /\.csv$/i.test(item.name))
    .sort((a, b) => a.name.localeCompare(b.name, 'ja'))
    .map((item) => ({
      name: item.name,
      path: item.path,
      url: item.download_url || rawUrl(item.path),
    }));
}

function findColumn(header, candidates) {
  const lower = header.map((h) => String(h).trim().toLowerCase().replace(/[\s_\-()\[\]（）]/g, ''));
  for (const name of candidates) {
    const key = String(name).toLowerCase().replace(/[\s_\-()\[\]（）]/g, '');
    const exact = lower.indexOf(key);
    if (exact >= 0) return exact;
    const partial = lower.findIndex((h) => h.includes(key) || key.includes(h));
    if (partial >= 0) return partial;
  }
  return -1;
}

function headerIndex(rows) {
  return rows.findIndex((row) => {
    const lower = row.map((x) => String(x).trim().toLowerCase());
    return lower.includes('sensorid') &&
      (lower.includes('timestamp') || lower.includes('minute') || lower.includes('time')) &&
      (lower.includes('heartrate') || lower.includes('heart rate') || lower.includes('hr') || lower.includes('heartrate_bpm') || lower.includes('meanheartrate_bpm'));
  });
}

function normalizeDate(raw, fallbackDate) {
  const s = String(raw || '').trim();
  const m = s.match(/(20\d{2})[-/](\d{1,2})[-/](\d{1,2})/);
  if (!m) return fallbackDate;
  return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
}

function dateFromFolder(folder) {
  const m = String(folder || '').match(/(20\d{2})_(\d{2})_(\d{2})/);
  if (!m) return CONFIG.restDate;
  return `${m[1]}-${m[2]}-${m[3]}`;
}

function folderLabel(folder) {
  const m = String(folder || '').match(/(20\d{2})_(\d{2})_(\d{2})/);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : folder.replace(/^data\//, '');
}

function normalizeTimestamp(raw, fallbackDate) {
  const s = String(raw || '').trim();
  let m = s.match(/(20\d{2})[-/](\d{1,2})[-/](\d{1,2})[ T](\d{1,2}):(\d{2})(?::(\d{2}))?/);
  if (m) {
    const date = `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
    const h = Number(m[4]);
    const min = Number(m[5]);
    const sec = Number(m[6] || 0);
    return {
      date,
      secondOfDay: h * 3600 + min * 60 + sec,
      time: `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}:${String(sec).padStart(2, '0')}`,
    };
  }
  m = s.match(/(\d{1,2}):(\d{2})(?::(\d{2}))?/);
  if (m) {
    const h = Number(m[1]);
    const min = Number(m[2]);
    const sec = Number(m[3] || 0);
    return {
      date: fallbackDate,
      secondOfDay: h * 3600 + min * 60 + sec,
      time: `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}:${String(sec).padStart(2, '0')}`,
    };
  }
  return null;
}

function parseSensorCsv(text, fileName = '', fallbackDate = CONFIG.restDate) {
  const rows = parseCsv(text);
  if (!rows.length) return [];

  let idx = headerIndex(rows);
  if (idx < 0) idx = 0;
  const header = rows[idx];
  const dateIdx = findColumn(header, ['Date', '日付']);
  const idIdx = findColumn(header, ['SensorID', 'ID', 'id']);
  const timeIdx = findColumn(header, ['Timestamp', 'Minute', 'DateTime', 'Time', '時刻']);
  const hrIdx = findColumn(header, ['HeartRate', 'Heart Rate', 'HeartRate_bpm', 'MeanHeartRate_bpm', 'HR', '心拍数']);
  const accNormIdx = findColumn(header, ['AccNorm', 'AccelerationNorm', 'ACCNorm', '加速度ノルム']);
  const accXIdx = findColumn(header, ['ACC_X', 'AccX', 'ACC X', 'Acceleration X', 'X']);
  const accYIdx = findColumn(header, ['ACC_Y', 'AccY', 'ACC Y', 'Acceleration Y', 'Y']);
  const accZIdx = findColumn(header, ['ACC_Z', 'AccZ', 'ACC Z', 'Acceleration Z', 'Z']);

  if (idIdx < 0 || timeIdx < 0 || hrIdx < 0) {
    throw new Error(`${fileName}: 必要な列（SensorID, Timestamp, HeartRate）が見つかりません。`);
  }

  return rows.slice(idx + 1).map((r, i) => {
    const rowDate = dateIdx >= 0 ? normalizeDate(r[dateIdx], fallbackDate) : fallbackDate;
    const parsedTime = normalizeTimestamp(r[timeIdx], rowDate);
    if (!parsedTime) return null;
    const sensorId = String(r[idIdx] || '').trim();
    if (!sensorId) return null;
    const hr = parseNumber(r[hrIdx]);
    const accNorm = accNormIdx >= 0 ? parseNumber(r[accNormIdx]) : NaN;
    const accX = accXIdx >= 0 ? parseNumber(r[accXIdx]) : NaN;
    const accY = accYIdx >= 0 ? parseNumber(r[accYIdx]) : NaN;
    const accZ = accZIdx >= 0 ? parseNumber(r[accZIdx]) : NaN;
    if (![hr, accNorm, accX, accY, accZ].some(Number.isFinite)) return null;
    return {
      sourceIndex: i,
      sourceFile: fileName,
      sensorId,
      date: parsedTime.date,
      secondOfDay: parsedTime.secondOfDay,
      time: parsedTime.time,
      hr,
      accNorm,
      accX,
      accY,
      accZ,
    };
  }).filter(Boolean);
}

function setLoadStatus(kind, title, detail = '') {
  const dot = el('statusDot');
  dot.classList.remove('loading', 'ready', 'error');
  dot.classList.add(kind);
  el('loadStatusTitle').textContent = title;
  el('loadStatusDetail').textContent = detail;
}

function setActiveTab(tabId) {
  state.activeTab = tabId;
  document.querySelectorAll('.dashboard-tab').forEach((btn) => {
    const isActive = btn.dataset.tabTarget === tabId;
    btn.classList.toggle('active', isActive);
    btn.setAttribute('aria-selected', isActive ? 'true' : 'false');
  });
  document.querySelectorAll('.tab-panel').forEach((panel) => {
    const isActive = panel.id === tabId;
    panel.classList.toggle('active', isActive);
    panel.hidden = !isActive;
  });
  state.hover = null;

  if (tabId === 'exercise-tab') {
    const folder = state.exercise.selectedFolder;
    const loaded = folder ? state.exercise.loadedByFolder.get(folder) : [];
    if (folder && (!loaded || !loaded.length)) loadExerciseFolder(folder);
    else updateStatusForActiveTab();
  } else {
    updateStatusForActiveTab();
  }
  drawAll();
}

function updateStatusForActiveTab() {
  if (state.activeTab === 'exercise-tab') {
    const folder = state.exercise.selectedFolder;
    if (!folder) return setLoadStatus('loading', '読み込み中', '計測日フォルダを確認しています');
    if (state.exercise.loadingFolders.has(folder)) return setLoadStatus('loading', '読み込み中', `${folder} のCSVを読み込んでいます`);
    const loaded = state.exercise.loadedByFolder.get(folder) || [];
    const failed = state.exercise.failedByFolder.get(folder) || [];
    if (!loaded.length && failed.length) return setLoadStatus('error', '読込失敗', `${folder} を確認してください`);
    if (failed.length) return setLoadStatus('error', '一部読込失敗', `${loaded.length} CSV読込 / ${failed.length} CSV失敗`);
    if (loaded.length) return setLoadStatus('ready', '読込完了', `${folder}: ${loaded.length} CSV`);
    return setLoadStatus('loading', '読み込み中', `${folder} を確認しています`);
  }

  const loaded = state.rest.loadedFiles;
  const failed = state.rest.failedFiles;
  if (!loaded.length && failed.length) return setLoadStatus('error', '読込失敗', `${CONFIG.restFolder} を確認してください`);
  if (failed.length) return setLoadStatus('error', '一部読込失敗', `${loaded.length} CSV読込 / ${failed.length} CSV失敗`);
  if (loaded.length) return setLoadStatus('ready', '読込完了', `${loaded.length} CSV`);
  return setLoadStatus('loading', '読み込み中', `${CONFIG.restFolder} 内のCSVを確認しています`);
}

async function loadFolderRows(folder) {
  const files = await listCsvFilesInFolder(folder);
  const loadedRows = [];
  const loadedFiles = [];
  const failedFiles = [];
  const fallbackDate = dateFromFolder(folder);

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    setLoadStatus('loading', '読み込み中', `${folder}: ${i + 1}/${files.length} CSV`);
    try {
      const text = await fetchText(file.url);
      const rows = parseSensorCsv(text, file.name, fallbackDate);
      loadedRows.push(...rows);
      loadedFiles.push(file.name);
    } catch (err) {
      failedFiles.push({ name: file.name, error: err.message || String(err) });
    }
  }
  return { rows: loadedRows, loadedFiles, failedFiles };
}

async function loadRestFolder() {
  updateStatusForActiveTab();
  drawAll();
  try {
    const { rows, loadedFiles, failedFiles } = await loadFolderRows(CONFIG.restFolder);
    state.rest.rows = rows;
    state.rest.loadedFiles = loadedFiles;
    state.rest.failedFiles = failedFiles;
    updateRestIdSelect();
    updateStatusForActiveTab();
    if (failedFiles.length) console.warn('Rest CSV read failures:', failedFiles);
    drawAll();
  } catch (err) {
    console.error(err);
    state.rest.failedFiles = [{ name: CONFIG.restFolder, error: err.message || String(err) }];
    updateRestIdSelect();
    updateStatusForActiveTab();
    drawAll();
  }
}

async function initializeExerciseFolders() {
  try {
    const items = await listFolder(CONFIG.dataRoot);
    const folders = items
      .filter((item) => item.type === 'dir')
      .filter((item) => /20\d{2}_\d{2}_\d{2}/.test(item.name))
      .map((item) => item.path)
      .sort((a, b) => a.localeCompare(b, 'ja'));

    state.exercise.folders = folders.length ? folders : [CONFIG.restFolder];
    const preferred = state.exercise.folders.includes(CONFIG.exercisePreferredFolder)
      ? CONFIG.exercisePreferredFolder
      : (state.exercise.folders.find((folder) => folder !== CONFIG.restFolder) || state.exercise.folders[0]);
    state.exercise.selectedFolder = preferred;
    updateExerciseDateSelect();
    updateExerciseIdSelect();
    if (state.activeTab === 'exercise-tab') loadExerciseFolder(preferred);
  } catch (err) {
    console.error(err);
    state.exercise.folders = [CONFIG.restFolder, CONFIG.exercisePreferredFolder];
    state.exercise.selectedFolder = CONFIG.exercisePreferredFolder;
    updateExerciseDateSelect();
    updateExerciseIdSelect();
  }
}

async function loadExerciseFolder(folder) {
  if (!folder || state.exercise.loadingFolders.has(folder)) return;
  state.exercise.loadingFolders.add(folder);
  updateStatusForActiveTab();
  drawAll();

  try {
    const { rows, loadedFiles, failedFiles } = await loadFolderRows(folder);
    state.exercise.rowsByFolder.set(folder, rows);
    state.exercise.loadedByFolder.set(folder, loadedFiles);
    state.exercise.failedByFolder.set(folder, failedFiles);
    if (failedFiles.length) console.warn('Exercise CSV read failures:', failedFiles);
  } catch (err) {
    console.error(err);
    state.exercise.rowsByFolder.set(folder, []);
    state.exercise.loadedByFolder.set(folder, []);
    state.exercise.failedByFolder.set(folder, [{ name: folder, error: err.message || String(err) }]);
  } finally {
    state.exercise.loadingFolders.delete(folder);
    updateExerciseIdSelect();
    updateExerciseTimeSelects();
    updateStatusForActiveTab();
    drawAll();
  }
}

function getRestTargetRows() {
  return state.rest.rows
    .filter((r) => r.date === CONFIG.restDate)
    .filter((r) => r.secondOfDay >= CONFIG.restStartSecond && r.secondOfDay <= CONFIG.restEndSecond)
    .sort((a, b) => a.secondOfDay - b.secondOfDay || a.sensorId.localeCompare(b.sensorId));
}

function getExerciseRows() {
  const folder = state.exercise.selectedFolder;
  return (state.exercise.rowsByFolder.get(folder) || [])
    .slice()
    .sort((a, b) => a.secondOfDay - b.secondOfDay || a.sensorId.localeCompare(b.sensorId));
}

function getExerciseDataRange() {
  const rows = getExerciseRows();
  const seconds = rows.map((r) => r.secondOfDay).filter(Number.isFinite);
  if (!seconds.length) return { start: 0, end: 1 };
  const start = Math.floor(Math.min(...seconds) / 300) * 300;
  const end = Math.ceil(Math.max(...seconds) / 300) * 300;
  return { start, end: Math.max(end, start + 300) };
}

function ensureExerciseTimeRange() {
  const dataRange = getExerciseDataRange();
  if (!getExerciseRows().length) {
    state.exercise.timeStart = null;
    state.exercise.timeEnd = null;
    return;
  }
  if (state.exercise.timeStart === null || state.exercise.timeStart < dataRange.start || state.exercise.timeStart >= dataRange.end) {
    state.exercise.timeStart = dataRange.start;
  }
  if (state.exercise.timeEnd === null || state.exercise.timeEnd > dataRange.end || state.exercise.timeEnd <= state.exercise.timeStart) {
    state.exercise.timeEnd = dataRange.end;
  }
  if (state.exercise.timeEnd <= state.exercise.timeStart) {
    state.exercise.timeEnd = Math.min(dataRange.end, state.exercise.timeStart + 300);
  }
}

function getExerciseTimeRange() {
  ensureExerciseTimeRange();
  if (state.exercise.timeStart === null || state.exercise.timeEnd === null) return { start: 0, end: 1 };
  return { start: state.exercise.timeStart, end: Math.max(state.exercise.timeEnd, state.exercise.timeStart + 60) };
}

function getExerciseRowsInRange() {
  const range = getExerciseTimeRange();
  return getExerciseRows().filter((r) => r.secondOfDay >= range.start && r.secondOfDay <= range.end);
}

function exerciseTimeOptions() {
  const rows = getExerciseRows();
  if (!rows.length) return [];
  const dataRange = getExerciseDataRange();
  const out = [];
  for (let s = dataRange.start; s <= dataRange.end; s += 300) out.push(s);
  return out;
}

function updateRestIdSelect() {
  const select = el('restIdSelect');
  const targetRows = getRestTargetRows();
  const ids = [...new Set(targetRows.map((r) => r.sensorId))].sort((a, b) => a.localeCompare(b, 'ja'));
  state.rest.ids = ids;

  select.innerHTML = '';
  if (!ids.length) {
    select.appendChild(new Option(state.rest.loadedFiles.length ? '対象データなし' : 'CSVを読み込み中', ''));
    select.disabled = true;
    state.rest.selectedId = '';
    return;
  }

  ids.forEach((id) => select.appendChild(new Option(id, id)));
  select.disabled = false;
  if (ids.includes(state.rest.selectedId)) {
    select.value = state.rest.selectedId;
  } else {
    state.rest.selectedId = ids[0];
    select.value = state.rest.selectedId;
  }
}

function updateExerciseDateSelect() {
  const select = el('exerciseDateSelect');
  select.innerHTML = '';
  if (!state.exercise.folders.length) {
    select.appendChild(new Option('計測日なし', ''));
    select.disabled = true;
    return;
  }
  state.exercise.folders.forEach((folder) => {
    select.appendChild(new Option(folderLabel(folder), folder));
  });
  select.disabled = false;
  select.value = state.exercise.selectedFolder || state.exercise.folders[0];
}

function updateExerciseIdSelect() {
  const select = el('exerciseIdSelect');
  const rows = getExerciseRows();
  const ids = [...new Set(rows.map((r) => r.sensorId))].sort((a, b) => a.localeCompare(b, 'ja'));

  select.innerHTML = '';
  if (!ids.length) {
    select.appendChild(new Option(rows.length ? '対象IDなし' : 'CSVを読み込み中', ''));
    select.disabled = true;
    state.exercise.selectedId = '';
    return;
  }
  ids.forEach((id) => select.appendChild(new Option(id, id)));
  select.disabled = false;
  if (ids.includes(state.exercise.selectedId)) {
    select.value = state.exercise.selectedId;
  } else {
    state.exercise.selectedId = ids[0];
    select.value = state.exercise.selectedId;
  }
}

function updateExerciseTimeSelects() {
  const startSelect = el('exerciseTimeStartSelect');
  const endSelect = el('exerciseTimeEndSelect');
  if (!startSelect || !endSelect) return;
  const opts = exerciseTimeOptions();
  if (!opts.length) {
    startSelect.innerHTML = '<option value="">-</option>';
    endSelect.innerHTML = '<option value="">-</option>';
    startSelect.disabled = true;
    endSelect.disabled = true;
    return;
  }
  ensureExerciseTimeRange();
  startSelect.disabled = false;
  endSelect.disabled = false;
  startSelect.innerHTML = opts.map((s) => `<option value="${s}" ${s === state.exercise.timeStart ? 'selected' : ''}>${secondToLabel(s)}</option>`).join('');
  endSelect.innerHTML = opts.map((s) => `<option value="${s}" ${s === state.exercise.timeEnd ? 'selected' : ''}>${secondToLabel(s)}</option>`).join('');
}

function buildSeries(rows, selectedId, metric, mode = 'selected') {
  const targetRows = mode === 'selected' ? rows.filter((r) => r.sensorId === selectedId) : rows;
  const bySecond = new Map();
  if (mode === 'selected') {
    targetRows.forEach((r) => {
      const value = r[metric];
      if (!Number.isFinite(value)) return;
      if (!bySecond.has(r.secondOfDay)) bySecond.set(r.secondOfDay, []);
      bySecond.get(r.secondOfDay).push(value);
    });
    return [...bySecond.entries()].sort((a, b) => a[0] - b[0]).map(([second, values]) => ({ second, value: mean(values), n: values.length }));
  }

  const bySecondById = new Map();
  targetRows.forEach((r) => {
    const value = r[metric];
    if (!Number.isFinite(value)) return;
    if (!bySecondById.has(r.secondOfDay)) bySecondById.set(r.secondOfDay, new Map());
    const idMap = bySecondById.get(r.secondOfDay);
    if (!idMap.has(r.sensorId)) idMap.set(r.sensorId, []);
    idMap.get(r.sensorId).push(value);
  });
  return [...bySecondById.entries()].sort((a, b) => a[0] - b[0]).map(([second, idMap]) => {
    const idMeans = [...idMap.values()].map(mean).filter(Number.isFinite);
    return { second, value: mean(idMeans), n: idMeans.length };
  });
}

function secondToLabel(second, withSeconds = false) {
  const h = Math.floor(second / 3600);
  const m = Math.floor((second % 3600) / 60);
  const s = Math.floor(second % 60);
  return withSeconds
    ? `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
    : `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function niceTickStep(value, targetTicks = 5) {
  const safe = Number.isFinite(value) && value > 0 ? value : 1;
  const rawStep = safe / Math.max(1, targetTicks);
  const magnitude = 10 ** Math.floor(Math.log10(rawStep));
  const candidates = [1, 2, 2.5, 5, 10].map((m) => m * magnitude);
  return candidates.find((step) => step >= rawStep) || 10 * magnitude;
}

function getYAxis(values, fallback, targetTicks = 5) {
  const good = values.filter(Number.isFinite);
  if (!good.length) return fallback;
  const minRaw = Math.min(...good);
  const maxRaw = Math.max(...good);
  const span = Math.max(Math.abs(maxRaw - minRaw), fallback.minSpan || 1);
  const pad = Math.max(fallback.pad || 0.1, span * 0.12);
  let min = minRaw - pad;
  let max = maxRaw + pad;
  const step = niceTickStep(max - min, targetTicks);
  min = Math.floor(min / step) * step;
  max = Math.ceil(max / step) * step;
  return { min, max, step };
}

function getCanvasContext(canvas) {
  const baseWidth = Number(canvas.dataset.baseWidth || canvas.getAttribute('width') || canvas.width || 1180);
  const baseHeight = Number(canvas.dataset.baseHeight || canvas.getAttribute('height') || canvas.height || 430);
  canvas.dataset.baseWidth = String(baseWidth);
  canvas.dataset.baseHeight = String(baseHeight);

  const rect = canvas.getBoundingClientRect();
  const cssWidth = Math.max(1, Math.round(rect.width || baseWidth));
  const cssHeight = Math.max(1, Math.round(cssWidth * baseHeight / baseWidth));
  const dpr = Math.max(1, Math.min(window.devicePixelRatio || 1, 2));
  const targetWidth = Math.round(cssWidth * dpr);
  const targetHeight = Math.round(cssHeight * dpr);

  if (canvas.width !== targetWidth || canvas.height !== targetHeight) {
    canvas.width = targetWidth;
    canvas.height = targetHeight;
  }
  canvas.style.height = `${cssHeight}px`;

  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.imageSmoothingEnabled = false;
  return { ctx, w: cssWidth, h: cssHeight };
}

function clearCanvas(ctx, w, h) {
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = COLORS.chartBg;
  ctx.fillRect(0, 0, w, h);
}

function chartBox(w, h, left = 92, top = 32, right = 36, bottom = 68) {
  const box = { left, top, right: w - right, bottom: h - bottom };
  box.width = box.right - box.left;
  box.height = box.bottom - box.top;
  return box;
}

function drawNoData(ctx, w, h, text) {
  clearCanvas(ctx, w, h);
  ctx.fillStyle = COLORS.muted;
  ctx.font = chartFont(700, 20);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, w / 2, h / 2);
}

function drawTimeGrid(ctx, box, axis, yLabel, digits, range, tickMinutes = 5) {
  const yRange = Math.max(1e-9, axis.max - axis.min);
  const start = range.start;
  const end = range.end;

  ctx.save();
  ctx.strokeStyle = COLORS.grid;
  ctx.lineWidth = 1.2;
  ctx.fillStyle = COLORS.muted;
  ctx.font = chartFont(700, 15);
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';

  for (let v = axis.min; v <= axis.max + 1e-9; v += axis.step) {
    const y = box.bottom - ((v - axis.min) / yRange) * box.height;
    ctx.beginPath();
    ctx.moveTo(box.left, y);
    ctx.lineTo(box.right, y);
    ctx.stroke();
    ctx.fillText(fmtNumber(v, digits), box.left - 12, y);
  }

  const rangeMinutes = Math.max(1, (end - start) / 60);
  const step = rangeMinutes > 90 ? 15 * 60 : tickMinutes * 60;
  const firstTick = Math.ceil(start / step) * step;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  for (let s = firstTick; s <= end + 1e-9; s += step) {
    const x = box.left + ((s - start) / (end - start)) * box.width;
    ctx.beginPath();
    ctx.moveTo(x, box.top);
    ctx.lineTo(x, box.bottom);
    ctx.stroke();
    ctx.fillStyle = COLORS.muted;
    ctx.fillText(secondToLabel(s), x, box.bottom + 12);
  }

  ctx.strokeStyle = COLORS.axis;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(box.left, box.bottom);
  ctx.lineTo(box.right, box.bottom);
  ctx.moveTo(box.left, box.top);
  ctx.lineTo(box.left, box.bottom);
  ctx.stroke();

  ctx.fillStyle = COLORS.ink;
  ctx.font = chartFont(800, 16);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.save();
  ctx.translate(box.left - 58, box.top + box.height / 2);
  ctx.rotate(-Math.PI / 2);
  ctx.fillText(yLabel, 0, 0);
  ctx.restore();
  ctx.fillText('時刻', box.left + box.width / 2, box.bottom + 48);
  ctx.restore();
}

function pointToCanvas(pt, box, axis, range) {
  const x = box.left + ((pt.second - range.start) / (range.end - range.start)) * box.width;
  const y = box.bottom - ((pt.value - axis.min) / (axis.max - axis.min)) * box.height;
  return { x, y };
}

function drawLine(ctx, series, box, axis, range, color, width = 3, dashed = false, alpha = 1) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.globalAlpha = alpha;
  ctx.setLineDash(dashed ? [10, 7] : []);
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.beginPath();
  let started = false;
  series.forEach((pt) => {
    if (!Number.isFinite(pt.value)) {
      started = false;
      return;
    }
    const { x, y } = pointToCanvas(pt, box, axis, range);
    if (!started) {
      ctx.moveTo(x, y);
      started = true;
    } else {
      ctx.lineTo(x, y);
    }
  });
  ctx.stroke();
  ctx.restore();
}

function findNearest(series, second) {
  if (!series.length) return null;
  let best = null;
  let bestDist = Infinity;
  series.forEach((pt) => {
    const dist = Math.abs(pt.second - second);
    if (dist < bestDist) {
      bestDist = dist;
      best = pt;
    }
  });
  return bestDist <= 90 ? best : null;
}

function drawHover(ctx, box, axis, selectedSeries, classSeries, options) {
  if (!state.hover || state.hover.canvasId !== options.canvasId) return;
  const range = options.range;
  const second = range.start + (state.hover.x - box.left) / box.width * (range.end - range.start);
  if (second < range.start || second > range.end) return;
  const selected = findNearest(selectedSeries, second);
  const average = findNearest(classSeries, second);
  if (!selected && !average) return;

  const guideX = box.left + ((second - range.start) / (range.end - range.start)) * box.width;
  ctx.save();
  ctx.strokeStyle = 'rgba(255,255,255,0.34)';
  ctx.lineWidth = 1.5;
  ctx.setLineDash([5, 5]);
  ctx.beginPath();
  ctx.moveTo(guideX, box.top);
  ctx.lineTo(guideX, box.bottom);
  ctx.stroke();
  ctx.setLineDash([]);

  const rows = [];
  const fmt = (value) => `${fmtNumber(value, options.digits)}${options.unit ? ` ${options.unit}` : ''}`;
  if (selected) rows.push({ label: `選択ID ${options.selectedId}`, value: fmt(selected.value), color: COLORS.orange, second: selected.second, raw: selected.value });
  if (average) rows.push({ label: '全員平均', value: fmt(average.value), color: COLORS.classLine, second: average.second, raw: average.value });
  rows.forEach((row) => {
    const yPoint = pointToCanvas({ second: row.second, value: row.raw }, box, axis, range);
    ctx.fillStyle = row.color;
    ctx.beginPath();
    ctx.arc(yPoint.x, yPoint.y, 4.5, 0, Math.PI * 2);
    ctx.fill();
  });

  const labelTime = secondToLabel(Math.round(second), true);
  ctx.font = chartFont(800, 14);
  const textWidth = Math.max(...rows.map((r) => ctx.measureText(`${r.label}: ${r.value}`).width), ctx.measureText(labelTime).width);
  const cardW = textWidth + 34;
  const cardH = 34 + rows.length * 24;
  const cardX = Math.min(box.right - cardW - 8, Math.max(box.left + 8, guideX + 12));
  const cardY = box.top + 12;

  ctx.fillStyle = 'rgba(15, 23, 42, 0.94)';
  roundedRect(ctx, cardX, cardY, cardW, cardH, 14);
  ctx.fill();
  ctx.strokeStyle = 'rgba(148, 163, 184, 0.42)';
  ctx.stroke();
  ctx.fillStyle = COLORS.ink;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.font = chartFont(900, 14);
  ctx.fillText(labelTime, cardX + 16, cardY + 23);
  rows.forEach((r, i) => {
    const y = cardY + 48 + i * 24;
    ctx.fillStyle = r.color;
    ctx.fillRect(cardX + 16, y - 9, 18, 4);
    ctx.fillStyle = COLORS.ink;
    ctx.font = chartFont(800, 14);
    ctx.fillText(`${r.label}: ${r.value}`, cardX + 42, y - 3);
  });
  ctx.restore();
}

function roundedRect(ctx, x, y, w, h, r) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + w - radius, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
  ctx.lineTo(x + w, y + h - radius);
  ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
  ctx.lineTo(x + radius, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}

function drawReferenceLine(ctx, box, axis, value, label) {
  if (!Number.isFinite(value) || value < axis.min || value > axis.max) return;
  const y = box.bottom - ((value - axis.min) / (axis.max - axis.min)) * box.height;
  ctx.save();
  ctx.strokeStyle = 'rgba(96, 165, 250, 0.70)';
  ctx.lineWidth = 1.8;
  ctx.setLineDash([6, 6]);
  ctx.beginPath();
  ctx.moveTo(box.left, y);
  ctx.lineTo(box.right, y);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = 'rgba(96, 165, 250, 0.95)';
  ctx.font = chartFont(900, 12);
  ctx.textAlign = 'right';
  ctx.textBaseline = 'bottom';
  ctx.fillText(label, box.right - 8, y - 5);
  ctx.restore();
}

function drawTimeSeries(canvasId, rows, selectedId, metric, options) {
  const canvas = el(canvasId);
  const { ctx, w, h } = getCanvasContext(canvas);
  const selectedSeries = buildSeries(rows, selectedId, metric, 'selected');
  const classSeries = buildSeries(rows, selectedId, metric, 'average');
  const range = options.range;

  if (!rows.length) return drawNoData(ctx, w, h, 'CSVを読み込んでいます。');
  if (!selectedSeries.length && !classSeries.length) return drawNoData(ctx, w, h, '対象時間帯にデータがありません。');

  clearCanvas(ctx, w, h);
  const box = chartBox(w, h, options.left || 96, 24, 36, 78);
  const values = selectedSeries.concat(classSeries).map((p) => p.value);
  const axis = getYAxis(values, options.fallbackAxis, 5);
  drawTimeGrid(ctx, box, axis, options.yLabel, options.digits, range, options.tickMinutes || 5);
  if (options.referenceValue !== undefined && options.referenceLabel) {
    drawReferenceLine(ctx, box, axis, options.referenceValue, options.referenceLabel);
  }
  drawLine(ctx, classSeries, box, axis, range, COLORS.classLine, 3, true, 0.95);
  drawLine(ctx, selectedSeries, box, axis, range, COLORS.orange, 3.2, false, 1);
  drawHover(ctx, box, axis, selectedSeries, classSeries, { ...options, canvasId, selectedId, range });
}

function drawExerciseAcceleration() {
  const canvasId = 'exerciseAccelCanvas';
  const canvas = el(canvasId);
  const { ctx, w, h } = getCanvasContext(canvas);
  const rows = getExerciseRows();
  const selectedId = state.exercise.selectedId;
  const range = getExerciseTimeRange();

  if (!rows.length) return drawNoData(ctx, w, h, 'CSVを読み込んでいます。');
  const selectedRows = rows.filter((r) => r.sensorId === selectedId);
  const hasAxes = selectedRows.some((r) => Number.isFinite(r.accX) || Number.isFinite(r.accY) || Number.isFinite(r.accZ));

  if (!hasAxes) {
    el('exerciseAccelTitle').textContent = '加速度ノルム';
    el('exerciseAccelSubtitle').textContent = 'AccNorm';
    return drawTimeSeries(canvasId, rows, selectedId, 'accNorm', {
      range,
      yLabel: '加速度ノルム',
      unit: '',
      digits: 3,
      fallbackAxis: { min: 0.8, max: 1.2, step: 0.1, minSpan: 0.05, pad: 0.02 },
      referenceValue: 1.0,
      referenceLabel: '1.000',
      tickMinutes: 10,
    });
  }

  el('exerciseAccelTitle').textContent = '3軸加速度';
  el('exerciseAccelSubtitle').textContent = 'X / Y / Z';

  const seriesX = buildSeries(rows, selectedId, 'accX', 'selected');
  const seriesY = buildSeries(rows, selectedId, 'accY', 'selected');
  const seriesZ = buildSeries(rows, selectedId, 'accZ', 'selected');
  const values = seriesX.concat(seriesY, seriesZ).map((p) => p.value).filter(Number.isFinite);
  if (!values.length) return drawNoData(ctx, w, h, '対象時間帯に加速度データがありません。');

  clearCanvas(ctx, w, h);
  const box = chartBox(w, h, 96, 24, 36, 78);
  const axis = getYAxis(values, { min: -2, max: 2, step: 1, minSpan: 1, pad: 0.2 }, 5);
  drawTimeGrid(ctx, box, axis, '加速度', 2, range, 10);
  drawLine(ctx, seriesX, box, axis, range, COLORS.accX, 2.2, false, 1);
  drawLine(ctx, seriesY, box, axis, range, COLORS.accY, 2.2, false, 1);
  drawLine(ctx, seriesZ, box, axis, range, COLORS.accZ, 2.2, false, 1);

  ctx.save();
  const labels = [
    { label: 'X', color: COLORS.accX },
    { label: 'Y', color: COLORS.accY },
    { label: 'Z', color: COLORS.accZ },
  ];
  ctx.font = chartFont(900, 13);
  let x = box.left + 8;
  labels.forEach((item) => {
    ctx.fillStyle = item.color;
    ctx.fillRect(x, box.top + 8, 22, 4);
    ctx.fillStyle = COLORS.ink;
    ctx.fillText(item.label, x + 30, box.top + 14);
    x += 62;
  });
  ctx.restore();
}

function buildPhaseTrendProfiles() {
  const targetRows = getRestTargetRows().filter((r) => Number.isFinite(r.hr));
  const ids = [...new Set(targetRows.map((r) => r.sensorId))].sort((a, b) => a.localeCompare(b, 'ja'));
  const profiles = ids.map((id) => {
    const values = CONFIG.phaseWindows.map((period) => {
      const periodValues = targetRows
        .filter((r) => r.sensorId === id && r.secondOfDay >= period.start && r.secondOfDay < period.end)
        .map((r) => r.hr)
        .filter(Number.isFinite);
      return mean(periodValues);
    });
    return { id, values };
  }).filter((profile) => profile.values.some(Number.isFinite));

  const meanValues = CONFIG.phaseWindows.map((_, index) => {
    const values = profiles.map((profile) => profile.values[index]).filter(Number.isFinite);
    return mean(values);
  });

  const selectedProfile = profiles.find((profile) => profile.id === state.rest.selectedId) || null;
  return { profiles, meanValues, selectedProfile };
}

function phasePointToCanvas(index, value, box, axis) {
  const denom = Math.max(1, CONFIG.phaseWindows.length - 1);
  const xPad = Math.max(58, box.width * 0.075);
  const usableWidth = Math.max(1, box.width - xPad * 2);
  const x = box.left + xPad + (index / denom) * usableWidth;
  const y = box.bottom - ((value - axis.min) / (axis.max - axis.min)) * box.height;
  return { x, y };
}

function drawCategoricalLine(ctx, values, box, axis, color, width = 2, dashed = false, alpha = 1, pointRadius = 3) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = width;
  ctx.globalAlpha = alpha;
  ctx.setLineDash(dashed ? [9, 7] : []);
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.beginPath();
  let started = false;
  values.forEach((value, index) => {
    if (!Number.isFinite(value)) {
      started = false;
      return;
    }
    const { x, y } = phasePointToCanvas(index, value, box, axis);
    if (!started) {
      ctx.moveTo(x, y);
      started = true;
    } else {
      ctx.lineTo(x, y);
    }
  });
  ctx.stroke();
  ctx.setLineDash([]);
  values.forEach((value, index) => {
    if (!Number.isFinite(value)) return;
    const { x, y } = phasePointToCanvas(index, value, box, axis);
    ctx.beginPath();
    ctx.arc(x, y, pointRadius, 0, Math.PI * 2);
    ctx.fill();
  });
  ctx.restore();
}

function drawPhaseTrend() {
  const canvas = el('phaseTrendCanvas');
  const { ctx, w, h } = getCanvasContext(canvas);
  if (!state.rest.rows.length) return drawNoData(ctx, w, h, 'CSVを読み込んでいます。');

  const { profiles, meanValues, selectedProfile } = buildPhaseTrendProfiles();
  if (!profiles.length) return drawNoData(ctx, w, h, '対象時間帯に心拍データがありません。');

  clearCanvas(ctx, w, h);
  const box = chartBox(w, h, 126, 34, 54, 92);
  const values = profiles.flatMap((profile) => profile.values).concat(meanValues).filter(Number.isFinite);
  const axis = getYAxis(values, { min: 40, max: 140, step: 20, minSpan: 20, pad: 5 }, 5);
  const yRange = Math.max(1e-9, axis.max - axis.min);

  ctx.save();
  ctx.strokeStyle = COLORS.grid;
  ctx.lineWidth = 1.2;
  ctx.fillStyle = COLORS.muted;
  ctx.font = chartFont(700, 15);
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';
  for (let v = axis.min; v <= axis.max + 1e-9; v += axis.step) {
    const y = box.bottom - ((v - axis.min) / yRange) * box.height;
    ctx.beginPath();
    ctx.moveTo(box.left, y);
    ctx.lineTo(box.right, y);
    ctx.stroke();
    ctx.fillText(fmtNumber(v, 0), box.left - 12, y);
  }

  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  CONFIG.phaseWindows.forEach((period, index) => {
    const { x } = phasePointToCanvas(index, axis.min, box, axis);
    ctx.fillStyle = COLORS.ink;
    ctx.font = chartFont(900, 16);
    ctx.fillText(period.label, x, box.bottom + 13);
    ctx.fillStyle = COLORS.muted;
    ctx.font = chartFont(800, 12);
    ctx.fillText(period.timeLabel, x, box.bottom + 36);
  });

  ctx.strokeStyle = COLORS.axis;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(box.left, box.bottom);
  ctx.lineTo(box.right, box.bottom);
  ctx.moveTo(box.left, box.top);
  ctx.lineTo(box.left, box.bottom);
  ctx.stroke();

  ctx.fillStyle = COLORS.ink;
  ctx.font = chartFont(800, 16);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.save();
  ctx.translate(box.left - 55, box.top + box.height / 2);
  ctx.rotate(-Math.PI / 2);
  ctx.fillText('平均心拍数（bpm）', 0, 0);
  ctx.restore();

  profiles.forEach((profile) => {
    if (profile.id === state.rest.selectedId) return;
    drawCategoricalLine(ctx, profile.values, box, axis, 'rgba(203, 213, 225, 0.28)', 1.4, false, 1, 2.2);
  });
  drawCategoricalLine(ctx, meanValues, box, axis, COLORS.classLine, 3.4, true, 1, 4.2);
  if (selectedProfile) drawCategoricalLine(ctx, selectedProfile.values, box, axis, COLORS.orange, 3.8, false, 1, 5);

  ctx.font = chartFont(900, 13);
  CONFIG.phaseWindows.forEach((_, index) => {
    const meanValue = meanValues[index];
    if (!Number.isFinite(meanValue)) return;
    const { x, y } = phasePointToCanvas(index, meanValue, box, axis);
    ctx.fillStyle = COLORS.classLine;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillText(`平均 ${fmtNumber(meanValue, 1)}`, x, Math.max(box.top + 18, y - 9));
  });
  if (selectedProfile) {
    selectedProfile.values.forEach((value, index) => {
      if (!Number.isFinite(value)) return;
      const { x, y } = phasePointToCanvas(index, value, box, axis);
      ctx.fillStyle = COLORS.orange;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.fillText(fmtNumber(value, 1), x, Math.min(box.bottom - 16, y + 10));
    });
  }
  ctx.restore();
}

function buildPeriodHrDistribution(period) {
  const targetRows = getRestTargetRows().filter((r) =>
    r.secondOfDay >= period.start &&
    r.secondOfDay < period.end &&
    Number.isFinite(r.hr)
  );
  const byId = new Map();
  targetRows.forEach((r) => {
    if (!byId.has(r.sensorId)) byId.set(r.sensorId, []);
    byId.get(r.sensorId).push(r.hr);
  });
  return [...byId.entries()]
    .map(([id, values]) => ({ id, value: mean(values), n: values.length }))
    .filter((d) => Number.isFinite(d.value))
    .sort((a, b) => a.value - b.value || a.id.localeCompare(b.id, 'ja'));
}

function buildHistogramData(distribution, xMin, xMax, binWidth) {
  const bins = [];
  for (let start = xMin; start < xMax - 1e-9; start += binWidth) {
    bins.push({ start, end: start + binWidth, count: 0 });
  }
  distribution.forEach((d) => {
    if (d.value < xMin || d.value > xMax) return;
    let idx = Math.floor((d.value - xMin) / binWidth);
    if (idx >= bins.length) idx = bins.length - 1;
    if (idx >= 0) bins[idx].count += 1;
  });
  return bins;
}

function computeSharedHistogramAxis(distributions) {
  const values = distributions.flatMap((d) => d.map((x) => x.value)).filter(Number.isFinite);
  const binWidth = CONFIG.histogramBinWidth;
  if (!values.length) return { xMin: 40, xMax: 120, binWidth, yMax: 5, yStep: 1 };
  const minValue = Math.min(...values);
  const maxValue = Math.max(...values);
  let xMin = Math.floor((minValue - binWidth) / binWidth) * binWidth;
  let xMax = Math.ceil((maxValue + binWidth) / binWidth) * binWidth;
  if (xMax - xMin < 20) {
    const mid = (xMin + xMax) / 2;
    xMin = Math.floor((mid - 10) / binWidth) * binWidth;
    xMax = Math.ceil((mid + 10) / binWidth) * binWidth;
  }
  const allBins = distributions.map((dist) => buildHistogramData(dist, xMin, xMax, binWidth));
  const maxCount = Math.max(1, ...allBins.flatMap((bins) => bins.map((b) => b.count)));
  const yStep = Math.max(1, niceTickStep(maxCount, 4));
  const yMax = Math.max(yStep, Math.ceil(maxCount / yStep) * yStep);
  return { xMin, xMax, binWidth, yMax, yStep };
}

function drawHistogramCanvas(period, distribution, axis) {
  const canvas = el(period.canvasId);
  const { ctx, w, h } = getCanvasContext(canvas);
  if (!state.rest.rows.length) return drawNoData(ctx, w, h, 'CSVを読み込んでいます。');
  if (!distribution.length) return drawNoData(ctx, w, h, '対象時間帯に心拍データがありません。');

  clearCanvas(ctx, w, h);
  const box = chartBox(w, h, 64, 38, 24, 58);
  const bins = buildHistogramData(distribution, axis.xMin, axis.xMax, axis.binWidth);
  const yRange = Math.max(1, axis.yMax);

  ctx.save();
  ctx.strokeStyle = COLORS.grid;
  ctx.lineWidth = 1.1;
  ctx.fillStyle = COLORS.muted;
  ctx.font = chartFont(700, 12);
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';
  for (let v = 0; v <= axis.yMax + 1e-9; v += axis.yStep) {
    const y = box.bottom - (v / yRange) * box.height;
    ctx.beginPath();
    ctx.moveTo(box.left, y);
    ctx.lineTo(box.right, y);
    ctx.stroke();
    ctx.fillText(fmtNumber(v, 0), box.left - 10, y);
  }

  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  const xTickStep = Math.max(axis.binWidth * 2, niceTickStep(axis.xMax - axis.xMin, 5));
  for (let xTick = Math.ceil(axis.xMin / xTickStep) * xTickStep; xTick <= axis.xMax + 1e-9; xTick += xTickStep) {
    const x = box.left + ((xTick - axis.xMin) / (axis.xMax - axis.xMin)) * box.width;
    ctx.beginPath();
    ctx.moveTo(x, box.top);
    ctx.lineTo(x, box.bottom);
    ctx.stroke();
    ctx.fillText(fmtNumber(xTick, 0), x, box.bottom + 10);
  }

  ctx.strokeStyle = COLORS.axis;
  ctx.lineWidth = 1.8;
  ctx.beginPath();
  ctx.moveTo(box.left, box.bottom);
  ctx.lineTo(box.right, box.bottom);
  ctx.moveTo(box.left, box.top);
  ctx.lineTo(box.left, box.bottom);
  ctx.stroke();

  bins.forEach((bin) => {
    const x0 = box.left + ((bin.start - axis.xMin) / (axis.xMax - axis.xMin)) * box.width;
    const x1 = box.left + ((bin.end - axis.xMin) / (axis.xMax - axis.xMin)) * box.width;
    const y = box.bottom - (bin.count / yRange) * box.height;
    const bw = Math.max(1, x1 - x0 - 3);
    const bh = Math.max(0, box.bottom - y);
    ctx.fillStyle = 'rgba(229, 237, 247, 0.72)';
    ctx.fillRect(x0 + 1.5, y, bw, bh);
  });

  const selected = distribution.find((d) => d.id === state.rest.selectedId);
  if (selected && Number.isFinite(selected.value)) {
    const x = box.left + ((selected.value - axis.xMin) / (axis.xMax - axis.xMin)) * box.width;
    ctx.strokeStyle = COLORS.orange;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(x, box.top);
    ctx.lineTo(x, box.bottom);
    ctx.stroke();
    const label = `${state.rest.selectedId}: ${fmtNumber(selected.value, 1)} bpm`;
    ctx.font = chartFont(900, 13);
    const labelW = ctx.measureText(label).width + 18;
    const labelX = Math.min(box.right - labelW, Math.max(box.left, x + 8));
    const labelY = box.top + 8;
    ctx.fillStyle = 'rgba(15, 23, 42, 0.94)';
    roundedRect(ctx, labelX, labelY, labelW, 27, 10);
    ctx.fill();
    ctx.strokeStyle = 'rgba(251, 146, 60, 0.65)';
    ctx.stroke();
    ctx.fillStyle = COLORS.orange;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, labelX + 9, labelY + 13.5);
  }

  ctx.fillStyle = COLORS.ink;
  ctx.font = chartFont(900, 15);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(`${period.label} ${period.timeLabel}`, box.left, box.top - 13);
  ctx.fillStyle = COLORS.muted;
  ctx.font = chartFont(800, 12);
  ctx.textAlign = 'center';
  ctx.fillText('平均心拍数（bpm）', box.left + box.width / 2, box.bottom + 42);
  ctx.save();
  ctx.translate(box.left - 44, box.top + box.height / 2);
  ctx.rotate(-Math.PI / 2);
  ctx.fillText('人数', 0, 0);
  ctx.restore();
  ctx.restore();
}

function updateSummaryHistograms() {
  const distributions = CONFIG.summaryWindows.map(buildPeriodHrDistribution);
  const axis = computeSharedHistogramAxis(distributions);
  CONFIG.summaryWindows.forEach((period, i) => drawHistogramCanvas(period, distributions[i], axis));
}

function drawRestingTab() {
  const rows = getRestTargetRows();
  const range = { start: CONFIG.restStartSecond, end: CONFIG.restEndSecond };
  drawTimeSeries('restHeartRateCanvas', rows, state.rest.selectedId, 'hr', {
    range,
    yLabel: '心拍数（bpm）',
    unit: 'bpm',
    digits: 0,
    fallbackAxis: { min: 40, max: 120, step: 20, minSpan: 10, pad: 5 },
  });
  drawTimeSeries('restAccNormCanvas', rows, state.rest.selectedId, 'accNorm', {
    range,
    yLabel: '加速度ノルム',
    unit: '',
    digits: 3,
    fallbackAxis: { min: 0.8, max: 1.2, step: 0.1, minSpan: 0.05, pad: 0.02 },
    referenceValue: 1.0,
    referenceLabel: '1.000',
  });
  drawPhaseTrend();
  updateSummaryHistograms();
}


function exerciseRowsForSelectedId() {
  const range = getExerciseTimeRange();
  return getExerciseRows().filter((r) =>
    r.sensorId === state.exercise.selectedId &&
    r.secondOfDay >= range.start && r.secondOfDay <= range.end
  );
}

function exerciseValuesForId(id, metric) {
  const range = getExerciseTimeRange();
  return getExerciseRows()
    .filter((r) => r.sensorId === id && r.secondOfDay >= range.start && r.secondOfDay <= range.end)
    .map((r) => r[metric])
    .filter(Number.isFinite);
}

function selectedExerciseMetrics() {
  const hrValues = exerciseValuesForId(state.exercise.selectedId, 'hr');
  const accValues = exerciseValuesForId(state.exercise.selectedId, 'accNorm');
  return {
    avgHr: mean(hrValues),
    maxHr: hrValues.length ? Math.max(...hrValues) : NaN,
    avgAcc: mean(accValues),
    hrN: hrValues.length,
    accN: accValues.length,
  };
}

function renderExerciseKpis() {
  const grid = el('exerciseKpiGrid');
  if (!grid) return;
  const rows = getExerciseRowsInRange();
  if (!rows.length || !state.exercise.selectedId) {
    grid.innerHTML = '<div class="empty">選択条件に一致するデータがありません。</div>';
    return;
  }
  const m = selectedExerciseMetrics();
  grid.innerHTML = `
    <article class="kpi heart-kpi">
      <p class="klabel">心拍数</p>
      <div class="metric-pair">
        <div class="metric-box"><p class="metric-label">平均心拍数</p><p class="metric-value">${fmtNumber(m.avgHr, 1)}<span class="unit">bpm</span></p></div>
        <div class="metric-box"><p class="metric-label">最大心拍数</p><p class="metric-value">${fmtNumber(m.maxHr, 0)}<span class="unit">bpm</span></p></div>
      </div>
      <p class="sub">選択IDの表示範囲内平均値です。</p>
    </article>
    <article class="kpi acc-kpi">
      <p class="klabel">加速度ノルム</p>
      <p class="metric-label">平均加速度ノルム</p>
      <p class="metric-value">${fmtNumber(m.avgAcc, 3)}<span class="unit">g</span></p>
      <p class="sub">表示範囲内のAccNorm平均値です。</p>
    </article>`;
}

function drawSimpleAxis(ctx, box, axis, yLabel, digits = 0) {
  const yRange = Math.max(1e-9, axis.max - axis.min);
  ctx.save();
  ctx.strokeStyle = COLORS.grid;
  ctx.lineWidth = 1.15;
  ctx.fillStyle = COLORS.muted;
  ctx.font = chartFont(700, 12);
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';
  for (let v = axis.min; v <= axis.max + 1e-9; v += axis.step) {
    const y = box.bottom - ((v - axis.min) / yRange) * box.height;
    ctx.beginPath();
    ctx.moveTo(box.left, y);
    ctx.lineTo(box.right, y);
    ctx.stroke();
    ctx.fillText(fmtNumber(v, digits), box.left - 9, y);
  }
  ctx.strokeStyle = COLORS.axis;
  ctx.lineWidth = 1.8;
  ctx.beginPath();
  ctx.moveTo(box.left, box.top);
  ctx.lineTo(box.left, box.bottom);
  ctx.lineTo(box.right, box.bottom);
  ctx.stroke();
  ctx.save();
  ctx.translate(box.left - 52, box.top + box.height / 2);
  ctx.rotate(-Math.PI / 2);
  ctx.fillStyle = COLORS.muted;
  ctx.font = chartFont(800, 12);
  ctx.textAlign = 'center';
  ctx.fillText(yLabel, 0, 0);
  ctx.restore();
  ctx.restore();
}

function drawBottomTimeAxis(ctx, box, range) {
  const rangeMinutes = Math.max(1, (range.end - range.start) / 60);
  const step = rangeMinutes > 90 ? 15 * 60 : 10 * 60;
  const firstTick = Math.ceil(range.start / step) * step;
  ctx.save();
  ctx.fillStyle = COLORS.muted;
  ctx.strokeStyle = COLORS.grid;
  ctx.font = chartFont(800, 12);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  for (let s = firstTick; s <= range.end + 1e-9; s += step) {
    const x = box.left + ((s - range.start) / (range.end - range.start)) * box.width;
    ctx.beginPath();
    ctx.moveTo(x, box.top);
    ctx.lineTo(x, box.bottom);
    ctx.stroke();
    ctx.fillText(secondToLabel(s), x, box.bottom + 12);
  }
  ctx.fillStyle = COLORS.ink;
  ctx.font = chartFont(800, 13);
  ctx.fillText('時刻', box.left + box.width / 2, box.bottom + 42);
  ctx.restore();
}

function drawSeriesLineBySecond(ctx, series, box, axis, range, color, width = 2.6, alpha = 1, dashed = false) {
  drawLine(ctx, series.map((p) => ({ second: p.second, value: p.value })), box, axis, range, color, width, dashed, alpha);
}

function drawBandSeries(ctx, stats, box, axis, range, color) {
  const pts = stats.filter((p) => Number.isFinite(p.q1) && Number.isFinite(p.q3));
  if (pts.length < 2) return;
  ctx.save();
  ctx.fillStyle = color;
  ctx.globalAlpha = 0.18;
  ctx.beginPath();
  pts.forEach((p, i) => {
    const x = box.left + ((p.second - range.start) / (range.end - range.start)) * box.width;
    const y = box.bottom - ((p.q3 - axis.min) / (axis.max - axis.min)) * box.height;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  for (let i = pts.length - 1; i >= 0; i--) {
    const p = pts[i];
    const x = box.left + ((p.second - range.start) / (range.end - range.start)) * box.width;
    const y = box.bottom - ((p.q1 - axis.min) / (axis.max - axis.min)) * box.height;
    ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function quantileValue(values, q) {
  const xs = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!xs.length) return NaN;
  const pos = (xs.length - 1) * q;
  const base = Math.floor(pos);
  const rest = pos - base;
  return xs[base + 1] === undefined ? xs[base] : xs[base] + rest * (xs[base + 1] - xs[base]);
}

function buildExerciseClassStats(metric = 'hr') {
  const range = getExerciseTimeRange();
  const bySecondById = new Map();
  getExerciseRows().forEach((r) => {
    if (r.secondOfDay < range.start || r.secondOfDay > range.end) return;
    const value = r[metric];
    if (!Number.isFinite(value)) return;
    if (!bySecondById.has(r.secondOfDay)) bySecondById.set(r.secondOfDay, new Map());
    const idMap = bySecondById.get(r.secondOfDay);
    if (!idMap.has(r.sensorId)) idMap.set(r.sensorId, []);
    idMap.get(r.sensorId).push(value);
  });
  return [...bySecondById.entries()].sort((a, b) => a[0] - b[0]).map(([second, idMap]) => {
    const idMeans = [...idMap.values()].map(mean).filter(Number.isFinite).sort((a, b) => a - b);
    return {
      second,
      q1: quantileValue(idMeans, 0.25),
      median: quantileValue(idMeans, 0.5),
      q3: quantileValue(idMeans, 0.75),
      n: idMeans.length,
    };
  });
}

function drawExerciseCombinedChart() {
  const canvas = el('exerciseCombinedChart');
  const { ctx, w, h } = getCanvasContext(canvas);
  const rows = getExerciseRowsInRange();
  const range = getExerciseTimeRange();
  if (!rows.length) return drawNoData(ctx, w, h, '運動時データを読み込んでいます。');

  clearCanvas(ctx, w, h);
  const outer = { left: 88, right: w - 40, top: 34, bottom: h - 62 };
  const gap = 34;
  const eachH = (outer.bottom - outer.top - gap) / 2;
  const hrBox = { left: outer.left, right: outer.right, top: outer.top, bottom: outer.top + eachH };
  const accBox = { left: outer.left, right: outer.right, top: hrBox.bottom + gap, bottom: outer.bottom };
  [hrBox, accBox].forEach((box) => { box.width = box.right - box.left; box.height = box.bottom - box.top; });

  const hrSeries = buildSeries(rows, state.exercise.selectedId, 'hr', 'selected');
  const accSeries = buildSeries(rows, state.exercise.selectedId, 'accNorm', 'selected');
  const hrAxis = { min: 0, max: 200, step: 40 };
  const accVals = accSeries.map((p) => p.value).filter(Number.isFinite);
  const accAxis = getYAxis(accVals, { min: 1, max: 2, step: 0.25, minSpan: 0.2, pad: 0.03 }, 4);

  drawSimpleAxis(ctx, hrBox, hrAxis, 'Heart Rate bpm', 0);
  drawSimpleAxis(ctx, accBox, accAxis, 'Acceleration norm g', 2);
  drawBottomTimeAxis(ctx, accBox, range);
  drawReferenceLine(ctx, accBox, accAxis, 1.0, '1.000');
  drawSeriesLineBySecond(ctx, hrSeries, hrBox, hrAxis, range, COLORS.yellow, 2.8, 1, false);
  drawSeriesLineBySecond(ctx, accSeries, accBox, accAxis, range, COLORS.cyan, 2.5, 1, false);
  ctx.save();
  ctx.fillStyle = COLORS.ink;
  ctx.font = chartFont(900, 13);
  ctx.textAlign = 'left';
  ctx.fillText('心拍数', hrBox.left + 8, hrBox.top + 14);
  ctx.fillText('加速度ノルム', accBox.left + 8, accBox.top + 14);
  ctx.restore();
}

function drawExerciseClassChart() {
  const canvas = el('exerciseClassCombinedChart');
  const { ctx, w, h } = getCanvasContext(canvas);
  const rows = getExerciseRowsInRange();
  const range = getExerciseTimeRange();
  if (!rows.length) return drawNoData(ctx, w, h, '運動時データを読み込んでいます。');

  clearCanvas(ctx, w, h);
  const box = chartBox(w, h, 88, 36, 40, 70);
  const stats = buildExerciseClassStats('hr');
  const selected = buildSeries(rows, state.exercise.selectedId, 'hr', 'selected');
  const values = stats.flatMap((p) => [p.q1, p.median, p.q3]).concat(selected.map((p) => p.value)).filter(Number.isFinite);
  const axis = getYAxis(values, { min: 40, max: 160, step: 20, minSpan: 20, pad: 5 }, 5);
  drawSimpleAxis(ctx, box, axis, '平均心拍数 bpm', 0);
  drawBottomTimeAxis(ctx, box, range);
  drawBandSeries(ctx, stats, box, axis, range, COLORS.blue);
  drawSeriesLineBySecond(ctx, stats.map((p) => ({ second: p.second, value: p.median })), box, axis, range, COLORS.blue, 2.5, 1, false);
  drawSeriesLineBySecond(ctx, selected, box, axis, range, COLORS.yellow, 2.2, 0.95, false);
}

function exerciseMetricPoints() {
  const ids = [...new Set(getExerciseRows().map((r) => r.sensorId))].sort((a, b) => a.localeCompare(b, 'ja'));
  return ids.map((id) => {
    const hr = exerciseValuesForId(id, 'hr');
    const acc = exerciseValuesForId(id, 'accNorm');
    return { id, avgHr: mean(hr), avgAcc: mean(acc), hrN: hr.length, accN: acc.length };
  }).filter((p) => Number.isFinite(p.avgHr) && Number.isFinite(p.avgAcc));
}

function drawExerciseScatterChart() {
  const canvas = el('exerciseScatterChart');
  const { ctx, w, h } = getCanvasContext(canvas);
  const pts = exerciseMetricPoints();
  if (!pts.length) return drawNoData(ctx, w, h, '平均値を計算できるデータがありません。');

  clearCanvas(ctx, w, h);
  const box = chartBox(w, h, 84, 36, 44, 72);
  const xs = pts.map((p) => p.avgAcc);
  const ys = pts.map((p) => p.avgHr);
  const xMinRaw = Math.min(...xs);
  const xMaxRaw = Math.max(...xs);
  const yMinRaw = Math.min(...ys);
  const yMaxRaw = Math.max(...ys);
  const xSpan = Math.max(0.05, xMaxRaw - xMinRaw);
  const ySpan = Math.max(10, yMaxRaw - yMinRaw);
  const xMin = Math.max(0, xMinRaw - xSpan * 0.12);
  const xMax = xMaxRaw + xSpan * 0.12;
  const yMin = Math.max(0, Math.floor((yMinRaw - ySpan * 0.12) / 10) * 10);
  const yMax = Math.ceil((yMaxRaw + ySpan * 0.12) / 10) * 10;
  const sx = (v) => box.left + ((v - xMin) / (xMax - xMin || 1)) * box.width;
  const sy = (v) => box.bottom - ((v - yMin) / (yMax - yMin || 1)) * box.height;

  ctx.save();
  ctx.strokeStyle = COLORS.axis;
  ctx.lineWidth = 1.8;
  ctx.beginPath();
  ctx.moveTo(box.left, box.top);
  ctx.lineTo(box.left, box.bottom);
  ctx.lineTo(box.right, box.bottom);
  ctx.stroke();
  ctx.strokeStyle = COLORS.grid;
  ctx.fillStyle = COLORS.muted;
  ctx.font = chartFont(700, 12);
  ctx.textAlign = 'right';
  for (let i = 0; i <= 5; i++) {
    const r = i / 5;
    const y = box.bottom - r * box.height;
    const v = yMin + r * (yMax - yMin);
    ctx.beginPath();
    ctx.moveTo(box.left, y);
    ctx.lineTo(box.right, y);
    ctx.stroke();
    ctx.fillText(fmtNumber(v, 0), box.left - 9, y);
  }
  ctx.textAlign = 'center';
  for (let i = 0; i <= 5; i++) {
    const r = i / 5;
    const x = box.left + r * box.width;
    const v = xMin + r * (xMax - xMin);
    ctx.fillText(fmtNumber(v, 2), x, box.bottom + 18);
  }
  ctx.fillStyle = COLORS.muted;
  ctx.font = chartFont(800, 13);
  ctx.fillText('平均加速度ノルム', box.left + box.width / 2, box.bottom + 46);
  ctx.save();
  ctx.translate(box.left - 54, box.top + box.height / 2);
  ctx.rotate(-Math.PI / 2);
  ctx.fillText('平均心拍数 bpm', 0, 0);
  ctx.restore();
  ctx.restore();

  pts.forEach((p) => {
    const selected = p.id === state.exercise.selectedId;
    ctx.save();
    ctx.globalAlpha = selected ? 1 : 0.32;
    ctx.fillStyle = selected ? COLORS.yellow : COLORS.blue;
    ctx.beginPath();
    ctx.arc(sx(p.avgAcc), sy(p.avgHr), selected ? 7 : 4.2, 0, Math.PI * 2);
    ctx.fill();
    if (selected) {
      ctx.strokeStyle = 'rgba(255,255,255,0.95)';
      ctx.lineWidth = 3;
      ctx.stroke();
      ctx.fillStyle = COLORS.ink;
      ctx.font = chartFont(900, 13);
      ctx.textAlign = 'left';
      ctx.fillText(`${p.id}`, sx(p.avgAcc) + 12, sy(p.avgHr));
    }
    ctx.restore();
  });
}

function drawExerciseTab() {
  updateExerciseTimeSelects();
  renderExerciseKpis();
  drawExerciseCombinedChart();
  drawExerciseClassChart();
  drawExerciseScatterChart();
}

function drawAll() {
  if (state.activeTab === 'resting-tab') drawRestingTab();
  else drawExerciseTab();
}

function setupEvents() {
  document.querySelectorAll('.dashboard-tab').forEach((button) => {
    button.addEventListener('click', () => setActiveTab(button.dataset.tabTarget));
  });

  el('restIdSelect').addEventListener('change', (e) => {
    state.rest.selectedId = e.target.value;
    state.hover = null;
    drawAll();
  });

  el('exerciseDateSelect').addEventListener('change', (e) => {
    state.exercise.selectedFolder = e.target.value;
    state.exercise.selectedId = '';
    state.exercise.timeStart = null;
    state.exercise.timeEnd = null;
    state.hover = null;
    updateExerciseIdSelect();
    const loaded = state.exercise.loadedByFolder.get(state.exercise.selectedFolder) || [];
    if (!loaded.length) loadExerciseFolder(state.exercise.selectedFolder);
    else {
      updateExerciseTimeSelects();
      updateStatusForActiveTab();
      drawAll();
    }
  });

  el('exerciseIdSelect').addEventListener('change', (e) => {
    state.exercise.selectedId = e.target.value;
    state.hover = null;
    drawAll();
  });

  el('exerciseTimeStartSelect').addEventListener('change', (e) => {
    state.exercise.timeStart = Number(e.target.value);
    if (state.exercise.timeEnd !== null && state.exercise.timeStart >= state.exercise.timeEnd) {
      state.exercise.timeEnd = state.exercise.timeStart + 300;
    }
    state.hover = null;
    drawAll();
  });

  el('exerciseTimeEndSelect').addEventListener('change', (e) => {
    state.exercise.timeEnd = Number(e.target.value);
    if (state.exercise.timeStart !== null && state.exercise.timeEnd <= state.exercise.timeStart) {
      state.exercise.timeStart = state.exercise.timeEnd - 300;
    }
    state.hover = null;
    drawAll();
  });

  ['restHeartRateCanvas', 'restAccNormCanvas', 'exerciseCombinedChart', 'exerciseClassCombinedChart', 'exerciseScatterChart'].forEach((canvasId) => {
    const canvas = el(canvasId);
    canvas.addEventListener('mousemove', (event) => {
      const rect = canvas.getBoundingClientRect();
      state.hover = { canvasId, x: event.clientX - rect.left, y: event.clientY - rect.top };
      drawAll();
    });
    canvas.addEventListener('mouseleave', () => {
      state.hover = null;
      drawAll();
    });
  });

  window.addEventListener('resize', () => drawAll());
}

setupEvents();
setActiveTab('resting-tab');
loadRestFolder();
initializeExerciseFolders();
