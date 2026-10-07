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

## Weekly Eblast Report (`/eblast.html`)

Builds the rolling 4-week **TRA Eblast Performance** sheet straight from The Rock Anaheim's Mailchimp account. There's nothing to upload: open the page, check the numbers, and export. Run it on Saturday or Sunday, after Friday's invite has gone out.

- **Report date:** pick a Sunday (it defaults to the coming Sunday). The report covers the four Sunday–Saturday weeks before it. Each week has a Sunday recap, a midweek resend and a Friday invite.
- **Finding campaigns:** each week's campaigns are matched by title:
  - Friday invite: starts with `Personal invite from Pastor`
  - Sunday recap: starts with `Weekend Recap`
  - Resend: starts with `Resend: Weekend Recap`

  A week with no match shows "No resend this week" (or similar). If more than one campaign matches, the earlier send is used and you can switch to the other one on the page.
- **This Week:** cards show the newest week's numbers.
- **Report Preview:** mirrors the spreadsheet.
- **Export .xlsx:** downloads `TRA_Eblast_Performance_4_weeks_MMDDYY.xlsx` in the same layout and formatting as the original sheet.

**How each column is calculated**

| Column | Source |
| --- | --- |
| Date, Time | Send date and time in Pacific time, rounded to the nearest 15 minutes |
| Recipients | Emails sent minus hard and soft bounces |
| Opens | Unique opens excluding Apple Mail Privacy Protection, with % = opens ÷ recipients. The best open rate is marked 🎉 and highlighted. |
| Unique Clicks | Mailchimp's unique clicks |
| Clicks on teaching | Distinct people who clicked any YouTube link (youtube.com, youtu.be, m.youtube.com) |
| Subject, Preview Text | From the campaign |
| Attendance, Notes | Left blank in the export for you to fill in |

### Monthly Trend

Below the weekly report, the **Monthly Trend** section charts the last 12 months (or 6) for the Sunday recap, Tuesday resend and Friday invite:
- **Charts:** open rate, unique clicks, clicks on teaching and recipients.
- **Table:** the same figures month by month.
- **Calculation:** each month averages every email of that type sent that month (Pacific time), so months with five Sundays aren't inflated. It uses the weekly sheet's definitions, including one email per type per week (the earliest send).
- **Current month:** marked "so far".
- **Export:** adds the table to the .xlsx as a second sheet, "Monthly Trend".

Months load two at a time from `GET /api/trends?month=YYYY-MM`. Responses are cached at Vercel's edge (past months for 6 hours, the current month for 15 minutes), so after the first load the trend appears almost instantly.

## Campaign Report Page (`/report.html`)

A second page (linked from the dashboard header) that reports on a single sent campaign. It only **reads** from Mailchimp: every call to the Mailchimp API is a GET request, and nothing in Mailchimp is ever changed.

**When you open it**, the page loads full reports for the latest **Sunday recap**, **Tuesday resend** and **Friday invite** (the most recent of each sent in the last 3 weeks), in the order they went out. Use **Latest Emails** to come back to this view after a search.

**Find a campaign by:**
- **Campaign title**: an exact match on the internal title (e.g. `Resend: Weekend Recap 9/27/26 (Jerry)`). If there's no exact match it falls back to a partial, case-insensitive match. If several campaigns match, it lists them so you can pick one.
- **Campaign ID**: the Mailchimp campaign ID.
- **Send date**: every campaign sent on that day (Pacific time), with a full report for each.

**Each report shows:**
- **Details:** title, subject line, preview text, send time (Pacific and UTC), audience, and segment.
- **Metrics:** the same numbers as the weekly TRA sheet: recipients (emails sent minus bounces), opens excluding Apple Mail Privacy Protection, Mailchimp's unique clicks, and clicks on teaching (people who clicked any YouTube link). Rates are a % of recipients. Also shows total opens and clicks, hard and soft bounces, and unsubscribes.
- **Link clicks:** every clicked link, with total and unique clicks plus each link's share of all clicks and of unique clicks.
- **YouTube links:** clicks on youtube.com, youtu.be and m.youtube.com, per link, with a combined unique figure that counts each person once.

**Extras**
- **Compare with:** enter a second title to see two campaigns side by side, such as an original and its Resend. Changes are shown as counts, percentages and percentage points.
- **Download:** export the report as a CSV or JSON file.
- **Shareable links:** the page URL keeps the search, e.g. `report.html?mode=title&q=Weekend%20Recap&compare=...`

### API key

The report page reads from **The Rock Anaheim** Mailchimp account using the `MAILCHIMP_API_KEY` environment variable in Vercel. The server prefix (e.g. `us21`) is taken from the end of the key.

To run the page locally, copy `.env.example` to `.env`, fill in the key, and run `vercel dev` (it loads `.env` automatically). `.env` is git-ignored, and the key is only ever used on the server.

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
