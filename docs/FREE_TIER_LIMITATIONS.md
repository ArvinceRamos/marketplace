# Free-Tier Limitations

Last checked: **2026-10-13** (Phase 8, official pages read in the browser; first check 2026-10-10).
Providers change limits often. Re-check right before deployment. Nothing here is unlimited.

## 1. Cost and limits table
| Service | Plan | Key limits (as published) | Cost | Source |
|---|---|---|---|---|
| Supabase | Free | 500 MB database (shared CPU, 500 MB RAM); 1 GB file storage; 5 GB egress + 5 GB cached egress; 50,000 monthly active users; 50 MB max upload per file; Realtime 200 concurrent connections and 2M messages/month; **2 active free projects**; **paused after 1 week of inactivity**; **no automatic backups** | ₱0 | https://supabase.com/pricing |
| Supabase Auth email | Built-in email | **2 emails per hour** for all auth emails (confirm, reset, magic link) unless custom SMTP is configured | ₱0 | https://supabase.com/docs/guides/auth/rate-limits |
| Supabase image transforms | — | Pro plan and above only | not available on Free | https://supabase.com/docs/guides/storage/serving/image-transformations |
| Supabase DB connection | Free | Direct connection is IPv6-only; use shared pooler (IPv4) | ₱0 | https://supabase.com/docs/guides/database/connecting-to-postgres |
| Render | Free web service (Hobby workspace) | Spins down after **15 minutes** without traffic; waking takes **about one minute**; 750 instance hours/month per workspace; one instance only; ephemeral disk; may restart any time; outbound SMTP ports blocked; **512 MB RAM, less than 1 CPU**. Hobby workspace: **5 GB outbound bandwidth/month** and **500 build pipeline minutes/month**; without a payment method, running out **suspends free services for the rest of the month** (bandwidth) or stops new builds (minutes). Render **may suspend a free service that sends an unusually high volume of outbound traffic** (its examples include calls to an external database) | ₱0 | https://render.com/docs/free · https://render.com/pricing |
| Vercel | Hobby | **Non-commercial personal use only**; 100 GB Fast Data Transfer; 10 GB Fast Origin Transfer; 1M function invocations; 4 h Active CPU; 360 GB-h provisioned memory; 5,000 image transformations/month; function max duration 300 s; runtime logs kept 1 hour | ₱0 | https://vercel.com/docs/limits/fair-use-guidelines · https://vercel.com/docs/limits |
| GitHub Actions | Free | Public repos: free on standard runners. Private repos: **2,000 minutes/month**, 500 MB artifacts; usage blocked when used up (no payment method) | ₱0 | https://docs.github.com/en/billing/concepts/product-billing/github-actions |
| Docker Desktop | Personal | Free for personal use, education, non-commercial open source, and small businesses (<250 staff and <$10M revenue). Needs WSL 2, 8 GB RAM, virtualization on. Docker Desktop is already installed on this PC (Docker 29.8.1, WSL 3.0.1, 15.7 GB RAM) | ₱0 | https://docs.docker.com/desktop/setup/install/windows-install/ |
| Supabase CLI local stack | Open source | Runs on your machine; no quota | ₱0 | https://supabase.com/docs/guides/local-development/cli/getting-started |

## 2. What this means for our design
| Limit | Impact | What we do |
|---|---|---|
| 1 GB storage | ~230 KB per photo (full + thumb WebP) ≈ 4,000 photos ≈ 500–1,000 listings | Max 8 photos, re-encode to WebP ≤ 1600 px, delete photos when listings are deleted |
| 5 GB egress | Each card thumbnail ~25 KB; ~200,000 thumbnail views/month before trouble | Serve thumbs in grids, full images only on detail page; cache headers |
| 500 MB database | Text rows are small; fine for tens of thousands of listings and messages | Keep images out of the DB; cap message length |
| No image transforms | Can't resize on the fly | Make thumbnails once at upload (Pillow) |
| Vercel 5K image transforms | `next/image` optimization would burn through it | Use our own thumbnails; mark Supabase images `unoptimized` |
| Render 5 GB bandwidth/month | API answers are JSON (measured 2026-10-13: a 24-item search page ≈ 13 KB, a listing ≈ 1.5 KB, uncompressed), so very roughly 300,000+ API calls a month; photos come from Supabase, not Render | Keep images off the API; watch the Render usage page; if close, add caching for public lists before anything else |
| Render may suspend high outbound traffic | Every API request talks to Supabase (database, Storage on uploads) | Normal small-group use should be fine; this is the main reason not to promote the site widely on the free plan |
| Render sleeps after 15 min | First visitor waits ~1 minute; SSR pages may time out | Loading/"waking up" state with retry; short SSR timeouts with client fallback |
| Render single instance, restarts | In-memory rate limits reset on restart | Accept for MVP; critical limits also checked in SQL (e.g. new chats per hour) |
| Supabase pauses after 7 idle days | Hosted dev project goes to sleep | Develop against the **local** stack; unpause hosted project from dashboard when needed |
| 2 active Supabase projects | RvFit likely uses one already | Marketplace uses the second slot. No separate staging project |
| No Supabase backups on Free | Data loss risk | Manual `supabase db dump` before risky migrations; document in runbook |
| 2 auth emails per hour | Email sign-up confirmation and password reset will fail beyond 2/hour | **Decision needed** (see §4) |
| Vercel Hobby non-commercial | A marketplace "advertising the sale of a product" could be read as commercial | Keep it a non-commercial learning/portfolio project: no fees, ads, or payments. Re-check terms before deploy; if it becomes commercial, Vercel needs Pro (paid) |
| Private repo CI minutes | Supabase local stack in CI ≈ 3–6 min per run | ~250+ runs/month fits; cache Docker images; run only on push/PR to main. Public repo would make CI free |

## 3. What becomes hard or impossible for free as usage grows
1. **Photo storage and bandwidth** — the first real wall. Past ~1 GB or 5 GB egress you need
   Supabase Pro (paid) or another free image host (adds complexity).
2. **Transactional email** — confirmations, password resets, and chat notifications need an
   email provider; free tiers exist but have daily caps.
3. **Always-on API** — no cold starts needs a paid Render instance.
4. **Realtime chat at scale** — 200 concurrent connections is enough for a small group, not for public launch.
5. **Commercial use** — charging fees or showing ads breaks Vercel Hobby terms.
6. **Backups and uptime guarantees** — not included on free plans.

**Honest summary:** this stack can run a family/portfolio-sized marketplace (tens of users,
hundreds of listings) for ₱0. It cannot promise unlimited users or traffic.

## 4. Decision needed: sign-up email
| Option | Cost | Trade-off |
|---|---|---|
| A. Email + password, confirmation **off** in hosted project; Google sign-in also offered | ₱0 | Simple. Fake emails possible. Password reset still emails (2/hour). Fine for a small group |
| B. Free SMTP provider for Supabase Auth (needs an account, maybe domain verification) | ₱0 within its cap | More setup; check that provider needs no payment method |
| C. Google sign-in only | ₱0 | No emails at all; excludes people without Google accounts |

Local development is unaffected: the local Supabase stack captures emails in a local inbox.
Recommendation: **A** for now, revisit before any public launch.
