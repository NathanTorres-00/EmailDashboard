// Per-campaign numbers for the weekly TRA sheet, shared by the weekly report and the monthly trend.
// Recipients = emails sent minus bounces; opens exclude Apple Mail Privacy Protection;
// unique clicks are Mailchimp's; teaching clicks = distinct people who clicked any YouTube link.

const { TIME_ZONE, pacificDateKey, formatSendTime, isYouTube, countUniqueClickers } = require('./_shared');

// Fields to request from GET /campaigns so campaignMetrics has what it needs.
const CAMPAIGN_LIST_FIELDS = 'campaigns.id,campaigns.send_time,campaigns.settings.title,campaigns.settings.subject_line,campaigns.settings.preview_text,total_items';

const pacificClock = new Intl.DateTimeFormat('en-US', {
    timeZone: TIME_ZONE, hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
});

// Send time rounded to the nearest 15 minutes, Pacific, as "HH:MM" (24h).
function roundedPacificTime(sendTime) {
    const [h, m] = pacificClock.format(new Date(sendTime)).split(':').map(Number);
    const minutes = Math.min(Math.round((h * 60 + m) / 15) * 15, 23 * 60 + 45);
    return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
}

async function campaignMetrics(mc, campaign) {
    const id = encodeURIComponent(campaign.id);
    const [report, links] = await Promise.all([
        mc.get(`/reports/${id}`, { fields: 'emails_sent,opens,clicks,bounces' }),
        mc.getAll(`/reports/${id}/click-details`, 'urls_clicked', {
            fields: 'urls_clicked.id,urls_clicked.url,urls_clicked.unique_clicks,total_items'
        })
    ]);

    const youtubeLinks = links.filter(l => isYouTube(l.url) && l.unique_clicks > 0);
    const teachingClicks = await countUniqueClickers(mc, campaign.id, youtubeLinks);

    const emailsSent = report.emails_sent || 0;
    const recipients = emailsSent - (report.bounces?.hard_bounces || 0) - (report.bounces?.soft_bounces || 0);
    const opens = report.opens?.proxy_excluded_unique_opens ?? null;

    return {
        id: campaign.id,
        title: campaign.settings?.title || '',
        date: pacificDateKey.format(new Date(campaign.send_time)),
        time: roundedPacificTime(campaign.send_time),
        sendTime: formatSendTime(campaign.send_time),
        subject: campaign.settings?.subject_line || '',
        previewText: campaign.settings?.preview_text || '',
        recipients,
        opens,
        openRate: opens != null && recipients > 0 ? opens / recipients : null,
        uniqueClicks: report.clicks?.unique_clicks || 0,
        teachingClicks,
        // Reference figures, useful when reconciling against older reports.
        reference: {
            emailsSent,
            uniqueOpensIncludingApple: report.opens?.unique_opens || 0,
            subscribersWhoClicked: report.clicks?.unique_subscriber_clicks || 0,
            youtubeUniqueClicksSummedPerLink: youtubeLinks.reduce((sum, l) => sum + l.unique_clicks, 0)
        }
    };
}

// Run tasks a few at a time to stay under Mailchimp's 10-connection limit.
async function runLimited(tasks, limit) {
    const results = new Array(tasks.length);
    let next = 0;
    async function worker() {
        while (next < tasks.length) {
            const i = next++;
            results[i] = await tasks[i]();
        }
    }
    await Promise.all(Array.from({ length: Math.min(limit, tasks.length) }, worker));
    return results;
}

module.exports = { CAMPAIGN_LIST_FIELDS, roundedPacificTime, campaignMetrics, runLimited };
