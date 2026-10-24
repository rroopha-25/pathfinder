# Pathfinder Privacy Policy

_Last updated: October 22, 2026_

Pathfinder is a Chrome extension that helps job seekers evaluate job postings. It's designed to keep your data on your device.

## What Pathfinder stores
All of this is stored **only in your browser** (`chrome.storage.local`).
- Your resume text (from the file you upload)
- Your settings: school, home country, past employers, background sentence, preferred location, and (optionally) your own Claude API key
- A random install ID, used only to count free AI runs per day
- H-1B data you import from USCIS
- Basic job details for jobs you view (title, company, location, sponsorship verdict)
- LinkedIn profile details visible on pages you view (name, headline, location), used to rank contacts for you
- Usage counts (e.g. jobs checked, edits copied) so you can see your own progress

## What Pathfinder reads
Pathfinder reads the content of job pages and LinkedIn pages **only while you are viewing them**. It doesn't crawl sites, visit pages on its own, or send messages for you.

## What leaves your device
Only when you click **Suggest edits** or **Write message**, Pathfinder sends the job description, your resume text, and (for messages) the selected person's public headline and location for AI processing:
- **If you added your own Claude API key**, this goes directly from your browser to **Anthropic's Claude API**.
- **Otherwise**, it goes to the **Pathfinder AI service** (a Cloudflare Worker run by the developer), which forwards it to Anthropic's Claude API and returns the result. The service does **not** store your resume, the job, or the AI response. It only keeps a count of AI runs per random install ID for about one day, to enforce the free daily limit.

Anthropic processes this data under its own terms and privacy policy: https://www.anthropic.com/legal/privacy. Cloudflare's privacy policy: https://www.cloudflare.com/privacypolicy/

## What Pathfinder never does
- Sell or share your data
- Use analytics, ads or tracking
- Load remote code
- Send LinkedIn messages or connection requests automatically

## Deleting your data
Open **Settings → Clear all data**, or remove the extension. Both delete everything Pathfinder stored.

## Contact
Questions: open an issue on this repository.
