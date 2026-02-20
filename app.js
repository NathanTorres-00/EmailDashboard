let openRateChartInstance = null;
let clickRateChartInstance = null;

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
                endDate: endDate.toISOString()
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

    const labels = sorted.map(c => {
        const name = c.settings?.subject_line || c.settings?.title || 'Untitled';
        return name.length > 22 ? name.slice(0, 22) + '…' : name;
    });
    const openRates = sorted.map(c => +((c.opens?.open_rate || 0) * 100).toFixed(2));
    const clickRates = sorted.map(c => +((c.clicks?.click_rate || 0) * 100).toFixed(2));

    const sharedOptions = {
        responsive: true,
        maintainAspectRatio: true,
        aspectRatio: 2,
        interaction: { mode: 'index', intersect: false },
        plugins: {
            legend: { display: false },
            tooltip: {
                backgroundColor: '#16161a',
                borderColor: '#27272a',
                borderWidth: 1,
                titleColor: '#a1a1aa',
                bodyColor: '#fafafa',
                padding: 12,
                callbacks: {
                    label: ctx => ` ${ctx.parsed.y.toFixed(2)}%`
                }
            }
        },
        scales: {
            x: {
                ticks: { color: '#71717a', font: { size: 11 }, maxRotation: 35 },
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
            labels,
            datasets: [{
                data: openRates,
                borderColor: '#22d3ee',
                backgroundColor: 'rgba(34, 211, 238, 0.08)',
                borderWidth: 2,
                pointRadius: 4,
                pointHoverRadius: 6,
                pointBackgroundColor: '#22d3ee',
                tension: 0.3,
                fill: true
            }]
        },
        options: sharedOptions
    });

    if (clickRateChartInstance) clickRateChartInstance.destroy();
    clickRateChartInstance = new Chart(document.getElementById('clickRateChart'), {
        type: 'line',
        data: {
            labels,
            datasets: [{
                data: clickRates,
                borderColor: '#4ade80',
                backgroundColor: 'rgba(74, 222, 128, 0.08)',
                borderWidth: 2,
                pointRadius: 4,
                pointHoverRadius: 6,
                pointBackgroundColor: '#4ade80',
                tension: 0.3,
                fill: true
            }]
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

async function loadDashboard() {
    const loading = document.getElementById('loading');
    const dashboard = document.getElementById('dashboard');
    const error = document.getElementById('error');
    const dateRangeSelect = document.getElementById('dateRange');
    const refreshButton = document.querySelector('.controls button');
    const dateRange = dateRangeSelect.value;

    // Show loading and disable controls
    loading.style.display = 'block';
    dashboard.style.display = 'none';
    error.style.display = 'none';
    refreshButton.disabled = true;
    dateRangeSelect.disabled = true;
    refreshButton.textContent = 'Updating...';

    try {
        const data = await fetchMailchimpData(parseInt(dateRange));

        if (!data.campaigns || data.campaigns.length === 0) {
            renderCampaignsTable([]);
            renderStats({
                totalSent: 0,
                totalOpens: 0,
                totalUniqueOpens: 0,
                totalClicks: 0,
                totalUniqueClicks: 0,
                totalUnsubscribed: 0,
                avgOpenRate: 0,
                avgClickRate: 0
            });
            renderCharts([]);
            renderHighlights([]);
        } else {
            const totals = calculateTotals(data.campaigns);
            renderStats(totals);
            renderCampaignsTable(data.campaigns);
            renderCharts(data.campaigns);
            renderHighlights(data.campaigns);
        }

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
        dateRangeSelect.disabled = false;
        refreshButton.textContent = 'Refresh Data';
    }
}

// Load dashboard on page load
document.addEventListener('DOMContentLoaded', loadDashboard);
