// Vercel Serverless Function to proxy Mailchimp API requests
// Set credentials in Vercel Environment Variables per account:
//   Account 1 (Solid Lives):       MAILCHIMP_API_KEY,   MAILCHIMP_SERVER
//   Account 2 (The Rock Network):  MAILCHIMP_API_KEY_2, MAILCHIMP_SERVER_2
//   Account 3 (Jesus Disciple):    MAILCHIMP_API_KEY_3, MAILCHIMP_SERVER_3

const ACCOUNT_CREDENTIALS = {
    "1": { key: process.env.MAILCHIMP_API_KEY,   server: process.env.MAILCHIMP_SERVER   || 'us19' },
    "2": { key: process.env.MAILCHIMP_API_KEY_2, server: process.env.MAILCHIMP_SERVER_2 || 'us19' },
    "3": { key: process.env.MAILCHIMP_API_KEY_3, server: process.env.MAILCHIMP_SERVER_3 || 'us19' },
};

module.exports = async (req, res) => {
    // Enable CORS
    res.setHeader('Access-Control-Allow-Credentials', true);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
    res.setHeader(
        'Access-Control-Allow-Headers',
        'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
    );

    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const { startDate, endDate, account = "1", listId } = req.body;

        const creds = ACCOUNT_CREDENTIALS[account] || ACCOUNT_CREDENTIALS["1"];
        const { key: MAILCHIMP_API_KEY, server: MAILCHIMP_SERVER } = creds;

        const sinceSendTime = new Date(startDate).toISOString();
        const beforeSendTime = new Date(endDate).toISOString();

        const authHeader = `Basic ${Buffer.from('anystring:' + MAILCHIMP_API_KEY).toString('base64')}`;

        // Single API call: /3.0/reports returns all campaign stats in one request
        // Previously we made N+1 calls (campaigns list + one report per campaign)
        const listFilter = listId ? `&list_id=${listId}` : '';
        const reportsUrl = `https://${MAILCHIMP_SERVER}.api.mailchimp.com/3.0/reports?count=100&since_send_time=${sinceSendTime}&before_send_time=${beforeSendTime}&sort_field=send_time&sort_dir=DESC${listFilter}&fields=reports.id,reports.send_time,reports.subject_line,reports.campaign_title,reports.emails_sent,reports.opens,reports.clicks,reports.unsubscribed,reports.abuse_reports,reports.forwards`;

        const reportsResponse = await fetch(reportsUrl, {
            headers: {
                'Authorization': authHeader,
                'Content-Type': 'application/json'
            }
        });

        if (!reportsResponse.ok) {
            throw new Error(`Mailchimp API error: ${reportsResponse.statusText}`);
        }

        const reportsData = await reportsResponse.json();

        // Normalize to the shape app.js expects
        const campaigns = (reportsData.reports || []).map(report => ({
            id: report.id,
            send_time: report.send_time,
            settings: {
                subject_line: report.subject_line,
                title: report.campaign_title
            },
            emails_sent: report.emails_sent,
            opens: report.opens,
            clicks: report.clicks,
            unsubscribed: report.unsubscribed,
            abuse_reports: report.abuse_reports,
            forwards: report.forwards
        }));

        res.status(200).json({
            campaigns,
            count: campaigns.length,
            dateRange: { start: startDate, end: endDate }
        });

    } catch (error) {
        console.error('Error fetching Mailchimp data:', error);
        res.status(500).json({
            error: 'Failed to fetch campaign data',
            message: error.message
        });
    }
}
