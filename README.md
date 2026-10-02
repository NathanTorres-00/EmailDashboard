# Mailchimp Campaign Dashboard

A beautiful, real-time dashboard for viewing Mailchimp campaign performance.

## Features

- 📊 Real-time campaign statistics
- 📧 Detailed campaign performance metrics
- 📅 Customizable date ranges (7, 14, 30, 90 days)
- 📱 Responsive design for mobile and desktop
- 🎨 Clean, professional interface perfect for stakeholders

## Metrics Tracked

- Emails Sent
- Unique Opens & Open Rate
- Unique Clicks & Click Rate
- Total Opens
- Unsubscribed
- Abuse Reports
- Forwards

## Campaign Report Page (`/report.html`)

A second page (linked from the dashboard header) that reports on a single sent campaign. It only **reads** from Mailchimp: every call to the Mailchimp API is a GET request, and nothing in Mailchimp is ever changed.

**Find a campaign by:**
- **Campaign title**: an exact match on the internal title (e.g. `Resend: Weekend Recap 9/27/26 (Jerry)`). If there's no exact match it falls back to a partial, case-insensitive match. If several campaigns match, it lists them so you can pick one.
- **Campaign ID**: the Mailchimp campaign ID.
- **Send date**: every campaign sent on that day (Pacific time), with a full report for each.

**Each report shows:**
- **Details:** title, subject line, preview text, send time (Pacific and UTC), audience, and segment.
- **Metrics:** emails sent; total opens, unique opens and open rate; total clicks, unique clicks and click rate; hard and soft bounces; unsubscribes.
- **Link clicks:** every clicked link, with total and unique clicks plus each link's share of all clicks and of unique clicks.
- **YouTube links:** clicks on youtube.com, youtu.be and m.youtube.com, with per-link and combined totals.

**Extras**
- **Compare with:** enter a second title to see two campaigns side by side, such as an original and its Resend. Changes are shown as counts, percentages and percentage points.
- **Download:** export the report as a CSV or JSON file.
- **Shareable links:** the page URL keeps the search, e.g. `report.html?account=1&mode=title&q=Weekend%20Recap&compare=...`

### API keys

The page uses the same Vercel environment variables as the dashboard. The server prefix (e.g. `us21`) is taken from the end of each key:

| Account | Variable |
| --- | --- |
| Solid Lives | `MAILCHIMP_API_KEY` |
| The Rock Network | `MAILCHIMP_API_KEY_2` |
| Jesus Disciple | `MAILCHIMP_API_KEY_3` |

To run the page locally, copy `.env.example` to `.env`, fill in the keys, and run `vercel dev` (it loads `.env` automatically). `.env` is git-ignored, and the keys are only ever used on the server.

## Deployment Instructions

### Option 1: Deploy to Vercel (Recommended - Free)

1. **Install Vercel CLI** (if you haven't already)
   ```bash
   npm install -g vercel
   ```

2. **Navigate to the project folder**
   ```bash
   cd mailchimp-dashboard
   ```

3. **Deploy**
   ```bash
   vercel
   ```
   
   - First time: You'll be asked to log in to Vercel
   - Follow the prompts (accept defaults)
   - Your dashboard will be live in ~30 seconds!

4. **Get your URL**
   - Vercel will give you a URL like: `https://mailchimp-dashboard-xyz.vercel.app`
   - Share this with your leadership team!

### Option 2: Deploy to Netlify (Also Free)

1. **Install Netlify CLI**
   ```bash
   npm install -g netlify-cli
   ```

2. **Deploy**
   ```bash
   netlify deploy --prod
   ```

### Option 3: Manual Deployment

1. Go to [vercel.com](https://vercel.com)
2. Click "Add New Project"
3. Import from GitHub or drag & drop this folder
4. Deploy!

## Security Note

Your Mailchimp API key is stored in the serverless function and is NOT exposed to the browser. This keeps your data secure.

## Updating the Dashboard

To update data, just refresh the page or click the "Refresh Data" button.

## Customization

Want to customize the look? Edit the CSS in `index.html`
Want to add more metrics? Edit the stats in `app.js`

## Support

Built for The Rock Church by Nathan Torres
Questions? Check the Vercel or Netlify deployment docs.

---

**Made with ❤️ for The Rock Church ministry team**
