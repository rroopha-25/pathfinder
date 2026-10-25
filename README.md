<p align="center">
  <img src="docs/banner.png" alt="Pathfinder: stop applying to jobs that can't hire you" width="100%">
</p>

<p align="center">
  <a href="https://chromewebstore.google.com/detail/abmjmkgdmifpioikgdlegdkgklohbfoh"><img alt="Chrome Web Store" src="https://img.shields.io/badge/Chrome%20Web%20Store-add%20to%20Chrome-4f46e5"></a>
  <img alt="Chrome Manifest V3" src="https://img.shields.io/badge/Chrome-Manifest%20V3-1a73e8">
  <img alt="Tests" src="https://img.shields.io/badge/tests-passing-0f7a55">
  <img alt="Privacy" src="https://img.shields.io/badge/data-stays%20in%20your%20browser-56627a">
  <img alt="Status" src="https://img.shields.io/badge/status-beta-a15c00">
</p>

<h3 align="center">A Chrome extension for international job seekers.<br>On any job posting: can they sponsor you, does your resume fit, and who should you message?</h3>

---

## The problem

International students on OPT are job hunting against a clock: OPT allows only a limited number of unemployment days. Yet most of their time goes to three things that don't work:

| | What happens today | Why it hurts |
|---|---|---|
| 🛂 | **Applying to jobs that can't sponsor them.** Postings are vague ("no sponsorship"? "future sponsorship"?) or silent. | Hours tailoring resumes for jobs that were never possible. |
| 📄 | **Sending the same resume everywhere.** Applicant tracking systems filter by keywords this job needs. | Hundreds of applications, almost no interviews. |
| 🤝 | **Messaging random strangers on LinkedIn.** There's no way to tell who is active, hiring, or local. | Cold messages go unanswered, with no path to a referral. |

The answers already exist: sponsorship history is public USCIS data, the job description lists the keywords, and LinkedIn shows who's active. **They're just scattered.** Pathfinder brings them into one side panel, on the page you're already looking at.

---

## Why use Pathfinder

**If you're on OPT, every week counts.** Pathfinder helps you spend it on jobs that can actually hire you.

- ⏱️ **Know in 5 seconds if a job is worth it.** No more tailoring a resume for a company that never sponsors.
- 🔍 **Find the hidden yes.** Many postings say "no sponsorship" while the company files hundreds of H-1Bs a year. Pathfinder spots this and gives you the exact question to ask the recruiter.
- 📈 **Get past the resume filter.** See which keywords this job wants that your resume is missing, and get honest line edits that never invent experience.
- 🎯 **Find your best-fit jobs in seconds.** On any careers page, see which roles match your resume at 75%+ instead of opening them one by one.
- 🤝 **Message people who reply.** Find recruiters and team members who are active, in your city, and share your school, country or past employer, with a message that sounds like you, not a template.
- 🔒 **Your data stays with you.** No account, no tracking. Your resume never leaves your browser unless you ask for AI help.
- 💸 **Free.** Built by an international student, for international students.

| Before Pathfinder | With Pathfinder |
|---|---|
| Read every posting hunting for "sponsorship" | One verdict: **Likely yes**, **Ask first**, or **Skip** |
| Google the company on H1BGrader | H-1B filings shown right next to the job |
| Guess which keywords matter | A match score plus missing keywords |
| Message random people on LinkedIn | Local, active people ranked by how likely they are to reply |

---

## See it in action

<p align="center">
  <img src="docs/demo.gif" alt="Pathfinder demo: sponsorship verdict, resume edits, and a LinkedIn message" width="360">
</p>

---

## Features

### 1. Sponsorship verdict, not just a keyword match
Pathfinder reads the posting **and** checks the company's real H-1B filings from USCIS, then gives one clear answer: **Likely yes**, **Ask first**, or **Skip**, with the reason and the next step.

| Verdict | H-1B history |
|---|---|
| <img src="docs/screenshots/feature-verdict.png" width="360"> | <img src="docs/screenshots/feature-h1b.png" width="360"> |

- Tells apart **"no sponsorship, now or later"**, a **vague "no sponsorship"**, and **legal blockers** (clearance, citizenship).
- Spots the hidden opportunity: *the posting says no, but the company sponsors hundreds a year*. It suggests asking the recruiter and gives you the exact question to copy.
- Shows new hires vs. renewals by year, the approval rate, and links to H1BGrader and MyVisaJobs.

### 2. Resume match + AI edits
| Match score | Line-by-line edits |
|---|---|
| <img src="docs/screenshots/feature-score.png" width="360"> | <img src="docs/screenshots/feature-edit.png" width="360"> |

- Scores your resume against **this** job: keywords (70), title fit (15), and measurable results (15).
- Shows **missing** keywords (required ones flagged) and **matched** ones.
- **Suggest edits** gives "change this line → to this" edits from Claude, mirroring the job's exact wording.
- **It never invents experience.** Edits only reword what's on your resume, use `[X%]` placeholders where a real number would help, and flag any line it can't find in your resume.

### 3. The right people, in your city, with a message that sounds human
| Location picker | AI-written LinkedIn message |
|---|---|
| <img src="docs/screenshots/feature-location.png" width="360"> | <img src="docs/screenshots/feature-message.png" width="360"> |

- One-click LinkedIn searches: **recent hiring posts**, **recruiters**, **people in this function**, **alumni from your school**.
- Ranks everyone you scroll past by **location** (it understands metros: "Phoenix" includes Tempe, Scottsdale and Chandler), recent activity, hiring posts, role fit, and shared school, country or employer.
- **Write message** fills a DM template with the person's role, a shared connection, and the job, then writes:
  - a **connection note** (with a live 300-character counter)
  - a **4–6 sentence message** that asks one smart question, with no bragging and no desperation
- You edit and send it yourself. **Pathfinder never sends anything automatically.**

### 4. Best jobs for you on any careers page
Open a company's careers page and click **Find my best matches**. Pathfinder reads every job listed, scores each one against your resume, and shows your **75%+ matches first**, each with a sponsorship check and the required skills you're missing.

- Reads whole job boards in one go on **Greenhouse, Lever, Ashby, Workday, SmartRecruiters and Eightfold** (e.g. Netflix), including boards embedded in a company's own site.
- On other career pages, reads each linked job politely (3 at a time) or uses the description already on the page.
- Filters: 75%+, 60%+ or all; hide jobs that say "no sponsorship". Runs only when you click.

### At a glance
<img src="docs/screenshots/feature-tiles.png" width="400">

Every job gets three tiles: **Sponsorship · Match · Contacts**. Tap one to jump to the details.

---

## How it works

```mermaid
flowchart LR
    A["Open any job posting<br/>LinkedIn · Indeed · Jobright · Google Jobs · career sites"] --> B["Pathfinder reads the job<br/>(title, company, location, description)"]
    B --> C{"Sponsorship check<br/>posting language + USCIS H-1B data"}
    C -->|"Skip"| X["Move on<br/>time saved"]
    C -->|"Likely yes / Ask first"| D["Resume match<br/>+ AI line edits"]
    D --> E["Find local recruiters<br/>& team members"]
    E --> F["AI LinkedIn message<br/>from your template"]
    F --> G(["Interview"])
    style X fill:#fdecec,stroke:#c0262d,color:#7a1418
    style G fill:#e6f6ef,stroke:#0f7a55,color:#0b4d36
```

---

## Works on

| Job boards | Applicant tracking systems | Anything else |
|---|---|---|
| LinkedIn · Indeed · Jobright · Google Jobs · Glassdoor · ZipRecruiter · Dice · Wellfound · Handshake | Greenhouse · Lever · Workday · Ashby · SmartRecruiters · iCIMS | Most company career pages, via the schema.org `JobPosting` data they publish for Google. Or highlight the job description and click **Use highlighted text**. |

---

## Install

### From the Chrome Web Store (recommended)
1. **[Add Pathfinder to Chrome](https://chromewebstore.google.com/detail/abmjmkgdmifpioikgdlegdkgklohbfoh)**, then pin it (puzzle icon → pin).
2. Open any job posting or company careers page and click the Pathfinder icon. The side panel opens.

> Chrome may show "Proceed with caution" for new extensions. That's normal for a new developer; it goes away as the extension builds a track record.

### Setup (Settings tab, about 2 minutes)
| Setting | Why | Notes |
|---|---|---|
| **Resume** | Match score and AI edits | PDF, .docx or .txt. Stays in your browser. Fills in your school and past employers automatically. |
| **School, home country, past employers** | Ranks people who share your background | Optional. Home country = where you're from. |
| **My background in one sentence** | Personalizes LinkedIn messages | e.g. *"Ops analyst moving into product work"* |
| **Claude API key** | Unlimited AI | Optional. Free AI (5 runs a day) is included from v1.1. |

### For developers (load from source)
1. Download this repo: green **Code** button → **Download ZIP**, then unzip it.
2. Open `chrome://extensions` and turn on **Developer mode**.
3. Click **Load unpacked** and select the **`pathfinder`** folder.

---

## Privacy by design

- **No accounts, no ads, no tracking.** Your resume, settings and H-1B data live in your browser (`chrome.storage.local`).
- Job and resume text leave your browser **only** when you click **Suggest edits** or **Write message**:
  - with your own key: straight to Anthropic's Claude API
  - otherwise: through the Pathfinder AI service, which forwards it to Claude and **stores nothing** (only a daily count per random install ID, for the free limit)
- Pathfinder **only reads pages you're viewing**. No bulk scraping, no auto-messaging, no automation on LinkedIn.
- **Clear all data** in Settings deletes everything.

Full policy: [docs/PRIVACY.md](docs/PRIVACY.md)

---

## Architecture

```mermaid
flowchart TB
    subgraph Browser["Your browser"]
        page["Job page / LinkedIn page<br/>(what you're viewing)"] -- "read on screen only" --> readers["extract.js · people.js<br/>job + people readers"]
        readers --> panel["Side panel<br/>sidepanel.html / .js"]
        panel <--> store[("chrome.storage.local<br/>resume · settings · H-1B data · metrics")]
        csv["USCIS H-1B data"] --> store
    end
    panel -- "only when you click<br/>Suggest edits / Write message" --> proxy["Pathfinder AI service<br/>Cloudflare Worker · stores nothing"]
    proxy --> api["Claude API<br/>structured JSON output"]
    panel -. "or your own key" .-> api
```

| File | What it does |
|---|---|
| `manifest.json` | Chrome Manifest V3 config and permissions |
| `extract.js` | Universal job reader: site adapters → JSON-LD → Next.js data → heuristics |
| `sponsorship.js` · `verdict.js` | Reads sponsorship language and combines it with H-1B history into a verdict |
| `h1b.js` | Imports USCIS CSVs (both formats), matches company names ("Google" = "GOOGLE LLC") |
| `resume.js` | Reads PDF/Word resumes locally (pdf.js, mammoth) and scores them |
| `people.js` · `location.js` | Reads LinkedIn people, ranks by activity and fit, matches metro areas |
| `prompts.js` | **All AI prompts**, including the LinkedIn DM template. Edit these to tune the AI. |
| `careers.js` | Career-page matching: finds job links and ATS boards, reads jobs politely, ranks them against your resume |
| `ai.js` | Claude calls (your key or the free service) with JSON-schema structured output and clear errors |
| `server/` | The free AI service: a Cloudflare Worker with per-user daily limits. See `server/DEPLOY.md` |
| `sidepanel.*` | The UI: Job, Resume, People and Settings tabs, light and dark mode |

---

## Light and dark mode

| Job | Resume | People |
|---|---|---|
| <img src="docs/screenshots/light-job.png" width="250"> | <img src="docs/screenshots/light-resume.png" width="250"> | <img src="docs/screenshots/light-people.png" width="250"> |
| <img src="docs/screenshots/dark-job.png" width="250"> | <img src="docs/screenshots/dark-resume.png" width="250"> | <img src="docs/screenshots/dark-people.png" width="250"> |

---

## Impact metrics (built in)

Pathfinder measures whether it changes outcomes, not just whether people click. **Settings → Copy metrics** exports:

| Metric | What it shows |
|---|---|
| Jobs checked, by site | Where people actually job hunt |
| Dead ends avoided | Jobs skipped thanks to the sponsorship verdict |
| Average match score | Resume fit over time |
| AI edits copied | Whether suggestions are actually used |
| Messages drafted / edited / copied | Outreach volume and how much people personalize |
| Visa questions asked | Recruiter conversations started |

---

## Development

```bash
npm install
npm test        # tests: job readers for 9 sites, H-1B parsing, verdicts, scoring, location matching, full panel flows
npm run package # zips the extension for upload
```

## Roadmap

- [x] Job readers for major job boards, ATS platforms and career pages
- [x] Sponsorship verdict + USCIS H-1B history
- [x] Resume score + AI line edits
- [x] Location-aware people finder + AI LinkedIn messages
- [x] Chrome Web Store release
- [x] Resume auto-fills your profile
- [x] Career-page matching: every job on a careers page scored against your resume, 75%+ first (v1.1)
- [ ] Free AI for everyone, no personal API key (v1.1)
- [ ] Built-in H-1B data, no CSV import (v1.1)
- [ ] Outreach tracker: sent → replied → referred → interview
- [ ] OPT unemployment-day tracker

Details: [docs/ROADMAP.md](docs/ROADMAP.md)

## Help make it better

Pathfinder is built from real job-search pain. If something breaks, a job site isn't read correctly, or you have an idea:

👉 **[Open an issue](../../issues)**: tell us the site, what you expected, and what happened.

Every report shapes the next version.

## Disclaimer

Pathfinder gives guidance based on job posting language and public USCIS data. **It is not legal or immigration advice.** Always confirm sponsorship with the employer.

---

<p align="center"><sub>Built for everyone who's applied to 200 jobs and heard back from 3.</sub></p>
