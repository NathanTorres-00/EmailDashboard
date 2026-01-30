// Mailchimp API Configuration
// Set these values in your environment or replace with your API key
const MAILCHIMP_API_KEY = process.env.MAILCHIMP_API_KEY || 'YOUR_API_KEY_HERE';
const MAILCHIMP_SERVER = process.env.MAILCHIMP_SERVER || 'us19';
const API_BASE_URL = `https://${MAILCHIMP_SERVER}.api.mailchimp.com/3.0`;

// Since we can't make direct API calls from the browser due to CORS,
// we'll need to use a serverless function as a proxy
// For now, this will use a backend API endpoint

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

async function loadDashboard() {
    const loading = document.getElementById('loading');
    const dashboard = document.getElementById('dashboard');
    const error = document.getElementById('error');
    const dateRange = document.getElementById('dateRange').value;

    // Show loading
    loading.style.display = 'block';
    dashboard.style.display = 'none';
    error.style.display = 'none';

    try {
        const data = await fetchMailchimpData(parseInt(dateRange));
        
        // Calculate totals
        const totals = calculateTotals(data.campaigns);
        
        // Render stats and table
        renderStats(totals);
        renderCampaignsTable(data.campaigns);
        
        // Update last updated time
        document.getElementById('lastUpdated').textContent = 
            `Last updated: ${new Date().toLocaleTimeString()}`;
        
        // Show dashboard
        loading.style.display = 'none';
        dashboard.style.display = 'block';
    } catch (err) {
        loading.style.display = 'none';
        error.style.display = 'block';
        error.textContent = `Error loading data: ${err.message}. Please check your API credentials and try again.`;
    }
}

// Load dashboard on page load
document.addEventListener('DOMContentLoaded', loadDashboard);
