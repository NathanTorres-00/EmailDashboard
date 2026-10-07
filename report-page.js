// Campaign Report page — looks up one (or more) sent campaigns via /api/report
// and renders metrics, a full links table, a YouTube section, and an optional comparison.

const MODE_LABELS = {
    title: { label: 'Campaign title', placeholder: 'Resend: Weekend Recap 9/27/26 (Jerry)' },
    id:    { label: 'Campaign ID',    placeholder: 'e.g. 1a2b3c4d5e' },
    date:  { label: 'Send date',      placeholder: '' },
};

let currentResult = null;          // { account, reports, compare, labels?, missing? } of the last rendered report
const picked = { primary: null, compare: null }; // campaign IDs chosen from a candidates list

const $ = id => document.getElementById(id);

// ---------- Formatting ----------

function escapeHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function formatNumber(num) {
    return (num || 0).toLocaleString('en-US');
}

function formatPercent(fraction) {
    return ((fraction || 0) * 100).toFixed(2) + '%';
}

function safeHref(url) {
    return /^https?:\/\//i.test(url) ? escapeHtml(url) : null;
}

// ---------- API ----------

async function fetchReport(mode, value) {
    const response = await fetch('/api/report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode, value })
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

// ---------- Rendering: one campaign ----------

function renderMetrics(r) {
    const cards = [
        {
            title: 'Emails Sent', accent: '#22d3ee',
            value: formatNumber(r.emailsSent),
            rows: [['Recipients', formatNumber(r.emailsSent)]]
        },
        {
            title: 'Opens', accent: '#4ade80',
            value: formatPercent(r.opens.rate),
            rows: [['Open rate', formatPercent(r.opens.rate)], ['Unique opens', formatNumber(r.opens.unique)], ['Total opens', formatNumber(r.opens.total)]]
        },
        {
            title: 'Clicks', accent: '#a78bfa',
            value: formatPercent(r.clicks.rate),
            rows: [['Click rate', formatPercent(r.clicks.rate)], ['Unique clicks', formatNumber(r.clicks.unique)], ['Total clicks', formatNumber(r.clicks.total)]]
        },
        {
            title: 'Bounces', accent: '#fb923c',
            value: formatNumber(r.bounces.hard + r.bounces.soft),
            rows: [['Hard bounces', formatNumber(r.bounces.hard)], ['Soft bounces', formatNumber(r.bounces.soft)]]
        },
        {
            title: 'Unsubscribes', accent: '#f87171',
            value: formatNumber(r.unsubscribes),
            rows: [['Unsubscribed', formatNumber(r.unsubscribes)]]
        }
    ];

    return `<div class="stats-grid">${cards.map(c => `
        <div class="stat-card">
            <div class="stat-card-accent" style="background:${c.accent};"></div>
            <h3>${c.title}</h3>
            <div class="value">${c.value}</div>
            <div class="breakdown">${c.rows.map(([label, val]) => `<span>${label}: <strong>${val}</strong></span>`).join('')}</div>
        </div>`).join('')}
    </div>`;
}

function linkCell(link) {
    const href = safeHref(link.url);
    const text = escapeHtml(link.url);
    const anchor = href ? `<a href="${href}" target="_blank" rel="noopener noreferrer">${text}</a>` : text;
    return `<td class="url-cell">${anchor}${link.isYouTube ? '<span class="yt-tag">YOUTUBE</span>' : ''}</td>`;
}

function renderLinksTable(r) {
    const body = r.links.length
        ? `<table>
                <thead><tr>
                    <th>URL</th>
                    <th class="num">Total clicks</th>
                    <th class="num">Unique clicks</th>
                    <th class="num">% of clicks</th>
                    <th class="num">% of unique clicks</th>
                </tr></thead>
                <tbody>${r.links.map(l => `
                    <tr>
                        ${linkCell(l)}
                        <td class="num">${formatNumber(l.totalClicks)}</td>
                        <td class="num">${formatNumber(l.uniqueClicks)}</td>
                        <td class="num">${formatPercent(l.shareOfClicks)}</td>
                        <td class="num">${formatPercent(l.shareOfUniqueClicks)}</td>
                    </tr>`).join('')}
                </tbody>
           </table>`
        : '<div class="no-data">No link clicks were recorded for this campaign.</div>';

    return `
        <h2 class="section-heading">Link Clicks <span class="count">· ${r.links.length} link${r.links.length === 1 ? '' : 's'}</span></h2>
        <div class="panel"><div class="table-wrap">${body}</div></div>`;
}

function renderYouTube(r) {
    const yt = r.youtube;
    let body;
    if (!yt.links.length) {
        body = '<div class="no-data">No YouTube links (youtube.com, youtu.be, m.youtube.com) were clicked in this campaign.</div>';
    } else {
        body = `
            <div class="yt-summary">
                <div><div class="meta-label">YouTube total clicks</div><div class="meta-value">${formatNumber(yt.totalClicks)}</div></div>
                <div><div class="meta-label">YouTube unique clicks</div><div class="meta-value">${formatNumber(yt.uniqueClicks)}</div></div>
                <div><div class="meta-label">YouTube links clicked</div><div class="meta-value">${yt.links.length}</div></div>
            </div>
            <div class="table-wrap"><table>
                <thead><tr>
                    <th>YouTube URL</th>
                    <th class="num">Total clicks</th>
                    <th class="num">Unique clicks</th>
                </tr></thead>
                <tbody>${yt.links.map(l => `
                    <tr>
                        ${linkCell({ ...l, isYouTube: false })}
                        <td class="num">${formatNumber(l.totalClicks)}</td>
                        <td class="num">${formatNumber(l.uniqueClicks)}</td>
                    </tr>`).join('')}
                </tbody>
                <tfoot><tr>
                    <td>Combined YouTube total</td>
                    <td class="num">${formatNumber(yt.totalClicks)}</td>
                    <td class="num">${formatNumber(yt.uniqueClicks)}</td>
                </tr></tfoot>
            </table></div>
            ${yt.links.length > 1 ? '<div class="footnote">Combined unique clicks add up each link’s unique clicks, so someone who clicked two different YouTube links counts twice.</div>' : ''}`;
    }

    return `
        <h2 class="section-heading youtube">YouTube Links</h2>
        <div class="panel">${body}</div>`;
}

function renderReport(r, badge) {
    const meta = [
        ['Sent (Pacific)', escapeHtml(r.sendTime.pacificDisplay), escapeHtml(r.sendTime.utcDisplay)],
        ['Audience', escapeHtml(r.audience || '—'), null],
        ['Segment', r.segmentText ? escapeHtml(r.segmentText) : '<span class="muted">Entire audience</span>', null],
        ['Campaign ID', escapeHtml(r.id), null]
    ];

    return `
        <section class="report">
            <div class="report-head">
                ${badge ? `<span class="report-badge">${escapeHtml(badge)}</span>` : ''}
                <div class="report-title">${escapeHtml(r.title)}</div>
                <div class="report-subject">${r.subjectLine ? escapeHtml(r.subjectLine) : '<span class="muted">No subject line</span>'}</div>
                <div class="report-preview">${r.previewText ? escapeHtml(r.previewText) : 'No preview text'}</div>
                <div class="meta-grid">${meta.map(([label, value, secondary]) => `
                    <div>
                        <div class="meta-label">${label}</div>
                        <div class="meta-value">${value}</div>
                        ${secondary ? `<div class="meta-value secondary">${secondary}</div>` : ''}
                    </div>`).join('')}
                </div>
            </div>
            ${renderMetrics(r)}
            ${renderLinksTable(r)}
            ${renderYouTube(r)}
        </section>`;
}

// ---------- Rendering: comparison ----------

function compareRows(a, b) {
    return [
        { label: 'Emails sent',           a: a.emailsSent,           b: b.emailsSent },
        { label: 'Total opens',           a: a.opens.total,          b: b.opens.total },
        { label: 'Unique opens',          a: a.opens.unique,         b: b.opens.unique },
        { label: 'Open rate',             a: a.opens.rate,           b: b.opens.rate, rate: true },
        { label: 'Total clicks',          a: a.clicks.total,         b: b.clicks.total },
        { label: 'Unique clicks',         a: a.clicks.unique,        b: b.clicks.unique },
        { label: 'Click rate',            a: a.clicks.rate,          b: b.clicks.rate, rate: true },
        { label: 'YouTube total clicks',  a: a.youtube.totalClicks,  b: b.youtube.totalClicks },
        { label: 'YouTube unique clicks', a: a.youtube.uniqueClicks, b: b.youtube.uniqueClicks },
        { label: 'Hard bounces',          a: a.bounces.hard,         b: b.bounces.hard, lowerIsBetter: true },
        { label: 'Soft bounces',          a: a.bounces.soft,         b: b.bounces.soft, lowerIsBetter: true },
        { label: 'Unsubscribes',          a: a.unsubscribes,         b: b.unsubscribes, lowerIsBetter: true },
    ];
}

// Change of B relative to A: counts as "+N (+x.xx%)", rates in percentage points.
function formatDelta(row) {
    const diff = row.b - row.a;
    if (diff === 0) return { text: 'No change', cls: 'delta-flat' };

    const good = row.lowerIsBetter ? diff < 0 : diff > 0;
    const cls = good ? 'delta-up' : 'delta-down';
    const sign = diff > 0 ? '+' : '−';

    if (row.rate) {
        return { text: `${sign}${Math.abs(diff * 100).toFixed(2)} pts`, cls };
    }
    const pct = row.a ? ` (${sign}${Math.abs(diff / row.a * 100).toFixed(2)}%)` : '';
    return { text: `${sign}${formatNumber(Math.abs(diff))}${pct}`, cls };
}

function renderComparison(a, b) {
    const fmt = row => v => row.rate ? formatPercent(v) : formatNumber(v);
    return `
        <h2 class="section-heading">Side-by-Side Comparison</h2>
        <div class="panel" style="margin-bottom:48px;">
            <div class="table-wrap"><table>
                <thead><tr>
                    <th>Metric</th>
                    <th class="num">A<span class="compare-col-title">${escapeHtml(a.title)}</span></th>
                    <th class="num">B<span class="compare-col-title">${escapeHtml(b.title)}</span></th>
                    <th class="num">Change (B vs A)</th>
                </tr></thead>
                <tbody>${compareRows(a, b).map(row => {
                    const delta = formatDelta(row);
                    return `
                    <tr>
                        <td class="campaign-title">${row.label}</td>
                        <td class="num">${fmt(row)(row.a)}</td>
                        <td class="num">${fmt(row)(row.b)}</td>
                        <td class="num ${delta.cls}">${delta.text}</td>
                    </tr>`;
                }).join('')}
                </tbody>
            </table></div>
            <div class="footnote">A sent ${escapeHtml(a.sendTime.pacificDisplay)} · B sent ${escapeHtml(b.sendTime.pacificDisplay)}. Rate changes are in percentage points.</div>
        </div>`;
}

// ---------- Rendering: candidates ----------

function renderCandidates(slot, query, result) {
    const which = slot === 'compare' ? 'the “Compare with” title' : 'your search';
    const reason = result.matchType === 'exact'
        ? `${result.candidates.length} campaigns share the exact title “${escapeHtml(query)}”.`
        : `No exact title match. ${result.candidates.length} campaigns contain “${escapeHtml(query)}”.`;

    $('candidates').innerHTML = `
        <div class="panel">
            <div class="panel-header">
                <h2>Which campaign did you mean?</h2>
                <p>${reason} Pick one for ${which}.</p>
            </div>
            <div class="table-wrap"><table>
                <thead><tr><th>Title</th><th>Subject line</th><th>Sent (Pacific)</th><th>ID</th><th></th></tr></thead>
                <tbody>${result.candidates.map(c => `
                    <tr>
                        <td class="campaign-title">${escapeHtml(c.title)}</td>
                        <td>${escapeHtml(c.subjectLine)}</td>
                        <td class="muted" style="white-space:nowrap;">${escapeHtml(c.sendTime.pacificDisplay)}</td>
                        <td class="muted">${escapeHtml(c.id)}</td>
                        <td class="num"><button type="button" class="pick-btn" data-slot="${slot}" data-id="${escapeHtml(c.id)}">View report</button></td>
                    </tr>`).join('')}
                </tbody>
            </table></div>
        </div>`;
}

// ---------- Main flow ----------

function setBusy(busy, text) {
    $('loading').style.display = busy ? 'block' : 'none';
    $('loadingText').textContent = text || 'Loading campaign report...';
    $('runBtn').disabled = busy;
    $('runBtn').textContent = busy ? 'Loading...' : 'Run Report';
    $('latestBtn').disabled = busy;
    $('csvBtn').disabled = busy || !currentResult;
    $('jsonBtn').disabled = busy || !currentResult;
}

function showError(message) {
    $('error').innerHTML = `<strong>Couldn’t load the report:</strong> ${escapeHtml(message)}`;
    $('error').style.display = 'block';
}

function syncUrl(mode, query, compareQuery) {
    const params = new URLSearchParams({ mode, q: query });
    if (compareQuery) params.set('compare', compareQuery);
    history.replaceState(null, '', `${location.pathname}?${params}`);
}

async function runReport() {
    const mode = $('mode').value;
    const query = $('query').value.trim();
    const compareQuery = mode === 'date' ? '' : $('compareQuery').value.trim();

    $('error').style.display = 'none';
    $('candidates').innerHTML = '';

    if (!query) {
        showError(mode === 'date' ? 'Please choose a send date.' : `Please enter a ${MODE_LABELS[mode].label.toLowerCase()}.`);
        return;
    }

    syncUrl(mode, query, compareQuery);
    setBusy(true, mode === 'date' ? `Finding campaigns sent on ${query}...` : 'Loading campaign report...');

    try {
        const primary = picked.primary
            ? await fetchReport('id', picked.primary)
            : await fetchReport(mode, query);

        if (primary.candidates) {
            clearResults();
            renderCandidates('primary', query, primary);
            return;
        }

        let compareReport = null;
        if (compareQuery) {
            setBusy(true, 'Loading comparison campaign...');
            const other = picked.compare
                ? await fetchReport('id', picked.compare)
                : await fetchReport('title', compareQuery);
            if (other.candidates) {
                clearResults();
                renderCandidates('compare', compareQuery, other);
                return;
            }
            compareReport = other.reports[0];
        }

        currentResult = { account: primary.account, reports: primary.reports, compare: compareReport };
        renderResults();
    } catch (err) {
        showError(err.message);
    } finally {
        setBusy(false);
    }
}

// Default view: the most recent Sunday recap, Tuesday resend and Friday invite.
async function runLatest() {
    $('error').style.display = 'none';
    $('candidates').innerHTML = '';
    history.replaceState(null, '', location.pathname);
    setBusy(true, 'Loading the latest Sunday, Tuesday and Friday emails...');

    try {
        const data = await fetchReport('latest', '');
        currentResult = { account: data.account, reports: data.reports, compare: null, labels: data.labels, missing: data.missing };
        renderResults();
    } catch (err) {
        clearResults();
        showError(err.message);
    } finally {
        setBusy(false);
    }
}

function clearResults() {
    currentResult = null;
    $('results').innerHTML = '';
    $('status').textContent = '';
}

function renderResults() {
    const { reports, compare, account, labels, missing } = currentResult;
    let html = '';

    if (missing?.length) {
        html += `<div class="empty-state" style="margin-bottom:24px;padding:16px 24px;">No ${escapeHtml(missing.join(' or ').toLowerCase())} was sent in the last 3 weeks.</div>`;
    }

    if (labels) {
        html += reports.map((r, i) => renderReport(r, labels[i])).join('');
    } else if (compare) {
        html += renderComparison(reports[0], compare);
        html += renderReport(reports[0], 'Campaign A');
        html += renderReport(compare, 'Campaign B');
    } else {
        html += reports.map((r, i) => renderReport(r, reports.length > 1 ? `Campaign ${i + 1} of ${reports.length}` : '')).join('');
    }

    $('results').innerHTML = html;

    const count = reports.length + (compare ? 1 : 0);
    const what = labels ? 'latest weekly emails' : `${count} campaign${count === 1 ? '' : 's'}`;
    $('status').textContent = `${account} · ${what} · loaded ${new Date().toLocaleTimeString()}`;
}

// ---------- Downloads ----------

function csvCell(value) {
    const s = String(value ?? '');
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function reportToCsvRows(r, label) {
    const rows = [
        [label],
        ['Campaign title', r.title],
        ['Subject line', r.subjectLine],
        ['Preview text', r.previewText],
        ['Sent (Pacific)', r.sendTime.pacificDisplay],
        ['Sent (UTC)', r.sendTime.utcDisplay],
        ['Audience', r.audience],
        ['Segment', r.segmentText || 'Entire audience'],
        ['Campaign ID', r.id],
        ['Emails sent', r.emailsSent],
        ['Total opens', r.opens.total],
        ['Unique opens', r.opens.unique],
        ['Open rate', formatPercent(r.opens.rate)],
        ['Total clicks', r.clicks.total],
        ['Unique clicks', r.clicks.unique],
        ['Click rate', formatPercent(r.clicks.rate)],
        ['Hard bounces', r.bounces.hard],
        ['Soft bounces', r.bounces.soft],
        ['Unsubscribes', r.unsubscribes],
        [],
        ['URL', 'Total clicks', 'Unique clicks', '% of clicks', '% of unique clicks', 'YouTube'],
        ...r.links.map(l => [l.url, l.totalClicks, l.uniqueClicks, formatPercent(l.shareOfClicks), formatPercent(l.shareOfUniqueClicks), l.isYouTube ? 'Yes' : '']),
        [],
        ['YouTube total clicks', r.youtube.totalClicks],
        ['YouTube unique clicks', r.youtube.uniqueClicks],
        [], []
    ];
    return rows;
}

function download(filename, content, type) {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 100);
}

function fileBaseName() {
    if (currentResult.labels) return `campaign-report-latest-weekly-${new Date().toISOString().slice(0, 10)}`;
    const first = currentResult.reports[0];
    const slug = (first.title || first.id).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60);
    return `campaign-report-${slug || first.id}`;
}

function downloadCsv() {
    if (!currentResult) return;
    const { reports, compare, labels } = currentResult;
    let rows = [];

    if (compare) {
        rows.push(['Comparison', 'A: ' + reports[0].title, 'B: ' + compare.title, 'Change (B vs A)']);
        for (const row of compareRows(reports[0], compare)) {
            const fmt = v => row.rate ? formatPercent(v) : v;
            rows.push([row.label, fmt(row.a), fmt(row.b), formatDelta(row).text.replace('−', '-')]);
        }
        rows.push([], []);
        rows = rows.concat(reportToCsvRows(reports[0], 'Campaign A'), reportToCsvRows(compare, 'Campaign B'));
    } else {
        reports.forEach((r, i) => { rows = rows.concat(reportToCsvRows(r, labels ? labels[i] : `Campaign ${i + 1}`)); });
    }

    const csv = rows.map(r => r.map(csvCell).join(',')).join('\n');
    download(`${fileBaseName()}.csv`, csv, 'text/csv');
}

function downloadJson() {
    if (!currentResult) return;
    download(`${fileBaseName()}.json`, JSON.stringify(currentResult, null, 2), 'application/json');
}

// ---------- Wiring ----------

function applyMode() {
    const mode = $('mode').value;
    const { label, placeholder } = MODE_LABELS[mode];
    const input = $('query');

    $('queryLabel').textContent = label;
    if (mode === 'date') {
        if (input.type !== 'date') input.value = '';
        input.type = 'date';
    } else {
        if (input.type === 'date') input.value = '';
        input.type = 'text';
    }
    input.placeholder = placeholder;
    $('compareQuery').disabled = mode === 'date';
    $('compareField').title = mode === 'date' ? 'Comparison is available when searching by title or ID' : '';
}

document.addEventListener('DOMContentLoaded', () => {
    $('mode').addEventListener('change', () => { picked.primary = null; picked.compare = null; applyMode(); });
    $('query').addEventListener('input', () => { picked.primary = null; });
    $('compareQuery').addEventListener('input', () => { picked.compare = null; });

    $('reportForm').addEventListener('submit', e => { e.preventDefault(); runReport(); });
    $('latestBtn').addEventListener('click', runLatest);
    $('csvBtn').addEventListener('click', downloadCsv);
    $('jsonBtn').addEventListener('click', downloadJson);

    $('candidates').addEventListener('click', e => {
        const btn = e.target.closest('.pick-btn');
        if (!btn) return;
        picked[btn.dataset.slot] = btn.dataset.id;
        runReport();
    });

    // Shareable links: report.html?mode=title&q=...&compare=...
    const params = new URLSearchParams(location.search);
    if (MODE_LABELS[params.get('mode')]) $('mode').value = params.get('mode');
    applyMode();
    if (params.get('q')) $('query').value = params.get('q');
    if (params.get('compare')) $('compareQuery').value = params.get('compare');
    if (params.get('q')) runReport();
    else runLatest();
});
