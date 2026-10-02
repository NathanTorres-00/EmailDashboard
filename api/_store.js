// Saved weekly-report inputs (attendance, notes, campaign choices) kept as one
// private JSON file in Vercel Blob. Requires a Blob store connected to the
// project, which provides BLOB_READ_WRITE_TOKEN.

const { get, put } = require('@vercel/blob');

const PATHNAME = 'eblast/weekly-report.json';

function isConfigured() {
    return Boolean(process.env.BLOB_READ_WRITE_TOKEN);
}

async function readSaved() {
    if (!isConfigured()) return {};
    const result = await get(PATHNAME, { access: 'private', useCache: false });
    if (!result || result.statusCode !== 200) return {};
    return new Response(result.stream).json();
}

async function writeSaved(data) {
    await put(PATHNAME, JSON.stringify(data, null, 2), {
        access: 'private',
        addRandomSuffix: false,
        allowOverwrite: true,
        contentType: 'application/json'
    });
}

module.exports = { isConfigured, readSaved, writeSaved };
