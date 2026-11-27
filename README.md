# CampusFest Sponsorship Growth Center

RISA Labs Growth APM assignment, **Challenge B: Sponsorship Growth** (maximise sponsorship cash collected before the festival).
Author: Vivek Kumar, IIT Delhi.

The repo contains the working product (dashboard, campaign and task management, embedded AI growth analyst) and the research, model and calculations behind the 3-slide strategy.

- Live app: _add your Vercel URL here_
- Strategy deck: 3 slides (PDF, submitted separately)

---

## 1. Decisions in one minute

| Decision | Choice | Why |
|---|---|---|
| Challenge | B, sponsorship cash | The provided sponsor data is a clean B2B pipeline (brands → outreach → qualification → opportunities → confirmed). It also has the gap that matters most for this goal: **confirmed value is not cash**. |
| City | Delhi NCR | Dense student audience to sell (DU alone admitted ~72,000 UG students in 2025-26) and sponsor decision-makers within meeting distance (Gurugram has offices of 250+ Fortune 500 companies). |
| Target | **₹45L cash collected before the fest (stretch), ₹17L base** | Built bottom-up from 2025 conversion rates per channel plus an explicit payment-timing model (Section 3). |
| Biggest insight | Warm channels convert; cold doesn't. Cash timing is the hidden lever. | 2025: warm intros turned 30 touches into 17 confirmed deals; cold outreach turned 322 touches into 33 opportunities and **0** confirmed. 41% of 2025 cash value was confirmed <30 days before the fest. |

---

## 2. What the 2025 data says (baseline)

Source: `data/source/Sponsor_Dataset.xlsx` (fictional CampusFest 2025, records 15 Jan to 20 Apr 2025, event 12-13 Apr 2025). All numbers below are computed by `analysis/analyze.py` and re-computed live by the app's SQL (they match).

**Data handling**: duplicate source IDs with identical payloads dropped (3 interactions, 1 qualification version, 2 opportunity versions, 0 conflicts). Histories are full-state versions, so each entity uses its latest version before the cut-off (end of the selected day, IST); versions are never summed.

| Metric (latest) | Value |
|---|---|
| Brands researched | 180 (270 contacts) |
| Source touches | 370 (322 outreach sends, 30 introductions, 18 inbound partner forms) |
| Brands that replied / positive / met | 109 / 74 / 60 |
| Qualified brands | **60** vs goal 55 (revised plan from 15 Mar; launch plan was 40) |
| Opportunities | 58 (one brand, Beardo, has two) |
| Confirmed partnerships | **24** vs goal 28 (86%) |
| Confirmed value | ₹22,40,000 = ₹20,00,000 cash (20 deals, avg ₹1,00,000) + ₹2,40,000 in-kind (4 deals) |
| Lost / withdrawn | 7 / 1 (Cobalt Learning was confirmed on 25 Feb, then withdrawn on 20 Mar, so it does not count) |
| Open pipeline | 26 deals, ₹14,40,000, all from cold channels, all stalled ≥10 days |
| Cash actually received | **Unknown**: no bank-receipt data in the source |

**By channel group** (warm = Warm Partner Introductions + Creator Network Referrals; inbound = Partner Interest Form; cold = Brand Discovery Email + Brand Leader LinkedIn + Past Conversation Revival):

| Group | Touches | Brands | Meetings (brands) | Qualified | Opportunities | Confirmed | Value |
|---|---|---|---|---|---|---|---|
| Warm | 30 | 27 | 23 | 23 | 18 | 17 | ₹15.7L |
| Inbound | 18 | 17 | 13 | 13 | 7 | 7 | ₹6.7L |
| Cold | 322 | 141 | 24 | 24 | 33 | **0** | ₹0 |

Other findings the app surfaces automatically (Diagnose page):
- 16 opportunities were opened for brands that were not yet qualified; only 1 of them closed. Opportunities opened on qualified brands closed 23 of 42 times.
- Kabir Shah owns 126 of 180 brands (70%) and logged 683 interactions but owns 0 opportunities: a capacity and hand-off problem.
- Brand Discovery Email drew 7 opt-outs from 224 sends (3.1%).
- Warm deals close fast: median 10 days from opportunity to confirmation, 5 days from proposal.
- 8 of 20 cash deals (₹8.2L, 41% of cash value) were confirmed less than 30 days before the fest.

---

## 3. Slide 1 model: how high can we aim?

### Structure
For each sponsor segment:

`cash collected before fest = prospects × conversion to signed cash deal × average cash deal × share collected before the fest`

Segments and why they are prioritised:
1. **Renewals** (20 cash partners from 2025): known fit, relationship exists, fastest to close and pay.
2. **Warm introductions** (alumni, existing partners, creators): 2025's engine, 47% intro → cash deal.
3. **Inbound** (partner form): self-selected intent, 33% → cash deal.
4. **Cold, qualified first**: 2025 converted 0%; kept only as a capped test with an entry package.

Sponsor motivations used in pitching: Gen-Z reach and sampling (food, personal care, consumer products), app installs/leads (education, mobility, media), employer branding. Selection criteria: audience fit, budget ≥ ₹50k, a warm path to a decision maker, ability to pay before the fest.

### Collection model (the cash-timing lever)
There are no payment records in the data, so collection is modelled explicitly:
- Payment-lag curve after signing (assumption): 25% paid within 15 days, 50% within 30, 75% within 45, 90% within 60, 100% within 90 (linear in between). Median 30 days, deliberately faster than Indian B2B averages (Atradius 2025 reports ~52-day average payment terms; Aon's 2026 benchmarking reports 56 days receivable), because a sponsorship has a fixed event date.
- Applied to each 2025 cash deal's actual confirmation date → value-weighted share paid before the fest: **warm 58.1%, inbound 46.9%, all 54.5%** (i.e. of 2025's ₹20L confirmed cash, only ~₹10.9L would likely have arrived before the fest).
- With advance terms (50% due 7 days after signing with 90% compliance, balance due D-7) and a calendar starting 3 weeks earlier: warm 90.7%, inbound 88.7%, renewals 93.3%, cold 80.4%.

### Base vs stretch

| Segment | Base: prospects × conv → deals × avg → signed × collected% = cash | Stretch |
|---|---|---|
| Renewals | 20 × 40% → 8 × ₹1.00L → ₹8.0L × 80.0% = **₹6.4L** | 20 × 65% → 13 × ₹1.10L → ₹14.3L × 93.3% = **₹13.3L** |
| Warm intros | 30 × 46.7% → 14 × ₹97.5k → ₹13.7L × 58.1% = **₹7.9L** | 60 × 40% → 24 × ₹97.5k → ₹23.4L × 90.7% = **₹21.2L** |
| Inbound | 18 × 33.3% → 6 × ₹1.06L → ₹6.35L × 46.9% = **₹3.0L** | 30 × 33.3% → 10 × ₹1.06L → ₹10.6L × 88.7% = **₹9.4L** |
| Cold (qualified) | 30 × 0% → 0 = **₹0** | 30 × 10% → 3 × ₹55k → ₹1.65L × 80.4% = **₹1.3L** |
| **Total** | **28 deals, ₹28.0L signed, ₹17.3L collected** | **50 deals, ₹49.9L signed, ₹45.3L collected** |

### Assumptions and their sources

| Input | Value | Source tag |
|---|---|---|
| Warm intro → cash deal | 14/30 = 46.7% (stretch haircut to 40% for marginal intros) | dataset / assumption |
| Inbound → cash deal | 6/18 = 33.3% | dataset |
| Avg cash deal | warm ₹97,500, inbound ₹1,05,833, all ₹1,00,000 | dataset |
| Cold qualified → deal | 0/33 in 2025; stretch 10% with qualify-first + entry package | dataset / assumption |
| Renewal rate | 40% base, 65% stretch (no renewal history in data) | assumption |
| Renewal uplift | +10% via bundle | assumption |
| Warm intro volume | 30 base (2025 actual), 60 stretch (alumni asks + a referral ask at every signing) | dataset / assumption |
| Inbound volume | 18 base (2025 actual), 30 stretch (sponsor page + LinkedIn) | dataset / assumption |
| Payment-lag curve | see above | assumption anchored on benchmarks |

All assumptions live in the `assumptions` table and are editable on the Decide page; the model and the copilot recompute from it.

### Why believe ₹45L
- Every conversion rate is either measured in 2025 or haircut from it; the stretch mostly adds **volume in channels that already convert** and **earlier cash**, not heroic rates.
- Capacity: 50 deals at ~1.5 meetings per warm deal plus ~40 cold meetings ≈ 115 meetings over 16 weeks ≈ 7 a week for a 4-person team (2025 held 60 meetings with Kabir mostly on cold email). Moving him to renewals and inbound follow-up covers it.
- Sensitivity (stretch case): renewals at 50% instead of 65% cost ~₹3L; 45 warm intros instead of 60 cost ~₹5L; keeping standard payment terms costs ~₹14L, which is why payment terms rank first. Each of these has a threshold and a fallback on Slide 3.

---

## 4. Slide 2: where we place our bets

**Prioritisation framework**: `score = expected incremental cash collected (₹ lakh) × confidence ÷ effort (person-weeks)`, after a hard filter that the cash can arrive before the fest. Confidence: 0.7 when the rate is measured in 2025 data, 0.6 when it rests on a sourced benchmark plus an assumption, 0.3-0.5 for untested assumptions. Contributions are attributed by applying the levers in rank order from base to stretch (sequential, so they add up to the ₹28L gap with no double counting).

| # | Bet | Why it can work | +Cash collected | Conf. | Effort | Score | Budget | Owner | Weeks |
|---|---|---|---|---|---|---|---|---|---|
| 1 | Advance-payment terms + earlier close calendar | Turns confirmed value into cash; 41% of 2025 cash was confirmed <30 days out | ₹8.2L | 0.6 | 1.5 | 3.27 | ₹75k (3% early-bird discount reserve) | Meera | 1-16 |
| 2 | Renewal-first program with ROI proof pack | 20 warm relationships; fastest close and pay | ₹5.9L | 0.6 | 3 | 1.18 | ₹25k | Riya | 1-6 |
| 3 | Warm-intro engine (alumni + partner referrals + creators) | 47% intro → cash in 2025 vs 0% cold | ₹8.8L | 0.7 | 6 | 1.03 | ₹60k | Nisha | 2-12 |
| 4 | Inbound engine (sponsor page + LinkedIn proof posts) | 33% inbound → cash; scales cheaply | ₹3.8L | 0.5 | 3 | 0.63 | ₹50k | Kabir | 3-12 |
| 5 | Cold reset: qualify-first + ₹55k entry package | Only a capped test; 0 of 33 cold deals closed | ₹1.3L | 0.3 | 3 | 0.13 | ₹10k | Kabir | 1-8 |

Total budget ₹2.2L of a ₹2.5L cap; 16.5 of ~20 person-weeks.

- **Double down**: #1 (cheapest cash), #3 (largest ₹), #2 (fastest).
- **Test with a cap**: #4 (₹15k ad-spend gate before scaling).
- **Deprioritised / rejected**: mass cold email (0 of 33 cold opportunities confirmed, 7 opt-outs), an across-the-board price rise (the ₹1.25L cold proposals were the ones lost), barter deals (not cash), agency outsourcing (margin with no evidence of better conversion).
- **Dependencies and overlap**: renewal partners are also the best source of referrals (counted only in #3's volume); payment terms apply to every deal, so #1 is measured as a collection rate, not deals; #5 frees capacity for #2-#4 if stopped.

---

## 5. Slide 3: how we will know what's working

| Bet | Critical variable / biggest risk | Early signal | Scale | Change | Stop |
|---|---|---|---|---|---|
| 1 Payment terms | Share of signed cash paid in 7 days / terms lower the win rate | First 10 signings | ≥70% paid in 7 days and proposal win rate within 10 pts of 2025 (52%) | 40-70%: 30% advance, PO at signing, day-5 call | <40% or win rate drops >10 pts: revert to standard terms for new deals |
| 2 Renewals | Renewal meetings / weak 2025 ROI | ≥60% of 20 partners take a meeting by week 2 | ≥50% renewed by week 6: add upsell tier | 30-50%: smaller bundle | <30%: stop special pricing, treat as warm leads |
| 3 Warm intros | Intros per week, intro → meeting / alumni fatigue | ≥15 intros from first 100 asks; ≥4/week by week 4 | ≥4/week and intro → meeting ≥70% (2025: 85%) | <70% meeting rate: retarget roles/sectors | <2/week after week 5: stop paid alumni events |
| 4 Inbound | Submissions per week, cost per qualified inbound / low intent | ≥2.5/week by week 5 | CPQ ≤ ₹5k: raise ad cap | CPQ ₹5-10k: change creative/audience | <1/week after ₹15k spend |
| 5 Cold reset | Proposal → win / repeat of 0% | Meetings per 100 touches ≥8 (2025: 7.5) | ≥15% win after 10 proposals | 5-15%: keep entry package only | <5% after 10 proposals: stop, move owner to #2/#3 |

**How the product supports this**: the Decide page computes each bet's KPI live from the data and compares it with these thresholds (signal: Scale / Change / Stop / Keep testing / No data). Diagnose shows bottlenecks and stalled deals with one-click follow-up tasks. The copilot answers "which bets crossed a threshold?", explains why with the data, and proposes tasks or status changes that a person confirms.

---

## 6. The product

### Pages
| Page | Purpose (assignment pillar) | Highlights |
|---|---|---|
| Command Center | Measure | Targets vs actuals using the target version in force at the snapshot, confirmed value split cash vs in-kind, recorded cash received, open pipeline, projection at event, daily cumulative charts vs goal lines, brand funnel, channel-group table, campaign KPIs |
| Diagnose | Diagnose | Evidence-backed findings (bottlenecks, process, capacity, risk, cash timing, data notes), funnel heatmap by channel group, stalled deals with "+ Task", win-probability model, owner workload |
| Decide | Support decisions | Five bets with live KPI vs thresholds and signals, editable owner/decision/spend, base vs stretch model with editable, source-tagged assumptions |
| Execute | Manage execution | Opportunities (new stage versions, values, owners, payments, full history), tasks (owner, due date, status, priority), campaigns (status, owner, budget, spend, notes), brands (qualification, outreach logging, new brands), payments, target versions |
| AI Copilot | Copilot | Drawer on every page + full screen; tool-calling analyst grounded in the live DB; confirm-to-execute proposals |
| Data & Audit | Trust | What the data can and cannot answer, counting rules, import/dedupe log, every copilot proposal with its status, full audit log, reset to original data |

**Snapshot selector**: every page and the copilot work "as of" any date (end of day IST) or on the latest data. Presets cover the target revision (15 Mar) and the eve of the fest.

**Campaign clock**: the data ends in April 2025, so edits that create source-style records (stage changes, interactions, payments, targets) are stamped one minute after the latest activity (or at the end of the viewed snapshot day) unless you set a time. That keeps "days in stage", projections and snapshots coherent. Tasks use real dates.

### Architecture
- Next.js 15 (App Router, TypeScript, Tailwind, Recharts), one catch-all API route (`app/api/[...path]/route.ts`).
- Postgres via `postgres` (Neon/Supabase in production) or embedded PGlite when no `DATABASE_URL` is set. Same SQL on both.
- Snapshot logic lives in SQL functions: `opp_state_asof(cut)`, `brand_qual_asof(cut)`, `target_asof(cut)`, `cut_of(date)`.
- All metrics are computed live from the tables (`lib/analytics.ts`); writes go through validated functions with an audit log (`lib/mutations.ts`).
- The original dataset ships as `data/seed.json` (converted by `analysis/make_seed.py`); "Reset to original data" restores it.

### AI copilot design (`lib/copilot.ts`)
- **Grounding**: OpenAI-compatible tool calling (default Gemini through its OpenAI endpoint). 14 tools: overview, funnel, campaign and owner performance, opportunity lists and detail, bottlenecks, trend, initiatives, growth model with what-if overrides, tasks, data coverage, read-only SQL, and `propose_actions`.
- **Reliable numbers**: arithmetic happens in SQL/TypeScript; the model is told to use tool numbers only and show formulas for derived figures. Each answer shows the tool calls it used ("Data used").
- **Safe SQL**: one SELECT/WITH statement, keyword deny-list, run inside a READ ONLY transaction with a 4 s timeout, 200-row cap.
- **Honesty**: `get_data_coverage` lists what is missing (bank receipts, spend, sponsor ROI, renewal history, loss reasons, geography, attendee data); the prompt requires naming the gap, giving a labelled proxy and saying what to record; small samples are flagged.
- **Execution with confirmation**: proposals are stored as pending actions and rendered with Confirm / Reject; nothing changes until a person confirms. Confirmed actions write through the same validated mutations and appear in the audit log.
- **Follow-ups**: the last 12 turns are sent with each request; the current snapshot date is passed in.
- **Resilience**: model fallback list (configured model → `gemini-2.5-flash` → `gemini-flash-lite-latest`); if the LLM is unavailable, a clearly labelled offline mode returns computed diagnostics instead of a free-form answer.

### Demo workflow (what to try)
1. Ask: "Are we on track for the confirmed-partnership target? What's driving the gap?"
2. Follow up: "Which stalled deals should we chase first? Create tasks for the top 3."
3. Confirm the proposed tasks, then open Execute → Tasks: they are saved, owned and dated.
4. Ask: "How much cash have we actually collected?": it should say no receipts are recorded and that confirmed value is not cash.
5. Record a payment on a confirmed deal (Execute → Opportunities) and ask again: the answer and the Command Center update.
6. Ask: "Which campaign has the best ROI?": there is no spend data, so it should say so and offer confirmed value per touch as a labelled proxy.

### Reference answers for testing (original data, latest snapshot)
| Question | Expected |
|---|---|
| Confirmed partnerships vs target | 24 vs 28 (86%), "Sponsor revised plan" effective 15 Mar 2025 |
| Qualified brands as of 14 Mar 2025 | 53 vs 40 (launch plan still in force) |
| Qualified brands as of 15 Mar 2025 | 55 vs 55 (revised plan) |
| Confirmed partnerships as of 31 Mar 2025 | 23, value ₹20,90,000 |
| Confirmed value split | ₹20,00,000 cash (20) + ₹2,40,000 in-kind (4) |
| Cash collected | Not in the data; ₹0 recorded until payments are entered |
| Cobalt Learning | Confirmed 25 Feb, withdrawn 20 Mar: not counted |
| Cold channel results | 33 opportunities, 0 confirmed, 26 open (₹14.4L), 6 lost, 1 withdrawn |
| Best converting campaign | Creator Network Referrals: 9 of 9 opportunities confirmed (21 touches); Partner Interest Form 7 of 7 |
| Owner with most stalled deals | Riya Kapoor (10) |
| Duplicates removed at import | 3 interactions, 1 qualification version, 2 opportunity versions |

---

## 7. Setup

### Run locally
```bash
npm install
cp .env.example .env.local   # add GEMINI_API_KEY; leave DATABASE_URL empty to use embedded PGlite
npm run dev                  # http://localhost:3000 (seeds the database on first request)
npm run check                # prints the reference metrics from the analytics layer
```

### Deploy (Vercel + Neon, free tiers)
1. Import this repo in Vercel (framework: Next.js, no build settings to change).
2. Environment variable: `GEMINI_API_KEY` (from Google AI Studio).
3. Storage → Create Database → Neon (Postgres) → connect to the project. This injects `DATABASE_URL`.
4. Redeploy. The first request creates the schema and loads the original data (a few seconds).

Supabase works the same way: set `DATABASE_URL` to the "Transaction pooler" connection string.

### Environment variables
| Name | Required | Notes |
|---|---|---|
| `DATABASE_URL` (or `POSTGRES_URL`) | for persistence in production | Postgres URI; pooled URLs work (`prepare: false`) |
| `GEMINI_API_KEY` | for the copilot | Without it the copilot runs in offline diagnostics mode |
| `GEMINI_MODEL` | no | Default `gemini-flash-latest` |
| `LLM_BASE_URL`, `LLM_API_KEY` | no | Any OpenAI-compatible endpoint with tool calling |

---

## 8. Testing and verification
- **Numbers**: `analysis/analyze.py` (pandas, from the Excel) and the app's SQL produce identical snapshots for 15 Feb, 14 Mar, 15 Mar, 31 Mar, 11 Apr and latest (qualified, confirmed count/value, open pipeline, target version).
- **Databases**: tested on embedded PGlite and on a real Postgres server (same results, including concurrent cold starts that seed only once).
- **Writes**: stage changes, payments, tasks, campaigns, brands, qualification, interactions, targets, initiative edits, assumptions and reset were exercised through the API and checked in the analytics.
- **Copilot**: the agent loop, tool execution, SQL guard (a `delete` attempt is rejected) and the confirm/reject flow were tested against a scripted OpenAI-compatible mock. The live Gemini model could not be reached from the build environment, so answer quality was tuned by prompt and tool design and should be spot-checked with the questions above after deploying.

## 9. Tools used
- Claude (Anthropic) as a coding and analysis assistant: data profiling, SQL, app code, copy. All numbers were re-computed and cross-checked between Python and SQL.
- Next.js 15, React 19, Tailwind CSS 4, Recharts 3, react-markdown + remark-gfm, `postgres` (postgres.js), `@electric-sql/pglite`, tsx; pandas for analysis.
- Hosting: Vercel (Hobby), Neon or Supabase (free), Google AI Studio Gemini API (free tier).
- Nothing was copied from templates; `create-next-app` scaffolding only.

## 10. Known limitations
- No bank-receipt, spend or sponsor-ROI data in the source: cash collected starts at ₹0 until payments are recorded; campaign ROI cannot be computed from source data; collection rates in the model are assumptions anchored on benchmarks.
- 2025 is the only edition in the data, so renewal rates are assumptions.
- Campaign attribution is observational (the campaign recorded on each record), not causal; the 3 sponsor activations are associations, not proven uplift.
- The win-probability model uses small samples (shown with counts) and Laplace smoothing; treat projections as directional.
- No authentication: anyone with the link can edit (fine for a demo; add auth before real use).
- The copilot depends on a free-tier LLM quota; it falls back to computed diagnostics when the quota is exhausted.

## 11. Sources
- Delhi University admissions 2025-26 (~72,230 UG students admitted): Careers360, Dec 2025.
- Gurugram hosts offices of 250+ Fortune 500 companies: Built In; Google Arts & Culture (Gurugram).
- Indian B2B payment terms average ~52 days (Atradius Payment Practices Barometer India 2025, via Trade Treasury Payments); average days receivable 56 days in 2025 (Aon 2026 Working Capital Benchmarking, via Business Today).
- RISA Labs context (B2B oncology workflow automation): company and press coverage, 2025-2026.
