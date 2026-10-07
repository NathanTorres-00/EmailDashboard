// Vercel Serverless Function — monthly trend for the weekly TRA emails (read-only GET requests to Mailchimp)
//
// GET /api/trends?month=YYYY-MM
//   For each email type (Sunday recap, Tuesday resend, Friday invite) sent that month (Pacific time):
//   the number of emails and the average per email of recipients, opens, unique clicks and
//   clicks on teaching, plus the open rate (total opens ÷ total recipients). Same definitions
//   as the weekly sheet, including its rule of one email per type per Sunday–Saturday week
//   (the earliest send). Responses are cached at the edge: past months for hours, the current
//   month for a few minutes.

const { createClient, MailchimpError } = require('./_mailchimp');
const { WEEKLY_EMAIL_PATTERNS, pacificDateKey } = require('./_shared');
const { CAMPAIGN_LIST_FIELDS, campaignMetrics, runLimited } = require('./_metrics');

const TYPES = ['recap', 'resend', 'friday'];

function nextMonth(month) {
    const [y, m] = month.split('-').map(Number);
    return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`;
}

// Sunday that starts the week containing a Pacific YYYY-MM-DD date.
function weekStart(day) {
    const date = new Date(`${day}T00:00:00Z`);
    return new Date(date.getTime() - date.getUTCDay() * 86400000).toISOString().slice(0, 10);
}

function summarize(rows) {
    const withOpens = rows.filter(r => r.opens != null);
    const sum = (list, field) => list.reduce((total, r) => total + r[field], 0);
    const avg = (list, field) => (list.length ? sum(list, field) / list.length : null);
    const openRecipients = sum(withOpens, 'recipients');
    return {
        count: rows.length,
        recipients: avg(rows, 'recipients'),
        opens: avg(withOpens, 'opens'),
        openRate: openRecipients > 0 ? sum(withOpens, 'opens') / openRecipients : null,
        uniqueClicks: avg(rows, 'uniqueClicks'),
        teachingClicks: avg(rows, 'teachingClicks')
    };
}

async function buildMonth(month) {
    const mc = createClient();
    const start = new Date(`${month}-01T00:00:00Z`);
    const end = new Date(`${nextMonth(month)}-01T00:00:00Z`);

    // Pad a day on each side in UTC, then filter precisely on the Pacific date.
    const campaigns = await mc.getAll('/campaigns', 'campaigns', {
        status: 'sent',
        sort_field: 'send_time',
        sort_dir: 'ASC',
        since_send_time: new Date(start.getTime() - 86400000).toISOString(),
        before_send_time: new Date(end.getTime() + 86400000).toISOString(),
        fields: CAMPAIGN_LIST_FIELDS
    });

    // Campaigns arrive oldest first, so the first one seen for a type and week is the earliest send.
    const seen = new Set();
    const matches = campaigns
        .filter(c => c.send_time && pacificDateKey.format(new Date(c.send_time)).startsWith(month))
        .map(c => ({ campaign: c, type: TYPES.find(t => WEEKLY_EMAIL_PATTERNS[t].test(c.settings?.title || '')) }))
        .filter(m => {
            if (!m.type) return false;
            const key = `${m.type}:${weekStart(pacificDateKey.format(new Date(m.campaign.send_time)))}`;
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        });

    const metrics = await runLimited(matches.map(m => () => campaignMetrics(mc, m.campaign)), 2);
    const rows = metrics.map((r, i) => ({
        type: matches[i].type,
        id: r.id,
        title: r.title,
        date: r.date,
        recipients: r.recipients,
        opens: r.opens,
        uniqueClicks: r.uniqueClicks,
        teachingClicks: r.teachingClicks
    }));

    return {
        month,
        types: Object.fromEntries(TYPES.map(t => [t, summarize(rows.filter(r => r.type === t))])),
        campaigns: rows
    };
}

module.exports = async (req, res) => {
    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const month = String(req.query?.month || '');
        if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw new MailchimpError('month must be in YYYY-MM format.', 400);

        const currentMonth = pacificDateKey.format(new Date()).slice(0, 7);
        if (month > currentMonth) throw new MailchimpError('That month hasn’t happened yet.', 400);

        const result = await buildMonth(month);
        res.setHeader('Cache-Control', month < currentMonth
            ? 's-maxage=21600, stale-while-revalidate=86400'
            : 's-maxage=900, stale-while-revalidate=3600');
        res.status(200).json({ ...result, complete: month < currentMonth });
    } catch (error) {
        const status = error instanceof MailchimpError ? error.status : 500;
        if (status >= 500) console.error('Trend error:', error.message);
        res.status(status).json({
            error: error instanceof MailchimpError ? error.message : 'Something went wrong building the monthly trend.'
        });
    }
};
