// Monthly Trend — for the Sunday recap, Tuesday resend and Friday invite, the average per email
// of each weekly-sheet number, month by month (/api/trends). Months load two at a time and the
// charts fill in as they arrive. Uses pacificToday() and escapeHtml() from eblast-page.js.

const TREND_SERIES = [
    { key: 'recap',  label: 'Sunday recap',   colorVar: '--series-recap' },
    { key: 'resend', label: 'Tuesday resend', colorVar: '--series-resend' },
    { key: 'friday', label: 'Friday invite',  colorVar: '--series-friday' },
];

const TREND_METRICS = [
    { canvas: 'trendOpenRate',     field: 'openRate',       label: 'Open rate',          format: v => `${(v * 100).toFixed(1)}%`, axis: v => `${(v * 100).toFixed(0)}%`, numFmt: '0.0%' },
    { canvas: 'trendUniqueClicks', field: 'uniqueClicks',   label: 'Unique clicks',      format: v => v.toFixed(1), numFmt: '0.0' },
    { canvas: 'trendTeaching',     field: 'teachingClicks', label: 'Clicks on teaching', format: v => v.toFixed(1), numFmt: '0.0' },
    { canvas: 'trendRecipients',   field: 'recipients',     label: 'Recipients',         format: v => Math.round(v).toLocaleString('en-US'), numFmt: '#,##0' },
];

const TREND_CONCURRENCY = 2; // two months at a time keeps Mailchimp under its connection limit

let trendMonths = [];      // months on screen, oldest → newest ("YYYY-MM")
const trendData = {};      // month → /api/trends response, kept when the range changes
const trendErrors = {};    // month → error message
const trendCharts = {};    // canvas id → Chart
let trendLoadId = 0;

function cssVar(name) {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

// ---------- Months ----------

function currentMonth() {
    return pacificToday().slice(0, 7);
}

function lastMonths(count) {
    let [y, m] = currentMonth().split('-').map(Number);
    const months = [];
    for (let i = 0; i < count; i++) {
        months.unshift(`${y}-${String(m).padStart(2, '0')}`);
        if (--m === 0) { m = 12; y--; }
    }
    return months;
}

function monthLabel(month, style = 'short') {
    const date = new Date(`${month}-01T00:00:00Z`);
    const text = date.toLocaleDateString('en-US', {
        timeZone: 'UTC', month: style === 'long' ? 'long' : 'short', year: style === 'axis' ? '2-digit' : 'numeric'
    });
    return month === currentMonth() && style !== 'axis' ? `${text} (so far)` : text;
}

// ---------- Chart plugins ----------

// Vertical hairline at the hovered month.
const crosshairPlugin = {
    id: 'crosshair',
    afterDatasetsDraw(chart) {
        const active = chart.tooltip?.getActiveElements() || [];
        if (!active.length) return;
        const { ctx, chartArea } = chart;
        const x = active[0].element.x;
        ctx.save();
        ctx.strokeStyle = cssVar('--text-muted');
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(x, chartArea.top);
        ctx.lineTo(x, chartArea.bottom);
        ctx.stroke();
        ctx.restore();
    }
};

// Series names at the end of each line, nudged apart with leader lines when they crowd.
const endLabelsPlugin = {
    id: 'endLabels',
    afterDatasetsDraw(chart) {
        const { ctx, chartArea } = chart;
        const labels = [];
        chart.data.datasets.forEach((dataset, i) => {
            const last = dataset.data.findLastIndex(v => v != null);
            if (last < 0) return;
            const point = chart.getDatasetMeta(i).data[last];
            labels.push({ x: point.x, y: point.y, text: dataset.label, color: dataset.borderColor });
        });
        labels.sort((a, b) => a.y - b.y);
        const gap = 15;
        labels.forEach((label, i) => {
            label.labelY = Math.max(label.y, i ? labels[i - 1].labelY + gap : chartArea.top + 6);
        });
        for (let i = labels.length - 1; i >= 0; i--) {
            const limit = i === labels.length - 1 ? chartArea.bottom - 4 : labels[i + 1].labelY - gap;
            labels[i].labelY = Math.min(labels[i].labelY, limit);
        }

        ctx.save();
        ctx.font = '11px Inter, sans-serif';
        ctx.textBaseline = 'middle';
        const textX = chartArea.right + 26;
        for (const label of labels) {
            ctx.strokeStyle = cssVar('--border-color');
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(label.x + 7, label.y);
            ctx.lineTo(chartArea.right + 6, label.labelY);
            ctx.stroke();
            ctx.strokeStyle = label.color;
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(chartArea.right + 8, label.labelY);
            ctx.lineTo(chartArea.right + 20, label.labelY);
            ctx.stroke();
            ctx.fillStyle = cssVar('--text-secondary');
            ctx.fillText(label.text, textX, label.labelY);
        }
        ctx.restore();
    }
};

function compactNumber(v) {
    return v >= 1000 ? `${(v / 1000).toLocaleString('en-US', { maximumFractionDigits: 1 })}k` : v.toLocaleString('en-US');
}

function ensureChart(metric) {
    if (trendCharts[metric.canvas]) return trendCharts[metric.canvas];
    const surface = cssVar('--bg-card');
    const muted = cssVar('--text-muted');
    const grid = cssVar('--border-color');
    const font = { family: 'Inter, sans-serif', size: 11 };

    trendCharts[metric.canvas] = new Chart(document.getElementById(metric.canvas), {
        type: 'line',
        data: {
            labels: [],
            datasets: TREND_SERIES.map(series => {
                const color = cssVar(series.colorVar);
                return {
                    label: series.label,
                    data: [],
                    borderColor: color,
                    backgroundColor: color,
                    borderWidth: 2,
                    borderCapStyle: 'round',
                    borderJoinStyle: 'round',
                    pointRadius: 4,
                    pointHoverRadius: 5,
                    pointBackgroundColor: color,
                    pointBorderColor: surface,
                    pointBorderWidth: 2,
                    pointHitRadius: 12,
                    spanGaps: false
                };
            })
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            animation: false,
            interaction: { mode: 'index', intersect: false },
            layout: { padding: { top: 6, right: 112 } },
            scales: {
                x: { grid: { display: false }, border: { color: grid }, ticks: { color: muted, font } },
                y: {
                    beginAtZero: true,
                    grid: { color: grid, lineWidth: 1 },
                    border: { display: false },
                    ticks: { color: muted, font, maxTicksLimit: 5, callback: v => (metric.axis ? metric.axis(v) : compactNumber(v)) }
                }
            },
            plugins: {
                legend: { display: false },
                tooltip: {
                    backgroundColor: cssVar('--bg-secondary'),
                    borderColor: grid,
                    borderWidth: 1,
                    titleColor: cssVar('--text-primary'),
                    bodyColor: cssVar('--text-secondary'),
                    titleFont: { ...font, weight: '600' },
                    bodyFont: font,
                    padding: 10,
                    usePointStyle: true,
                    callbacks: {
                        title: items => monthLabel(trendMonths[items[0].dataIndex], 'long'),
                        label: item => `${item.raw == null ? '—' : metric.format(item.raw)}  ${item.dataset.label}`,
                        // Series with no email that month are skipped by Chart.js; list them anyway.
                        afterBody: items => TREND_SERIES
                            .filter(series => !items.some(item => item.dataset.label === series.label))
                            .map(series => `—  ${series.label} (no email)`),
                        labelPointStyle: () => ({ pointStyle: 'line', rotation: 0 })
                    }
                }
            }
        },
        plugins: [crosshairPlugin, endLabelsPlugin]
    });
    return trendCharts[metric.canvas];
}

// ---------- Rendering ----------

function renderTrendLegend() {
    $('trendLegend').innerHTML = TREND_SERIES.map(s => `
        <span class="legend-item"><span class="legend-key" style="background:var(${s.colorVar})"></span>${escapeHtml(s.label)}</span>`).join('');
}

function trendValue(month, seriesKey, field) {
    return trendData[month]?.types?.[seriesKey]?.[field] ?? null;
}

function renderTrend() {
    const labels = trendMonths.map(m => monthLabel(m, 'axis'));
    for (const metric of TREND_METRICS) {
        const chart = ensureChart(metric);
        chart.data.labels = labels;
        TREND_SERIES.forEach((series, i) => {
            chart.data.datasets[i].data = trendMonths.map(m => trendValue(m, series.key, metric.field));
        });
        chart.update('none');
    }

    $('trendRange').textContent = `· ${monthLabel(trendMonths[0])} – ${monthLabel(trendMonths[trendMonths.length - 1])}`;

    const columns = [{ label: 'Emails', field: 'count', format: v => String(v) }, ...TREND_METRICS];
    $('trendHead').innerHTML = `
        <tr>
            <th rowspan="2">Month</th>
            ${TREND_SERIES.map(s => `<th class="group" colspan="${columns.length}">${escapeHtml(s.label)}</th>`).join('')}
        </tr>
        <tr>
            ${TREND_SERIES.map(() => columns.map((c, i) => `<th class="num${i === 0 ? ' group-start' : ''}">${escapeHtml(c.label)}</th>`).join('')).join('')}
        </tr>`;

    $('trendBody').innerHTML = [...trendMonths].reverse().map(month => {
        const monthCell = `<td class="nowrap">${escapeHtml(monthLabel(month))}</td>`;
        if (!trendData[month]) {
            const status = trendErrors[month] ? 'Couldn’t load this month' : 'Loading…';
            return `<tr>${monthCell}<td class="muted" colspan="${TREND_SERIES.length * columns.length}">${status}</td></tr>`;
        }
        const cells = TREND_SERIES.map(s => columns.map((c, i) => {
            const v = trendValue(month, s.key, c.field);
            const text = v == null || (c.field === 'count' && v === 0) ? '—' : c.format(v);
            return `<td class="num${i === 0 ? ' group-start' : ''}">${escapeHtml(text)}</td>`;
        }).join('')).join('');
        return `<tr>${monthCell}${cells}</tr>`;
    }).join('');
}

function updateTrendStatus() {
    const loaded = trendMonths.filter(m => trendData[m]).length;
    const failed = trendMonths.filter(m => trendErrors[m]);
    $('trendStatus').textContent = loaded + failed.length < trendMonths.length
        ? `Loading ${loaded + 1} of ${trendMonths.length} months…`
        : '';
    $('trendError').style.display = failed.length ? 'block' : 'none';
    if (failed.length) {
        $('trendError').innerHTML = `<strong>Couldn’t load ${escapeHtml(failed.map(m => monthLabel(m)).join(', '))}:</strong> ${escapeHtml(trendErrors[failed[0]])}`;
    }
}

// ---------- Loading ----------

async function fetchTrendMonth(month) {
    const response = await fetch(`/api/trends?month=${month}`);
    let data;
    try {
        data = await response.json();
    } catch {
        throw new Error(`The trend service returned an unexpected response (${response.status}).`);
    }
    if (!response.ok) throw new Error(data.error || `Request failed (${response.status}).`);
    return data;
}

async function loadTrend() {
    const loadId = ++trendLoadId;
    trendMonths = lastMonths(Number($('trendMonths').value));
    // The current month is always re-fetched; earlier months are reused if already loaded.
    delete trendData[currentMonth()];
    trendMonths.forEach(m => delete trendErrors[m]);
    renderTrend();
    updateTrendStatus();

    const queue = [...trendMonths].reverse().filter(m => !trendData[m]); // newest first
    async function worker() {
        while (queue.length && loadId === trendLoadId) {
            const month = queue.shift();
            try {
                trendData[month] = await fetchTrendMonth(month);
            } catch (err) {
                trendErrors[month] = err.message;
            }
            if (loadId !== trendLoadId) return;
            renderTrend();
            updateTrendStatus();
        }
    }
    await Promise.all(Array.from({ length: TREND_CONCURRENCY }, worker));
}

// ---------- Export (second sheet of the .xlsx) ----------

// Adds a "Monthly Trend" sheet once every month on screen has loaded.
function addTrendSheet(wb) {
    if (!trendMonths.length || trendMonths.some(m => !trendData[m])) return false;
    const ws = wb.addWorksheet('Monthly Trend');
    const font = { name: 'Calibri', size: 12 };
    const bold = { ...font, bold: true };
    const columns = [{ label: 'Emails', field: 'count', numFmt: '0' }, ...TREND_METRICS];

    ws.getColumn(1).width = 22;
    for (let i = 2; i <= 1 + TREND_SERIES.length * columns.length; i++) ws.getColumn(i).width = 13;

    const groupRow = ws.getRow(1);
    const headerRow = ws.getRow(2);
    groupRow.getCell(1).value = 'Month';
    TREND_SERIES.forEach((s, si) => {
        const first = 2 + si * columns.length;
        ws.mergeCells(1, first, 1, first + columns.length - 1);
        groupRow.getCell(first).value = s.label;
        groupRow.getCell(first).alignment = { horizontal: 'center' };
        columns.forEach((c, ci) => { headerRow.getCell(first + ci).value = c.label; });
    });
    [groupRow, headerRow].forEach(row => row.eachCell({ includeEmpty: true }, cell => { cell.font = bold; }));
    headerRow.eachCell({ includeEmpty: true }, cell => { cell.border = { bottom: { style: 'medium' } }; cell.alignment = { wrapText: true, vertical: 'middle' }; });

    [...trendMonths].reverse().forEach((month, r) => {
        const row = ws.getRow(3 + r);
        row.getCell(1).value = monthLabel(month, 'long');
        TREND_SERIES.forEach((s, si) => {
            columns.forEach((c, ci) => {
                const v = trendValue(month, s.key, c.field);
                if (v == null || (c.field === 'count' && v === 0)) return;
                const cell = row.getCell(2 + si * columns.length + ci);
                cell.value = v;
                cell.numFmt = c.numFmt;
            });
        });
        row.eachCell({ includeEmpty: true }, cell => { cell.font = font; });
    });
    return true;
}

document.addEventListener('DOMContentLoaded', () => {
    renderTrendLegend();
    $('trendMonths').addEventListener('change', loadTrend);
    trendMonths = lastMonths(Number($('trendMonths').value));
    renderTrend(); // empty charts and "Loading…" rows until it starts
    $('trendStatus').textContent = 'Waiting for the weekly report…';
    // Start after the weekly report has loaded, so the two don't compete for
    // Mailchimp's limit on simultaneous requests.
    document.addEventListener('weeklyreportdone', loadTrend, { once: true });
});
