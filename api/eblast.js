// Vercel Serverless Function — TRA Eblast Performance (rolling 4 weeks)
// Mailchimp is read-only here (GET requests only); attendance/notes are saved in Vercel Blob.
//
// POST /api/eblast { action: "report", reportDate: "YYYY-MM-DD" }
//   reportDate is a Sunday. The report covers the four Sunday–Saturday weeks before it;
//   each week has a Sunday recap, a midweek resend and a Friday invite.
// POST /api/eblast { action: "save", weekStart, section, attendance?, note?, campaignId? }
//   Saves the manual inputs for one row (attendance applies to Friday rows only).

const { createClient, MailchimpError } = require('./_mailchimp');
const { TIME_ZONE, pacificDateKey, formatSendTime, isYouTube } = require('./_shared');
const store = require('./_store');

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

async function buildReport(reportDate) {
    const mc = createClient();
    const [campaigns, saved] = await Promise.all([
        listCampaignsForReport(mc, reportDate),
        store.readSaved().catch(err => {
            console.error('Could not read saved report inputs:', err.message);
            return {};
        })
    ]);
    const savedRows = saved.rows || {};

    const weekStarts = Array.from({ length: WEEKS }, (_, k) => addDays(reportDate, -7 * (k + 1))); // newest first

    const slots = [];
    for (const section of SECTIONS) {
        for (const weekStart of weekStarts) {
            const weekEnd = addDays(weekStart, 7);
            const key = `${weekStart}:${section.key}`;
            const savedRow = savedRows[key] || {};

            const candidates = campaigns.filter(c => {
                if (!c.send_time || !section.match.test(c.settings?.title || '')) return false;
                const day = pacificDateKey.format(new Date(c.send_time));
                return day >= weekStart && day < weekEnd;
            });
            const chosen = candidates.find(c => c.id === savedRow.campaignId) || candidates[0] || null;

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
                })),
                attendance: section.key === 'friday' ? (savedRow.attendance ?? null) : undefined,
                note: savedRow.note || ''
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
        storageConfigured: store.isConfigured(),
        sections: SECTIONS.map(s => ({
            key: s.key,
            label: s.label,
            rows: rows.filter(r => r.section === s.key)
        }))
    };
}

// ---------- Saving manual inputs ----------

async function saveRow(body) {
    if (!store.isConfigured()) {
        throw new MailchimpError('Saving is not set up yet: connect a Vercel Blob store to this project.', 503);
    }

    const { weekStart, section } = body;
    if (typeof weekStart !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(weekStart) || !isSunday(weekStart)) {
        throw new MailchimpError('weekStart must be a Sunday in YYYY-MM-DD format.', 400);
    }
    if (!SECTIONS.some(s => s.key === section)) throw new MailchimpError('Unknown section.', 400);

    const update = {};
    if ('attendance' in body) {
        if (section !== 'friday') throw new MailchimpError('Attendance is recorded on Friday rows only.', 400);
        const value = body.attendance;
        if (value !== null && !(Number.isInteger(value) && value >= 0 && value <= 1000000)) {
            throw new MailchimpError('Attendance must be a whole number.', 400);
        }
        update.attendance = value;
    }
    if ('note' in body) {
        if (typeof body.note !== 'string' || body.note.length > 500) throw new MailchimpError('Notes are limited to 500 characters.', 400);
        update.note = body.note.trim();
    }
    if ('campaignId' in body) {
        if (body.campaignId !== null && !/^[a-z0-9]+$/i.test(body.campaignId)) throw new MailchimpError('Invalid campaign ID.', 400);
        update.campaignId = body.campaignId;
    }

    const saved = await store.readSaved();
    saved.rows = saved.rows || {};
    const key = `${weekStart}:${section}`;
    const row = { ...(saved.rows[key] || {}), ...update };
    for (const field of Object.keys(row)) {
        if (row[field] === null || row[field] === '') delete row[field];
    }
    if (Object.keys(row).length) saved.rows[key] = row;
    else delete saved.rows[key];
    await store.writeSaved(saved);

    return { saved: saved.rows[key] || {} };
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
            return res.status(200).json(await buildReport(reportDate));
        }
        if (body.action === 'save') {
            return res.status(200).json(await saveRow(body));
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
