// Vercel Serverless Function — TRA Eblast Performance (rolling 4 weeks, read-only GET requests to Mailchimp)
//
// POST /api/eblast { action: "report", reportDate: "YYYY-MM-DD", choices?: { "<weekStart>:<section>": "<campaignId>" } }
//   reportDate is a Sunday. The report covers the four Sunday–Saturday weeks before it;
//   each week has a Sunday recap, a midweek resend and a Friday invite. When more than one
//   campaign matches a row the earliest is used, unless `choices` picks another.

const { createClient, MailchimpError } = require('./_mailchimp');
const { TIME_ZONE, pacificDateKey, formatSendTime, isYouTube } = require('./_shared');

const WEEKS = 4;
const DAY_MS = 86400000;

// Display order matches the spreadsheet. `offset` = days after the week's Sunday
// the email normally goes out (used to date a row when no campaign was sent).
const SECTIONS = [
    { key: 'friday', label: 'Fridays/Saturdays',               match: /^\s*personal invite from pastor/i,   offset: 5, missing: 'No Friday invite this week' },
    { key: 'recap',  label: 'Sundays/Mondays',                 match: /^\s*weekend recap/i,                 offset: 0, missing: 'No Sunday recap this week' },
    { key: 'resend', label: 'Midweek Resends (Sunday recaps)', match: /^\s*resend:\s*weekend recap/i,       offset: 2, missing: 'No resend this week' },
];

const pacificClock = new Intl.DateTimeFormat('en-US', {
    timeZone: TIME_ZONE, hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
});

// ---------- Date helpers (YYYY-MM-DD strings, calendar math in UTC) ----------

function parseDay(day) {
    return new Date(`${day}T00:00:00Z`);
}

function addDays(day, days) {
    return new Date(parseDay(day).getTime() + days * DAY_MS).toISOString().slice(0, 10);
}

function isSunday(day) {
    return parseDay(day).getUTCDay() === 0;
}

// Send time rounded to the nearest 15 minutes, Pacific, as "HH:MM" (24h).
function roundedPacificTime(sendTime) {
    const [h, m] = pacificClock.format(new Date(sendTime)).split(':').map(Number);
    const minutes = Math.min(Math.round((h * 60 + m) / 15) * 15, 23 * 60 + 45);
    return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
}

// ---------- Mailchimp ----------

async function listCampaignsForReport(mc, reportDate) {
    const firstWeek = addDays(reportDate, -7 * WEEKS);
    // Pad a day on each side in UTC, then filter precisely on the Pacific date.
    return mc.getAll('/campaigns', 'campaigns', {
        status: 'sent',
        sort_field: 'send_time',
        sort_dir: 'ASC',
        since_send_time: parseDay(addDays(firstWeek, -1)).toISOString(),
        before_send_time: parseDay(addDays(reportDate, 1)).toISOString(),
        fields: 'campaigns.id,campaigns.send_time,campaigns.settings.title,campaigns.settings.subject_line,campaigns.settings.preview_text,total_items'
    });
}

// Number of distinct subscribers who clicked any of the given links.
async function countUniqueClickers(mc, campaignId, links) {
    const people = new Set();
    for (const link of links) {
        const members = await mc.getAll(
            `/reports/${encodeURIComponent(campaignId)}/click-details/${encodeURIComponent(link.id)}/members`,
            'members',
            { fields: 'members.email_id,total_items' }
        );
        members.forEach(m => people.add(m.email_id));
    }
    return people.size;
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

// ---------- Report ----------

async function buildReport(reportDate, choices) {
    const mc = createClient();
    const campaigns = await listCampaignsForReport(mc, reportDate);

    const weekStarts = Array.from({ length: WEEKS }, (_, k) => addDays(reportDate, -7 * (k + 1))); // newest first

    const slots = [];
    for (const section of SECTIONS) {
        for (const weekStart of weekStarts) {
            const weekEnd = addDays(weekStart, 7);
            const key = `${weekStart}:${section.key}`;

            const candidates = campaigns.filter(c => {
                if (!c.send_time || !section.match.test(c.settings?.title || '')) return false;
                const day = pacificDateKey.format(new Date(c.send_time));
                return day >= weekStart && day < weekEnd;
            });
            const chosen = candidates.find(c => c.id === choices[key]) || candidates[0] || null;

            slots.push({
                key,
                section: section.key,
                weekStart,
                expectedDate: addDays(weekStart, section.offset),
                missingText: section.missing,
                chosen,
                candidates: candidates.map(c => ({
                    id: c.id,
                    title: c.settings?.title || '',
                    sendTime: formatSendTime(c.send_time).pacificDisplay
                }))
            });
        }
    }

    const metrics = await runLimited(
        slots.map(slot => () => slot.chosen ? campaignMetrics(mc, slot.chosen) : null),
        3
    );

    const rows = slots.map((slot, i) => {
        const { chosen, ...row } = slot;
        return { ...row, campaign: metrics[i] };
    });

    return {
        account: mc.accountName,
        reportDate,
        sections: SECTIONS.map(s => ({
            key: s.key,
            label: s.label,
            rows: rows.filter(r => r.section === s.key)
        }))
    };
}

module.exports = async (req, res) => {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const body = req.body || {};
        if (body.action === 'report') {
            const reportDate = body.reportDate;
            if (typeof reportDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(reportDate) || isNaN(parseDay(reportDate))) {
                throw new MailchimpError('reportDate must be in YYYY-MM-DD format.', 400);
            }
            if (!isSunday(reportDate)) throw new MailchimpError('The report date must be a Sunday.', 400);
            const choices = body.choices && typeof body.choices === 'object' ? body.choices : {};
            if (Object.values(choices).some(id => typeof id !== 'string' || !/^[a-z0-9]+$/i.test(id))) {
                throw new MailchimpError('Invalid campaign choice.', 400);
            }
            return res.status(200).json(await buildReport(reportDate, choices));
        }
        throw new MailchimpError('Unknown action.', 400);
    } catch (error) {
        const status = error instanceof MailchimpError ? error.status : 500;
        if (status >= 500) console.error('Eblast report error:', error.message);
        res.status(status).json({
            error: error instanceof MailchimpError ? error.message : 'Something went wrong building the weekly report.'
        });
    }
};
