// Vercel Serverless Function — TRA Eblast Performance (rolling 4 weeks, read-only GET requests to Mailchimp)
//
// POST /api/eblast { action: "report", reportDate: "YYYY-MM-DD", choices?: { "<weekStart>:<section>": "<campaignId>" } }
//   reportDate is a Sunday. The report covers the four Sunday–Saturday weeks before it;
//   each week has a Sunday recap, a midweek resend and a Friday invite. When more than one
//   campaign matches a row the earliest is used, unless `choices` picks another.

const { createClient, MailchimpError } = require('./_mailchimp');
const { WEEKLY_EMAIL_PATTERNS, pacificDateKey, formatSendTime } = require('./_shared');
const { CAMPAIGN_LIST_FIELDS, campaignMetrics, runLimited } = require('./_metrics');

const WEEKS = 4;
const DAY_MS = 86400000;

// Display order matches the spreadsheet. `offset` = days after the week's Sunday
// the email normally goes out (used to date a row when no campaign was sent).
const SECTIONS = [
    { key: 'friday', label: 'Fridays/Saturdays',               match: WEEKLY_EMAIL_PATTERNS.friday, offset: 5, missing: 'No Friday invite this week' },
    { key: 'recap',  label: 'Sundays/Mondays',                 match: WEEKLY_EMAIL_PATTERNS.recap,  offset: 0, missing: 'No Sunday recap this week' },
    { key: 'resend', label: 'Midweek Resends (Sunday recaps)', match: WEEKLY_EMAIL_PATTERNS.resend, offset: 2, missing: 'No resend this week' },
];

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
        fields: CAMPAIGN_LIST_FIELDS
    });
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
