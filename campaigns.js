// Vercel Serverless Function to proxy Mailchimp API requests
// Set these in Vercel Environment Variables
const MAILCHIMP_API_KEY = process.env.MAILCHIMP_API_KEY;
const MAILCHIMP_SERVER = process.env.MAILCHIMP_SERVER || 'us19';

export default async function handler(req, res) {
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
        const { days, startDate, endDate } = req.body;

        // Fetch campaigns
        const campaignsUrl = `https://${MAILCHIMP_SERVER}.api.mailchimp.com/3.0/campaigns?count=1000&status=sent&sort_field=send_time&sort_dir=DESC`;
        
        const campaignsResponse = await fetch(campaignsUrl, {
            headers: {
                'Authorization': `Bearer ${MAILCHIMP_API_KEY}`,
                'Content-Type': 'application/json'
            }
        });

        if (!campaignsResponse.ok) {
            throw new Error(`Mailchimp API error: ${campaignsResponse.statusText}`);
        }

        const campaignsData = await campaignsResponse.json();
        
        // Filter campaigns by date range
        const filteredCampaigns = campaignsData.campaigns.filter(campaign => {
            const sendTime = new Date(campaign.send_time);
            const start = new Date(startDate);
            const end = new Date(endDate);
            return sendTime >= start && sendTime <= end;
        });

        // Fetch detailed reports for each campaign
        const campaignReports = await Promise.all(
            filteredCampaigns.map(async (campaign) => {
                const reportUrl = `https://${MAILCHIMP_SERVER}.api.mailchimp.com/3.0/reports/${campaign.id}`;
                
                const reportResponse = await fetch(reportUrl, {
                    headers: {
                        'Authorization': `Bearer ${MAILCHIMP_API_KEY}`,
                        'Content-Type': 'application/json'
                    }
                });

                if (reportResponse.ok) {
                    return await reportResponse.json();
                }
                
                // If report fails, return campaign with basic info
                return {
                    ...campaign,
                    emails_sent: campaign.emails_sent || 0,
                    opens: { unique_opens: 0, open_rate: 0, opens_total: 0 },
                    clicks: { unique_clicks: 0, click_rate: 0, clicks_total: 0 },
                    unsubscribed: 0,
                    abuse_reports: 0
                };
            })
        );

        res.status(200).json({
            campaigns: campaignReports,
            count: campaignReports.length,
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
