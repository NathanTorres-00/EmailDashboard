// Weekly Eblast Report — builds the rolling 4-week TRA Eblast Performance sheet from
// Mailchimp (/api/eblast) and exports the .xlsx. Attendance and Notes are left blank to fill in.

const EXCELJS_URL = 'https://cdn.jsdelivr.net/npm/exceljs@4.4.0/dist/exceljs.min.js';
const TIME_ZONE = 'America/Los_Angeles';

// Order the newest week's emails go out, for the "This Week" cards.
const WEEK_CARD_ORDER = [
    { section: 'recap',  kind: 'Sunday recap' },
    { section: 'resend', kind: 'Midweek resend' },
    { section: 'friday', kind: 'Friday invite' },
];

let report = null;  // last /api/eblast report response
const choices = {}; // row key → campaign ID, when a week has more than one matching send

const $ = id => document.getElementById(id);

// ---------- Dates & formatting ----------

function addDays(day, days) {
    return new Date(Date.parse(`${day}T00:00:00Z`) + days * 86400000).toISOString().slice(0, 10);
}

function pacificToday() {
    return new Intl.DateTimeFormat('en-CA', { timeZone: TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}

// The given day if it's a Sunday, otherwise the following Sunday.
function sundayOnOrAfter(day) {
    const dow = new Date(`${day}T00:00:00Z`).getUTCDay();
    return addDays(day, (7 - dow) % 7);
}

function formatLongDate(day) {
    return new Date(`${day}T00:00:00Z`).toLocaleDateString('en-US', {
        timeZone: 'UTC', weekday: 'long', month: 'long', day: '2-digit', year: 'numeric'
    });
}

function formatShortDate(day) {
    return new Date(`${day}T00:00:00Z`).toLocaleDateString('en-US', {
        timeZone: 'UTC', weekday: 'short', month: 'short', day: 'numeric'
    });
}

function formatTime(hhmm) {
    const [h, m] = hhmm.split(':').map(Number);
    return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
}

function formatNumber(num) {
    return num == null ? '' : num.toLocaleString('en-US');
}

function opensText(campaign) {
    if (campaign.opens == null) return '—';
    return `${formatNumber(campaign.opens)} (${(campaign.openRate * 100).toFixed(1)}%)`;
}

function escapeHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// ---------- Report helpers ----------

function allRows() {
    return report.sections.flatMap(s => s.rows);
}

// Key of the row with the highest open rate across the whole report.
function bestOpenKey() {
    let best = null;
    for (const row of allRows()) {
        const rate = row.campaign?.openRate;
        if (rate != null && (!best || rate > best.rate)) best = { key: row.key, rate };
    }
    return best?.key || null;
}

// ---------- API ----------

async function api(body) {
    const response = await fetch('/api/eblast', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
    });
    let data;
    try {
        data = await response.json();
    } catch {
        throw new Error(`The report service returned an unexpected response (${response.status}).`);
    }
    if (!response.ok) throw new Error(data.error || `Request failed (${response.status}).`);
    return data;
}

// ---------- Rendering ----------

function renderWeekCards() {
    const newestWeek = report.sections[0].rows[0].weekStart;
    $('weekHeading').innerHTML = `This Week <span class="count">· week of ${escapeHtml(formatShortDate(newestWeek))}</span>`;

    $('weekCards').innerHTML = WEEK_CARD_ORDER.map(({ section, kind }) => {
        const row = report.sections.find(s => s.key === section).rows[0];
        const c = row.campaign;
        if (!c) {
            return `
                <div class="week-card missing">
                    <div><div class="kind">${kind}</div><div class="when">${escapeHtml(formatShortDate(row.expectedDate))}</div></div>
                    <div>${escapeHtml(row.missingText)} — no matching campaign was found in Mailchimp.</div>
                </div>`;
        }
        return `
            <div class="week-card">
                <div>
                    <div class="kind">${kind}</div>
                    <div class="when">${escapeHtml(formatShortDate(c.date))} · ${formatTime(c.time)}</div>
                </div>
                <div class="title">${escapeHtml(c.title)}</div>
                ${candidateSelect(row)}
                <div class="metric-grid">
                    <div class="metric"><div class="label">Recipients</div><div class="value">${formatNumber(c.recipients)}</div></div>
                    <div class="metric"><div class="label">Opens</div><div class="value">${c.opens == null ? '—' : formatNumber(c.opens)}<small>${c.opens == null ? '' : (c.openRate * 100).toFixed(1) + '%'}</small></div></div>
                    <div class="metric"><div class="label">Unique clicks</div><div class="value">${formatNumber(c.uniqueClicks)}</div></div>
                    <div class="metric"><div class="label">Clicks on teaching</div><div class="value">${formatNumber(c.teachingClicks)}</div></div>
                </div>
                <div class="copy-block">
                    <strong>Subject</strong><p>${escapeHtml(c.subject) || '—'}</p>
                    <strong>Preview text</strong><p>${escapeHtml(c.previewText) || '—'}</p>
                </div>
            </div>`;
    }).join('');
}

function candidateSelect(row) {
    if (row.candidates.length < 2) return '';
    return `
        <select class="candidate" data-key="${escapeHtml(row.key)}" title="More than one matching campaign was sent this week">
            ${row.candidates.map(c => `<option value="${escapeHtml(c.id)}"${c.id === row.campaign?.id ? ' selected' : ''}>Sent ${escapeHtml(c.sendTime)}</option>`).join('')}
        </select>`;
}

function renderTable() {
    const bestKey = bestOpenKey();

    $('reportBody').innerHTML = report.sections.map(section => {
        const rows = section.rows.map(row => {
            const c = row.campaign;
            if (!c) {
                return `
                    <tr class="missing-row">
                        <td class="nowrap">${escapeHtml(formatLongDate(row.expectedDate))}</td>
                        <td></td><td></td><td></td><td></td><td></td>
                        <td colspan="2">${escapeHtml(row.missingText)}</td>
                    </tr>`;
            }

            return `
                <tr>
                    <td class="date-cell">${escapeHtml(formatLongDate(c.date))}${candidateSelect(row)}</td>
                    <td class="nowrap">${formatTime(c.time)}</td>
                    <td class="num">${formatNumber(c.recipients)}</td>
                    <td class="num${row.key === bestKey ? ' best' : ''}">${opensText(c)}${row.key === bestKey ? ' 🎉' : ''}</td>
                    <td class="num">${formatNumber(c.uniqueClicks)}</td>
                    <td class="num">${formatNumber(c.teachingClicks)}</td>
                    <td class="copy">${escapeHtml(c.subject)}</td>
                    <td class="copy">${escapeHtml(c.previewText)}</td>
                </tr>`;
        }).join('');

        return `<tr class="section-row"><td colspan="8">${escapeHtml(section.label)}</td></tr>${rows}`;
    }).join('');

    $('previewCount').textContent = `· ${formatShortDate(report.sections[0].rows[3].weekStart)} – ${formatShortDate(addDays(report.reportDate, -1))}`;
}

function render() {
    renderWeekCards();
    renderTable();
    $('content').style.display = 'block';
}

// ---------- Loading ----------

function setBusy(busy) {
    $('loading').style.display = busy ? 'block' : 'none';
    $('loadBtn').disabled = busy;
    $('exportBtn').disabled = busy || !report;
    if (busy) $('content').style.display = 'none';
}

async function loadReport() {
    const input = $('reportDate');
    const reportDate = sundayOnOrAfter(input.value || pacificToday());
    input.value = reportDate;
    history.replaceState(null, '', `${location.pathname}?date=${reportDate}`);

    $('error').style.display = 'none';
    setBusy(true);
    try {
        report = await api({ action: 'report', reportDate, choices });
        render();
        $('status').textContent = `${report.account} · loaded ${new Date().toLocaleTimeString()}`;
    } catch (err) {
        report = null;
        $('error').innerHTML = `<strong>Couldn’t load the report:</strong> ${escapeHtml(err.message)}`;
        $('error').style.display = 'block';
    } finally {
        setBusy(false);
        // Lets the Monthly Trend start once the weekly numbers are in (see eblast-trend.js).
        document.dispatchEvent(new Event('weeklyreportdone'));
    }
}

// ---------- Export ----------

function loadExcelJS() {
    if (window.ExcelJS) return Promise.resolve(window.ExcelJS);
    return new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = EXCELJS_URL;
        script.onload = () => resolve(window.ExcelJS);
        script.onerror = () => reject(new Error('Could not load the spreadsheet library. Check your connection and try again.'));
        document.head.appendChild(script);
    });
}

// Mirrors the layout and formatting of TRA_Eblast_Performance_4_weeks_*.xlsx.
function buildWorkbook(ExcelJS) {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Sheet1');
    const font = { name: 'Calibri', size: 12 };
    const bold = { ...font, bold: true };

    // 9.01 rather than 9: ExcelJS drops a width of exactly 9 as the default.
    ws.columns = [30.375, 10.125, 9.625, 13.125, 12.125, 9.01, 10.5, 54.5, 80.125, 25.625].map(width => ({ width }));

    const header = ['Fridays/Saturdays', 'Time', 'Recipients', 'Opens', 'Unique Clicks', 'Clicks on teaching', 'Attendance', 'Subject', 'Preview Text', 'Notes'];
    const headerRow = ws.getRow(1);
    headerRow.height = 35.1;
    header.forEach((text, i) => {
        const cell = headerRow.getCell(i + 1);
        cell.value = text;
        cell.font = bold;
        cell.alignment = { vertical: 'middle', wrapText: true, ...(i > 0 && i < 9 ? { horizontal: 'left' } : {}) };
        if (i < 9) cell.border = { bottom: { style: 'medium' } };
    });

    const bestKey = bestOpenKey();
    let r = 2;

    report.sections.forEach((section, index) => {
        if (index > 0) {
            r++; // blank spacer row
            const labelCell = ws.getRow(r).getCell(1);
            labelCell.value = section.label;
            labelCell.font = bold;
            labelCell.alignment = { wrapText: true };
            if (section.label.length > 30) ws.getRow(r).height = 31.5;
            r++;
        }

        for (const row of section.rows) {
            const excelRow = ws.getRow(r++);
            const cells = Array.from({ length: 10 }, (_, i) => excelRow.getCell(i + 1));
            cells.forEach((cell, i) => {
                cell.font = font;
                cell.alignment = i < 7 ? { horizontal: 'left', vertical: 'middle' } : { vertical: 'middle', wrapText: true };
            });

            const c = row.campaign;
            const [y, m, d] = (c ? c.date : row.expectedDate).split('-').map(Number);
            cells[0].value = new Date(Date.UTC(y, m - 1, d));
            cells[0].numFmt = '[$-F800]dddd\\,\\ mmmm\\ dd\\,\\ yyyy';

            if (!c) {
                cells[7].value = row.missingText;
                continue;
            }

            const [hh, mm] = c.time.split(':').map(Number);
            cells[1].value = (hh * 60 + mm) / 1440;
            cells[1].numFmt = 'h:mm AM/PM';
            cells[2].value = c.recipients;
            cells[2].numFmt = '#,##0';
            cells[3].value = opensText(c) + (row.key === bestKey ? ' 🎉' : '');
            if (row.key === bestKey) cells[3].fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFF00' } };
            cells[4].value = c.uniqueClicks;
            cells[5].value = c.teachingClicks;
            cells[7].value = c.subject;
            cells[8].value = c.previewText;
        }
    });

    addTrendSheet(wb); // second sheet, from eblast-trend.js (skipped until the trend has loaded)
    return wb;
}

async function exportReport() {
    if (!report) return;
    const button = $('exportBtn');
    button.disabled = true;
    button.textContent = 'Preparing…';
    try {
        const ExcelJS = await loadExcelJS();
        const buffer = await buildWorkbook(ExcelJS).xlsx.writeBuffer();
        const [y, m, d] = report.reportDate.split('-');
        const filename = `TRA_Eblast_Performance_4_weeks_${m}${d}${y.slice(2)}.xlsx`;

        const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(url), 100);
    } catch (err) {
        $('error').innerHTML = `<strong>Couldn’t export:</strong> ${escapeHtml(err.message)}`;
        $('error').style.display = 'block';
    } finally {
        button.disabled = false;
        button.textContent = 'Export .xlsx';
    }
}

// ---------- Wiring ----------

document.addEventListener('DOMContentLoaded', () => {
    $('controls').addEventListener('submit', e => { e.preventDefault(); loadReport(); });
    $('exportBtn').addEventListener('click', exportReport);

    // Switching between two sends in the same week reloads the report with that choice.
    $('content').addEventListener('change', e => {
        if (!e.target.classList.contains('candidate')) return;
        choices[e.target.dataset.key] = e.target.value;
        loadReport();
    });

    const requested = new URLSearchParams(location.search).get('date');
    $('reportDate').value = /^\d{4}-\d{2}-\d{2}$/.test(requested || '') ? requested : sundayOnOrAfter(pacificToday());
    loadReport();
});
