# Pathfinder roadmap

## In progress (v1.1.0)
- [x] Resume auto-fills profile (school, past employers, background)
- [x] Free AI service (Cloudflare Worker, 5 runs/user/day, global cap) — waiting on deploy + Worker URL
- [ ] Built-in USCIS H-1B data (no CSV import) — waiting on the USCIS CSV files

## Next: Career-page job matching (suggested by a tester)
**Idea:** When a user opens a company's careers page, Pathfinder scans all the listed jobs and highlights the ones that match their saved resume at **75% or higher**, instead of the user opening each job one by one.

Notes for building it:
- Read the job list on the page (Greenhouse, Lever, Workday, Ashby and most career sites list jobs in a standard way); open each job's details in the background only as needed.
- Score each job against the saved resume with the existing local match score (no AI cost), then show a ranked "Best matches here" list with score + sponsorship verdict.
- Respect the site: small batches, a short delay between requests, cache results, and only run when the user is on that page and clicks "Find my matches".
- Then: filter by location / remote, and let the user change the 75% threshold.

## Later
- Outreach tracker: sent → replied → referred → interview
- OPT unemployment-day tracker
- Simple landing page (GitHub Pages)
