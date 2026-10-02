// Vercel Serverless Function — single-campaign report (read-only, GET requests to Mailchimp only)
//
// POST /api/report  { mode: "title"|"id"|"date", value: "..." }  — The Rock Anaheim account
//   mode "title" → exact internal title match, else partial case-insensitive match.
//                  More than one match returns { candidates } so the page can ask which one.
//   mode "id"    → report for that campaign ID.
//   mode "date"  → report for every campaign sent on that YYYY-MM-DD (Pacific time).
// Success returns { reports: [...] }.

const { createClient, MailchimpError } = require('./_mailchimp');

const TIME_ZONE = 'America/Los_Angeles';
const YOUTUBE_HOSTS = ['youtube.com', 'youtu.be', 'm.youtube.com'];

const pacificDateKey = new Intl.DateTimeFormat('en-CA', {
    timeZone: TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit'
});
const pacificDisplay = new Intl.DateTimeFormat('en-US', {
    timeZone: TIME_ZONE, weekday: 'short', month: 'short', day: 'numeric', year: 'numeric',
    hour: 'numeric', minute: '2-digit', timeZoneName: 'short'
});
const utcDisplay = new Intl.DateTimeFormat('en-US', {
    timeZone: 'UTC', month: 'short', day: 'numeric', year: 'numeric',
    hour: 'numeric', minute: '2-digit', timeZoneName: 'short'
});

function formatSendTime(sendTime) {
    if (!sendTime) return { utc: null, pacificDate: null, pacificDisplay: '—', utcDisplay: '—' };
    const date = new Date(sendTime);
    return {
        utc: date.toISOString(),
        pacificDate: pacificDateKey.format(date),
        pacificDisplay: pacificDisplay.format(date),
        utcDisplay: utcDisplay.format(date)
    };
}

function stripHtml(text) {
    return (text || '').replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
}

function isYouTube(url) {
    let host;
    try {
        host = new URL(url).hostname.toLowerCase();
    } catch {
        return /(^|\/\/|\.)(youtube\.com|youtu\.be)\b/i.test(url);
    }
    host = host.replace(/^www\./, '');
    return YOUTUBE_HOSTS.includes(host);
}

function summarizeCampaign(c) {
    return {
        id: c.id,
        title: c.settings?.title || '(untitled)',
        subjectLine: c.settings?.subject_line || '',
        sendTime: formatSendTime(c.send_time)
    };
}

// All sent campaigns, newest first, with just enough fields to match on.
function listSentCampaigns(mc, params = {}) {
    return mc.getAll('/campaigns', 'campaigns', {
        status: 'sent',
        sort_field: 'send_time',
        sort_dir: 'DESC',
        fields: 'campaigns.id,campaigns.settings.title,campaigns.settings.subject_line,campaigns.send_time,total_items',
        ...params
    });
}

async function buildReport(mc, campaignId) {
    const id = encodeURIComponent(campaignId);

    const [campaign, report, linkItems] = await Promise.all([
        mc.get(`/campaigns/${id}`, {
            fields: 'id,status,send_time,settings.title,settings.subject_line,settings.preview_text,recipients.list_name,recipients.segment_text'
        }),
        mc.get(`/reports/${id}`, {
            fields: 'id,emails_sent,opens,clicks,bounces,unsubscribed'
        }),
        mc.getAll(`/reports/${id}/click-details`, 'urls_clicked', {
            fields: 'urls_clicked.url,urls_clicked.total_clicks,urls_clicked.unique_clicks,total_items'
        })
    ]);

    // Click shares are computed from the link totals so each column sums to 100%.
    const totalLinkClicks = linkItems.reduce((sum, l) => sum + (l.total_clicks || 0), 0);
    const totalLinkUniqueClicks = linkItems.reduce((sum, l) => sum + (l.unique_clicks || 0), 0);

    const links = linkItems
        .map(l => ({
            url: l.url,
            totalClicks: l.total_clicks || 0,
            uniqueClicks: l.unique_clicks || 0,
            shareOfClicks: totalLinkClicks ? (l.total_clicks || 0) / totalLinkClicks : 0,
            shareOfUniqueClicks: totalLinkUniqueClicks ? (l.unique_clicks || 0) / totalLinkUniqueClicks : 0,
            isYouTube: isYouTube(l.url)
        }))
        .sort((a, b) => b.totalClicks - a.totalClicks || b.uniqueClicks - a.uniqueClicks);

    const youtubeLinks = links.filter(l => l.isYouTube);

    return {
        id: campaign.id,
        status: campaign.status,
        title: campaign.settings?.title || '(untitled)',
        subjectLine: campaign.settings?.subject_line || '',
        previewText: campaign.settings?.preview_text || '',
        sendTime: formatSendTime(campaign.send_time),
        audience: campaign.recipients?.list_name || '',
        segmentText: stripHtml(campaign.recipients?.segment_text),
        emailsSent: report.emails_sent || 0,
        opens: {
            total: report.opens?.opens_total || 0,
            unique: report.opens?.unique_opens || 0,
            rate: report.opens?.open_rate || 0
        },
        clicks: {
            total: report.clicks?.clicks_total || 0,
            unique: report.clicks?.unique_subscriber_clicks || 0,
            rate: report.clicks?.click_rate || 0
        },
        bounces: {
            hard: report.bounces?.hard_bounces || 0,
            soft: report.bounces?.soft_bounces || 0
        },
        unsubscribes: report.unsubscribed || 0,
        links,
        youtube: {
            links: youtubeLinks,
            totalClicks: youtubeLinks.reduce((sum, l) => sum + l.totalClicks, 0),
            uniqueClicks: youtubeLinks.reduce((sum, l) => sum + l.uniqueClicks, 0)
        }
    };
}

// Fetch reports one campaign at a time to stay well under Mailchimp's
// 10-concurrent-connection limit.
async function buildReports(mc, ids) {
    const reports = [];
    for (const id of ids) reports.push(await buildReport(mc, id));
    return reports;
}

async function findByTitle(mc, title) {
    const campaigns = await listSentCampaigns(mc);

    const exact = campaigns.filter(c => (c.settings?.title || '').trim() === title);
    if (exact.length === 1) return { reports: await buildReports(mc, [exact[0].id]) };
    if (exact.length > 1) return { candidates: exact.map(summarizeCampaign), matchType: 'exact' };

    const needle = title.toLowerCase();
    const partial = campaigns.filter(c => (c.settings?.title || '').toLowerCase().includes(needle));
    if (partial.length === 1) return { reports: await buildReports(mc, [partial[0].id]) };
    if (partial.length > 1) return { candidates: partial.map(summarizeCampaign), matchType: 'partial' };

    throw new MailchimpError(`No sent campaign found with a title matching "${title}".`, 404);
}

async function findByDate(mc, date) {
    // A Pacific calendar day falls within [date 00:00Z, date+2 00:00Z); filter precisely after.
    const start = new Date(`${date}T00:00:00Z`);
    const end = new Date(start.getTime() + 2 * 86400000);
    const campaigns = await listSentCampaigns(mc, {
        since_send_time: start.toISOString(),
        before_send_time: end.toISOString()
    });

    const onDate = campaigns
        .filter(c => c.send_time && pacificDateKey.format(new Date(c.send_time)) === date)
        .reverse(); // chronological order within the day

    if (!onDate.length) {
        throw new MailchimpError(`No campaigns were sent on ${date} (Pacific time).`, 404);
    }
    return { reports: await buildReports(mc, onDate.map(c => c.id)) };
}

module.exports = async (req, res) => {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const { mode, value } = req.body || {};
        const query = typeof value === 'string' ? value.trim() : '';
        if (!query) throw new MailchimpError('Please enter a campaign title, ID, or date.', 400);

        const mc = createClient();

        let result;
        if (mode === 'title') {
            result = await findByTitle(mc, query);
        } else if (mode === 'id') {
            if (!/^[a-z0-9]+$/i.test(query)) throw new MailchimpError('Campaign IDs contain only letters and numbers.', 400);
            try {
                result = { reports: await buildReports(mc, [query]) };
            } catch (err) {
                if (err.status === 404) throw new MailchimpError(`No campaign found with ID "${query}".`, 404);
                throw err;
            }
        } else if (mode === 'date') {
            if (!/^\d{4}-\d{2}-\d{2}$/.test(query) || isNaN(new Date(`${query}T00:00:00Z`))) {
                throw new MailchimpError('Dates must be in YYYY-MM-DD format.', 400);
            }
            result = await findByDate(mc, query);
        } else {
            throw new MailchimpError('Unknown search mode.', 400);
        }

        res.status(200).json({ account: mc.accountName, ...result });
    } catch (error) {
        const status = error instanceof MailchimpError ? error.status : 500;
        if (status >= 500) console.error('Error building Mailchimp report:', error.message);
        res.status(status).json({
            error: error instanceof MailchimpError ? error.message : 'Failed to build the campaign report.'
        });
    }
};
