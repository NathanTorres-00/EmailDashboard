// Helpers shared by the report endpoints: Pacific-time formatting and YouTube link detection.

const TIME_ZONE = 'America/Los_Angeles';
const YOUTUBE_HOSTS = ['youtube.com', 'youtu.be', 'm.youtube.com'];

const pacificDateKey = new Intl.DateTimeFormat('en-CA', {
    timeZone: TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit'
});
const pacificDisplay = new Intl.DateTimeFormat('en-US', {
    timeZone: TIME_ZONE, weekday: 'short', month: 'short', day: 'numeric', year: 'numeric',
    hour: 'numeric', minute: '2-digit', timeZoneName: 'short'
});
const utcDisplay = new Intl.DateTimeFormat('en-US', {
    timeZone: 'UTC', month: 'short', day: 'numeric', year: 'numeric',
    hour: 'numeric', minute: '2-digit', timeZoneName: 'short'
});

function formatSendTime(sendTime) {
    if (!sendTime) return { utc: null, pacificDate: null, pacificDisplay: '—', utcDisplay: '—' };
    const date = new Date(sendTime);
    return {
        utc: date.toISOString(),
        pacificDate: pacificDateKey.format(date),
        pacificDisplay: pacificDisplay.format(date),
        utcDisplay: utcDisplay.format(date)
    };
}

function isYouTube(url) {
    let host;
    try {
        host = new URL(url).hostname.toLowerCase();
    } catch {
        return /(^|\/\/|\.)(youtube\.com|youtu\.be)\b/i.test(url);
    }
    host = host.replace(/^www\./, '');
    return YOUTUBE_HOSTS.includes(host);
}

module.exports = { TIME_ZONE, pacificDateKey, pacificDisplay, utcDisplay, formatSendTime, isYouTube };
