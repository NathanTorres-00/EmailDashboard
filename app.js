let openRateChartInstance = null;
let clickRateChartInstance = null;
let currentCampaignsData = null;
let currentTabIndex = 0;
const campaignsCache = {};

// Audience tabs — matched to Mailchimp lists by name at runtime
const AUDIENCE_TABS = [
    { label: 'Jesus Disciple App',              matchKey: 'jesus disciple app',  listId: null, memberCount: null },
    { label: 'The Rock Network | Group Leaders', matchKey: 'group leader',        listId: null, memberCount: null },
    { label: 'JD Networks [ERYNE]',             matchKey: 'eryne',               listId: null, memberCount: null },
    { label: 'JDU Interest',                    matchKey: 'jdu interest',        listId: null, memberCount: null },
];

const BENCHMARKS = {
    marketing: { label: 'Marketing Avg', openRate: 21.33, clickRate: 2.62, color: '#a78bfa' },
    corporate: { label: 'Corporate Avg', openRate: 22.0,  clickRate: 3.0,  color: '#fb923c' },
    church:    { label: 'Church Avg',    openRate: 27.0,  clickRate: 2.8,  color: '#f59e0b' },
};

// Fetch all Mailchimp audience lists for account 1
async function fetchAudienceLists() {
    const response = await fetch('/api/lists', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ account: '1' })
    });
    if (!response.ok) throw new Error('Failed to fetch audience lists');
    const data = await response.json();
    return data.lists || [];
}

// Match fetched lists to AUDIENCE_TABS by name (case-insensitive substring)
function matchListsToTabs(lists) {
    for (const tab of AUDIENCE_TABS) {
        const match = lists.find(l => l.name.toLowerCase().includes(tab.matchKey.toLowerCase()));
        if (match) {
            tab.listId = match.id;
            tab.memberCount = match.memberCount;
        }
    }
}

// Render the tab nav from AUDIENCE_TABS
function renderTabs() {
    const nav = document.querySelector('.tab-nav');
    nav.innerHTML = AUDIENCE_TABS.map((tab, i) => `
        <button class="tab-btn${i === currentTabIndex ? ' active' : ''}"
                onclick="switchTab(${i})"
                ${!tab.listId ? 'disabled title="Audience not found in Mailchimp"' : ''}>
            <span class="tab-label">${tab.label}</span>
            ${tab.memberCount != null ? `<span class="tab-count">${formatNumber(tab.memberCount)} subscribers</span>` : ''}
        </button>
    `).join('');
}

// Fetch campaign data from our serverless API proxy
async function fetchMailchimpData(days = 30, listId = null) {
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const response = await fetch('/api/campaigns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            days,
            startDate: startDate.toISOString(),
            endDate: endDate.toISOString(),
            account: '1',
            listId
        })
    });

    if (!response.ok) throw new Error('Failed to fetch campaign data');
    return response.json();
}

function formatNumber(num) {
    return num.toLocaleString();
}

function formatPercent(num) {
    return (num * 100).toFixed(2) + '%';
}

function formatDate(dateString) {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
}

function calculateTotals(campaigns) {
    const totals = {
        totalSent: 0,
        totalOpens: 0,
        totalUniqueOpens: 0,
        totalClicks: 0,
        totalUniqueClicks: 0,
        totalUnsubscribed: 0,
        totalAbuse: 0,
        totalForwards: 0
    };

    campaigns.forEach(campaign => {
        totals.totalSent += campaign.emails_sent || 0;
        totals.totalOpens += campaign.opens?.opens_total || 0;
        totals.totalUniqueOpens += campaign.opens?.unique_opens || 0;
        totals.totalClicks += campaign.clicks?.clicks_total || 0;
        totals.totalUniqueClicks += campaign.clicks?.unique_clicks || 0;
        totals.totalUnsubscribed += campaign.unsubscribed || 0;
        totals.totalAbuse += campaign.abuse_reports || 0;
        totals.totalForwards += campaign.forwards?.forwards_count || 0;
    });

    totals.avgOpenRate = totals.totalSent > 0
        ? totals.totalUniqueOpens / totals.totalSent
        : 0;
    totals.avgClickRate = totals.totalSent > 0
        ? totals.totalUniqueClicks / totals.totalSent
        : 0;
    totals.campaignCount = campaigns.length;

    return totals;
}

function renderStats(totals) {
    const statsGrid = document.getElementById('statsGrid');

    const count = totals.campaignCount || 0;
    const countLabel = `From ${count} campaign${count !== 1 ? 's' : ''}`;
    const memberCount = AUDIENCE_TABS[currentTabIndex]?.memberCount;

    // Church benchmark context badges
    function benchBadge(yours, industry) {
        const diff = (yours * 100) - industry;
        const sign = diff >= 0 ? '+' : '';
        const cls = diff >= 0 ? 'bench-positive' : 'bench-negative';
        return `<span class="bench-badge ${cls}">${sign}${diff.toFixed(1)}pp vs church avg</span>`;
    }
    const openBadge = totals.totalSent > 0 ? benchBadge(totals.avgOpenRate, BENCHMARKS.church.openRate) : '';
    const clickBadge = totals.totalSent > 0 ? benchBadge(totals.avgClickRate, BENCHMARKS.church.clickRate) : '';

    const stats = [
        {
            title: 'Audience Size',
            value: memberCount != null ? formatNumber(memberCount) : '—',
            subvalue: 'Active subscribers',
            tintBg: 'rgba(251, 146, 60, 0.03)',
            tintBorder: 'rgba(251, 146, 60, 0.12)',
            accentColor: '#fb923c'
        },
        {
            title: 'Total Emails Sent',
            value: formatNumber(totals.totalSent),
            subvalue: countLabel,
            tintBg: 'rgba(34, 211, 238, 0.03)',
            tintBorder: 'rgba(34, 211, 238, 0.12)',
            accentColor: '#22d3ee'
        },
        {
            title: 'Average Open Rate',
            value: formatPercent(totals.avgOpenRate),
            subvalue: `${formatNumber(totals.totalUniqueOpens)} unique opens${openBadge ? ' · ' + openBadge : ''}`,
            tintBg: 'rgba(74, 222, 128, 0.03)',
            tintBorder: 'rgba(74, 222, 128, 0.12)',
            accentColor: '#4ade80'
        },
        {
            title: 'Average Click Rate',
            value: formatPercent(totals.avgClickRate),
            subvalue: `${formatNumber(totals.totalUniqueClicks)} unique clicks${clickBadge ? ' · ' + clickBadge : ''}`,
            tintBg: 'rgba(167, 139, 250, 0.03)',
            tintBorder: 'rgba(167, 139, 250, 0.12)',
            accentColor: '#a78bfa'
        },
        {
            title: 'Total Unsubscribed',
            value: formatNumber(totals.totalUnsubscribed),
            subvalue: countLabel,
            tintBg: 'rgba(248, 113, 113, 0.03)',
            tintBorder: 'rgba(248, 113, 113, 0.12)',
            accentColor: '#f87171'
        }
    ];

    statsGrid.innerHTML = stats.map(stat => `
        <div class="stat-card" style="background: ${stat.tintBg}; border-color: ${stat.tintBorder};">
            <div class="stat-card-accent" style="background: ${stat.accentColor};"></div>
            <h3>${stat.title}</h3>
            <div class="value">${stat.value}</div>
            <div class="subvalue" style="line-height:1.8;">${stat.subvalue}</div>
        </div>
    `).join('');
}

function renderCampaignsTable(campaigns) {
    const tbody = document.getElementById('campaignsBody');

    if (campaigns.length === 0) {
        tbody.innerHTML = '<tr><td colspan="8" class="no-data">No campaigns found in this time period</td></tr>';
        return;
    }

    // Church benchmark thresholds for color coding
    const OPEN_GOOD = 0.27, OPEN_POOR = 0.21;
    const CLICK_GOOD = 0.028, CLICK_POOR = 0.020;

    tbody.innerHTML = campaigns.map(campaign => {
        const openRate = campaign.opens?.open_rate || 0;
        const clickRate = campaign.clicks?.click_rate || 0;
        const openClass = openRate >= OPEN_GOOD ? 'rate-good' : openRate < OPEN_POOR ? 'rate-poor' : 'rate-mid';
        const clickClass = clickRate >= CLICK_GOOD ? 'rate-good' : clickRate < CLICK_POOR ? 'rate-poor' : 'rate-mid';
        return `
        <tr>
            <td class="campaign-title">${campaign.settings?.subject_line || campaign.settings?.title || 'Untitled'}</td>
            <td class="date">${formatDate(campaign.send_time)}</td>
            <td>${formatNumber(campaign.emails_sent || 0)}</td>
            <td>${formatNumber(campaign.opens?.unique_opens || 0)}</td>
            <td><span class="${openClass}">${formatPercent(openRate)}</span></td>
            <td>${formatNumber(campaign.clicks?.unique_clicks || 0)}</td>
            <td><span class="${clickClass}">${formatPercent(clickRate)}</span></td>
            <td>${formatNumber(campaign.unsubscribed || 0)}</td>
        </tr>`;
    }).join('');
}

function renderCharts(campaigns) {
    const sorted = [...campaigns].sort((a, b) => new Date(a.send_time) - new Date(b.send_time));

    const openRateData = sorted.map(c => ({
        x: new Date(c.send_time),
        y: +((c.opens?.open_rate || 0) * 100).toFixed(2)
    }));
    const clickRateData = sorted.map(c => ({
        x: new Date(c.send_time),
        y: +((c.clicks?.click_rate || 0) * 100).toFixed(2)
    }));

    // Determine x-axis bounds for benchmark lines
    const now = new Date();
    const dateRangeDays = parseInt(document.getElementById('dateRange').value) || 30;
    const xMin = sorted.length ? new Date(sorted[0].send_time) : new Date(now - dateRangeDays * 86400000);
    const xMax = sorted.length ? new Date(sorted[sorted.length - 1].send_time) : now;

    function benchmarkDatasets(rateKey) {
        return Object.values(BENCHMARKS).map(b => ({
            label: b.label,
            data: [{ x: xMin, y: b[rateKey] }, { x: xMax, y: b[rateKey] }],
            borderColor: b.color,
            borderWidth: 1.5,
            borderDash: [6, 3],
            pointRadius: 0,
            pointHoverRadius: 0,
            fill: false,
            tension: 0
        }));
    }

    const sharedOptions = {
        responsive: true,
        maintainAspectRatio: true,
        aspectRatio: 2,
        interaction: { mode: 'index', intersect: false },
        plugins: {
            legend: {
                display: true,
                position: 'bottom',
                labels: {
                    color: '#71717a',
                    font: { size: 11 },
                    boxWidth: 20,
                    padding: 12,
                    filter: item => item.datasetIndex > 0
                }
            },
            tooltip: {
                backgroundColor: '#16161a',
                borderColor: '#27272a',
                borderWidth: 1,
                titleColor: '#fafafa',
                bodyColor: '#a1a1aa',
                padding: 12,
                filter: item => item.datasetIndex === 0,
                callbacks: {
                    title: ctx => {
                        const name = sorted[ctx[0].dataIndex]?.settings?.subject_line
                            || sorted[ctx[0].dataIndex]?.settings?.title
                            || 'Untitled';
                        return name.length > 40 ? name.slice(0, 40) + '…' : name;
                    },
                    label: ctx => ` ${ctx.parsed.y.toFixed(2)}%`
                }
            }
        },
        scales: {
            x: {
                type: 'time',
                time: {
                    tooltipFormat: 'MMM d, yyyy',
                    displayFormats: { day: 'MMM d', week: 'MMM d', month: 'MMM yyyy' }
                },
                ticks: { color: '#71717a', font: { size: 11 }, maxRotation: 0, maxTicksLimit: 8 },
                grid: { color: '#27272a' }
            },
            y: {
                ticks: {
                    color: '#71717a',
                    font: { size: 11 },
                    callback: v => v + '%'
                },
                grid: { color: '#27272a' }
            }
        }
    };

    if (openRateChartInstance) openRateChartInstance.destroy();
    openRateChartInstance = new Chart(document.getElementById('openRateChart'), {
        type: 'line',
        data: {
            datasets: [
                {
                    label: 'Your Data',
                    data: openRateData,
                    borderColor: '#22d3ee',
                    backgroundColor: 'rgba(34, 211, 238, 0.08)',
                    borderWidth: 2,
                    pointRadius: 2,
                    pointHoverRadius: 4,
                    pointBackgroundColor: '#22d3ee',
                    tension: 0.3,
                    fill: true
                },
                ...benchmarkDatasets('openRate')
            ]
        },
        options: sharedOptions
    });

    if (clickRateChartInstance) clickRateChartInstance.destroy();
    clickRateChartInstance = new Chart(document.getElementById('clickRateChart'), {
        type: 'line',
        data: {
            datasets: [
                {
                    label: 'Your Data',
                    data: clickRateData,
                    borderColor: '#4ade80',
                    backgroundColor: 'rgba(74, 222, 128, 0.08)',
                    borderWidth: 2,
                    pointRadius: 2,
                    pointHoverRadius: 4,
                    pointBackgroundColor: '#4ade80',
                    tension: 0.3,
                    fill: true
                },
                ...benchmarkDatasets('clickRate')
            ]
        },
        options: sharedOptions
    });
}

function renderHighlights(campaigns) {
    if (!campaigns.length) {
        document.getElementById('bestCampaign').innerHTML = '<p style="color:var(--text-muted);font-size:13px;">No data</p>';
        document.getElementById('worstCampaign').innerHTML = '<p style="color:var(--text-muted);font-size:13px;">No data</p>';
        return;
    }

    const best = campaigns.reduce((a, b) => (b.opens?.open_rate || 0) > (a.opens?.open_rate || 0) ? b : a);
    const worst = campaigns.reduce((a, b) => (b.opens?.open_rate || 0) < (a.opens?.open_rate || 0) ? b : a);

    function buildCard(campaign, label) {
        const name = campaign.settings?.subject_line || campaign.settings?.title || 'Untitled';
        return `
            <div class="highlight-badge">${label}</div>
            <div class="highlight-name">${name}</div>
            <div class="highlight-metrics">
                <div class="highlight-metric">
                    <span class="highlight-metric-label">Open Rate</span>
                    <span class="highlight-metric-value primary">${formatPercent(campaign.opens?.open_rate || 0)}</span>
                </div>
                <div class="highlight-metric">
                    <span class="highlight-metric-label">Click Rate</span>
                    <span class="highlight-metric-value secondary">${formatPercent(campaign.clicks?.click_rate || 0)}</span>
                </div>
                <div class="highlight-metric">
                    <span class="highlight-metric-label">Sent</span>
                    <span class="highlight-metric-value secondary">${formatNumber(campaign.emails_sent || 0)}</span>
                </div>
            </div>
            <div class="highlight-date">${formatDate(campaign.send_time)}</div>
        `;
    }

    document.getElementById('bestCampaign').innerHTML = buildCard(best, 'Best Campaign');
    document.getElementById('worstCampaign').innerHTML = buildCard(worst, 'Worst Campaign');
}

function renderBenchmarks(campaigns) {
    const section = document.getElementById('benchmarksSection');

    if (!campaigns.length) {
        section.innerHTML = Object.values(BENCHMARKS).map(b => `
            <div class="benchmark-card" style="border-top-color:${b.color}">
                <div class="benchmark-label" style="color:${b.color}">${b.label}</div>
                <p style="color:var(--text-muted);font-size:13px;margin-top:12px;">No data</p>
            </div>
        `).join('');
        return;
    }

    const totalSent = campaigns.reduce((s, c) => s + (c.emails_sent || 0), 0);
    const avgOpenRate = totalSent > 0
        ? (campaigns.reduce((s, c) => s + (c.opens?.unique_opens || 0), 0) / totalSent) * 100
        : 0;
    const avgClickRate = totalSent > 0
        ? (campaigns.reduce((s, c) => s + (c.clicks?.unique_clicks || 0), 0) / totalSent) * 100
        : 0;

    function diffBadge(yours, industry) {
        const diff = yours - industry;
        const sign = diff >= 0 ? '+' : '';
        const arrow = diff >= 0 ? '↑' : '↓';
        const cls = diff >= 0 ? 'benchmark-diff-positive' : 'benchmark-diff-negative';
        return `<span class="benchmark-diff ${cls}">${sign}${diff.toFixed(2)}% ${arrow} vs industry</span>`;
    }

    function progressBar(yours, industry, color) {
        // Scale: industry avg = 75% of track width, so bars > industry can show overage
        const pct = industry > 0 ? Math.min((yours / industry) * 75, 100) : 0;
        const markLeft = 75; // industry mark always at 75%
        return `
            <div class="benchmark-bar-track">
                <div class="benchmark-bar-fill" style="width:${pct}%;background:${color};"></div>
                <div class="benchmark-bar-mark" style="left:${markLeft}%;"></div>
            </div>`;
    }

    section.innerHTML = Object.values(BENCHMARKS).map(b => `
        <div class="benchmark-card" style="border-top-color:${b.color}">
            <div class="benchmark-label" style="color:${b.color}">${b.label}</div>
            <div class="benchmark-metric-block">
                <div class="benchmark-metric-name">Open Rate</div>
                <div class="benchmark-yours-row">
                    <span class="benchmark-yours">${avgOpenRate.toFixed(2)}%</span>
                    ${diffBadge(avgOpenRate, b.openRate)}
                </div>
                <div class="benchmark-industry-line">Industry avg: ${b.openRate.toFixed(2)}%</div>
                ${progressBar(avgOpenRate, b.openRate, b.color)}
            </div>
            <div class="benchmark-divider"></div>
            <div class="benchmark-metric-block">
                <div class="benchmark-metric-name">Click Rate</div>
                <div class="benchmark-yours-row">
                    <span class="benchmark-yours">${avgClickRate.toFixed(2)}%</span>
                    ${diffBadge(avgClickRate, b.clickRate)}
                </div>
                <div class="benchmark-industry-line">Industry avg: ${b.clickRate.toFixed(2)}%</div>
                ${progressBar(avgClickRate, b.clickRate, b.color)}
            </div>
        </div>
    `).join('');
}

function renderPeriodSummary(campaigns) {
    const el = document.getElementById('periodSummary');
    const days = parseInt(document.getElementById('dateRange').value) || 30;
    const labels = { 7: 'Last 7 Days', 14: 'Last 14 Days', 30: 'Last 30 Days', 90: 'Last 90 Days' };
    const periodLabel = labels[days] || `Last ${days} Days`;

    const end = new Date();
    const start = new Date(end - days * 86400000);
    const fmt = d => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    const fmtFull = d => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    const dateRange = `${fmt(start)} – ${fmtFull(end)}`;

    if (!campaigns.length) {
        el.style.display = 'none';
        return;
    }

    const totals = calculateTotals(campaigns);
    el.style.display = 'flex';
    el.innerHTML = `
        <span class="period-label">${periodLabel}</span>
        <span class="period-dot">·</span>
        <span style="color:var(--text-muted);font-size:12px;">${dateRange}</span>
        <span style="flex:1;"></span>
        <span class="period-stat">${totals.campaignCount} campaign${totals.campaignCount !== 1 ? 's' : ''}</span>
        <span class="period-stat"><strong>${formatNumber(totals.totalSent)}</strong> sent</span>
        <span class="period-stat"><strong>${formatPercent(totals.avgOpenRate)}</strong> open</span>
        <span class="period-stat"><strong>${formatPercent(totals.avgClickRate)}</strong> click</span>
    `;
}

function renderAll(campaigns) {
    if (!campaigns.length) {
        document.getElementById('periodSummary').style.display = 'none';
        renderCampaignsTable([]);
        renderStats({
            totalSent: 0, totalOpens: 0, totalUniqueOpens: 0,
            totalClicks: 0, totalUniqueClicks: 0, totalUnsubscribed: 0,
            avgOpenRate: 0, avgClickRate: 0, campaignCount: 0
        });
        renderCharts([]);
        renderBenchmarks([]);
        renderHighlights([]);
    } else {
        renderPeriodSummary(campaigns);
        renderStats(calculateTotals(campaigns));
        renderCampaignsTable(campaigns);
        renderCharts(campaigns);
        renderBenchmarks(campaigns);
        renderHighlights(campaigns);
    }
}

function switchTab(index) {
    currentTabIndex = index;
    const tab = AUDIENCE_TABS[index];
    currentCampaignsData = campaignsCache[tab.listId] || null;

    document.querySelectorAll('.tab-btn').forEach((btn, i) => {
        btn.classList.toggle('active', i === index);
    });

    if (tab.listId && campaignsCache[tab.listId]) {
        renderAll(campaignsCache[tab.listId]);
        document.getElementById('lastUpdated').textContent =
            `Last updated: ${new Date().toLocaleTimeString()}`;
    } else {
        loadDashboard();
    }
}

let listsInitialized = false;

async function loadDashboard() {
    const loading = document.getElementById('loading');
    const dashboard = document.getElementById('dashboard');
    const error = document.getElementById('error');
    const dateRangeSelect = document.getElementById('dateRange');
    const refreshButton = document.getElementById('refreshBtn');
    const downloadButton = document.getElementById('downloadBtn');
    const dateRange = dateRangeSelect.value;

    loading.style.display = 'block';
    dashboard.style.display = 'none';
    error.style.display = 'none';
    refreshButton.disabled = true;
    downloadButton.disabled = true;
    dateRangeSelect.disabled = true;
    refreshButton.innerHTML = 'Updating...';

    try {
        // On first load, resolve audience list IDs from Mailchimp
        if (!listsInitialized) {
            const lists = await fetchAudienceLists();
            matchListsToTabs(lists);
            listsInitialized = true;
            renderTabs();
        }

        const tab = AUDIENCE_TABS[currentTabIndex];
        if (!tab.listId) {
            throw new Error(`Audience "${tab.label}" was not found in Mailchimp. Check the list name.`);
        }

        const data = await fetchMailchimpData(parseInt(dateRange), tab.listId);

        currentCampaignsData = data.campaigns || [];
        campaignsCache[tab.listId] = currentCampaignsData;

        renderAll(currentCampaignsData);

        document.getElementById('lastUpdated').textContent =
            `Last updated: ${new Date().toLocaleTimeString()}`;

        // Update subtitle with reporting period
        const days = parseInt(dateRange);
        const end = new Date();
        const start = new Date(end - days * 86400000);
        const fmtOpt = { month: 'short', day: 'numeric' };
        const fmtOptYear = { month: 'short', day: 'numeric', year: 'numeric' };
        document.querySelector('.subtitle').textContent =
            `The Rock Church · ${start.toLocaleDateString('en-US', fmtOpt)} – ${end.toLocaleDateString('en-US', fmtOptYear)}`;

        loading.style.display = 'none';
        dashboard.style.display = 'block';
    } catch (err) {
        loading.style.display = 'none';
        error.style.display = 'block';
        error.innerHTML = `
            <strong>Error loading data:</strong> ${err.message}<br>
            <small>Please check your network connection and Mailchimp API credentials in Vercel.</small>
        `;
    } finally {
        refreshButton.disabled = false;
        downloadButton.disabled = !currentCampaignsData || currentCampaignsData.length === 0;
        dateRangeSelect.disabled = false;
        refreshButton.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-2px;margin-right:6px;"><polyline points="23 4 23 10 17 10"></polyline><polyline points="1 20 1 14 7 14"></polyline><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path></svg>Refresh Data';
    }
}

function downloadReport() {
    if (!currentCampaignsData || !currentCampaignsData.length) return;

    const headers = ['Campaign', 'Send Date', 'Emails Sent', 'Unique Opens', 'Open Rate', 'Unique Clicks', 'Click Rate', 'Unsubscribed'];

    const rows = currentCampaignsData.map(c => {
        const name = (c.settings?.subject_line || c.settings?.title || 'Untitled').replace(/"/g, '""');
        return [
            `"${name}"`,
            formatDate(c.send_time),
            c.emails_sent || 0,
            c.opens?.unique_opens || 0,
            formatPercent(c.opens?.open_rate || 0),
            c.clicks?.unique_clicks || 0,
            formatPercent(c.clicks?.click_rate || 0),
            c.unsubscribed || 0
        ];
    });

    const csv = [headers, ...rows].map(r => r.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `campaign-report-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 100);
}

// Load dashboard on page load
document.addEventListener('DOMContentLoaded', loadDashboard);
