// Vercel Serverless Function to proxy Mailchimp API requests
// Set these in Vercel Environment Variables
const MAILCHIMP_API_KEY = process.env.MAILCHIMP_API_KEY;
const MAILCHIMP_SERVER = process.env.MAILCHIMP_SERVER || 'us19';

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
        const { startDate, endDate } = req.body;

        const sinceSendTime = new Date(startDate).toISOString();
        const beforeSendTime = new Date(endDate).toISOString();

        const authHeader = `Basic ${Buffer.from('anystring:' + MAILCHIMP_API_KEY).toString('base64')}`;

        // Single API call: /3.0/reports returns all campaign stats in one request
        // Previously we made N+1 calls (campaigns list + one report per campaign)
        const reportsUrl = `https://${MAILCHIMP_SERVER}.api.mailchimp.com/3.0/reports?count=100&since_send_time=${sinceSendTime}&before_send_time=${beforeSendTime}&sort_field=send_time&sort_dir=DESC&fields=reports.id,reports.send_time,reports.subject_line,reports.campaign_title,reports.emails_sent,reports.opens,reports.clicks,reports.unsubscribed,reports.abuse_reports,reports.forwards`;

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
