const state = {
  rows: [],
  ids: [],
  selectedId: '',
  loadedFiles: [],
  failedFiles: [],
  hover: null,
};

const CONFIG = {
  repoFullName: 'ShojiKonda/HR-and-ACC-dashboard_SHL',
  branch: 'main',
  dataFolder: 'data/2026_05_25',
  defaultDate: '2026-05-25',
  displayStartSecond: 11 * 3600 + 20 * 60,
  displayEndSecond: 11 * 3600 + 45 * 60,
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

CONFIG.contentsApiUrl = `https://api.github.com/repos/${CONFIG.repoFullName}/contents/${CONFIG.dataFolder}?ref=${CONFIG.branch}`;

const COLORS = {
  ink: '#ffffff',
  muted: '#cbd5e1',
  grid: 'rgba(255, 255, 255, 0.24)',
  axis: '#ffffff',
  chartBg: '#111827',
  orange: '#fb923c',
  classLine: '#e5edf7',
  blue: '#60a5fa',
  green: '#34d399',
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

function headerIndex(rows) {
  return rows.findIndex((row) => {
    const lower = row.map((x) => String(x).trim().toLowerCase());
    return lower.includes('sensorid') &&
      (lower.includes('timestamp') || lower.includes('minute') || lower.includes('time')) &&
      (lower.includes('heartrate') || lower.includes('heartrate_bpm') || lower.includes('meanheartrate_bpm')) &&
      lower.includes('accnorm');
  });
}

function normalizeDate(raw, fallbackDate) {
  const s = String(raw || '').trim();
  const m = s.match(/(20\d{2})[-/](\d{1,2})[-/](\d{1,2})/);
  if (!m) return fallbackDate;
  return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
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

function parseSensorCsv(text, fileName = '') {
  const rows = parseCsv(text);
  if (!rows.length) return [];

  let idx = headerIndex(rows);
  if (idx < 0) idx = 0;
  const header = rows[idx];
  const dateIdx = findColumn(header, ['Date', '日付']);
  const idIdx = findColumn(header, ['SensorID', 'ID', 'id']);
  const timeIdx = findColumn(header, ['Timestamp', 'Minute', 'DateTime', 'Time', '時刻']);
  const hrIdx = findColumn(header, ['HeartRate', 'HeartRate_bpm', 'MeanHeartRate_bpm', 'HR', '心拍数']);
  const accIdx = findColumn(header, ['AccNorm', 'AccelerationNorm', 'ACCNorm', '加速度ノルム']);

  if (idIdx < 0 || timeIdx < 0 || hrIdx < 0 || accIdx < 0) {
    throw new Error(`${fileName}: 必要な列（SensorID, Timestamp, HeartRate, AccNorm）が見つかりません。`);
  }

  return rows.slice(idx + 1).map((r, i) => {
    const fallbackDate = dateIdx >= 0 ? normalizeDate(r[dateIdx], CONFIG.defaultDate) : CONFIG.defaultDate;
    const parsedTime = normalizeTimestamp(r[timeIdx], fallbackDate);
    if (!parsedTime) return null;
    const sensorId = String(r[idIdx] || '').trim();
    if (!sensorId) return null;
    const hr = parseNumber(r[hrIdx]);
    const accNorm = parseNumber(r[accIdx]);
    if (!Number.isFinite(hr) && !Number.isFinite(accNorm)) return null;
    return {
      sourceIndex: i,
      sourceFile: fileName,
      sensorId,
      date: parsedTime.date,
      secondOfDay: parsedTime.secondOfDay,
      time: parsedTime.time,
      hr,
      accNorm,
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

async function listCsvFilesInFolder() {
  const res = await fetch(CONFIG.contentsApiUrl, {
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

async function loadTargetFolder() {
  setLoadStatus('loading', '読み込み中', `${CONFIG.dataFolder} 内のCSVを確認しています`);
  drawAll();

  try {
    const files = await listCsvFilesInFolder();
    if (!files.length) {
      setLoadStatus('error', 'CSVなし', `${CONFIG.dataFolder} にCSVがありません`);
      updateIdSelect();
      drawAll();
      return;
    }

    const loadedRows = [];
    const loadedFiles = [];
    const failedFiles = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      setLoadStatus('loading', '読み込み中', `${i + 1}/${files.length} CSV`);
      try {
        const text = await fetchText(file.url);
        const rows = parseSensorCsv(text, file.name);
        loadedRows.push(...rows);
        loadedFiles.push(file.name);
      } catch (err) {
        failedFiles.push({ name: file.name, error: err.message || String(err) });
      }
    }

    state.rows = loadedRows;
    state.loadedFiles = loadedFiles;
    state.failedFiles = failedFiles;
    updateIdSelect();

    if (!loadedFiles.length) {
      setLoadStatus('error', '読込失敗', 'CSVを読み込めませんでした');
    } else if (failedFiles.length) {
      setLoadStatus('error', '一部読込失敗', `${loadedFiles.length} CSV読込 / ${failedFiles.length} CSV失敗`);
      console.warn('CSV read failures:', failedFiles);
    } else {
      setLoadStatus('ready', '読込完了', `${loadedFiles.length} CSV`);
    }

    drawAll();
  } catch (err) {
    console.error(err);
    setLoadStatus('error', '読込失敗', `${CONFIG.dataFolder} を確認してください`);
    updateIdSelect();
    drawAll();
  }
}

function getTargetRows() {
  return state.rows
    .filter((r) => r.date === CONFIG.defaultDate)
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
    select.appendChild(new Option(state.loadedFiles.length ? '対象データなし' : 'CSVを読み込み中', ''));
    select.disabled = true;
    state.selectedId = '';
    return;
  }

  ids.forEach((id) => select.appendChild(new Option(id, id)));
  select.disabled = false;
  if (ids.includes(state.selectedId)) {
    select.value = state.selectedId;
  } else {
    state.selectedId = ids[0];
    select.value = state.selectedId;
  }
}

function buildSelectedSeries(metric) {
  const targetRows = getTargetRows().filter((r) => r.sensorId === state.selectedId);
  const bySecond = new Map();
  targetRows.forEach((r) => {
    const value = r[metric];
    if (!Number.isFinite(value)) return;
    if (!bySecond.has(r.secondOfDay)) bySecond.set(r.secondOfDay, []);
    bySecond.get(r.secondOfDay).push(value);
  });
  return [...bySecond.entries()].sort((a, b) => a[0] - b[0]).map(([second, values]) => ({
    second,
    value: mean(values),
    n: values.length,
  }));
}

function buildClassAverageSeries(metric) {
  const targetRows = getTargetRows();
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

function drawGrid(ctx, box, axis, yLabel, digits = 0) {
  const start = CONFIG.displayStartSecond;
  const end = CONFIG.displayEndSecond;
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
    ctx.fillText(fmtNumber(v, digits), box.left - 12, y);
  }

  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  for (let s = start; s <= end; s += 5 * 60) {
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
    if (!Number.isFinite(pt.value)) {
      started = false;
      return;
    }
    const { x, y } = pointToCanvas(pt, box, axis);
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
  const fmt = (value) => `${fmtNumber(value, options.digits)}${options.unit ? ` ${options.unit}` : ''}`;
  if (selected) rows.push({ label: `選択ID ${state.selectedId}`, value: fmt(selected.value), color: COLORS.orange, second: selected.second, raw: selected.value });
  if (average) rows.push({ label: '全員平均', value: fmt(average.value), color: COLORS.classLine, second: average.second, raw: average.value });
  rows.forEach((row) => {
    const yPoint = pointToCanvas({ second: row.second, value: row.raw }, box, axis);
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

function drawTimeSeries(canvasId, metric, options) {
  const canvas = el(canvasId);
  const { ctx, w, h } = getCanvasContext(canvas);
  const selectedSeries = buildSelectedSeries(metric);
  const classSeries = buildClassAverageSeries(metric);

  if (!state.rows.length) return drawNoData(ctx, w, h, 'CSVを読み込んでいます。');
  if (!selectedSeries.length && !classSeries.length) return drawNoData(ctx, w, h, '対象時間帯にデータがありません。');

  clearCanvas(ctx, w, h);
  const box = chartBox(w, h, 96, 24, 36, 78);
  const values = selectedSeries.concat(classSeries).map((p) => p.value);
  const axis = getYAxis(values, options.fallbackAxis, 5);
  drawGrid(ctx, box, axis, options.yLabel, options.digits);
  if (options.referenceValue !== undefined && options.referenceLabel) {
    drawReferenceLine(ctx, box, axis, options.referenceValue, options.referenceLabel);
  }
  drawLine(ctx, classSeries, box, axis, COLORS.classLine, 3, true, 0.95);
  drawLine(ctx, selectedSeries, box, axis, COLORS.orange, 3.2, false, 1);
  drawHover(ctx, box, axis, selectedSeries, classSeries, { ...options, canvasId });
}


function buildPhaseTrendProfiles() {
  const targetRows = getTargetRows().filter((r) => Number.isFinite(r.hr));
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

  const selectedProfile = profiles.find((profile) => profile.id === state.selectedId) || null;
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
  if (!state.rows.length) return drawNoData(ctx, w, h, 'CSVを読み込んでいます。');

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
    if (profile.id === state.selectedId) return;
    drawCategoricalLine(ctx, profile.values, box, axis, 'rgba(203, 213, 225, 0.28)', 1.4, false, 1, 2.2);
  });

  drawCategoricalLine(ctx, meanValues, box, axis, COLORS.classLine, 3.4, true, 1, 4.2);

  if (selectedProfile) {
    drawCategoricalLine(ctx, selectedProfile.values, box, axis, COLORS.orange, 3.8, false, 1, 5);
  }

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
  const targetRows = getTargetRows().filter((r) =>
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
  if (!values.length) {
    return { xMin: 40, xMax: 120, binWidth, yMax: 5, yStep: 1 };
  }
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
  if (!state.rows.length) return drawNoData(ctx, w, h, 'CSVを読み込んでいます。');
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

  const selected = distribution.find((d) => d.id === state.selectedId);
  if (selected && Number.isFinite(selected.value)) {
    const x = box.left + ((selected.value - axis.xMin) / (axis.xMax - axis.xMin)) * box.width;
    ctx.strokeStyle = COLORS.orange;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(x, box.top);
    ctx.lineTo(x, box.bottom);
    ctx.stroke();

    const label = `${state.selectedId}: ${fmtNumber(selected.value, 1)} bpm`;
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
  CONFIG.summaryWindows.forEach((period, i) => {
    drawHistogramCanvas(period, distributions[i], axis);
  });
}

function drawAll() {
  drawTimeSeries('heartRateCanvas', 'hr', {
    yLabel: '心拍数（bpm）',
    unit: 'bpm',
    digits: 0,
    fallbackAxis: { min: 40, max: 120, step: 20, minSpan: 10, pad: 5 },
  });
  drawTimeSeries('accNormCanvas', 'accNorm', {
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

function setupEvents() {
  el('idSelect').addEventListener('change', (e) => {
    state.selectedId = e.target.value;
    state.hover = null;
    drawAll();
  });

  ['heartRateCanvas', 'accNormCanvas'].forEach((canvasId) => {
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
loadTargetFolder();


function setupDashboardTabs() {
  const buttons = document.querySelectorAll('.dashboard-tab');
  const panels = document.querySelectorAll('.tab-panel');
  buttons.forEach((button) => {
    button.addEventListener('click', () => {
      const target = button.dataset.tabTarget;
      buttons.forEach((b) => b.classList.toggle('active', b === button));
      panels.forEach((panel) => {
        const active = panel.id === target;
        panel.classList.toggle('active', active);
        panel.hidden = !active;
      });
      window.setTimeout(() => {
        window.dispatchEvent(new Event('resize'));
        if (typeof drawAll === 'function') drawAll();
      }, 80);
    });
  });
}

setupDashboardTabs();


// ===== Exercise tab: same implementation as the previous personal dashboard, isolated from the resting tab =====
(function(){
const SURFACE = "#111827";
const WHITE = "#ffffff";
const INK = "#e8eef7";
const MUTED = "#9aa8bd";
const GRID = "rgba(255,255,255,.12)";
const AXIS = "rgba(255,255,255,.82)";
const C = {
  blue: "#60a5fa",
  cyan: "#22d3ee",
  green: "#2dd4bf",
  purple: "#a78bfa",
  orange: "#fb923c",
  yellow: "#facc15",
  pink: "#f472b6",
  red: "#f87171",
  gray: "rgba(154,168,189,.45)"
};
const SERIES = [C.blue, C.cyan, C.green, C.purple, C.orange, C.yellow, C.pink, C.red];
const FONT = '"Noto Sans JP","Hiragino Sans","Yu Gothic","Yu Gothic UI",Meiryo,sans-serif';
const ACC_SMOOTH_SEC = 5;
const DEFAULT_START_SEC = 10 * 3600 + 40 * 60;
const DEFAULT_END_SEC = 11 * 3600 + 50 * 60;

const state = {
  measurements: [],
  selectedDate: null,
  selectedSensor: null,
  compareSensor: null,
  compareDates: new Set(),
  timeStart: null,
  timeEnd: null,
  datasetName: "読み込み中",
  datasetNote: "data/index.json を確認しています。"
};

function $(id) { return document.getElementById(id); }
function fnt(weight = 700, size = 13) { return `${weight} ${size}px ${FONT}`; }
function setStatus(name, note) {
  state.datasetName = name;
  state.datasetNote = note;
  $("datasetName").textContent = name;
  $("datasetNote").textContent = note;
}

function canvasContext(canvas) {
  const rect = canvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  const width = Math.max(1, Math.round(rect.width));
  const height = Math.max(1, Math.round(rect.height));
  canvas.width = Math.round(width * dpr);
  canvas.height = Math.round(height * dpr);
  const ctx = canvas.getContext("2d");
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.imageSmoothingEnabled = true;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.textBaseline = "middle";
  ctx.fillStyle = SURFACE;
  ctx.fillRect(0, 0, width, height);
  return { ctx, width, height };
}

function parseDateTime(value) {
  const text = String(value || "").trim();
  const m = text.match(/(\d{4})[\/\-年_](\d{1,2})[\/\-月_](\d{1,2})\D+(\d{1,2}):(\d{1,2}):(\d{1,2})(?:\.(\d+))?/);
  if (!m) {
    const d = new Date(text);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const ms = m[7] ? Number((m[7] + "000").slice(0, 3)) : 0;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4]), Number(m[5]), Number(m[6]), ms);
}
function dateKey(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function secOfDay(d) { return d.getHours() * 3600 + d.getMinutes() * 60 + d.getSeconds(); }
function timeLabel(sec) {
  const s = Math.max(0, Math.round(sec));
  const h = Math.floor(s / 3600) % 24;
  const m = Math.floor((s % 3600) / 60);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}
function splitCSV(line) {
  if (!line.includes('"')) return line.split(",");
  const out = [];
  let cur = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (quoted && line[i + 1] === '"') { cur += '"'; i += 1; }
      else quoted = !quoted;
    } else if (ch === "," && !quoted) { out.push(cur); cur = ""; }
    else cur += ch;
  }
  out.push(cur);
  return out;
}
function canonicalHeader(value) { return String(value || "").trim().toLowerCase().replace(/[\s_\-()]/g, ""); }
function findColumn(headers, candidates) {
  const hs = headers.map(canonicalHeader);
  for (const c of candidates) {
    const i = hs.indexOf(canonicalHeader(c));
    if (i >= 0) return i;
  }
  for (const c of candidates) {
    const key = canonicalHeader(c);
    const i = hs.findIndex(h => h.includes(key));
    if (i >= 0) return i;
  }
  return -1;
}
function parseMeta(path) {
  const name = path.split("/").pop() || path;
  const base = name.replace(/\.csv$/i, "");
  const type = /加速度|acc|acceler/i.test(path) ? "acc" : /心拍|heart|hr/i.test(path) ? "hr" : null;
  const dm = path.match(/(20\d{2})[\/_\-年](\d{1,2})[\/_\-月](\d{1,2})/);
  const date = dm ? `${dm[1]}-${String(dm[2]).padStart(2, "0")}-${String(dm[3]).padStart(2, "0")}` : null;
  const stripped = base.replace(/加速度|心拍数|心拍|Heart Rate|Heart|HR|ACC|Acceleration/ig, "");
  const matches = stripped.match(/(?:^|[_\-\s])([A-Za-z]*\d{1,6})(?=$|[_\-\s])/g);
  const sensor = matches && matches.length ? matches[matches.length - 1].replace(/^[_\-\s]+/, "") : "001";
  return { type, date, sensor, name };
}

function parseAccCSV(text) {
  const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/).filter(line => line.trim());
  if (lines.length < 2) return { samples: [], firstDate: null };
  const headers = splitCSV(lines[0]);
  const ti = findColumn(headers, ["Timestamp", "Time", "DateTime", "日時"]);
  const xi = findColumn(headers, ["ACC X", "AccX", "X", "Acceleration X"]);
  const yi = findColumn(headers, ["ACC Y", "AccY", "Y", "Acceleration Y"]);
  const zi = findColumn(headers, ["ACC Z", "AccZ", "Z", "Acceleration Z"]);
  if ([ti, xi, yi, zi].some(i => i < 0)) throw new Error("加速度CSV列を判定できません");
  const bins = new Map();
  let firstDate = null;
  for (let i = 1; i < lines.length; i++) {
    const row = splitCSV(lines[i]);
    const d = parseDateTime(row[ti]);
    if (!d) continue;
    if (!firstDate) firstDate = dateKey(d);
    const x = Number(row[xi]);
    const y = Number(row[yi]);
    const z = Number(row[zi]);
    if (![x, y, z].every(Number.isFinite)) continue;
    const sec = secOfDay(d);
    const b = bins.get(sec) || { sum: 0, count: 0 };
    b.sum += Math.sqrt(x * x + y * y + z * z);
    b.count += 1;
    bins.set(sec, b);
  }
  const samples = [...bins.entries()].sort((a, b) => a[0] - b[0]).map(([x, b]) => ({ x, value: b.sum / b.count }));
  return { samples, firstDate };
}
function parseHrCSV(text) {
  const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/).filter(line => line.trim());
  if (lines.length < 2) return { samples: [], firstDate: null };
  const headers = splitCSV(lines[0]);
  const ti = findColumn(headers, ["Timestamp", "Time", "DateTime", "日時"]);
  const hi = findColumn(headers, ["Heart Rate", "HeartRate", "HR", "心拍数", "心拍"]);
  if (ti < 0 || hi < 0) throw new Error("心拍CSV列を判定できません");
  const bins = new Map();
  let firstDate = null;
  for (let i = 1; i < lines.length; i++) {
    const row = splitCSV(lines[i]);
    const d = parseDateTime(row[ti]);
    if (!d) continue;
    if (!firstDate) firstDate = dateKey(d);
    const hr = Number(row[hi]);
    if (!Number.isFinite(hr) || hr <= 0) continue;
    const sec = secOfDay(d);
    const b = bins.get(sec) || { sum: 0, count: 0 };
    b.sum += hr;
    b.count += 1;
    bins.set(sec, b);
  }
  const samples = [...bins.entries()].sort((a, b) => a[0] - b[0]).map(([x, b]) => ({ x, value: b.sum / b.count }));
  return { samples, firstDate };
}


function isMergedCSV(headers) {
  const hasTimestamp = findColumn(headers, ["Timestamp", "Time", "DateTime", "日時"]) >= 0;
  const hasDate = findColumn(headers, ["Date", "計測日", "日付"]) >= 0;
  const hasSensor = findColumn(headers, ["SensorID", "Sensor ID", "Sensor", "センサID", "ID"]) >= 0;
  const hasHr = findColumn(headers, ["HeartRate", "Heart Rate", "HR", "心拍数", "心拍"]) >= 0;
  const hasAcc = findColumn(headers, ["AccNorm", "Acceleration Norm", "ACC Norm", "加速度ノルム"]) >= 0;
  return hasTimestamp && hasSensor && hasHr && hasAcc && hasDate;
}

function parseMergedCSV(text) {
  const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/).filter(line => line.trim());
  if (lines.length < 2) return [];
  const headers = splitCSV(lines[0]);
  if (!isMergedCSV(headers)) return [];
  const dateIdx = findColumn(headers, ["Date", "計測日", "日付"]);
  const tsIdx = findColumn(headers, ["Timestamp", "Time", "DateTime", "日時"]);
  const sensorIdx = findColumn(headers, ["SensorID", "Sensor ID", "Sensor", "センサID", "ID"]);
  const hrIdx = findColumn(headers, ["HeartRate", "Heart Rate", "HR", "心拍数", "心拍"]);
  const accIdx = findColumn(headers, ["AccNorm", "Acceleration Norm", "ACC Norm", "加速度ノルム"]);
  const map = new Map();

  for (let i = 1; i < lines.length; i++) {
    const row = splitCSV(lines[i]);
    const d = parseDateTime(row[tsIdx]);
    const dateText = String(row[dateIdx] || "").trim();
    const date = dateText || (d ? dateKey(d) : null);
    const sensor = String(row[sensorIdx] || "").trim() || "001";
    if (!date || !d) continue;
    const key = `${date}|${sensor}`;
    const item = map.get(key) || { date, sensor, acc: [], hr: [], sourceFiles: [] };
    const x = secOfDay(d);
    const hr = Number(row[hrIdx]);
    const acc = Number(row[accIdx]);
    if (Number.isFinite(hr) && hr > 0) item.hr.push({ x, value: hr });
    if (Number.isFinite(acc)) item.acc.push({ x, value: acc });
    map.set(key, item);
  }

  return [...map.values()].map(item => ({
    ...item,
    hr: item.hr.sort((a, b) => a.x - b.x),
    acc: item.acc.sort((a, b) => a.x - b.x)
  }));
}

function naturalCompare(a, b) { return String(a).localeCompare(String(b), "ja", { numeric: true, sensitivity: "base" }); }
function mean(values) {
  let sum = 0;
  let count = 0;
  for (const value of values) {
    if (Number.isFinite(value)) {
      sum += value;
      count += 1;
    }
  }
  return count ? sum / count : NaN;
}
function safeMax(values, fallback = 0) {
  let max = -Infinity;
  for (const value of values) {
    if (Number.isFinite(value) && value > max) max = value;
  }
  return max === -Infinity ? fallback : max;
}
function completeMeasurement(m) {
  let minX = Infinity;
  let maxX = -Infinity;
  for (const p of m.hr) {
    if (Number.isFinite(p.x)) {
      if (p.x < minX) minX = p.x;
      if (p.x > maxX) maxX = p.x;
    }
  }
  for (const p of m.acc) {
    if (Number.isFinite(p.x)) {
      if (p.x < minX) minX = p.x;
      if (p.x > maxX) maxX = p.x;
    }
  }
  if (minX === Infinity) {
    minX = 0;
    maxX = 0;
  }
  return { ...m, startX: minX, endX: maxX };
}
function dates() { return [...new Set(state.measurements.map(m => m.date))].sort(); }
function sensors() { return [...new Set(state.measurements.map(m => m.sensor))].sort(naturalCompare); }
function sensorsForDate(date) { return [...new Set(state.measurements.filter(m => m.date === date).map(m => m.sensor))].sort(naturalCompare); }
function datesForSensor(sensor) { return [...new Set(state.measurements.filter(m => m.sensor === sensor).map(m => m.date))].sort(); }
function selectedMeasurement() { return state.measurements.find(m => m.date === state.selectedDate && m.sensor === state.selectedSensor) || null; }
function selectedCompareMeasurements() {
  return [...state.compareDates].sort().map(d => state.measurements.find(m => m.date === d && m.sensor === state.compareSensor)).filter(Boolean);
}
function dateColor(date) {
  const ds = dates();
  const i = ds.indexOf(date);
  return SERIES[(i >= 0 ? i : 0) % SERIES.length];
}

function boundsForAllData() {
  let minX = Infinity;
  let maxX = -Infinity;
  for (const m of state.measurements) {
    for (const p of m.hr) {
      if (Number.isFinite(p.x)) {
        if (p.x < minX) minX = p.x;
        if (p.x > maxX) maxX = p.x;
      }
    }
    for (const p of m.acc) {
      if (Number.isFinite(p.x)) {
        if (p.x < minX) minX = p.x;
        if (p.x > maxX) maxX = p.x;
      }
    }
  }
  if (minX === Infinity) return null;
  return { min: minX, max: maxX };
}
function ensureTimeRange() {
  const b = boundsForAllData();
  if (!b) return;
  const start = Math.floor(b.min / 300) * 300;
  const end = Math.ceil(b.max / 300) * 300;
  const defaultStart = Math.max(start, Math.min(DEFAULT_START_SEC, Math.max(start, end - 300)));
  const defaultEnd = Math.min(end, Math.max(DEFAULT_END_SEC, defaultStart + 300));
  if (state.timeStart === null || state.timeStart < start || state.timeStart >= end) state.timeStart = defaultStart;
  if (state.timeEnd === null || state.timeEnd > end || state.timeEnd <= state.timeStart) state.timeEnd = Math.max(state.timeStart + 300, defaultEnd);
  if (state.timeEnd > end) state.timeEnd = end;
  if (state.timeEnd <= state.timeStart) state.timeStart = Math.max(start, state.timeEnd - 300);
}
function timeOptions() {
  const b = boundsForAllData();
  if (!b) return [];
  const start = Math.floor(b.min / 300) * 300;
  const end = Math.ceil(b.max / 300) * 300;
  const out = [];
  for (let s = start; s <= end; s += 300) out.push(s);
  return out;
}
function inTimeRange(p) { return p.x >= state.timeStart && p.x <= state.timeEnd; }
function filterRange(samples) { return samples.filter(inTimeRange); }

function smoothSamples(samples, windowSec = ACC_SMOOTH_SEC) {
  const src = [...samples].sort((a, b) => a.x - b.x);
  if (!src.length) return [];
  const half = windowSec / 2;
  const out = [];
  let left = 0, right = 0, sum = 0;
  for (let i = 0; i < src.length; i++) {
    const x = src[i].x;
    while (right < src.length && src[right].x <= x + half) {
      sum += src[right].value;
      right += 1;
    }
    while (left < src.length && src[left].x < x - half) {
      sum -= src[left].value;
      left += 1;
    }
    const n = Math.max(1, right - left);
    out.push({ x, value: sum / n });
  }
  return out;
}
function quantile(sorted, q) {
  if (!sorted.length) return NaN;
  const pos = (sorted.length - 1) * q;
  const base = Math.floor(pos);
  const rest = pos - base;
  const next = sorted[base + 1];
  return next === undefined ? sorted[base] : sorted[base] + rest * (next - sorted[base]);
}
function classStats(date, type) {
  const bins = new Map();
  const group = state.measurements.filter(m => m.date === date);
  for (const m of group) {
    const data = type === "acc" ? smoothSamples(m.acc) : m.hr;
    for (const p of data) {
      if (!inTimeRange(p) || !Number.isFinite(p.value)) continue;
      const key = Math.round(p.x);
      const bin = bins.get(key) || [];
      bin.push(p.value);
      bins.set(key, bin);
    }
  }
  return [...bins.entries()].sort((a, b) => a[0] - b[0]).map(([x, values]) => {
    values.sort((a, b) => a - b);
    return { x, q1: quantile(values, 0.25), median: quantile(values, 0.5), q3: quantile(values, 0.75), n: values.length };
  });
}

function measurementMetrics(m) {
  const hr = filterRange(m.hr).map(p => p.value);
  const acc = filterRange(m.acc).map(p => p.value);
  return { date: m.date, sensor: m.sensor, avgHr: mean(hr), avgAcc: mean(acc), hrN: hr.length, accN: acc.length };
}
function allMetricPoints() {
  return state.measurements.map(measurementMetrics).filter(m => Number.isFinite(m.avgHr) && Number.isFinite(m.avgAcc));
}
function formatNumber(value, digits = 1) { return Number.isFinite(value) ? value.toFixed(digits) : "-"; }

function finiteMetricValues(m, type) {
  const samples = type === "hr" ? m.hr : m.acc;
  return filterRange(samples).map(p => p.value).filter(Number.isFinite);
}
function median(values) {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!sorted.length) return NaN;
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}
function minMax(values) {
  let min = Infinity;
  let max = -Infinity;
  for (const v of values) {
    if (!Number.isFinite(v)) continue;
    if (v < min) min = v;
    if (v > max) max = v;
  }
  return min === Infinity ? { min: NaN, max: NaN } : { min, max };
}
function allMetricValuesForDate(date, type) {
  const values = [];
  for (const m of state.measurements) {
    if (m.date !== date) continue;
    const samples = type === "hr" ? m.hr : m.acc;
    for (const p of filterRange(samples)) {
      if (Number.isFinite(p.value)) values.push(p.value);
    }
  }
  return values;
}

const HR_ZONE_DEFS = [
  { key: "z1", level: "1", name: "50-60%", min: 0.50, max: 0.60, bpmMin: 100, bpmMax: 120, color: "#cfd8dc", bandColor: "rgba(207,216,220,.30)" },
  { key: "z2", level: "2", name: "60-70%", min: 0.60, max: 0.70, bpmMin: 120, bpmMax: 140, color: "#4fc3f7", bandColor: "rgba(79,195,247,.28)" },
  { key: "z3", level: "3", name: "70-80%", min: 0.70, max: 0.80, bpmMin: 140, bpmMax: 160, color: "#9ccc65", bandColor: "rgba(156,204,101,.28)" },
  { key: "z4", level: "4", name: "80-90%", min: 0.80, max: 0.90, bpmMin: 160, bpmMax: 180, color: "#facc15", bandColor: "rgba(250,204,21,.28)" },
  { key: "z5", level: "5", name: "90-100%", min: 0.90, max: Infinity, bpmMin: 180, bpmMax: 200, color: "#ec4899", bandColor: "rgba(236,72,153,.28)" }
];
const ACC_INTENSITY_BANDS = [
  { key: "b1", label: "1.00-1.05g", min: 1.00, max: 1.05, color: "rgba(96,165,250,.90)" },
  { key: "b2", label: "1.05-1.10g", min: 1.05, max: 1.10, color: "rgba(34,211,238,.92)" },
  { key: "b3", label: "1.10-1.20g", min: 1.10, max: 1.20, color: "rgba(45,212,191,.92)" },
  { key: "b4", label: "1.20-1.40g", min: 1.20, max: 1.40, color: "rgba(167,139,250,.92)" },
  { key: "b5", label: "1.40-1.60g", min: 1.40, max: 1.60, color: "rgba(250,204,21,.95)" },
  { key: "b6", label: "1.60-2.00g", min: 1.60, max: 2.00, color: "rgba(251,146,60,.95)" },
  { key: "b7", label: "≥2.00g", min: 2.00, max: Infinity, color: "rgba(248,113,113,.96)" }
];

function formatDuration(totalSeconds) {
  const sec = Math.max(0, Math.round(totalSeconds || 0));
  const h = String(Math.floor(sec / 3600)).padStart(2, "0");
  const m = String(Math.floor((sec % 3600) / 60)).padStart(2, "0");
  const s = String(sec % 60).padStart(2, "0");
  return `${h}:${m}:${s}`;
}
function heartZoneSummary(hrValues, hrMaxRef) {
  const zones = HR_ZONE_DEFS.map(z => ({ ...z, count: 0, pct: 0, seconds: 0 }));
  const valid = hrValues.filter(v => Number.isFinite(v) && v > 0);
  if (!valid.length || !Number.isFinite(hrMaxRef) || hrMaxRef <= 0) return zones;
  for (const value of valid) {
    const ratio = value / hrMaxRef;
    const z = zones.find(zone => ratio >= zone.min && ratio < zone.max);
    if (z) z.count += 1;
  }
  const totalInZones = zones.reduce((sum, z) => sum + z.count, 0);
  for (const z of zones) {
    z.seconds = z.count;
    z.pct = totalInZones ? (z.count / totalInZones) * 100 : 0;
  }
  return zones;
}

function averageHeartZonePercentagesForDate(date, hrMaxRef) {
  const zones = HR_ZONE_DEFS.map(z => ({ ...z, pct: 0, seconds: 0, count: 0 }));
  const group = state.measurements.filter(m => m.date === date);
  let subjectCount = 0;

  for (const m of group) {
    const values = finiteMetricValues(m, "hr");
    if (!values.length) continue;
    const subjectZones = heartZoneSummary(values, hrMaxRef);
    subjectZones.forEach((z, i) => {
      zones[i].pct += z.pct;
    });
    subjectCount += 1;
  }

  if (!subjectCount) return { zones, subjectCount };
  zones.forEach(z => {
    z.pct = z.pct / subjectCount;
  });
  return { zones, subjectCount };
}

function renderHeartZoneBlock(zonesInput, title, subtitle, ariaLabel) {
  const zones = zonesInput.slice().reverse();
  const rows = zones.map(z => `
    <div class="zone-row">
      <div class="zone-level" style="--c:${z.color}">${z.level}</div>
      <div class="zone-track"><div class="zone-fill" style="--c:${z.color};width:${Math.max(0, Math.min(100, z.pct))}%"></div></div>
      <div class="zone-time">${z.pct.toFixed(1)}%</div>
    </div>`).join("");
  const caption = HR_ZONE_DEFS.slice().reverse().map(z => `<span class="zone-caption-item"><i style="--c:${z.color}"></i>${z.level}: ${z.name}</span>`).join("");
  return `
    <div class="zone-block unified-zone-block">
      <div class="zone-head">
        <div class="zone-card-title">${title}</div>
        <div class="zone-card-subtitle">${subtitle}</div>
      </div>
      <div class="zone-rows" aria-label="${ariaLabel}">${rows}</div>
      <div class="zone-caption">${caption}</div>
    </div>`;
}

function renderClassAverageHeartZoneBar(date, hrMaxRef) {
  const { zones, subjectCount } = averageHeartZonePercentagesForDate(date, hrMaxRef);
  if (!subjectCount) return '<div class="zone-empty">表示範囲内に心拍データがあるIDがありません。</div>';
  return renderHeartZoneBlock(
    zones,
    '全ID平均の心拍ゾーン滞在割合',
    `各IDの割合を平均 / n=${subjectCount}`,
    '全ID平均の心拍ゾーン滞在割合'
  );
}

function renderHeartZoneBar(hrValues, hrMaxRef, sensorId = '') {
  const zones = heartZoneSummary(hrValues, hrMaxRef);
  const totalInZones = zones.reduce((sum, z) => sum + z.count, 0);
  if (!totalInZones) return '<div class="zone-empty">表示範囲内に Polar 心拍ゾーンへ入る心拍データがありません。</div>';
  return renderHeartZoneBlock(
    zones,
    '選択IDの心拍ゾーン滞在割合',
    sensorId ? `選択ID ${sensorId}` : '選択ID',
    '選択IDの心拍ゾーン滞在割合'
  );
}

function accBandSummary(accValues) {
  const counts = ACC_INTENSITY_BANDS.map(b => ({ ...b, count: 0, pct: 0 }));
  const valid = accValues.filter(v => Number.isFinite(v) && v > 0).map(v => Math.max(1, v));
  if (!valid.length) return counts;
  for (const value of valid) {
    const band = counts.find(item => value >= item.min && value < item.max) || counts[counts.length - 1];
    band.count += 1;
  }
  for (const band of counts) band.pct = valid.length ? (band.count / valid.length) * 100 : 0;
  return counts;
}
function stackedBandHighPct(bands, thresholdKeySet) {
  return bands.filter(b => thresholdKeySet.has(b.key)).reduce((sum, b) => sum + b.pct, 0);
}
function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) {
    return;
  }
  const rr = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}
function drawStackedBandCompare(canvas, config) {
  const rows = config.rows || [];
  if (!rows.length) {
    noData(canvas, config.title, config.emptyMessage || "表示できるデータがありません。");
    return;
  }
  const { ctx, width, height } = canvasContext(canvas);
  // Hidden tabs can report a 0-1 px canvas width. Skip drawing now; the chart is redrawn when the tab becomes visible.
  if (width < 320 || height < 160) return;
  title(ctx, config.title, "");
  const defs = config.defs || [];

  const legendY = 56;
  let lx = 24;
  ctx.save();
  ctx.font = fnt(800, 11);
  ctx.textAlign = "left";
  for (const d of defs) {
    const label = d.label || (d.level ? `Z${d.level}` : d.key);
    const tw = ctx.measureText(label).width;
    const itemW = tw + 24;
    if (lx + itemW > width - 24) break;
    ctx.fillStyle = d.color;
    ctx.fillRect(lx, legendY - 5, 12, 12);
    ctx.fillStyle = INK;
    ctx.fillText(label, lx + 18, legendY + 1);
    lx += itemW + 10;
  }
  ctx.restore();

  const leftW = 112;
  const rightW = 112;
  const plot = { l: 24 + leftW, r: width - 24 - rightW, t: 88, b: height - 42 };
  const rowGap = 18;
  const rowH = Math.min(38, Math.max(28, (plot.b - plot.t - rowGap * (rows.length - 1)) / Math.max(1, rows.length)));
  const totalH = rows.length * rowH + (rows.length - 1) * rowGap;
  const y0 = plot.t + Math.max(0, (plot.b - plot.t - totalH) / 2);
  const sx = pct => plot.l + (pct / 100) * (plot.r - plot.l);

  ctx.save();
  ctx.strokeStyle = AXIS;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(plot.l, plot.b);
  ctx.lineTo(plot.r, plot.b);
  ctx.stroke();
  ctx.font = fnt(800, 11);
  ctx.fillStyle = INK;
  ctx.textAlign = "center";
  for (let i = 0; i <= 4; i++) {
    const pct = i * 25;
    const x = sx(pct);
    ctx.strokeStyle = i === 0 ? AXIS : GRID;
    ctx.beginPath();
    ctx.moveTo(x, plot.t - 8);
    ctx.lineTo(x, plot.b);
    ctx.stroke();
    ctx.fillText(`${pct}%`, x, plot.b + 18);
  }
  ctx.restore();

  rows.forEach((row, idx) => {
    const y = y0 + idx * (rowH + rowGap);
    const cy = y + rowH / 2;
    ctx.save();
    ctx.textAlign = "right";
    ctx.fillStyle = WHITE;
    ctx.font = fnt(900, 12);
    ctx.fillText(row.label, plot.l - 12, cy);
    ctx.restore();

    ctx.save();
    ctx.fillStyle = "rgba(255,255,255,.04)";
    roundRect(ctx, plot.l, y, plot.r - plot.l, rowH, 8);
    ctx.fill();
    ctx.restore();

    let startPct = 0;
    for (const seg of row.segments) {
      const w = ((plot.r - plot.l) * seg.pct) / 100;
      if (w <= 0.4) { startPct += seg.pct; continue; }
      ctx.save();
      ctx.fillStyle = seg.color;
      ctx.fillRect(sx(startPct), y, w, rowH);
      if (seg.pct >= 9) {
        ctx.fillStyle = "#0f172a";
        ctx.font = fnt(900, 11);
        ctx.textAlign = "center";
        ctx.fillText(`${seg.pct.toFixed(0)}%`, sx(startPct) + w / 2, cy);
      }
      ctx.restore();
      startPct += seg.pct;
    }
    ctx.save();
    ctx.strokeStyle = "rgba(255,255,255,.14)";
    roundRect(ctx, plot.l, y, plot.r - plot.l, rowH, 8);
    ctx.stroke();
    ctx.restore();

    if (row.summary) {
      ctx.save();
      ctx.textAlign = "left";
      ctx.fillStyle = WHITE;
      ctx.font = fnt(900, 11);
      ctx.fillText(row.summary, plot.r + 12, cy - 7);
      if (row.detail) {
        ctx.fillStyle = MUTED;
        ctx.font = fnt(700, 10);
        ctx.fillText(row.detail, plot.r + 12, cy + 8);
      }
      ctx.restore();
    }
  });
}


async function listExerciseFolderCsvs(folder) {
  const repo = "ShojiKonda/HR-and-ACC-dashboard_SHL";
  const branch = "main";
  const apiUrl = `https://api.github.com/repos/${repo}/contents/${folder}?ref=${branch}`;
  const res = await fetch(apiUrl, { cache: "no-store", headers: { Accept: "application/vnd.github+json" } });
  if (!res.ok) throw new Error(`${folder}: ${res.status}`);
  const items = await res.json();
  if (!Array.isArray(items)) return [];
  return items
    .filter(item => item.type === "file" && /\.csv$/i.test(item.name) && !/preprocess_report\.csv$/i.test(item.name))
    .map(item => item.path);
}

async function buildExerciseIndexFromGithubFolders() {
  const repo = "ShojiKonda/HR-and-ACC-dashboard_SHL";
  const branch = "main";
  const rootUrl = `https://api.github.com/repos/${repo}/contents/data?ref=${branch}`;
  const res = await fetch(rootUrl, { cache: "no-store", headers: { Accept: "application/vnd.github+json" } });
  if (!res.ok) throw new Error(`data folder: ${res.status}`);
  const items = await res.json();
  if (!Array.isArray(items)) throw new Error("data フォルダ一覧を取得できません");
  const folders = items
    .filter(item => item.type === "dir" && /^20\d{2}_\d{2}_\d{2}$/.test(item.name))
    .map(item => item.path)
    .sort();

  // 運動時タブでは 2026-06-01 を主対象にする。なければ全日付フォルダを読む。
  const preferred = folders.includes("data/2026_06_01") ? ["data/2026_06_01"] : folders;
  const files = [];
  for (const folder of preferred) {
    const csvs = await listExerciseFolderCsvs(folder);
    files.push(...csvs);
  }
  return files;
}

async function autoLoadIndexedData() {
  setStatus("読み込み中", "運動時データを確認しています。");
  try {
    let files = [];
    let sourceLabel = "data/index.json";
    try {
      const res = await fetch("data/index.json", { cache: "no-store" });
      if (!res.ok) throw new Error(`data/index.json: ${res.status}`);
      const index = await res.json();
      files = Array.isArray(index) ? index : (Array.isArray(index.files) ? index.files : []);
      // 6月1日を運動時データとして優先する。index.json に他日付も含まれる場合は 2026_06_01 を抽出する。
      const juneFiles = files.filter(path => /2026[_-]06[_-]01|2026-06-01/.test(path));
      if (juneFiles.length) files = juneFiles;
      if (!files.length) throw new Error("data/index.json にCSVファイルが登録されていません");
    } catch (indexError) {
      sourceLabel = "GitHub data/2026_06_01 フォルダ";
      files = await buildExerciseIndexFromGithubFolders();
      if (!files.length) throw new Error(`${indexError.message}。GitHubフォルダからもCSVを取得できません。`);
    }

    const map = new Map();
    let loaded = 0;
    let mergedLoaded = 0;
    let rawLoaded = 0;
    const errors = [];

    function putMeasurement(item, sourcePath) {
      const key = `${item.date}|${item.sensor}`;
      const existing = map.get(key) || { date: item.date, sensor: item.sensor, acc: [], hr: [], sourceFiles: [] };
      if (item.acc && item.acc.length) existing.acc = item.acc;
      if (item.hr && item.hr.length) existing.hr = item.hr;
      existing.sourceFiles.push(sourcePath);
      map.set(key, existing);
    }

    for (const path of files) {
      if (!/\.csv$/i.test(path)) continue;
      if (/preprocess_report\.csv$/i.test(path)) continue;
      try {
        const csvRes = await fetch(encodeURI(path), { cache: "no-store" });
        if (!csvRes.ok) throw new Error(`${csvRes.status} ${csvRes.statusText}`);
        const text = await csvRes.text();

        const mergedItems = parseMergedCSV(text);
        if (mergedItems.length) {
          for (const item of mergedItems) putMeasurement(item, path);
          loaded += 1;
          mergedLoaded += 1;
          continue;
        }

        const meta = parseMeta(path);
        if (!meta.type) continue;
        const parsed = meta.type === "acc" ? parseAccCSV(text) : parseHrCSV(text);
        const date = meta.date || parsed.firstDate || "unknown-date";
        const key = `${date}|${meta.sensor}`;
        const item = map.get(key) || { date, sensor: meta.sensor, acc: [], hr: [], sourceFiles: [] };
        if (meta.type === "acc") item.acc = parsed.samples;
        else item.hr = parsed.samples;
        item.sourceFiles.push(path);
        map.set(key, item);
        loaded += 1;
        rawLoaded += 1;
      } catch (e) {
        errors.push(`${path}: ${e.message}`);
      }
    }
    const measurements = [...map.values()].filter(m => m.acc.length || m.hr.length).map(completeMeasurement).sort((a, b) => a.date.localeCompare(b.date) || naturalCompare(a.sensor, b.sensor));
    if (!measurements.length) throw new Error("読み込み可能な測定データがありません");

    state.measurements = measurements;
    const ds = dates();
    state.selectedDate = ds.includes("2026-06-01") ? "2026-06-01" : ds[0];
    state.selectedSensor = sensorsForDate(state.selectedDate)[0] || sensors()[0];
    state.compareSensor = state.selectedSensor;
    state.compareDates = new Set(datesForSensor(state.compareSensor));
    state.timeStart = null;
    state.timeEnd = null;
    ensureTimeRange();
    const modeText = mergedLoaded ? `統合CSV ${mergedLoaded}ファイル` : `元CSV ${rawLoaded}ファイル`;
    setStatus(`GitHubデータ ${measurements.length}件`, `${sourceLabel}から${modeText}を読み込みました。表示範囲を変えると指標を再計算します。${errors.length ? ` ${errors.length}件の警告があります。` : ""}`);
    updateAll();
  } catch (e) {
    state.measurements = [];
    setStatus("データ未読込", `${e.message}。data/index.json または data/2026_06_01/ のCSV配置を確認してください。`);
    updateAll();
  }
}

function renderSelectors() {
  $("datasetName").textContent = state.datasetName;
  $("datasetNote").textContent = state.datasetNote;
  ensureTimeRange();
  const ds = dates();
  if (!state.selectedDate || !ds.includes(state.selectedDate)) state.selectedDate = ds[0] || null;
  $("dateSelect").innerHTML = ds.map(d => `<option value="${d}" ${d === state.selectedDate ? "selected" : ""}>${d}</option>`).join("");
  const ss = sensorsForDate(state.selectedDate);
  if (!state.selectedSensor || !ss.includes(state.selectedSensor)) state.selectedSensor = ss[0] || null;
  $("sensorSelect").innerHTML = ss.map(s => `<option value="${s}" ${s === state.selectedSensor ? "selected" : ""}>${s}</option>`).join("");

  const allSensors = sensors();
  if (!state.compareSensor || !allSensors.includes(state.compareSensor)) state.compareSensor = state.selectedSensor || allSensors[0] || null;
  $("compareSensorSelect").innerHTML = allSensors.map(s => `<option value="${s}" ${s === state.compareSensor ? "selected" : ""}>${s}</option>`).join("");
  const cd = datesForSensor(state.compareSensor);
  if (![...state.compareDates].some(d => cd.includes(d))) state.compareDates = new Set(cd);
  $("compareDateChecks").innerHTML = cd.map(d => `<label class="check"><input type="checkbox" value="${d}" ${state.compareDates.has(d) ? "checked" : ""}>${d}</label>`).join("") || '<div class="empty">このセンサIDには比較可能な計測日がありません。</div>';

  const opts = timeOptions();
  const startHtml = opts.map(s => `<option value="${s}" ${s === state.timeStart ? "selected" : ""}>${timeLabel(s)}</option>`).join("");
  const endHtml = opts.map(s => `<option value="${s}" ${s === state.timeEnd ? "selected" : ""}>${timeLabel(s)}</option>`).join("");
  document.querySelectorAll(".time-start").forEach(sel => { sel.innerHTML = startHtml; });
  document.querySelectorAll(".time-end").forEach(sel => { sel.innerHTML = endHtml; });
}

function renderKpis() {
  const el = $("kpiGrid");
  const m = selectedMeasurement();
  if (!m) {
    el.innerHTML = '<div class="empty">選択条件に一致するデータがありません。</div>';
    return;
  }
  const hrValues = finiteMetricValues(m, "hr");
  const avgHr = mean(hrValues);
  const maxHr = safeMax(hrValues, NaN);
  el.innerHTML = `
    <article class="kpi heart-kpi heart-zone-panel">
      <p class="klabel">心拍数</p>
      <div class="metric-pair metric-pair-compact">
        <div class="metric-box">
          <p class="metric-label">平均心拍数</p>
          <p class="metric-value">${formatNumber(avgHr, 1)}<span class="unit">bpm</span></p>
        </div>
        <div class="metric-box">
          <p class="metric-label">最大心拍数</p>
          <p class="metric-value">${formatNumber(maxHr, 0)}<span class="unit">bpm</span></p>
        </div>
      </div>
      <div class="zone-compare-grid">
        <div class="zone-card selected-zone-card">
          ${renderHeartZoneBar(hrValues, 200, m.sensor)}
        </div>
        <div class="zone-card average-zone-card">
          ${renderClassAverageHeartZoneBar(state.selectedDate, 200)}
        </div>
      </div>
    </article>`;
}


function title(ctx, text, subtitle, x = 24, y = 28) {
  ctx.fillStyle = WHITE;
  ctx.font = fnt(900, 17);
  ctx.textAlign = "left";
  ctx.fillText(text, x, y);
  if (subtitle) {
    ctx.fillStyle = MUTED;
    ctx.font = fnt(700, 12);
    ctx.fillText(subtitle, x, y + 24);
  }
}
function noData(canvas, text, message) {
  const { ctx } = canvasContext(canvas);
  title(ctx, text, message);
}
function niceMax(value, step = 5, fallback = 1) {
  if (!Number.isFinite(value) || value <= 0) return fallback;
  return Math.ceil(value / step) * step;
}
function valuesFromSeries(series, key) {
  const vals = [];
  for (const s of series) {
    for (const line of (s[key] || [])) vals.push(...line.samples.map(p => p.value));
    for (const band of (s[`${key}Bands`] || [])) vals.push(...band.samples.flatMap(p => [p.q1, p.median, p.q3]));
  }
  return vals.filter(Number.isFinite);
}
function drawAxis(ctx, plot, side, min, max, label) {
  ctx.save();
  ctx.strokeStyle = AXIS;
  ctx.lineWidth = 1;
  ctx.beginPath();
  const xAxis = side === "left" ? plot.l : plot.r;
  ctx.moveTo(xAxis, plot.t);
  ctx.lineTo(xAxis, plot.b);
  ctx.stroke();
  ctx.font = fnt(700, 11);
  ctx.fillStyle = INK;
  ctx.textAlign = side === "left" ? "right" : "left";
  for (let i = 0; i <= 4; i++) {
    const ratio = i / 4;
    const y = plot.b - ratio * (plot.b - plot.t);
    const v = min + ratio * (max - min);
    ctx.strokeStyle = i === 0 ? AXIS : GRID;
    ctx.beginPath();
    ctx.moveTo(plot.l, y);
    ctx.lineTo(plot.r, y);
    ctx.stroke();
    ctx.fillText(v.toFixed(max - min <= 5 ? 1 : 0), side === "left" ? plot.l - 9 : plot.r + 9, y);
  }
  ctx.save();
  const labelX = side === "left" ? 20 : plot.r + 52;
  ctx.translate(labelX, (plot.t + plot.b) / 2);
  ctx.rotate(-Math.PI / 2);
  ctx.fillStyle = MUTED;
  ctx.font = fnt(800, 12);
  ctx.textAlign = "center";
  ctx.fillText(label, 0, 0);
  ctx.restore();
  ctx.restore();
}
function drawTimeAxis(ctx, plot) {
  ctx.save();
  ctx.strokeStyle = AXIS;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(plot.l, plot.b);
  ctx.lineTo(plot.r, plot.b);
  ctx.stroke();
  ctx.font = fnt(800, 11);
  ctx.fillStyle = INK;
  ctx.textAlign = "center";
  for (let i = 0; i <= 6; i++) {
    const r = i / 6;
    const x = plot.l + r * (plot.r - plot.l);
    const sec = state.timeStart + r * (state.timeEnd - state.timeStart);
    ctx.fillText(timeLabel(sec), x, plot.b + 22);
  }
  ctx.restore();
}
function linePath(ctx, samples, sx, sy, color, width = 2.4, alpha = 1, dashed = false) {
  const pts = samples.filter(p => Number.isFinite(p.value) && p.x >= state.timeStart && p.x <= state.timeEnd);
  if (!pts.length) return;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.setLineDash(dashed ? [5, 4] : []);
  ctx.beginPath();
  pts.forEach((p, i) => {
    const x = sx(p.x), y = sy(p.value);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.stroke();
  ctx.restore();
}
function bandPath(ctx, samples, sx, sy, color, alpha = 0.16) {
  const pts = samples.filter(p => Number.isFinite(p.q1) && Number.isFinite(p.q3) && p.x >= state.timeStart && p.x <= state.timeEnd);
  if (pts.length < 2) return;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = color;
  ctx.beginPath();
  pts.forEach((p, i) => {
    const x = sx(p.x), y = sy(p.q3);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  for (let i = pts.length - 1; i >= 0; i--) ctx.lineTo(sx(pts[i].x), sy(pts[i].q1));
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function areaPath(ctx, samples, sx, sy, baselineY, color, alpha = 0.18) {
  const pts = samples.filter(p => Number.isFinite(p.value) && p.x >= state.timeStart && p.x <= state.timeEnd);
  if (pts.length < 2) return;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = color;
  ctx.beginPath();
  pts.forEach((p, i) => {
    const x = sx(p.x);
    const y = sy(p.value);
    if (i === 0) ctx.moveTo(x, baselineY);
    ctx.lineTo(x, y);
  });
  ctx.lineTo(sx(pts[pts.length - 1].x), baselineY);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}
function drawHeartZoneBands(ctx, plot, hrMax) {
  ctx.save();
  for (const zone of HR_ZONE_DEFS) {
    const yTop = plot.b - (Math.min(hrMax, zone.bpmMax) / hrMax) * (plot.b - plot.t);
    const yBottom = plot.b - (Math.max(0, zone.bpmMin) / hrMax) * (plot.b - plot.t);
    if (yBottom <= plot.t || yTop >= plot.b) continue;
    const bandTop = Math.max(plot.t, yTop);
    const bandBottom = Math.min(plot.b, yBottom);
    if (bandBottom <= bandTop) continue;
    ctx.fillStyle = zone.bandColor;
    ctx.fillRect(plot.l, bandTop, plot.r - plot.l, bandBottom - bandTop);
    ctx.fillStyle = "rgba(255,255,255,.55)";
    ctx.font = fnt(800, 10);
    ctx.textAlign = "right";
    ctx.fillText(zone.level, plot.r - 6, (bandTop + bandBottom) / 2 + 3);
  }
  ctx.restore();
}

function drawAccAxis(ctx, plot, min, max, label) {
  ctx.save();
  ctx.strokeStyle = AXIS;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(plot.r, plot.t);
  ctx.lineTo(plot.r, plot.b);
  ctx.stroke();
  ctx.font = fnt(700, 11);
  ctx.fillStyle = INK;
  ctx.textAlign = "left";
  for (let i = 0; i <= 3; i++) {
    const ratio = i / 3;
    const y = plot.b - ratio * (plot.b - plot.t);
    const v = min + ratio * (max - min);
    ctx.strokeStyle = i === 0 ? AXIS : "rgba(255,255,255,.08)";
    ctx.beginPath();
    ctx.moveTo(plot.r, y);
    ctx.lineTo(plot.r + 6, y);
    ctx.stroke();
    ctx.fillText(v.toFixed(max - min <= 5 ? 1 : 0), plot.r + 9, y);
  }
  ctx.save();
  ctx.translate(plot.r + 52, (plot.t + plot.b) / 2);
  ctx.rotate(-Math.PI / 2);
  ctx.fillStyle = MUTED;
  ctx.font = fnt(800, 12);
  ctx.textAlign = "center";
  ctx.fillText(label, 0, 0);
  ctx.restore();
  ctx.restore();
}

function combinedChart(canvas, config) {
  const series = config.series || [];
  const hasHr = series.some(s => (s.hr || []).some(x => x.samples.length) || (s.hrBands || []).some(x => x.samples.length));
  const hasAcc = series.some(s => (s.acc || []).some(x => x.samples.length) || (s.accBands || []).some(x => x.samples.length));
  if ((!hasHr && !hasAcc) || state.timeStart === null || state.timeEnd === null || state.timeEnd <= state.timeStart) {
    noData(canvas, config.title, "表示できるデータがありません。");
    return;
  }
  const { ctx, width, height } = canvasContext(canvas);
  title(ctx, config.title, config.subtitle);
  const outer = { l: 72, r: width - 82, t: 78, b: height - 56 };
  const gap = hasHr && hasAcc ? 32 : 0;
  const innerH = outer.b - outer.t;
  let hrPlot = null;
  let accPlot = null;
  if (hasHr && hasAcc) {
    const eachH = (innerH - gap) / 2;
    hrPlot = { l: outer.l, r: outer.r, t: outer.t, b: outer.t + eachH };
    accPlot = { l: outer.l, r: outer.r, t: hrPlot.b + gap, b: outer.b };
  } else if (hasHr) {
    hrPlot = { ...outer };
  } else if (hasAcc) {
    accPlot = { ...outer };
  }

  const hrVals = valuesFromSeries(series, "hr");
  const accVals = valuesFromSeries(series, "acc");
  const hrMax = 200;
  const accMin = 1;
  const accMaxRaw = hasAcc ? Math.max(accMin + 0.2, safeMax(accVals, accMin) * 1.08) : accMin + 1;
  const accMax = niceMax(accMaxRaw, 0.25, accMin + 1);
  const sx = x => outer.l + ((x - state.timeStart) / (state.timeEnd - state.timeStart)) * (outer.r - outer.l);
  const syHr = v => hrPlot.b - (v / hrMax) * (hrPlot.b - hrPlot.t);
  const syAcc = v => {
    const clamped = Math.max(accMin, Math.min(accMax, v));
    return accPlot.b - ((clamped - accMin) / (accMax - accMin || 1)) * (accPlot.b - accPlot.t);
  };

  if (hasHr) {
    drawAxis(ctx, hrPlot, "left", 0, hrMax, "Heart Rate bpm");
    drawHeartZoneBands(ctx, hrPlot, hrMax);
  }
  if (hasAcc) {
    drawAxis(ctx, accPlot, "left", accMin, accMax, "Acceleration norm g");
  }
  drawTimeAxis(ctx, hasAcc ? accPlot : hrPlot);

  for (const s of series) {
    if (hasHr) {
      for (const b of (s.hrBands || [])) bandPath(ctx, b.samples, sx, syHr, b.color || s.color || C.blue, b.alpha ?? 0.16);
    }
    if (hasAcc) {
      for (const b of (s.accBands || [])) bandPath(ctx, b.samples, sx, syAcc, b.color || s.color || C.cyan, b.alpha ?? 0.10);
      for (const line of (s.acc || [])) areaPath(ctx, line.samples, sx, syAcc, syAcc(accMin), line.color || s.color || C.cyan, line.fillAlpha ?? 0.16);
    }
  }
  for (const s of series) {
    if (hasHr) {
      for (const line of (s.hr || [])) linePath(ctx, line.samples, sx, syHr, line.color || s.color || C.yellow, line.width || 2.4, line.alpha ?? 1, line.dashed || false);
    }
    if (hasAcc) {
      for (const line of (s.acc || [])) linePath(ctx, line.samples, sx, syAcc, line.color || s.color || C.cyan, line.width || 2.2, line.alpha ?? 1, line.dashed || false);
    }
  }
  ctx.save();
  ctx.font = fnt(900, 12);
  ctx.fillStyle = WHITE;
  ctx.textAlign = "left";
  if (hasHr && hrPlot) ctx.fillText("心拍数", hrPlot.l + 8, hrPlot.t + 14);
  if (hasAcc && accPlot) ctx.fillText("加速度ノルム", accPlot.l + 8, accPlot.t + 14);
  ctx.restore();
}

function gaussianKernel(u) { return Math.exp(-0.5 * u * u) / Math.sqrt(2 * Math.PI); }
function standardDeviation(values) {
  const xs = values.filter(Number.isFinite);
  if (!xs.length) return NaN;
  const m = mean(xs);
  const v = mean(xs.map(x => (x - m) ** 2));
  return Math.sqrt(v);
}
function bandwidthSilverman(values) {
  const xs = values.filter(Number.isFinite).sort((a, b) => a - b);
  const n = xs.length;
  if (n < 2) return 0.12;
  const sd = standardDeviation(xs);
  const iqr = quantile(xs, 0.75) - quantile(xs, 0.25);
  const scale = Math.min(sd || Infinity, (iqr / 1.34) || Infinity);
  const fallback = Math.max(0.08, ((xs[xs.length - 1] - xs[0]) || 0.5) / 20);
  const h = 0.9 * (Number.isFinite(scale) && scale > 0 ? scale : fallback) * Math.pow(n, -1 / 5);
  return Number.isFinite(h) && h > 0 ? h : fallback;
}
function kdeCurve(values, gridMin, gridMax, points = 160) {
  const xs = values.filter(Number.isFinite);
  if (xs.length < 2) return [];
  const h = bandwidthSilverman(xs);
  const step = (gridMax - gridMin) / Math.max(2, points - 1);
  const curve = [];
  for (let i = 0; i < points; i++) {
    const x = gridMin + step * i;
    let sum = 0;
    for (const v of xs) sum += gaussianKernel((x - v) / h);
    curve.push({ x, value: sum / (xs.length * h) });
  }
  return curve;
}
function densityChart(canvas, config) {
  const items = (config.series || []).map(s => ({ ...s, values: (s.values || []).filter(Number.isFinite) })).filter(s => s.values.length >= 2);
  if (!items.length) { noData(canvas, config.title, "表示できるデータがありません。"); return; }
  const { ctx, width, height } = canvasContext(canvas);
  title(ctx, config.title, config.subtitle);
  const plot = { l: 72, r: width - 42, t: 78, b: height - 56 };
  const all = items.flatMap(s => s.values);
  const xMin = Math.max(1, (config.xMin ?? (Math.min(...all) - 0.08)));
  const xMax = config.xMax ?? niceMax(Math.max(...all) * 1.05, 0.25, 2);
  const curves = items.map(s => ({ ...s, curve: kdeCurve(s.values, xMin, xMax) })).filter(s => s.curve.length > 1);
  if (!curves.length) { noData(canvas, config.title, "表示できるデータがありません。"); return; }
  const yMax = Math.max(0.1, ...curves.flatMap(s => s.curve.map(p => p.value))) * 1.12;
  const sx = v => plot.l + ((v - xMin) / (xMax - xMin || 1)) * (plot.r - plot.l);
  const sy = v => plot.b - ((v - 0) / (yMax || 1)) * (plot.b - plot.t);
  ctx.strokeStyle = AXIS;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(plot.l, plot.t);
  ctx.lineTo(plot.l, plot.b);
  ctx.lineTo(plot.r, plot.b);
  ctx.stroke();
  ctx.font = fnt(700, 11);
  ctx.fillStyle = INK;
  ctx.textAlign = "right";
  for (let i = 0; i <= 4; i++) {
    const r = i / 4;
    const y = plot.b - r * (plot.b - plot.t);
    const v = r * yMax;
    ctx.strokeStyle = i === 0 ? AXIS : GRID;
    ctx.beginPath();
    ctx.moveTo(plot.l, y);
    ctx.lineTo(plot.r, y);
    ctx.stroke();
    ctx.fillText(v.toFixed(2), plot.l - 9, y);
  }
  ctx.textAlign = "center";
  for (let i = 0; i <= 6; i++) {
    const r = i / 6;
    const x = plot.l + r * (plot.r - plot.l);
    const v = xMin + r * (xMax - xMin);
    ctx.fillText(v.toFixed(2), x, plot.b + 22);
  }
  ctx.fillStyle = MUTED;
  ctx.font = fnt(800, 12);
  ctx.fillText("加速度ノルム (g)", (plot.l + plot.r) / 2, height - 14);
  ctx.save();
  ctx.translate(20, (plot.t + plot.b) / 2);
  ctx.rotate(-Math.PI / 2);
  ctx.fillText("確率密度", 0, 0);
  ctx.restore();
  for (const s of curves) {
    ctx.save();
    ctx.globalAlpha = 0.12;
    ctx.fillStyle = s.color;
    ctx.beginPath();
    s.curve.forEach((p, i) => {
      const x = sx(p.x), y = sy(p.value);
      if (i === 0) ctx.moveTo(x, plot.b);
      ctx.lineTo(x, y);
    });
    ctx.lineTo(sx(s.curve[s.curve.length - 1].x), plot.b);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    ctx.save();
    ctx.strokeStyle = s.color;
    ctx.lineWidth = 2.6;
    ctx.beginPath();
    s.curve.forEach((p, i) => {
      const x = sx(p.x), y = sy(p.value);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();
    ctx.restore();
  }
}

function labelBox(ctx, text, x, y, color) {
  ctx.save();
  ctx.font = fnt(900, 11);
  const pad = 7;
  const w = ctx.measureText(text).width + pad * 2;
  const h = 20;
  ctx.fillStyle = "rgba(17,24,39,.92)";
  ctx.strokeStyle = color;
  ctx.lineWidth = 1;
  ctx.fillRect(x, y - h / 2, w, h);
  ctx.strokeRect(x, y - h / 2, w, h);
  ctx.fillStyle = WHITE;
  ctx.textAlign = "left";
  ctx.fillText(text, x + pad, y);
  ctx.restore();
}
function arrow(ctx, x1, y1, x2, y2, color) {
  const a = Math.atan2(y2 - y1, x2 - x1);
  const head = 13;
  ctx.save();
  ctx.strokeStyle = "rgba(255,255,255,.95)";
  ctx.lineWidth = 7;
  ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
  ctx.strokeStyle = color;
  ctx.lineWidth = 4.2;
  ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
  ctx.fillStyle = "rgba(255,255,255,.95)";
  ctx.beginPath(); ctx.moveTo(x2, y2); ctx.lineTo(x2 - (head + 4) * Math.cos(a - Math.PI / 6), y2 - (head + 4) * Math.sin(a - Math.PI / 6)); ctx.lineTo(x2 - (head + 4) * Math.cos(a + Math.PI / 6), y2 - (head + 4) * Math.sin(a + Math.PI / 6)); ctx.closePath(); ctx.fill();
  ctx.fillStyle = color;
  ctx.beginPath(); ctx.moveTo(x2, y2); ctx.lineTo(x2 - head * Math.cos(a - Math.PI / 6), y2 - head * Math.sin(a - Math.PI / 6)); ctx.lineTo(x2 - head * Math.cos(a + Math.PI / 6), y2 - head * Math.sin(a + Math.PI / 6)); ctx.closePath(); ctx.fill();
  ctx.restore();
}
function scatter(canvas, config) {
  const pts = allMetricPoints();
  if (!pts.length) { noData(canvas, config.title, "散布図用のデータがありません。"); return; }
  const { ctx, width, height } = canvasContext(canvas);
  title(ctx, config.title, config.subtitle);
  const plot = { l: 72, r: width - 48, t: 72, b: height - 56 };
  const xs = pts.map(p => p.avgAcc), ys = pts.map(p => p.avgHr);
  const xMin = Math.max(0, Math.min(...xs) - 0.05);
  const xMax = Math.max(...xs) + 0.08;
  const yMin = Math.max(0, Math.floor((Math.min(...ys) - 8) / 5) * 5);
  const yMax = Math.ceil((Math.max(...ys) + 8) / 5) * 5;
  const sx = v => plot.l + ((v - xMin) / (xMax - xMin || 1)) * (plot.r - plot.l);
  const sy = v => plot.b - ((v - yMin) / (yMax - yMin || 1)) * (plot.b - plot.t);
  ctx.strokeStyle = AXIS; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(plot.l, plot.t); ctx.lineTo(plot.l, plot.b); ctx.lineTo(plot.r, plot.b); ctx.stroke();
  ctx.font = fnt(700, 11); ctx.fillStyle = INK; ctx.textAlign = "right";
  for (let i = 0; i <= 5; i++) {
    const r = i / 5, y = plot.b - r * (plot.b - plot.t), v = yMin + r * (yMax - yMin);
    ctx.strokeStyle = i ? GRID : AXIS; ctx.beginPath(); ctx.moveTo(plot.l, y); ctx.lineTo(plot.r, y); ctx.stroke(); ctx.fillText(v.toFixed(0), plot.l - 9, y);
  }
  ctx.textAlign = "center";
  for (let i = 0; i <= 5; i++) {
    const r = i / 5, x = plot.l + r * (plot.r - plot.l), v = xMin + r * (xMax - xMin);
    ctx.fillText(v.toFixed(2), x, plot.b + 22);
  }
  ctx.fillStyle = MUTED; ctx.font = fnt(800, 12); ctx.fillText("平均加速度ノルム", (plot.l + plot.r) / 2, height - 14);
  ctx.save(); ctx.translate(18, (plot.t + plot.b) / 2); ctx.rotate(-Math.PI / 2); ctx.fillText("平均心拍数 bpm", 0, 0); ctx.restore();
  ctx.save();
  ctx.globalAlpha = 0.58;
  for (const p of pts) {
    const x = sx(p.avgAcc);
    const y = sy(p.avgHr);
    ctx.fillStyle = dateColor(p.date);
    ctx.beginPath();
    ctx.arc(x, y, 5.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,.34)';
    ctx.lineWidth = 1;
    ctx.stroke();
  }
  ctx.restore();
  const legendDates = dates();
  let lx = Math.max(plot.l + 8, plot.r - 178), ly = plot.t + 12;
  ctx.font = fnt(800, 11); ctx.textAlign = "left";
  for (let i = 0; i < Math.min(legendDates.length, 8); i++) {
    const d = legendDates[i]; ctx.fillStyle = dateColor(d); ctx.beginPath(); ctx.arc(lx, ly + i * 17, 4, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = INK; ctx.fillText(d, lx + 10, ly + i * 17);
  }
  const vectors = config.vectors || [];
  vectors.forEach((v, i) => {
    const color = v.color || dateColor(v.date);
    const x = sx(v.avgAcc);
    const y = sy(v.avgHr);
    ctx.fillStyle = "rgba(255,255,255,.95)"; ctx.beginPath(); ctx.arc(x, y, 11, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = color; ctx.beginPath(); ctx.arc(x, y, 7.5, 0, Math.PI * 2); ctx.fill();
    const dx = (i % 2 === 0) ? 12 : -82;
    const dy = -18 + (i % 3) * 16;
    labelBox(ctx, v.date, x + dx, y + dy, color);
  });
  if (config.selected) {
    const s = config.selected;
    ctx.fillStyle = "rgba(255,255,255,.95)"; ctx.beginPath(); ctx.arc(sx(s.avgAcc), sy(s.avgHr), 11, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = C.yellow; ctx.beginPath(); ctx.arc(sx(s.avgAcc), sy(s.avgHr), 7.5, 0, Math.PI * 2); ctx.fill();
    labelBox(ctx, `${s.sensor} ${s.date}`, sx(s.avgAcc) + 12, sy(s.avgHr), C.yellow);
  }
}

function renderPersonalCharts() {
  const m = selectedMeasurement();
  if (!m) {
    noData($("personalCombinedChart"), "心拍・加速度ノルム時系列", "選択条件に一致するデータがありません。");
    noData($("classCombinedChart"), "心拍数のクラス中央値とばらつき", "選択条件に一致するデータがありません。");
    noData($("personalScatterChart"), "平均加速度と平均心拍数", "選択条件に一致するデータがありません。");
    return;
  }
  const accSmooth = smoothSamples(m.acc);
  combinedChart($("personalCombinedChart"), {
    title: "心拍・加速度ノルム時系列",
    subtitle: "",
    series: [{
      hr: [{ samples: filterRange(m.hr), color: C.yellow, width: 2.8 }],
      acc: [{ samples: filterRange(accSmooth), color: C.cyan, width: 2.4, fillAlpha: 0.20 }]
    }]
  });
  const hrStats = classStats(m.date, "hr");
  combinedChart($("classCombinedChart"), {
    title: "心拍数のクラス中央値とばらつき",
    subtitle: "",
    series: [{
      hrBands: [{ samples: hrStats, color: C.blue, alpha: 0.18 }],
      hr: [
        { samples: hrStats.map(p => ({ x: p.x, value: p.median })), color: C.blue, width: 2.4 },
        { samples: filterRange(m.hr), color: C.yellow, width: 2.0, alpha: 0.95 }
      ]
    }]
  });
  const sm = measurementMetrics(m);
  scatter($("personalScatterChart"), {
    title: "平均加速度と平均心拍数",
    subtitle: "",
    selected: Number.isFinite(sm.avgAcc) && Number.isFinite(sm.avgHr) ? sm : null
  });
}


function renderCompareCharts() {
  const ms = selectedCompareMeasurements();
  const legendHtml = ms.map(m => `<span><i class="dot" style="--c:${dateColor(m.date)}"></i>${m.date}</span>`).join("");
  combinedChart($("compareCombinedChart"), {
    title: "心拍・加速度ノルム時系列の日間比較",
    subtitle: "",
    series: ms.map(m => {
      const color = dateColor(m.date);
      return {
        color,
        hr: [{ samples: filterRange(m.hr), color, width: 2.2 }],
        acc: [{ samples: filterRange(smoothSamples(m.acc)), color, width: 2.0, fillAlpha: 0.10 }]
      };
    })
  });
  $("compareLegend").innerHTML = legendHtml || '<span class="empty">比較する計測日を選択してください。</span>';

  drawStackedBandCompare($("compareAccBandChart"), {
    title: "加速度ノルム強度帯別割合の日間比較",
    subtitle: "",
    defs: ACC_INTENSITY_BANDS,
    rows: ms.map(m => {
      const values = finiteMetricValues(m, "acc");
      const bands = accBandSummary(values);
      const highPct = stackedBandHighPct(bands, new Set(["b4", "b5", "b6", "b7"]));
      return {
        label: m.date,
        segments: bands,
        summary: `≥1.20g ${highPct.toFixed(1)}%`,
        detail: `n=${values.length.toLocaleString()}`
      };
    }),
    emptyMessage: "比較用の加速度データがありません。"
  });

  drawStackedBandCompare($("compareHrZoneChart"), {
    title: "心拍ゾーン別割合の日間比較",
    subtitle: "",
    defs: HR_ZONE_DEFS,
    rows: ms.map(m => {
      const values = finiteMetricValues(m, "hr");
      const bands = heartZoneSummary(values, 200);
      const highPct = stackedBandHighPct(bands, new Set(["z4", "z5"]));
      return {
        label: m.date,
        segments: bands,
        summary: `Z4+Z5 ${highPct.toFixed(1)}%`,
        detail: `n=${values.length.toLocaleString()}`
      };
    }),
    emptyMessage: "比較用の心拍データがありません。"
  });

  const selectedDates = [...state.compareDates].sort();
  combinedChart($("compareClassCombinedChart"), {
    title: "心拍数のクラス中央値とばらつきの日間比較",
    subtitle: "",
    series: selectedDates.map(d => {
      const color = dateColor(d);
      const hrStats = classStats(d, "hr");
      return {
        color,
        hrBands: [{ samples: hrStats, color, alpha: 0.09 }],
        hr: [{ samples: hrStats.map(p => ({ x: p.x, value: p.median })), color, width: 2.0 }]
      };
    })
  });
  $("compareClassLegend").innerHTML = legendHtml || '<span class="empty">比較する計測日を選択してください。</span>';

  const vectors = ms.map(m => ({ ...measurementMetrics(m), color: dateColor(m.date) })).filter(m => Number.isFinite(m.avgAcc) && Number.isFinite(m.avgHr));
  scatter($("compareScatterChart"), {
    title: "平均加速度と平均心拍数の関係の日間変化",
    subtitle: "",
    vectors
  });
}


function updateAll() {
  renderSelectors();
  renderKpis();
  renderPersonalCharts();
  renderCompareCharts();
}

function bindEvents() {
  document.querySelectorAll(".tab").forEach(btn => {
    btn.addEventListener("click", () => {
      const tab = btn.dataset.tab;
      document.querySelectorAll(".tab").forEach(b => b.classList.toggle("active", b.dataset.tab === tab));
      document.querySelectorAll(".page").forEach(p => p.classList.toggle("active", p.dataset.page === tab));
      setTimeout(updateAll, 30);
    });
  });
  $("dateSelect").addEventListener("change", e => {
    state.selectedDate = e.target.value;
    state.selectedSensor = sensorsForDate(state.selectedDate)[0] || state.selectedSensor;
    updateAll();
  });
  $("sensorSelect").addEventListener("change", e => { state.selectedSensor = e.target.value; updateAll(); });
  $("compareSensorSelect").addEventListener("change", e => {
    state.compareSensor = e.target.value;
    state.compareDates = new Set(datesForSensor(state.compareSensor));
    updateAll();
  });
  $("compareDateChecks").addEventListener("change", e => {
    if (e.target.type !== "checkbox") return;
    if (e.target.checked) state.compareDates.add(e.target.value);
    else state.compareDates.delete(e.target.value);
    updateAll();
  });
  document.addEventListener("change", e => {
    if (e.target.classList && e.target.classList.contains("time-start")) {
      state.timeStart = Number(e.target.value);
      if (state.timeStart >= state.timeEnd) state.timeEnd = state.timeStart + 300;
      updateAll();
    }
    if (e.target.classList && e.target.classList.contains("time-end")) {
      state.timeEnd = Number(e.target.value);
      if (state.timeEnd <= state.timeStart) state.timeStart = state.timeEnd - 300;
      updateAll();
    }
  });
  window.addEventListener("resize", () => {
    clearTimeout(window.__resizeTimer);
    window.__resizeTimer = setTimeout(updateAll, 120);
  });
}

bindEvents();
updateAll();
autoLoadIndexedData();

})();
