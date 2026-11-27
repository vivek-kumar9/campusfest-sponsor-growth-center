# CampusFest Sponsorship Growth Center

My submission for the RISA Labs Growth APM assignment, Challenge B (sponsorship growth).
Vivek Kumar, IIT Delhi

Live app: https://campusfest-sponsor-growth-center.vercel.app
The 3-slide strategy deck is submitted as a PDF along with this repo.

This README covers the reasoning behind the deck (data, model, bets, thresholds), how the app works, how to run it, and what I would still improve.

## Why I chose sponsorship, and Delhi NCR

I picked Challenge B because the sponsor dataset is essentially a small B2B sales pipeline: brands, outreach, qualification, then deals with a stage history and rupee values. That is much closer to how RISA itself grows than attendee marketing is, and it is the kind of funnel I wanted to reason about.

There is also a gap in this data that ends up driving most of my plan. A "confirmed" partnership has a value attached, but nothing in the data says the money was received. The goal is cash collected *before* the fest, so when a deal gets signed matters as much as whether it gets signed.

I set the fest in Delhi NCR for two reasons. Sponsors pay for student reach, and Delhi University alone admitted about 72,000 undergraduates in 2025-26. The buyers are also close by: Gurugram has offices of 250+ Fortune 500 companies, so most pitches can be done in person rather than over email.

## What the 2025 data shows

Source file: `data/source/Sponsor_Dataset.xlsx` (fictional CampusFest 2025: records from 15 Jan to 20 Apr 2025, fest on 12-13 Apr 2025). I worked out every number below twice, once in pandas (`analysis/analyze.py`) and once in the app's SQL, and the two match.

Before counting anything I had to deal with a few traps in the data:

- Some IDs appear twice with identical rows (3 interactions, 1 qualification record, 2 opportunity records). I treated these as import retries and kept one copy. None of them had conflicting values.
- Qualification and opportunity tables are histories where each row is the full state at that time. For any date I take the latest row before the end of that day (IST). Adding the rows up would double count.
- Cobalt Learning was confirmed on 25 Feb and then withdrawn on 20 Mar, so it is not a confirmed partnership.
- The target was raised on 15 Mar (from 40 qualified brands / 20 partnerships to 55 / 28), so any "vs target" number depends on the date you look at.

The headline numbers at the end of the data:

| | |
|---|---|
| Brands researched | 180 (270 contacts) |
| First touches | 370: 322 cold emails/LinkedIn messages, 30 introductions, 18 partner-form submissions |
| Brands that replied / replied positively / met | 109 / 74 / 60 |
| Qualified brands | 60 against a goal of 55 |
| Opportunities | 58 (Beardo has two) |
| Confirmed partnerships | 24 against a goal of 28 (86%) |
| Confirmed value | ₹22,40,000: ₹20,00,000 cash from 20 deals (₹1,00,000 average) and ₹2,40,000 in kind from 4 |
| Lost / withdrawn | 7 / 1 |
| Still open | 26 deals worth ₹14,40,000, all from cold channels, none moved in the last 10+ days |
| Cash actually received | Not in the data |

Splitting by how the brand came in is the most useful cut. I grouped the six campaigns into warm (Warm Partner Introductions, Creator Network Referrals), inbound (Partner Interest Form) and cold (Brand Discovery Email, Brand Leader LinkedIn, Past Conversation Revival):

| Group | Touches | Brands | Brands met | Qualified | Opportunities | Confirmed | Value |
|---|---|---|---|---|---|---|---|
| Warm | 30 | 27 | 23 | 23 | 18 | 17 | ₹15.7L |
| Inbound | 18 | 17 | 13 | 13 | 7 | 7 | ₹6.7L |
| Cold | 322 | 141 | 24 | 24 | 33 | 0 | ₹0 |

Every confirmed partnership came from a warm introduction or the partner form. Cold outreach created a lot of activity (322 touches, 33 opportunities) and not a single signed deal; 26 of those opportunities were still open and stalled when the fest happened.

A few other things stood out:

- 16 opportunities were opened for brands that hadn't been qualified yet, and only 1 of them closed. Opportunities opened on qualified brands closed 23 times out of 42.
- Kabir Shah owns 126 of the 180 brands (70%) and logged 683 interactions, but owns none of the opportunities. That looks like a hand-off problem as much as a workload one.
- Brand Discovery Email got 7 opt-outs from 224 sends (3.1%).
- Warm deals close quickly: a median of 10 days from opportunity to confirmation, 5 days from proposal.
- 8 of the 20 cash deals (₹8.2L, 41% of the cash value) were confirmed less than 30 days before the fest. Under normal payment cycles a lot of that money would arrive after the event.

## Slide 1: how high can we aim

For each sponsor segment:

`cash collected before the fest = prospects × conversion to a signed cash deal × average deal × share paid before the fest`

The four segments, in the order I'd work them:

1. Renewals of the 20 cash partners from 2025. The fit is proven and the relationship exists, so they are the fastest to sign and to pay.
2. Warm introductions (alumni, existing partners, creators). This was the engine in 2025: 47% of introductions became cash deals.
3. Inbound partner-form submissions: 33% became cash deals.
4. Cold outreach, but only after a brand is qualified. It converted 0% in 2025, so I keep it as a small, capped test.

What sponsors are buying, and what I'd pitch: Gen-Z reach and sampling (food, personal care, consumer products), app installs and leads (education, mobility, media), and employer branding. I'd only chase brands with a fit with the audience, a budget of at least ₹50k, a warm route to a decision maker and the ability to pay before the fest.

### Modelling when the cash arrives

Since the data has no payments, I modelled collection explicitly. I assumed a payment-lag curve after signing: 25% paid within 15 days, 50% within 30, 75% within 45, 90% within 60 and everything by 90 (straight lines in between). That is a median of 30 days, deliberately quicker than the Indian B2B averages I found (Atradius 2025: about 52-day payment terms; Aon 2026: 56 days receivable), because a sponsorship is tied to a fixed event date.

Applying that curve to the real 2025 confirmation dates gives the share of cash that would have arrived before the fest: 58.1% for warm deals, 46.9% for inbound, 54.5% overall. In other words, of the ₹20L confirmed in 2025, only about ₹10.9L was likely in the bank by the fest.

With advance terms (50% due 7 days after signing, assuming 90% of sponsors comply, balance due a week before the fest) and an outreach calendar that starts 3 weeks earlier, those shares rise to 90.7% for warm, 88.7% for inbound, 93.3% for renewals and 80.4% for cold.

### Base case and stretch

| Segment | Base | Stretch |
|---|---|---|
| Renewals | 20 × 40% = 8 deals × ₹1.00L = ₹8.0L signed, 80% paid in time = ₹6.4L | 20 × 65% = 13 deals × ₹1.10L = ₹14.3L, 93.3% = ₹13.3L |
| Warm intros | 30 × 46.7% = 14 × ₹97.5k = ₹13.7L, 58.1% = ₹7.9L | 60 × 40% = 24 × ₹97.5k = ₹23.4L, 90.7% = ₹21.2L |
| Inbound | 18 × 33.3% = 6 × ₹1.06L = ₹6.35L, 46.9% = ₹3.0L | 30 × 33.3% = 10 × ₹1.06L = ₹10.6L, 88.7% = ₹9.4L |
| Cold (qualified first) | 30 × 0% = 0 | 30 × 10% = 3 × ₹55k = ₹1.65L, 80.4% = ₹1.3L |
| Total | 28 deals, ₹28.0L signed, ₹17.3L collected | 50 deals, ₹49.9L signed, ₹45.3L collected |

The base case is "repeat the 2025 playbook, add renewals at a cautious 40%, keep normal payment terms". The stretch is what the five bets on slide 2 add.

Where each input comes from:

| Input | Value | Basis |
|---|---|---|
| Warm intro to cash deal | 14/30 = 46.7%; 40% in the stretch because extra intros will be weaker | 2025 data, then my haircut |
| Inbound to cash deal | 6/18 = 33.3% | 2025 data |
| Average cash deal | warm ₹97,500, inbound ₹1,05,833, overall ₹1,00,000 | 2025 data |
| Cold (qualified) to deal | 0 of 33 in 2025; 10% in the stretch with qualify-first and an entry package | 2025 data, then my assumption |
| Renewal rate | 40% base, 65% stretch | my assumption (2025 is the only year in the data) |
| Renewal price | +10% through bundles | my assumption |
| Warm intro volume | 30 base (2025 actual), 60 stretch (alumni asks plus a referral ask at every signing) | 2025 data / my assumption |
| Inbound volume | 18 base (2025 actual), 30 stretch (sponsor page and LinkedIn posts) | 2025 data / my assumption |
| Payment-lag curve | see above | my assumption, set against published benchmarks |

All of these sit in an `assumptions` table that can be edited on the Decide page; the model in the app and the copilot both recalculate from it.

### Why I think ₹45L is reachable

- Every conversion rate is either measured in the 2025 data or cut down from it. The stretch mostly comes from more volume in channels that already convert, and from getting paid earlier, not from optimistic conversion rates.
- Capacity: 50 deals need roughly 115 meetings over 16 weeks (about 1.5 meetings per warm deal plus around 40 cold meetings). That is about 7 a week for a team of four. 2025 managed 60 meetings while Kabir was mostly sending cold email, so moving him onto renewals and inbound follow-ups should cover it.
- What could go wrong: if renewals come in at 50% instead of 65%, the stretch drops by about ₹3L; with 45 warm intros instead of 60, by about ₹5L. Keeping normal payment terms costs about ₹14L, which is why payment terms are the first bet. Each risk has a threshold and a fallback on slide 3.

## Slide 2: the five bets

I ranked ideas by `extra cash collected before the fest (₹ lakh) × confidence ÷ effort (person-weeks)`, and dropped anything whose cash couldn't land before the fest. For confidence I used 0.7 when the rate is measured in the 2025 data, 0.6 when it rests on a published benchmark plus my assumption, and 0.3-0.5 for things nobody has tested yet. To avoid double counting, I added the bets one at a time in rank order going from the base case to the stretch, so the contributions add up exactly to the ₹28L gap.

| # | Bet | Why I think it works | Extra cash | Conf. | Effort (pw) | Score | Budget | Owner | Weeks |
|---|---|---|---|---|---|---|---|---|---|
| 1 | Advance-payment terms and an earlier close calendar | 41% of 2025 cash was confirmed less than 30 days before the fest | ₹8.2L | 0.6 | 1.5 | 3.27 | ₹75k (reserve for a 3% early-payment discount) | Meera | 1-16 |
| 2 | Renewals first, backed by a short ROI report for each 2025 partner | 20 existing relationships, quickest to sign and pay | ₹5.9L | 0.6 | 3 | 1.18 | ₹25k | Riya | 1-6 |
| 3 | More warm intros: alumni, partner referrals, creators | 47% of 2025 intros became cash deals; cold converted 0% | ₹8.8L | 0.7 | 6 | 1.03 | ₹60k | Nisha | 2-12 |
| 4 | More inbound: a public sponsor page and LinkedIn posts with 2025 results | 33% of 2025 form fills became cash deals, and it is cheap to scale | ₹3.8L | 0.5 | 3 | 0.63 | ₹50k | Kabir | 3-12 |
| 5 | Cold outreach only after qualification, with a ₹55k entry package | 0 of 33 cold deals closed in 2025, so this stays a capped test | ₹1.3L | 0.3 | 3 | 0.13 | ₹10k | Kabir | 1-8 |

That is ₹2.2L of a ₹2.5L budget and 16.5 of about 20 person-weeks.

I would put most of the effort into bets 1, 3 and 2. Bet 4 gets a ₹15k ad budget, and I'd only add more if it performs. Bet 5 is stopped after 10 proposals unless it starts winning.

Ideas I'm not pursuing:
- Mass cold email: 322 touches, 0 deals and 7 opt-outs last year.
- Raising prices across the board: the ₹1.25L cold proposals were exactly the ones that got lost.
- Barter deals: they don't bring in cash.
- Outsourcing to an agency: their margin buys no evidence of better conversion.

How the bets interact: partners who renew are also the best source of referrals, but I only count those referrals once, under bet 3. Payment terms apply to every deal, so bet 1 is measured as a collection rate rather than as extra deals. And if bet 5 is stopped, Kabir's time goes to bets 2-4.

## Slide 3: how I'll know what's working

| Bet | Biggest risk | Early signal | Scale if | Change if | Stop if |
|---|---|---|---|---|---|
| 1 Payment terms | Sponsors refuse and we sign fewer deals | First 10 signings, by week 3 | 70%+ pay the advance within 7 days and the proposal win rate stays within 10 points of 2025's 52% | 40-70% pay: ask for 30% upfront, raise the PO at signing, call on day 5 | Under 40%, or win rate drops more than 10 points: go back to normal terms for new deals |
| 2 Renewals | 2025 partners didn't see enough value | 12 of the 20 partners agree to meet by week 2 | Half renewed by week 6: add an upsell tier | 30-50%: offer a smaller bundle, try a new contact | Under 30%: drop the special pricing and treat them as normal warm leads |
| 3 Warm intros | Alumni fatigue, low-quality intros | 15+ intros from the first 100 asks by week 3; 4 a week by week 4 | 4+ a week and 70%+ turn into meetings (2025: 85%) | Meeting rate under 70%: target different roles or sectors | Under 2 a week after week 5: stop paying for alumni events |
| 4 Inbound | Forms from brands with no real budget | 2.5 submissions a week by week 5 | Under ₹5k per qualified lead: raise the ad budget | ₹5-10k per lead: change the creative or audience | Under 1 a week after ₹15k spent: stop the ads |
| 5 Cold reset | Same 0% result as 2025 | 8+ meetings per 100 touches (2025: 7.5) | 15%+ wins after 10 proposals: keep going | 5-15%: keep only the entry package | Under 5% after 10 proposals: stop and move Kabir to bets 2-3 |

The app is built around this table. The Decide page calculates each bet's KPI from the live data, compares it with these lines and shows Scale, Change, Stop, Keep testing or No data. The Diagnose page lists stalled deals with a one-click follow-up task. The copilot can answer "which bets crossed a line this week?", explain why from the data, and propose tasks or status changes that someone has to confirm.

## The app

| Page | What it's for |
|---|---|
| Command Center | Targets vs actuals (using whichever target version was in force on the chosen date), confirmed value split into cash and in-kind, cash actually recorded, open pipeline, a projection to the fest date, cumulative charts against the goal, the brand funnel, channel groups and campaign KPIs |
| Diagnose | Findings with the numbers behind them (bottlenecks, process issues, workload, opt-outs, cash timing), funnel conversion by channel group, stalled deals with a follow-up button, the win-probability table and team workload |
| Decide | The five bets with live KPIs against their thresholds, editable owner, decision and spend, and the base vs stretch model with editable assumptions |
| Execute | Opportunities (change stage or value, record payments, see full history), tasks (owner, due date, status, priority), campaigns (status, owner, budget, spend, notes), brands (qualification, logging outreach, adding brands), payments and target versions |
| AI Copilot | A side panel on every page plus a full-screen view |
| Data & Audit | What the data can and can't answer, the counting rules, the import/de-duplication log, every copilot proposal and whether it was confirmed, a full audit log, and a reset button |

Two design decisions worth explaining:

- **Choosing a date.** Every page, and the copilot, can be viewed "as of" a date (end of that day, IST) or on all the data. There are shortcuts for 15 Mar, when the target changed, and 11 Apr, the day before the fest. Snapshots only count records from before that point, so nothing from the future leaks into an earlier view.
- **The campaign clock.** The data stops in April 2025, so when you change a deal stage, log an interaction or record a payment, the app timestamps it one minute after the latest activity in the data (or at the end of the date you're viewing), unless you pick a time yourself. Otherwise "days in stage" and the projections would be measured against today's date and stop making sense. Tasks use real dates.

### How it's built

- Next.js 15 (App Router, TypeScript, Tailwind, Recharts) with a single catch-all API route (`app/api/[...path]/route.ts`).
- Postgres: Neon in production, or embedded PGlite when `DATABASE_URL` isn't set, so it also runs locally with no setup. The same SQL runs on both.
- The as-of logic lives in SQL functions (`opp_state_asof`, `brand_qual_asof`, `target_asof`, `cut_of`), so the dashboard, the copilot and ad-hoc queries all count the same way.
- Every metric is computed from the tables at request time (`lib/analytics.ts`). Writes go through validation and are logged (`lib/mutations.ts`).
- The original data ships as `data/seed.json` (made by `analysis/make_seed.py`), and "Reset to original data" restores it.

### The copilot

The copilot (`lib/copilot.ts`) never answers from memory. It calls tools that query the database (overview, funnel, campaign and owner performance, deal lists and detail, bottlenecks, trends, the bets, the growth model with what-if changes, tasks, a data-coverage check, read-only SQL) and writes its answer from what they return.

- **Numbers:** all arithmetic happens in SQL or TypeScript. The model is told to use only tool numbers and to show the formula for anything it derives. Each answer lists the tool calls it made under "Data used".
- **SQL safety:** one SELECT or WITH statement, a keyword block-list, a READ ONLY transaction, a 4-second timeout and a 200-row cap.
- **Saying "I don't know":** the coverage tool lists what is missing (bank receipts, spend, sponsor ROI, renewal history, loss reasons, geography, attendee data). The prompt asks it to name the gap, offer a clearly labelled proxy if there is one, say what would need to be recorded, and flag small samples.
- **Taking action:** it can propose tasks, campaign status changes, stage updates and payments. These are saved as pending, shown with Confirm and Reject, and only applied once someone confirms. Confirmed changes go through the same validation and audit log as manual edits.
- **Follow-ups:** the last 12 messages and the selected date go with each question.

One thing broke after deployment. The first version tried `gemini-flash-latest` first, and the "create tasks" question timed out (HTTP 504). I added an `/api/llm-check` endpoint to see what my free-tier key could actually use: the thinking-heavy flash models were taking more than 6 seconds even to reply "ok", and the 2.5 models are closed to new keys. I switched the default order to `gemini-3.5-flash-lite`, `gemini-flash-lite-latest`, `gemini-3.1-flash-lite`, `gemini-3.5-flash`, `gemini-flash-latest`. I also added a 15-second timeout per call and a 40-second budget per answer, and made the app remember which model worked so it stops retrying broken ones. The same question now takes about 5 seconds. If no model is available at all, the copilot says so and shows computed diagnostics instead of making something up.

### Things to try

1. "Are we on track for the confirmed-partnership target? What's driving the gap?"
2. "Which stalled deals should we chase first? Create tasks for the top 3." Confirm the tasks, then check Execute → Tasks.
3. "How much cash have we actually collected?" It should say none is recorded and that confirmed value isn't cash.
4. Record a payment on a confirmed deal in Execute → Opportunities, then ask again. The answer and the Command Center both change.
5. "Which campaign has the best ROI?" There's no spend data, so it should say that and offer confirmed value per touch as a stand-in.

Answers to check against (original data, latest date):

| Question | Answer |
|---|---|
| Confirmed partnerships vs target | 24 vs 28 (86%), "Sponsor revised plan" from 15 Mar 2025 |
| Qualified brands as of 14 Mar 2025 | 53 vs 40 (launch plan still in force) |
| Qualified brands as of 15 Mar 2025 | 55 vs 55 (revised plan) |
| Confirmed partnerships as of 31 Mar 2025 | 23, worth ₹20,90,000 |
| Confirmed value split | ₹20,00,000 cash (20 deals) + ₹2,40,000 in kind (4) |
| Cash collected | Not in the data; ₹0 until payments are recorded |
| Cobalt Learning | Confirmed 25 Feb, withdrawn 20 Mar, so not counted |
| Cold channels | 33 opportunities, 0 confirmed, 26 open (₹14.4L), 6 lost, 1 withdrawn |
| Best converting campaign | Creator Network Referrals: 9 of 9 opportunities confirmed (21 touches); Partner Interest Form 7 of 7 |
| Owner with the most stalled deals | Riya Kapoor (10) |
| Duplicates removed | 3 interactions, 1 qualification record, 2 opportunity records |

## Running it

Locally:

```bash
npm install
cp .env.example .env.local   # add GEMINI_API_KEY; leave DATABASE_URL empty to use embedded PGlite
npm run dev                  # http://localhost:3000 (loads the data on first request)
npm run check                # prints the reference numbers from the analytics code
```

Deploying (all free tiers):
1. Import the repo in Vercel (Next.js is detected automatically).
2. Add `GEMINI_API_KEY` from Google AI Studio as an environment variable.
3. Storage → Create Database → Neon, connected to the project with the prefix `DATABASE` (this creates `DATABASE_URL`).
4. Redeploy. The first request creates the tables and loads the data, which takes a few seconds.

Supabase also works: set `DATABASE_URL` to its transaction pooler connection string.

Environment variables:

| Name | Needed? | Notes |
|---|---|---|
| `DATABASE_URL` (or `POSTGRES_URL`) | For data to persist in production | Pooled URLs work (`prepare: false`) |
| `GEMINI_API_KEY` | For the copilot | Without it the copilot only shows computed diagnostics |
| `GEMINI_MODEL` | No | Moves a model to the front of the list |
| `LLM_REASONING` | No | `on` sends `reasoning_effort: low` (slower); off by default |
| `LLM_BASE_URL`, `LLM_API_KEY` | No | Any OpenAI-compatible endpoint that supports tool calling |

Endpoints I used for checking the deployment:
- `GET /api/health`: database type, persistence, data version, whether the AI key is set
- `GET /api/llm-check`: which models the key can use right now
- `GET /api/ask?q=...&asOf=YYYY-MM-DD`: runs one copilot question and returns the answer, tool calls, model and time taken

## How I tested it

- **Numbers:** pandas (straight from the Excel file) and the app's SQL give identical results for 15 Feb, 14 Mar, 15 Mar, 31 Mar, 11 Apr and the latest date: qualified brands, confirmed count and value, open pipeline and target version.
- **Databases:** ran it on embedded PGlite and on a real Postgres server. Results were the same, and several cold starts at once still load the data only once.
- **Edits:** stage changes, payments, tasks, campaigns, brands, qualification, interactions, targets, bet edits, assumptions and reset, each checked through the API and then in the dashboards.
- **Copilot without the live model:** tested the tool loop, the SQL guard (a `delete` is rejected) and the confirm/reject flow against a scripted stand-in model.
- **Copilot on the deployed app** (`gemini-3.5-flash-lite`, answers checked against the data):
  - "Which stalled deals should we follow up first? Create tasks for the top 3." Cedar Pantry ₹1,10,000 (33.5 days in negotiation), Evergreen Pantry ₹90,000 (47.5) and Daybreak Pantry ₹90,000 (56.5); 3 tasks proposed for confirmation; 4.8 s.
  - "Qualified brands as of 14 March 2025 vs the goal in force?" 53 vs 40 (launch plan); 1.9 s.
  - "Which campaign has the best ROI?" Says spend isn't tracked, uses confirmed value per touch as a labelled stand-in and names Creator Network Referrals; 3.0 s.
  - "Stretch cash if renewals come in at 50%?" ₹45,27,875 goes to ₹42,19,985 (down ₹3,07,890), labelled as assumptions; 2.0 s.
  - "Did the Beardo activation increase attendance?" Attendance data isn't in the dataset, and the link is only an association; 3.0 s.
  - "How much cash have we actually collected?" ₹0 recorded; the ₹20,00,000 of confirmed cash isn't proof of payment.

## Tools I used

- Claude as a coding and analysis assistant for data profiling, SQL and the app code. I checked every number separately in Python and in SQL.
- Next.js 15, React 19, Tailwind CSS 4, Recharts 3, react-markdown with remark-gfm, postgres.js, PGlite and tsx; pandas for the analysis.
- Vercel (Hobby), Neon (free) and the Gemini API through Google AI Studio (free tier).
- The project started from `create-next-app`; nothing else is from a template.

## Limitations and what I'd do next

- The data has no bank receipts, spend or sponsor-side ROI. Cash collected starts at ₹0 until payments are recorded, campaign ROI can't be computed from the source data, and the collection rates in the model are assumptions checked against published benchmarks. The first thing I'd add is invoice and payment tracking.
- 2025 is the only year in the data, so renewal rates are a guess until the first renewal conversations happen.
- Campaign attribution only records which campaign each record came through; it doesn't prove that campaign caused the deal. The three sponsor activations are associations, not measured uplift.
- The win-probability table uses small samples (the counts are shown) with Laplace smoothing, so projections are directional.
- There's no login: anyone with the link can edit. That's fine for a demo but would need auth before real use.
- The copilot runs on a free-tier Gemini quota; if it runs out, the app falls back to computed diagnostics.

## Sources

- Delhi University admissions 2025-26 (about 72,230 undergraduates admitted): Careers360, Dec 2025.
- Gurugram hosts offices of 250+ Fortune 500 companies: Built In; Google Arts & Culture.
- Indian B2B payment terms average about 52 days: Atradius Payment Practices Barometer India 2025 (via Trade Treasury Payments). Average days receivable of 56 days in 2025: Aon 2026 Working Capital Benchmarking (via Business Today).
- RISA Labs background (B2B oncology workflow automation): company site and press coverage, 2025-2026.
