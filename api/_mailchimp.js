// Shared read-only Mailchimp helper for the report endpoint.
// Files in /api starting with "_" are not deployed as functions by Vercel.
//
// Uses The Rock Anaheim Mailchimp account via MAILCHIMP_API_KEY (Vercel env
// var, or .env for `vercel dev`). The server prefix comes from the key suffix
// ("...-us21" → us21), falling back to MAILCHIMP_SERVER if the key has none.

const ACCOUNT = { name: 'The Rock Anaheim', keyVar: 'MAILCHIMP_API_KEY', serverVar: 'MAILCHIMP_SERVER' };

const MAX_RETRIES = 4;

class MailchimpError extends Error {
    constructor(message, status) {
        super(message);
        this.status = status;
    }
}

function createClient() {
    const config = ACCOUNT;
    const key = process.env[config.keyVar];
    if (!key) {
        throw new MailchimpError(`No API key configured for ${config.name}. Set ${config.keyVar} in the environment.`, 500);
    }

    const server = key.includes('-') ? key.split('-').pop() : process.env[config.serverVar];
    if (!server || !/^[a-z]+\d+$/i.test(server)) {
        throw new MailchimpError(`Could not determine the Mailchimp server prefix for ${config.name}. The key should end in "-usXX".`, 500);
    }

    const baseUrl = `https://${server}.api.mailchimp.com/3.0`;
    const authHeader = `Basic ${Buffer.from('anystring:' + key).toString('base64')}`;

    // GET only — this client never modifies anything in Mailchimp.
    async function get(path, params = {}) {
        const url = new URL(baseUrl + path);
        for (const [k, v] of Object.entries(params)) {
            if (v !== undefined && v !== null) url.searchParams.set(k, v);
        }

        for (let attempt = 0; ; attempt++) {
            const response = await fetch(url, {
                method: 'GET',
                headers: { 'Authorization': authHeader, 'Accept': 'application/json' }
            });

            if (response.ok) return response.json();

            if (response.status === 429 && attempt < MAX_RETRIES) {
                const retryAfter = Number(response.headers.get('retry-after'));
                const delayMs = retryAfter > 0 ? Math.min(retryAfter, 10) * 1000 : 1000 * 2 ** attempt;
                await new Promise(resolve => setTimeout(resolve, delayMs));
                continue;
            }

            let detail = '';
            try { detail = (await response.json()).detail || ''; } catch { /* non-JSON body */ }

            if (response.status === 401 || response.status === 403) {
                throw new MailchimpError(`Mailchimp rejected the API key for ${config.name}. Check ${config.keyVar}.`, 502);
            }
            if (response.status === 404) {
                throw new MailchimpError(detail || 'The requested resource could not be found.', 404);
            }
            if (response.status === 429) {
                throw new MailchimpError('Mailchimp rate limit reached. Please wait a minute and try again.', 429);
            }
            throw new MailchimpError(`Mailchimp API error (${response.status})${detail ? ': ' + detail : ''}`, 502);
        }
    }

    // Page through a collection endpoint until every item has been fetched.
    async function getAll(path, itemsKey, params = {}, pageSize = 1000) {
        const items = [];
        for (let offset = 0; ; offset += pageSize) {
            const page = await get(path, { ...params, count: pageSize, offset });
            const batch = page[itemsKey] || [];
            items.push(...batch);
            const total = page.total_items;
            if (batch.length < pageSize || (total != null && items.length >= total)) return items;
        }
    }

    return { get, getAll, accountName: config.name };
}

module.exports = { createClient, MailchimpError };
