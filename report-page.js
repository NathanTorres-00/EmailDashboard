// Campaign Report — the weekly sheet's numbers as a table, one row per email: the last four
// Sunday–Saturday weeks of Friday invites, Sunday recaps and Tuesday resends (/api/eblast),
// or any email found by title or send date (/api/report), shown in the same columns.

const TIME_ZONE = 'America/Los_Angeles';

const $ = id => document.getElementById(id);

let shown = null;      // { sections: [{ label, rows: [row] }] } currently on screen
let reportDate = null; // Sunday after the four weeks shown ("YYYY-MM-DD")

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

function longDate(day) {
    return new Date(`${day}T12:00:00Z`).toLocaleDateString('en-US', {
        timeZone: 'UTC', weekday: 'long', month: 'long', day: 'numeric', year: 'numeric'
    });
}

function shortDate(day) {
    return new Date(`${day}T12:00:00Z`).toLocaleDateString('en-US', { timeZone: 'UTC', month: 'short', day: 'numeric' });
}

function clockTime(hhmm) {
    const [h, m] = hhmm.split(':').map(Number);
    return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
}

// Pacific date and send time rounded to the nearest 15 minutes, like the weekly sheet.
function pacificDateAndTime(utc) {
    const date = new Date(utc);
    const day = new Intl.DateTimeFormat('en-CA', { timeZone: TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
    const [h, m] = new Intl.DateTimeFormat('en-US', { timeZone: TIME_ZONE, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
        .format(date).split(':').map(Number);
    const minutes = Math.min(Math.round((h * 60 + m) / 15) * 15, 23 * 60 + 45);
    return { day, time: `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}` };
}

const number = n => (n == null ? '—' : n.toLocaleString('en-US'));
const percent = f => `${((f || 0) * 100).toFixed(1)}%`;

function escapeHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// "9/27/26", "9/27/2026" or "2026-09-27" → "2026-09-27"; anything else → null.
function parseDate(text) {
    let m = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
    if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
    m = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/);
    if (m) return `${m[3].length === 2 ? `20${m[3]}` : m[3]}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}`;
    return null;
}

// ---------- Rows ----------

// A row is { day, time, recipients, opens, openRate, uniqueClicks, teachingClicks, subject, preview }
// or { day, note } when no email went out.

function rowFromWeekly(slot) {
    const c = slot.campaign;
    if (!c) {
        const notSent = slot.expectedDate >= pacificToday();
        return { day: slot.expectedDate, note: notSent ? 'Not sent yet' : slot.missingText };
    }
    return {
        day: c.date, time: c.time, recipients: c.recipients, opens: c.opens, openRate: c.openRate,
        uniqueClicks: c.uniqueClicks, teachingClicks: c.teachingClicks, subject: c.subject, preview: c.previewText
    };
}

function rowFromReport(r) {
    const { day, time } = pacificDateAndTime(r.sendTime.utc);
    return {
        day, time, recipients: r.recipients, opens: r.opens.unique, openRate: r.opens.rate,
        uniqueClicks: r.clicks.unique, teachingClicks: r.youtube.uniqueClicks, subject: r.subjectLine, preview: r.previewText
    };
}

const opensText = row => (row.opens == null ? '—' : `${number(row.opens)} (${percent(row.openRate)})`);

// ---------- API ----------

async function post(path, body) {
    const response = await fetch(path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
    });
    let data;
    try {
        data = await response.json();
    } catch {
        throw new Error(`the report service sent an unexpected response (${response.status})`);
    }
    if (!response.ok) throw new Error(data.error || `the request failed (${response.status})`);
    return data;
}

// ---------- Rendering ----------

function setStatus(text, { error = false, retry = null } = {}) {
    const el = $('status');
    el.className = `status${error ? ' error' : ''}`;
    el.textContent = text;
    if (retry) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'text-button';
        button.textContent = 'Try again';
        button.addEventListener('click', retry);
        el.append(button);
    }
}

function setBusy(busy) {
    $('searchBtn').disabled = busy;
    $('earlierBtn').disabled = busy;
    $('laterBtn').disabled = busy || !reportDate || reportDate >= sundayOnOrAfter(pacificToday());
    if (busy) {
        $('results').hidden = true;
        $('picker').innerHTML = '';
    }
}

function renderRow(row) {
    const date = `<td class="date">${escapeHtml(longDate(row.day))}</td>`;
    if (row.note) {
        return `<tr class="note">${date}<td></td><td colspan="4"></td><td colspan="2">${escapeHtml(row.note)}</td></tr>`;
    }
    return `
        <tr>
            ${date}
            <td class="time">${clockTime(row.time)}</td>
            <td class="num">${number(row.recipients)}</td>
            <td class="num">${row.opens == null ? '—' : `${number(row.opens)} <span class="rate">(${percent(row.openRate)})</span>`}</td>
            <td class="num">${number(row.uniqueClicks)}</td>
            <td class="num">${number(row.teachingClicks)}</td>
            <td class="subject">${escapeHtml(row.subject)}</td>
            <td class="preview">${escapeHtml(row.preview)}</td>
        </tr>`;
}

function show(sections, { lede, isWeeks }) {
    shown = { sections };
    $('lede').textContent = lede;
    setStatus('');
    $('rows').innerHTML = sections.map(section => `
        ${section.label ? `<tr class="section"><th colspan="8" scope="colgroup">${escapeHtml(section.label)}</th></tr>` : ''}
        ${section.rows.map(renderRow).join('')}`).join('');
    $('results').hidden = false;
    $('backBtn').hidden = isWeeks;
}

function showPicker(query, candidates) {
    $('lede').textContent = `Emails with “${query}” in the title.`;
    setStatus('');
    $('picker').innerHTML = `
        <p>${candidates.length} emails match. Pick one to see its numbers.</p>
        <ul>${candidates.map(c => {
            const { day } = pacificDateAndTime(c.sendTime.utc);
            return `
            <li><button type="button" data-id="${escapeHtml(c.id)}">
                <span>${escapeHtml(c.title)}</span>
                <span class="when">${escapeHtml(longDate(day))}</span>
            </button></li>`;
        }).join('')}
        </ul>`;
    $('results').hidden = true;
    $('backBtn').hidden = false;
}

// ---------- Flows ----------

async function loadWeeks(date) {
    reportDate = date;
    history.replaceState(null, '', date === sundayOnOrAfter(pacificToday()) ? location.pathname : `${location.pathname}?weeks=${date}`);
    setBusy(true);
    setStatus('Loading four weeks of emails from Mailchimp…');
    try {
        const data = await post('/api/eblast', { action: 'report', reportDate: date });
        const first = addDays(date, -28);
        const last = addDays(date, -1);
        show(data.sections.map(s => ({ label: s.label, rows: s.rows.map(rowFromWeekly) })), {
            lede: `Friday invites, Sunday recaps and Tuesday resends from ${shortDate(first)} to ${shortDate(last)}.`,
            isWeeks: true
        });
    } catch (err) {
        setStatus(`Couldn’t load the emails: ${err.message}.`, { error: true, retry: () => loadWeeks(date) });
    } finally {
        setBusy(false);
    }
}

async function search(query) {
    query = query.trim();
    if (!query) {
        setStatus('Type a title or a send date to search.', { error: true });
        $('q').focus();
        return;
    }
    history.replaceState(null, '', `${location.pathname}?q=${encodeURIComponent(query)}`);

    const day = parseDate(query);
    const mode = day ? 'date' : /^[0-9a-f]{10}$/i.test(query) ? 'id' : 'title';

    setBusy(true);
    setStatus(day ? `Finding emails sent on ${longDate(day)}…` : 'Searching Mailchimp…');
    try {
        const data = await post('/api/report', { mode, value: day || query });
        if (data.candidates) {
            showPicker(query, data.candidates);
            return;
        }
        show([{ label: null, rows: data.reports.map(rowFromReport) }], {
            lede: day ? `Emails sent on ${longDate(day)}.` : `Results for “${query}”.`,
            isWeeks: false
        });
    } catch (err) {
        $('backBtn').hidden = false;
        setStatus(`${err.message.replace(/\.$/, '')}.`, { error: true });
    } finally {
        setBusy(false);
    }
}

async function openById(id, title) {
    setBusy(true);
    setStatus('Loading that email…');
    try {
        const data = await post('/api/report', { mode: 'id', value: id });
        show([{ label: null, rows: data.reports.map(rowFromReport) }], { lede: `Results for “${title}”.`, isWeeks: false });
    } catch (err) {
        setStatus(`Couldn’t load that email: ${err.message}.`, { error: true, retry: () => openById(id, title) });
    } finally {
        setBusy(false);
    }
}

// ---------- CSV (same columns as the weekly sheet) ----------

function csvCell(value) {
    const s = String(value ?? '');
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function downloadCsv() {
    if (!shown) return;
    const columns = ['Time', 'Recipients', 'Opens', 'Unique Clicks', 'Clicks on teaching', 'Attendance', 'Subject', 'Preview Text', 'Notes'];
    const lines = [];
    shown.sections.forEach((section, i) => {
        if (i > 0) lines.push([]);
        lines.push([section.label || 'Date', ...columns]);
        for (const row of section.rows) {
            lines.push(row.note
                ? [longDate(row.day), '', '', '', '', '', '', row.note, '', '']
                : [longDate(row.day), clockTime(row.time), row.recipients, opensText(row), row.uniqueClicks,
                   row.teachingClicks, '', row.subject, row.preview, '']);
        }
    });
    const csv = lines.map(line => line.map(csvCell).join(',')).join('\n');

    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `campaign-report-${reportDate || pacificToday()}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 100);
}

// ---------- Wiring ----------

document.addEventListener('DOMContentLoaded', () => {
    const current = sundayOnOrAfter(pacificToday());

    $('searchForm').addEventListener('submit', e => { e.preventDefault(); search($('q').value); });
    $('csvBtn').addEventListener('click', downloadCsv);
    $('backBtn').addEventListener('click', () => { $('q').value = ''; loadWeeks(current); });
    $('earlierBtn').addEventListener('click', () => loadWeeks(addDays(reportDate || current, -7)));
    $('laterBtn').addEventListener('click', () => loadWeeks(addDays(reportDate || current, 7)));
    $('picker').addEventListener('click', e => {
        const button = e.target.closest('button[data-id]');
        if (button) openById(button.dataset.id, button.querySelector('span').textContent);
    });

    // Shareable links: /?q=<title or date>, or /?weeks=<Sunday after the four weeks> (old report.html links redirect here)
    const params = new URLSearchParams(location.search);
    const weeks = params.get('weeks');
    if (params.get('q')) {
        $('q').value = params.get('q');
        search(params.get('q'));
    } else if (/^\d{4}-\d{2}-\d{2}$/.test(weeks || '') && sundayOnOrAfter(weeks) <= current) {
        loadWeeks(sundayOnOrAfter(weeks));
    } else {
        loadWeeks(current);
    }
});
