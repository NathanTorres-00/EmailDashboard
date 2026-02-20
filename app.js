let openRateChartInstance = null;
let clickRateChartInstance = null;
let currentCampaignsData = null;
let currentAccount = 1;
const campaignsCache = {};

const BENCHMARKS = {
    marketing: { label: 'Marketing Avg', openRate: 21.33, clickRate: 2.62, color: '#a78bfa' },
    corporate: { label: 'Corporate Avg', openRate: 22.0,  clickRate: 3.0,  color: '#fb923c' },
    church:    { label: 'Church Avg',    openRate: 27.0,  clickRate: 2.8,  color: '#f59e0b' },
};

// Fetch campaign data from our serverless API proxy
async function fetchMailchimpData(days = 30) {
    try {
        // Calculate date range
        const endDate = new Date();
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - days);

        // We'll call our serverless function which will proxy the Mailchimp API
        const response = await fetch('/api/campaigns', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                days: days,
                startDate: startDate.toISOString(),
                endDate: endDate.toISOString(),
                account: String(currentAccount)
            })
        });

        if (!response.ok) {
            throw new Error('Failed to fetch campaign data');
        }

        const data = await response.json();
        return data;
    } catch (error) {
        console.error('Error fetching Mailchimp data:', error);
        throw error;
    }
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

    return totals;
}

function renderStats(totals) {
    const statsGrid = document.getElementById('statsGrid');

    const stats = [
        {
            title: 'Total Emails Sent',
            value: formatNumber(totals.totalSent),
            subvalue: 'Across all campaigns'
        },
        {
            title: 'Average Open Rate',
            value: formatPercent(totals.avgOpenRate),
            subvalue: `${formatNumber(totals.totalUniqueOpens)} unique opens`
        },
        {
            title: 'Average Click Rate',
            value: formatPercent(totals.avgClickRate),
            subvalue: `${formatNumber(totals.totalUniqueClicks)} unique clicks`
        },
        {
            title: 'Total Unsubscribed',
            value: formatNumber(totals.totalUnsubscribed),
            subvalue: 'Opt-outs'
        }
    ];

    statsGrid.innerHTML = stats.map(stat => `
        <div class="stat-card">
            <h3>${stat.title}</h3>
            <div class="value">${stat.value}</div>
            <div class="subvalue">${stat.subvalue}</div>
        </div>
    `).join('');
}

function renderCampaignsTable(campaigns) {
    const tbody = document.getElementById('campaignsBody');

    if (campaigns.length === 0) {
        tbody.innerHTML = '<tr><td colspan="8" class="no-data">No campaigns found in this time period</td></tr>';
        return;
    }

    tbody.innerHTML = campaigns.map(campaign => `
        <tr>
            <td class="campaign-title">${campaign.settings?.subject_line || campaign.settings?.title || 'Untitled'}</td>
            <td class="date">${formatDate(campaign.send_time)}</td>
            <td>${formatNumber(campaign.emails_sent || 0)}</td>
            <td>${formatNumber(campaign.opens?.unique_opens || 0)}</td>
            <td class="rate">${formatPercent(campaign.opens?.open_rate || 0)}</td>
            <td>${formatNumber(campaign.clicks?.unique_clicks || 0)}</td>
            <td class="rate">${formatPercent(campaign.clicks?.click_rate || 0)}</td>
            <td>${formatNumber(campaign.unsubscribed || 0)}</td>
        </tr>
    `).join('');
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
                    pointRadius: 4,
                    pointHoverRadius: 6,
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
                    pointRadius: 4,
                    pointHoverRadius: 6,
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

    function diffHTML(yours, industry) {
        const diff = yours - industry;
        const sign = diff >= 0 ? '+' : '';
        const arrow = diff >= 0 ? '↑' : '↓';
        const color = diff >= 0 ? 'var(--success)' : 'var(--error)';
        return `<span class="benchmark-diff" style="color:${color}">${sign}${diff.toFixed(2)}% ${arrow}</span>`;
    }

    section.innerHTML = Object.values(BENCHMARKS).map(b => `
        <div class="benchmark-card" style="border-top-color:${b.color}">
            <div class="benchmark-label" style="color:${b.color}">${b.label}</div>
            <div class="benchmark-row">
                <span class="benchmark-metric-name">Open Rate</span>
                <div class="benchmark-values">
                    <span class="benchmark-value">Industry: ${b.openRate.toFixed(2)}%</span>
                    <span class="benchmark-yours">${avgOpenRate.toFixed(2)}%</span>
                    ${diffHTML(avgOpenRate, b.openRate)}
                </div>
            </div>
            <div class="benchmark-row">
                <span class="benchmark-metric-name">Click Rate</span>
                <div class="benchmark-values">
                    <span class="benchmark-value">Industry: ${b.clickRate.toFixed(2)}%</span>
                    <span class="benchmark-yours">${avgClickRate.toFixed(2)}%</span>
                    ${diffHTML(avgClickRate, b.clickRate)}
                </div>
            </div>
        </div>
    `).join('');
}

function renderAll(campaigns) {
    if (!campaigns.length) {
        renderCampaignsTable([]);
        renderStats({
            totalSent: 0, totalOpens: 0, totalUniqueOpens: 0,
            totalClicks: 0, totalUniqueClicks: 0, totalUnsubscribed: 0,
            avgOpenRate: 0, avgClickRate: 0
        });
        renderCharts([]);
        renderBenchmarks([]);
        renderHighlights([]);
    } else {
        renderStats(calculateTotals(campaigns));
        renderCampaignsTable(campaigns);
        renderCharts(campaigns);
        renderBenchmarks(campaigns);
        renderHighlights(campaigns);
    }
}

function switchTab(accountNum) {
    currentAccount = accountNum;
    currentCampaignsData = campaignsCache[accountNum] || null;

    document.querySelectorAll('.tab-btn').forEach((btn, i) => {
        btn.classList.toggle('active', i + 1 === accountNum);
    });

    if (campaignsCache[accountNum]) {
        renderAll(campaignsCache[accountNum]);
        document.getElementById('lastUpdated').textContent =
            `Last updated: ${new Date().toLocaleTimeString()}`;
    } else {
        loadDashboard();
    }
}

async function loadDashboard() {
    const loading = document.getElementById('loading');
    const dashboard = document.getElementById('dashboard');
    const error = document.getElementById('error');
    const dateRangeSelect = document.getElementById('dateRange');
    const refreshButton = document.getElementById('refreshBtn');
    const downloadButton = document.getElementById('downloadBtn');
    const dateRange = dateRangeSelect.value;

    // Show loading and disable controls
    loading.style.display = 'block';
    dashboard.style.display = 'none';
    error.style.display = 'none';
    refreshButton.disabled = true;
    downloadButton.disabled = true;
    dateRangeSelect.disabled = true;
    refreshButton.textContent = 'Updating...';

    try {
        const data = await fetchMailchimpData(parseInt(dateRange));

        currentCampaignsData = data.campaigns || [];
        campaignsCache[currentAccount] = currentCampaignsData;

        renderAll(currentCampaignsData);

        // Update last updated time
        document.getElementById('lastUpdated').textContent =
            `Last updated: ${new Date().toLocaleTimeString()}`;

        // Show dashboard
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
        refreshButton.textContent = 'Refresh Data';
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
    a.click();
    URL.revokeObjectURL(url);
}

// Load dashboard on page load
document.addEventListener('DOMContentLoaded', loadDashboard);
