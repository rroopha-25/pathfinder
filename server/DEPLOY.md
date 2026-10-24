# Deploy the Pathfinder AI service (about 15 minutes, no coding)

This gives every Pathfinder user free AI edits and messages (5 a day), paid from **your** Anthropic account.

## 0. Protect your wallet first
1. Go to **console.anthropic.com → Settings → Limits** (or **Billing**) and set a **monthly spend limit** you're comfortable with (e.g. $20).
2. Create a **new API key just for this service**: **API Keys → Create Key**, name it `pathfinder-server`. Copy it.

## 1. Create a free Cloudflare account
Go to **dash.cloudflare.com** and sign up. The free plan is enough.

## 2. Create the Worker
1. Left menu: **Workers & Pages** → **Create** → **Create Worker**.
2. Name it **`pathfinder-ai`** → **Deploy**.
3. Click **Edit code**. Delete everything in the editor.
4. Open **`worker.js`** (from this folder), copy all of it, paste it into the editor.
5. Click **Deploy** (top right).

## 3. Create the usage counter (KV)
1. Left menu: **Storage & Databases → KV** (sometimes under **Workers & Pages → KV**) → **Create namespace**.
2. Name it **`pathfinder-limits`** → **Add**.

## 4. Connect the counter to the Worker
1. Open **Workers & Pages → pathfinder-ai → Settings → Bindings**.
2. **Add binding → KV namespace**.
3. **Variable name:** `LIMITS` (exactly, in capitals). **KV namespace:** `pathfinder-limits`.
4. **Save / Deploy.**

## 5. Add your API key as a secret
1. Same Worker → **Settings → Variables and Secrets → Add**.
2. **Type:** Secret. **Name:** `ANTHROPIC_API_KEY`. **Value:** the `pathfinder-server` key from step 0.
3. Optional (type: Text):
   - `PER_USER_DAILY` = `5` (free AI runs per user per day)
   - `GLOBAL_DAILY` = `300` (total free runs per day for everyone; your cost ceiling)
4. **Deploy.**

## 6. Copy your Worker URL
On the Worker's overview page you'll see something like:
`https://pathfinder-ai.YOURNAME.workers.dev`

Send that URL back (or paste it into `pathfinder/config.js` as `PATHFINDER_AI_URL`), then rebuild the extension zip with a new version number and upload it to the Chrome Web Store.

## Check it's working
After the new extension version is installed, remove your own key from Pathfinder Settings, open a job, and click **Suggest edits**. You should see results and "4 free AI runs left today".

## Costs and safety
- Cloudflare free plan: 100,000 requests/day, far more than you need.
- Anthropic: you pay per AI run. `GLOBAL_DAILY` caps how many free runs happen per day, so your maximum daily cost is bounded. Check current per-token prices at anthropic.com/pricing.
- The service only accepts Pathfinder's two request types and only from Chrome extensions, so it can't be used as a general free chatbot.
- To pause free AI instantly: set `GLOBAL_DAILY` to `0` and deploy.
