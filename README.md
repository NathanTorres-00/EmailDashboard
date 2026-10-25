# The Rock Anaheim — Mailchimp Reports

Read-only reporting on The Rock Anaheim's weekly emails (Friday invites, Sunday recaps and Tuesday resends), pulled live from Mailchimp.

| Page | Address | What it's for |
| --- | --- | --- |
| **Campaign Report** (home page) | `/` | The last four weeks of emails as a table of the sheet's numbers, plus search by title or date |
| **Weekly Eblast Report** | `/eblast.html` | The rolling 4-week TRA sheet with .xlsx export, and the Monthly Trend |
| Original dashboard | `/dashboard.html` | The earlier multi-audience dashboard. Not linked from the reports, and it doesn't currently load with The Rock Anaheim's API key |

Old `/report.html` links, including shared searches like `report.html?q=9/27/26`, redirect to the home page.

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

The trend starts loading once the weekly report has finished, so the weekly numbers aren't slowed down. Months load two at a time from `GET /api/trends?month=YYYY-MM`. Responses are cached at Vercel's edge: months before last month for a week, last month for a day (late opens and clicks still arrive), and the current month for 15 minutes. When a cached month expires, the saved copy is still shown while a fresh one is fetched in the background, so after the first load the trend appears almost instantly. A new deployment clears the cache.

## Campaign Report (home page, `/`)

A simple table of the weekly sheet's numbers, one row per email. It only **reads** from Mailchimp: every call to the Mailchimp API is a GET request, and nothing in Mailchimp is ever changed.

**When you open it**, the page shows the last four Sunday–Saturday weeks, grouped like the sheet:
- **Fridays/Saturdays:** the Friday invites
- **Sundays/Mondays:** the Sunday recaps
- **Midweek Resends (Sunday recaps):** the Tuesday resends

Each row shows the date, time (Pacific, rounded to 15 minutes), recipients, opens with the open rate, unique clicks, clicks on teaching, subject and preview text. It uses the same definitions and data as the Weekly Eblast Report. A week with no matching email shows a note instead, such as "No resend this week", or "Not sent yet".

**Extras**
- **Earlier weeks / Later weeks:** move the four-week window back or forward one week.
- **Find another email:** search by title (several matches give a list to pick from) or by send date (`9/27/26`). Results appear in the same row format.
- **Download CSV:** the rows on screen, in the sheet's column order, with Attendance and Notes left blank.
- **Shareable links:** `/?weeks=2026-10-11` for a four-week window, or `/?q=9/27/26` for a search.

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

Want to customize the look? Each page keeps its styles in a `<style>` block at the top of its HTML file (`index.html`, `eblast.html`, `dashboard.html`).
Want to add more metrics? Edit the stats in `app.js`

## Support

Built for The Rock Church by Nathan Torres
Questions? Check the Vercel or Netlify deployment docs.

---

**Made with ❤️ for The Rock Church ministry team**
