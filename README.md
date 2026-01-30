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
