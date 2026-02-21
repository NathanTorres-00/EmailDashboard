// Vercel Serverless Function — fetch Mailchimp audience lists for a given account
const ACCOUNT_CREDENTIALS = {
    "1": { key: process.env.MAILCHIMP_API_KEY,   server: process.env.MAILCHIMP_SERVER   || 'us19' },
    "2": { key: process.env.MAILCHIMP_API_KEY_2, server: process.env.MAILCHIMP_SERVER_2 || 'us19' },
    "3": { key: process.env.MAILCHIMP_API_KEY_3, server: process.env.MAILCHIMP_SERVER_3 || 'us19' },
};

module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Credentials', true);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,POST');
    res.setHeader('Access-Control-Allow-Headers',
        'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');

    if (req.method === 'OPTIONS') { res.status(200).end(); return; }

    try {
        const account = req.body?.account || req.query?.account || '1';
        const creds = ACCOUNT_CREDENTIALS[account] || ACCOUNT_CREDENTIALS['1'];
        const { key: MAILCHIMP_API_KEY, server: MAILCHIMP_SERVER } = creds;

        const authHeader = `Basic ${Buffer.from('anystring:' + MAILCHIMP_API_KEY).toString('base64')}`;
        const url = `https://${MAILCHIMP_SERVER}.api.mailchimp.com/3.0/lists?count=100&fields=lists.id,lists.name`;

        const response = await fetch(url, {
            headers: { 'Authorization': authHeader, 'Content-Type': 'application/json' }
        });

        if (!response.ok) throw new Error(`Mailchimp API error: ${response.statusText}`);

        const data = await response.json();
        const lists = (data.lists || []).map(l => ({ id: l.id, name: l.name }));

        res.status(200).json({ lists });
    } catch (error) {
        console.error('Error fetching Mailchimp lists:', error);
        res.status(500).json({ error: 'Failed to fetch lists', message: error.message });
    }
};
