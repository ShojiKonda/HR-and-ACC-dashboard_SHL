const state = {
  rows: [],
  ids: [],
  selectedId: '',
  fileName: '',
  hover: null,
};

const CONFIG = {
  repoFullName: 'ShojiKonda/HR-and-ACC-dashboard_SHL',
  branch: 'main',
  dataFolder: 'data/2026_05_25',
  displayStartSecond: 11 * 3600 + 10 * 60,
  displayEndSecond: 11 * 3600 + 50 * 60,
  defaultDate: '2026-05-25',
};

const COLORS = {
  ink: '#ffffff',
  muted: '#cbd5e1',
  faint: 'rgba(255, 255, 255, 0.18)',
  grid: 'rgba(255, 255, 255, 0.24)',
  axis: '#ffffff',
  chartBg: '#111827',
  orange: '#fb923c',
  classLine: '#e5edf7',
  blue: '#60a5fa',
  red: '#f87171',
};

const CHART_FONT_FAMILY = '"Noto Sans JP", "Hiragino Sans", "Yu Gothic", "Yu Gothic UI", Meiryo, sans-serif';
const chartFont = (weight, size) => `${weight} ${size}px ${CHART_FONT_FAMILY}`;
const el = (id) => document.getElementById(id);

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
      if (quote && line[i + 1] === '"') { current += '"'; i++; }
      else { quote = !quote; }
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

async function readTextFile(file) {
  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  const encodings = ['utf-8', 'shift_jis'];
  for (const enc of encodings) {
    try {
      const text = new TextDecoder(enc, { fatal: enc === 'utf-8' }).decode(bytes);
      const bad = (text.match(/�/g) || []).length;
      if (enc === 'utf-8' || bad < 3) return text;
    } catch (e) {}
  }
  return new TextDecoder('shift_jis').decode(bytes);
}

async function fetchText(path) {
  const res = await fetch(path, { cache: 'no-store' });
  if (!res.ok) throw new Error(`Cannot fetch ${path}`);
  return await res.text();
}

function headerIndex(rows) {
  return rows.findIndex((row) => {
    const lower = row.map((x) => String(x).trim().toLowerCase());
    return lower.includes('sensorid') &&
      (lower.includes('timestamp') || lower.includes('minute') || lower.includes('time')) &&
      (lower.includes('heartrate_bpm') || lower.includes('meanheartrate_bpm') || lower.includes('heartrate') || lower.includes('hr'));
  });
}

function findColumn(header, candidates) {
  const lower = header.map((h) => String(h).trim().toLowerCase());
  for (const name of candidates) {
    const key = String(name).toLowerCase();
    const exact = lower.indexOf(key);
    if (exact >= 0) return exact;
    const partial = lower.findIndex((h) => h.includes(key));
    if (partial >= 0) return partial;
  }
  return -1;
}

function normalizeTimestamp(raw, fallbackDate) {
  const s = String(raw || '').trim();
  let m = s.match(/(20\d{2})[-/](\d{1,2})[-/](\d{1,2})[ T](\d{1,2}):(\d{2})(?::(\d{2}))?/);
  if (m) {
    const date = `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
    const h = Number(m[4]);
    const min = Number(m[5]);
    const sec = Number(m[6] || 0);
    return { date, secondOfDay: h * 3600 + min * 60 + sec, time: `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}:${String(sec).padStart(2, '0')}` };
  }
  m = s.match(/(\d{1,2}):(\d{2})(?::(\d{2}))?/);
  if (m) {
    const h = Number(m[1]);
    const min = Number(m[2]);
    const sec = Number(m[3] || 0);
    return { date: fallbackDate, secondOfDay: h * 3600 + min * 60 + sec, time: `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}:${String(sec).padStart(2, '0')}` };
  }
  return null;
}

function parseHeartRateCsv(text, fileName = '') {
  const rows = parseCsv(text);
  if (!rows.length) return [];

  let idx = headerIndex(rows);
  if (idx < 0) idx = 0;
  const header = rows[idx];
  const idIdx = findColumn(header, ['SensorID', 'ID', 'id']);
  const timeIdx = findColumn(header, ['Timestamp', 'Minute', 'DateTime', 'Time', '時刻']);
  const hrIdx = findColumn(header, ['HeartRate_bpm', 'MeanHeartRate_bpm', 'HeartRate', 'HR', '心拍数']);

  if (idIdx < 0 || timeIdx < 0 || hrIdx < 0) {
    throw new Error('必要な列（SensorID, Timestamp/Minute, HeartRate_bpm/MeanHeartRate_bpm）が見つかりません。');
  }

  const fallbackDate = el('dateInput')?.value || CONFIG.defaultDate;
  return rows.slice(idx + 1).map((r, i) => {
    const parsedTime = normalizeTimestamp(r[timeIdx], fallbackDate);
    if (!parsedTime) return null;
    const hr = parseNumber(r[hrIdx]);
    const sensorId = String(r[idIdx] || '').trim();
    if (!sensorId || !Number.isFinite(hr)) return null;
    return {
      sourceIndex: i,
      sensorId,
      date: parsedTime.date,
      secondOfDay: parsedTime.secondOfDay,
      time: parsedTime.time,
      hr,
    };
  }).filter(Boolean);
}

function getTargetRows() {
  const targetDate = el('dateInput').value || CONFIG.defaultDate;
  return state.rows
    .filter((r) => r.date === targetDate)
    .filter((r) => r.secondOfDay >= CONFIG.displayStartSecond && r.secondOfDay <= CONFIG.displayEndSecond)
    .sort((a, b) => a.secondOfDay - b.secondOfDay || a.sensorId.localeCompare(b.sensorId));
}

function updateIdSelect() {
  const select = el('idSelect');
  const targetRows = getTargetRows();
  const ids = [...new Set(targetRows.map((r) => r.sensorId))].sort((a, b) => a.localeCompare(b, 'ja'));
  state.ids = ids;

  select.innerHTML = '';
  if (!ids.length) {
    select.appendChild(new Option('対象データなし', ''));
    select.disabled = true;
    state.selectedId = '';
    return;
  }

  ids.forEach((id) => select.appendChild(new Option(id, id)));
  select.disabled = false;
  if (ids.includes(state.selectedId)) select.value = state.selectedId;
  else {
    state.selectedId = ids[0];
    select.value = state.selectedId;
  }
}

function buildSelectedSeries() {
  const targetRows = getTargetRows().filter((r) => r.sensorId === state.selectedId);
  const bySecond = new Map();
  targetRows.forEach((r) => {
    if (!bySecond.has(r.secondOfDay)) bySecond.set(r.secondOfDay, []);
    bySecond.get(r.secondOfDay).push(r.hr);
  });
  return [...bySecond.entries()].sort((a, b) => a[0] - b[0]).map(([second, values]) => ({
    second,
    value: mean(values),
    n: values.length,
  }));
}

function buildClassAverageSeries() {
  const targetRows = getTargetRows();
  const bySecondById = new Map();
  targetRows.forEach((r) => {
    if (!bySecondById.has(r.secondOfDay)) bySecondById.set(r.secondOfDay, new Map());
    const idMap = bySecondById.get(r.secondOfDay);
    if (!idMap.has(r.sensorId)) idMap.set(r.sensorId, []);
    idMap.get(r.sensorId).push(r.hr);
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

function getYAxis(values) {
  const good = values.filter(Number.isFinite);
  if (!good.length) return { min: 40, max: 120, step: 20 };
  const minRaw = Math.min(...good);
  const maxRaw = Math.max(...good);
  const span = Math.max(10, maxRaw - minRaw);
  const pad = Math.max(5, span * 0.12);
  let min = Math.max(0, Math.floor((minRaw - pad) / 5) * 5);
  let max = Math.ceil((maxRaw + pad) / 5) * 5;
  if (max - min < 20) {
    min = Math.max(0, min - 5);
    max += 5;
  }
  const step = niceTickStep(max - min, 5);
  min = Math.floor(min / step) * step;
  max = Math.ceil(max / step) * step;
  return { min, max, step };
}

function getCanvasContext(canvas) {
  const baseWidth = Number(canvas.dataset.baseWidth || canvas.getAttribute('width') || canvas.width || 1180);
  const baseHeight = Number(canvas.dataset.baseHeight || canvas.getAttribute('height') || canvas.height || 540);
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

function chartBox(w, h, left = 92, top = 52, right = 36, bottom = 88) {
  const box = { left, top, right: w - right, bottom: h - bottom };
  box.width = box.right - box.left;
  box.height = box.bottom - box.top;
  return box;
}

function drawNoData(ctx, w, h, text) {
  clearCanvas(ctx, w, h);
  ctx.fillStyle = COLORS.muted;
  ctx.font = chartFont(700, 22);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, w / 2, h / 2);
}

function drawGrid(ctx, box, axis) {
  const start = CONFIG.displayStartSecond;
  const end = CONFIG.displayEndSecond;
  const yRange = Math.max(1e-9, axis.max - axis.min);

  ctx.save();
  ctx.strokeStyle = COLORS.grid;
  ctx.lineWidth = 1.25;
  ctx.fillStyle = COLORS.muted;
  ctx.font = chartFont(700, 16);
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';

  for (let v = axis.min; v <= axis.max + 1e-6; v += axis.step) {
    const y = box.bottom - ((v - axis.min) / yRange) * box.height;
    ctx.beginPath();
    ctx.moveTo(box.left, y);
    ctx.lineTo(box.right, y);
    ctx.stroke();
    ctx.fillText(fmtNumber(v, 0), box.left - 12, y);
  }

  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  for (let s = start; s <= end; s += 10 * 60) {
    const x = box.left + ((s - start) / (end - start)) * box.width;
    ctx.beginPath();
    ctx.moveTo(x, box.top);
    ctx.lineTo(x, box.bottom);
    ctx.stroke();
    ctx.fillStyle = COLORS.muted;
    ctx.fillText(secondToLabel(s), x, box.bottom + 14);
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
  ctx.font = chartFont(800, 17);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.save();
  ctx.translate(box.left - 58, box.top + box.height / 2);
  ctx.rotate(-Math.PI / 2);
  ctx.fillText('心拍数（bpm）', 0, 0);
  ctx.restore();
  ctx.fillText('時刻', box.left + box.width / 2, box.bottom + 58);

  ctx.restore();
}

function pointToCanvas(pt, box, axis) {
  const start = CONFIG.displayStartSecond;
  const end = CONFIG.displayEndSecond;
  const x = box.left + ((pt.second - start) / (end - start)) * box.width;
  const y = box.bottom - ((pt.value - axis.min) / (axis.max - axis.min)) * box.height;
  return { x, y };
}

function drawLine(ctx, series, box, axis, color, width = 3, dashed = false, alpha = 1) {
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
    if (!Number.isFinite(pt.value)) { started = false; return; }
    const { x, y } = pointToCanvas(pt, box, axis);
    if (!started) { ctx.moveTo(x, y); started = true; }
    else ctx.lineTo(x, y);
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
    if (dist < bestDist) { bestDist = dist; best = pt; }
  });
  return bestDist <= 90 ? best : null;
}

function drawHover(ctx, box, axis, selectedSeries, classSeries) {
  if (!state.hover) return;
  const second = CONFIG.displayStartSecond + (state.hover.x - box.left) / box.width * (CONFIG.displayEndSecond - CONFIG.displayStartSecond);
  if (second < CONFIG.displayStartSecond || second > CONFIG.displayEndSecond) return;
  const selected = findNearest(selectedSeries, second);
  const average = findNearest(classSeries, second);
  if (!selected && !average) return;

  const guideX = box.left + ((second - CONFIG.displayStartSecond) / (CONFIG.displayEndSecond - CONFIG.displayStartSecond)) * box.width;
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
  if (selected) rows.push({ label: `選択ID ${state.selectedId}`, value: selected.value, text: `${fmtNumber(selected.value, 1)} bpm`, color: COLORS.orange, second: selected.second });
  if (average) rows.push({ label: '全員平均', value: average.value, text: `${fmtNumber(average.value, 1)} bpm`, color: COLORS.classLine, second: average.second });
  rows.forEach((row) => {
    const yPoint = pointToCanvas({ second: row.second, value: row.value }, box, axis);
    ctx.fillStyle = row.color;
    ctx.beginPath();
    ctx.arc(yPoint.x, yPoint.y, 4.5, 0, Math.PI * 2);
    ctx.fill();
  });

  const labelTime = secondToLabel(Math.round(second), true);
  ctx.font = chartFont(800, 14);
  const textWidth = Math.max(...rows.map((r) => ctx.measureText(`${r.label}: ${r.text}`).width), ctx.measureText(labelTime).width);
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
    ctx.fillText(`${r.label}: ${r.text}`, cardX + 42, y - 3);
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

function updateCards(selectedSeries, classSeries) {
  const targetDate = el('dateInput').value || CONFIG.defaultDate;
  const targetRows = getTargetRows();
  const uniqueIds = [...new Set(targetRows.map((r) => r.sensorId))];
  el('idCount').textContent = String(uniqueIds.length);
  el('idCountNote').textContent = state.fileName ? `${state.fileName} / ${targetDate}` : 'データ未読込';
  el('selectedIdCard').textContent = state.selectedId || '-';
  el('selectedIdNote').textContent = selectedSeries.length ? `${selectedSeries.length}点` : '対象データなし';
  el('selectedMeanHr').textContent = selectedSeries.length ? `${fmtNumber(mean(selectedSeries.map((p) => p.value)), 1)} bpm` : '-';
  el('classMeanHr').textContent = classSeries.length ? `${fmtNumber(mean(classSeries.map((p) => p.value)), 1)} bpm` : '-';
}

function updateStatus() {
  const targetDate = el('dateInput').value || CONFIG.defaultDate;
  const targetRows = getTargetRows();
  const dates = [...new Set(state.rows.map((r) => r.date))].sort();
  const status = el('dataStatus');
  if (!state.rows.length) {
    status.textContent = 'データ未読込';
  } else if (!targetRows.length) {
    status.textContent = `対象日 ${targetDate} の11:10〜11:50データがありません。CSV内の日付: ${dates.slice(0, 5).join(', ')}${dates.length > 5 ? '...' : ''}`;
  } else {
    status.textContent = `${targetDate} 11:10〜11:50 / ${targetRows.length}行`;
  }
}

function drawChart() {
  const canvas = el('restingCanvas');
  const { ctx, w, h } = getCanvasContext(canvas);
  const selectedSeries = buildSelectedSeries();
  const classSeries = buildClassAverageSeries();
  updateCards(selectedSeries, classSeries);
  updateStatus();

  if (!state.rows.length) return drawNoData(ctx, w, h, 'CSVを読み込むと、安静時心拍数の時系列を表示します。');
  if (!selectedSeries.length && !classSeries.length) return drawNoData(ctx, w, h, '対象日の11:10〜11:50に心拍データがありません。');

  clearCanvas(ctx, w, h);
  const box = chartBox(w, h, 96, 44, 36, 92);
  const values = selectedSeries.concat(classSeries).map((p) => p.value);
  const axis = getYAxis(values);
  drawGrid(ctx, box, axis);
  drawLine(ctx, classSeries, box, axis, COLORS.classLine, 3, true, 0.95);
  drawLine(ctx, selectedSeries, box, axis, COLORS.orange, 3.2, false, 1);

  ctx.fillStyle = COLORS.ink;
  ctx.font = chartFont(900, 19);
  ctx.textAlign = 'left';
  ctx.fillText(`対象日: ${el('dateInput').value || CONFIG.defaultDate} / ID: ${state.selectedId || '-'}`, box.left, box.top - 16);
  drawHover(ctx, box, axis, selectedSeries, classSeries);
}

async function loadCsvText(text, fileName) {
  state.rows = parseHeartRateCsv(text, fileName);
  state.fileName = fileName;
  state.hover = null;
  el('restingFileName').textContent = fileName;
  updateIdSelect();
  drawChart();
}

async function listCsvFilesInDataFolder() {
  const apiUrl = `https://api.github.com/repos/${CONFIG.repoFullName}/contents/${CONFIG.dataFolder}?ref=${CONFIG.branch}`;
  const res = await fetch(apiUrl, {
    cache: 'no-store',
    headers: { Accept: 'application/vnd.github+json' },
  });
  if (!res.ok) throw new Error(`Cannot list ${CONFIG.dataFolder}`);

  const items = await res.json();
  if (!Array.isArray(items)) throw new Error(`${CONFIG.dataFolder} の一覧を取得できません。`);

  return items
    .filter((item) => item.type === 'file')
    .filter((item) => /\.csv$/i.test(item.name))
    .sort((a, b) => a.name.localeCompare(b.name, 'ja'))
    .map((item) => ({
      name: item.name,
      url: item.download_url || `https://raw.githubusercontent.com/${CONFIG.repoFullName}/${CONFIG.branch}/${item.path}`,
    }));
}

async function loadCsvEntries(entries, sourceLabel) {
  state.rows = [];
  state.fileName = sourceLabel;
  state.hover = null;
  el('restingFileName').textContent = `${sourceLabel} を読み込み中...`;
  drawChart();

  const allRows = [];
  const loadedNames = [];
  const failedNames = [];

  for (const entry of entries) {
    try {
      const text = entry.file ? await readTextFile(entry.file) : await fetchText(entry.url);
      const parsed = parseHeartRateCsv(text, entry.name || entry.url);
      allRows.push(...parsed);
      loadedNames.push(entry.name || entry.url);
    } catch (err) {
      failedNames.push(`${entry.name || entry.url}: ${err.message || String(err)}`);
    }
  }

  state.rows = allRows;
  state.fileName = `${sourceLabel}: ${loadedNames.length} CSV`;
  state.hover = null;
  el('restingFileName').textContent = failedNames.length
    ? `${state.fileName} 読込 / 失敗 ${failedNames.length} CSV`
    : `${state.fileName} 読込完了`;

  if (failedNames.length) console.warn('CSV load failures:', failedNames);
  updateIdSelect();
  drawChart();
}

async function tryLoadDefaultFiles() {
  try {
    el('restingFileName').textContent = `${CONFIG.dataFolder} のCSV一覧を取得中...`;
    const entries = await listCsvFilesInDataFolder();
    if (!entries.length) {
      el('restingFileName').textContent = `${CONFIG.dataFolder} にCSVファイルがありません。`;
      drawChart();
      return;
    }
    await loadCsvEntries(entries, `${CONFIG.dataFolder} 内の全CSV`);
  } catch (err) {
    console.error(err);
    el('restingFileName').textContent = `${CONFIG.dataFolder} の自動読込に失敗しました。手動でCSVを複数選択してください。`;
    drawChart();
  }
}

function setupEvents() {
  const input = el('restingInput');
  input.addEventListener('change', async (event) => {
    const files = [...(event.target.files || [])].filter((file) => /\.csv$/i.test(file.name));
    if (!files.length) return;
    await loadCsvEntries(files.map((file) => ({ name: file.name, file })), '手動選択CSV');
  });

  const drop = el('restingDrop');
  ['dragenter', 'dragover'].forEach((name) => drop.addEventListener(name, (e) => {
    e.preventDefault();
    drop.classList.add('dragover');
  }));
  ['dragleave', 'drop'].forEach((name) => drop.addEventListener(name, (e) => {
    e.preventDefault();
    drop.classList.remove('dragover');
  }));
  drop.addEventListener('drop', async (e) => {
    const files = [...(e.dataTransfer?.files || [])].filter((file) => /\.csv$/i.test(file.name));
    if (!files.length) return;
    await loadCsvEntries(files.map((file) => ({ name: file.name, file })), 'ドラッグ＆ドロップCSV');
  });

  el('idSelect').addEventListener('change', (e) => {
    state.selectedId = e.target.value;
    state.hover = null;
    drawChart();
  });

  el('dateInput').addEventListener('change', () => {
    updateIdSelect();
    state.hover = null;
    drawChart();
  });

  const canvas = el('restingCanvas');
  canvas.addEventListener('mousemove', (event) => {
    const rect = canvas.getBoundingClientRect();
    state.hover = { x: event.clientX - rect.left, y: event.clientY - rect.top };
    drawChart();
  });
  canvas.addEventListener('mouseleave', () => {
    state.hover = null;
    drawChart();
  });

  window.addEventListener('resize', () => drawChart());
}

setupEvents();
tryLoadDefaultFiles();
