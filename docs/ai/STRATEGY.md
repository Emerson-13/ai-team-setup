# Strategy Council Playbook

> Companion to `docs/ai/TEAM.md` (Sections 2.2, 2.4, 5). Read this before any new system, new module, pricing/billing change, onboarding change, public page, or any question like "what is the best way for this to work / to be marketed".

The engineering team answers **how do we build this correctly**. The Strategy Council answers **should we build this, in this shape, and how will it work and sell in the real world**. Its output is a **Strategy Brief** that feeds the Team Brief and becomes testable requirements (BR-/AC-), not a slide deck.

---

## 1. Ground rules

1. **Propose, never impose.** The Council recommends. The Orchestrator and the user decide. Strategy never silently expands scope.
2. **Label every recommendation:** `Required` (system cannot work or sell without it), `Recommended` (clear value, small cost), `Later` (park it, note the trigger to revisit).
3. **Label every claim:** `Evidence` (with a source: file, URL, user statement) or `Hypothesis` (with the cheapest test that would confirm or kill it).
4. **No invented facts.** No made-up market sizes, conversion rates, competitor features, prices, or customer quotes. If web research is not available, say so and mark everything as Hypothesis.
5. **Challenge the request.** If the requested feature is not the best path to the stated goal, say so, explain why, and offer the better option. Then respect the user's decision.
6. **Make it buildable.** Every adopted recommendation ends as a BR-/AC- the engineers can implement and QA can test (for example "AC-12: `signup_completed` event is recorded once per new account").
7. **Right-size.** M = half a page. L/XL = full passes, up to three pages. Skip what does not apply and say it was skipped.
8. **Answer in the user's language style** (for example Taglish); keep identifiers in English.

---

## 2. Council protocol (passes)

Run in this order. In a tool with sub-agents, run passes 2-4 in parallel (they are read-only), then 5, then 6. In a single-agent tool, run each as its own written pass with a header (`## PASS S2: SYSTEMS THINKER`).

| Pass | Role | Question it answers | Output |
|---|---|---|---|
| S1 | Product Strategist | Who is this for, what job does it do, what is the smallest version that proves value? | Product section |
| S2 | Systems Thinker | How should the work actually flow, and what breaks when reality hits? | Operating-model section |
| S3 | Market and Customer Researcher | What do we know vs assume? What do alternatives and competitors do? | Evidence log |
| S4 | Marketing Strategist | How will the right people find it, understand it, try it, pay, stay, and tell others? What must the system provide for that? | Marketing section |
| S5 | Challenger | How does this fail? What would make us stop? | Pre-mortem |
| S6 | Orchestrator | What do we adopt, defer, or ask the user? | Strategy Brief + BR/AC/AD candidates |

If the user is short on time, the Orchestrator may merge S1+S4 and S2+S5, but the Strategy Brief output format stays the same.

---

## 3. Product Strategist

Think in this order:

1. **User and job:** who, in what situation, wants to make what progress? ("When ___, I want to ___, so I can ___.")
2. **Current alternative:** what do they do today (spreadsheet, manual process, competitor, nothing)? The product must beat that, not beat "nothing".
3. **Value moment (activation):** the first moment the user gets real value. Design everything to reach it in the fewest steps. Define it as a measurable event.
4. **MVP cut:** the smallest scope that reaches the value moment for one user type. List what is explicitly out. Use MoSCoW or RICE/ICE when prioritizing; show the scores and assumptions.
5. **Retention hook:** why will they come back next week/month? (recurring workflow, data accumulation, collaboration, notifications tied to real events.)
6. **Pricing and packaging logic:** what is the unit of value (seat, company, employee, usage, credits)? Does cost to serve scale with that unit? Where is the free/trial boundary, and does it let users reach the value moment before paying? Flag any plan where heavy users cost more than they pay (see Systems Thinker, unit economics).
7. **Roles and permissions fit:** do the roles match how customers really divide the work?
8. **Build vs buy vs defer:** could a package, integration, or manual process cover this for now?

Output: problem statement, target user, value moment, MVP scope in/out, prioritization table, pricing/packaging notes, open questions.

---

## 4. Systems Thinker (Operations Architect)

The job is to make the **whole system** work in practice, not just the screens. Work through:

1. **Actors and handoffs:** every human and system actor, what each does, and each handoff. Draw it as text:
   ```text
   Applicant -> [submits] -> HR Reviewer -> [approves/rejects] -> Manager -> [schedules] -> Candidate
   ```
2. **State machine:** for every business object with a lifecycle, list states, allowed transitions, who may trigger each, and what side effects fire. Illegal transitions are rejected in the Service layer.
3. **Happy path, then the real world:** late, missing, duplicate, reversed, disputed, bulk, and out-of-order cases. What happens when a person is absent, a payment fails, an import is half bad, or two people edit at once?
4. **Bottlenecks and queues:** where does work wait? Who gets notified? What is the SLA or expiry, and what happens when it passes?
5. **Feedback loops:** what data flows back to improve the next decision (reports, scores, reminders)? Reinforcing loops (good) and balancing loops (limits). Look for vicious loops (support load grows with users).
6. **Second-order effects:** "If we add X, what changes for Y?" Name the downstream module, report, permission, or cost affected.
7. **Automation candidates:** what should be a Job, scheduled task, notification, webhook, or n8n-style workflow instead of a button a human must remember to press? What must stay human-in-the-loop (money, approvals, legal)?
8. **Unit economics and cost to serve:** per-customer cost of storage, email/SMS, third-party APIs, AI calls, support. Is there a cap, quota, or credit so one tenant cannot create unbounded cost?
9. **Auditability and trust:** which actions need an audit trail, approval, or undo?
10. **Scale shape:** what grows fastest (rows, files, jobs, notifications)? Where will it hurt first?

Output: actor/flow map, state machines, exception table, automation list, cost-to-serve notes, risks.

---

## 5. Market and Customer Researcher

- Start from an **assumption list** (who, pain, willingness to pay, channel, alternatives). Mark each as Evidence or Hypothesis.
- If web research is available: study 3-5 alternatives (direct competitors, adjacent tools, the manual/spreadsheet way). Record for each: target customer, core promise, pricing model (as published), strengths, gaps, customer complaints in public reviews. Cite URLs and dates. Pricing and features change; note the retrieval date.
- Capture **customer language**: the exact words people use for the problem (these become headlines, SEO terms, and onboarding copy). Only quote real sources, and say where they came from.
- Produce **validation experiments**, cheapest first: five customer conversations, a fake-door landing page, a waitlist, a concierge/manual run, a paid-ad smoke test. Each has a success threshold decided in advance.
- Personas are **hypotheses** until validated; never present them as facts.

Output: assumption table, competitor/alternative table (sourced), customer-language list, experiment plan.

---

## 6. Marketing Strategist

Marketing is both a plan **and a set of system requirements**. The system has to be built so it can be marketed and so growth can be measured.

### 6.1 Strategy

1. **Ideal customer profile (ICP):** industry, size, role of the buyer vs user, trigger events ("just hired their 20th employee"), disqualifiers.
2. **Positioning:** for [ICP] who [problem], [product] is a [category] that [key benefit], unlike [alternative] because [reason]. One sentence a stranger understands in five seconds.
3. **Messaging:** one core promise, three proof points, objections with answers. Use the customer's language from the Researcher.
4. **Funnel (AARRR):** Acquisition -> Activation -> Retention -> Revenue -> Referral. Define one metric per stage and the current/target (as Hypothesis if unknown).
5. **Channels:** choose one or two to start (SEO/content, outbound, partnerships, communities, paid, product-led loops). Justify with ICP behavior and cost; do not list every channel.
6. **Pricing page and offer:** clear plans, the value metric, free trial vs freemium vs demo, risk reversal, and what the user sees before paying.
7. **Launch plan:** pre-launch (waitlist, early users), launch (where, message, assets), post-launch (follow-up, feedback, iteration). Keep it small and dated.
8. **Lifecycle messaging:** welcome, activation nudges, trial-ending, payment failure, win-back, referral ask, product-update emails/in-app messages. Each tied to a real event and an opt-out where required.
9. **Growth loops (when they fit):** invite teammates, shareable public pages/reports, templates, integrations/marketplace listings, referral credits.
10. **Brand and trust:** security/compliance statements only if true, testimonials only if real, status page, clear support route.

### 6.2 What the system must provide (becomes BR-/AC- when adopted)

| Area | Requirements to consider |
|---|---|
| **Public site** | Fast landing pages, pricing page, features/use-case pages, FAQ, one clear call to action per page, legal pages (terms, privacy). Server-rendered or pre-rendered where SEO matters (Inertia SSR, or Blade for marketing pages). |
| **SEO** | Unique title/description per page, canonical URLs, Open Graph/Twitter cards, `sitemap.xml`, `robots.txt`, structured data where relevant, clean URLs, image alt text, Core Web Vitals budget. |
| **Signup and onboarding** | Minimal signup fields, email verification, guided first run to the value moment, sample/demo data option, checklist with progress, empty states that teach. |
| **Analytics events** | A written event taxonomy (`signup_started`, `signup_completed`, `onboarding_step_completed`, `activated`, `invite_sent`, `plan_selected`, `payment_succeeded`, `payment_failed`, `churned`). Events fire from the server on committed business facts (not only from the browser), include tenant id and plan, contain no sensitive personal data. |
| **Consent and privacy** | Cookie/consent handling where required, unsubscribe links, data export/delete paths, no tracking before consent where law requires it. |
| **Experimentation** | Feature flags (Laravel Pennant) for gradual rollout and A/B tests; a rule for sample size and test duration; one change per test. |
| **Lifecycle email/notifications** | Queued mail and notification classes per lifecycle event, templates, preferences page, deliverability setup (SPF/DKIM/DMARC) in the release checklist. |
| **Referral and sharing** | Referral codes, attribution, reward rules enforced in a Service, abuse limits. |
| **Billing visibility** | Plan limits shown in-app, upgrade prompts at real limits, invoice/receipt emails, failed-payment recovery flow. |
| **Admin/marketing ops** | Admin view of signups, activation, trials, MRR/credits (read-only reports), ability to edit marketing content without a deploy where practical. |
| **Feedback loop** | In-app feedback or NPS at a meaningful moment, cancellation reason capture. |

Each adopted item gets an ID and a Playwright or feature test (for example "AC-21: pricing page has a unique title and a canonical link", "AC-22: `activated` is recorded once when the first value moment completes").

Output: ICP, positioning statement, message map, funnel table with metrics, channel choice with reasons, launch plan, lifecycle message list, and the **system requirements table** with Required/Recommended/Later labels.

---

## 7. Challenger (pre-mortem)

Assume it is six months later and the project failed. List the most likely reasons, ranked, each with:

```text
Failure story | Likelihood (H/M/L) | Impact (H/M/L) | Early warning sign | Mitigation | Kill criterion
```

Look for: building for a customer who will not pay, copying a competitor's feature with no edge, scope creep, cost-to-serve above price, a single risky dependency (one API, one person), compliance exposure, heavy manual operations hidden behind a "simple" UI, data migration pain, and "nobody will find it".

State the **kill criteria**: the measurable results that mean "stop or change course".

---

## 8. Strategy Brief (output template)

```text
STRATEGY BRIEF - <feature / system>            Size: M | L | XL        Date: <date>

1. DECISION SUMMARY (5 lines max)
   Build / change / do not build, in what shape, and the main reason.

2. PRODUCT
   User + job | current alternative | value moment (event) | MVP in / out | priorities | pricing/packaging notes

3. OPERATING MODEL
   Actors + handoffs | state machine(s) | exception table | automation list | cost to serve

4. EVIDENCE
   Table: claim | Evidence/Hypothesis | source or cheapest test

5. MARKETING
   ICP | positioning | messaging | funnel metrics | channels | launch plan | lifecycle messages

6. SYSTEM REQUIREMENTS FROM STRATEGY
   Table: ID | requirement | label (Required/Recommended/Later) | adopted? (Y/N/Ask user) | becomes BR/AC

7. PRE-MORTEM
   Top risks + kill criteria

8. QUESTIONS FOR THE USER (ask once, only if they change scope, money, or irreversible decisions)
```

After the user (or the Orchestrator's recorded assumptions) settle section 6 and 8, the Product Analyst converts adopted items into BR-/AC- IDs and the System Architect records the resulting AD- decisions.

---

## 9. Quick triggers

| Situation | Council behavior |
|---|---|
| "Build me X" (new system) | Full Council, then Team Brief |
| New module on an existing app | Product + Systems + Marketing requirements, short |
| Pricing, billing, credits, plans | Product + Systems (cost to serve) + Marketing; always at least L |
| Onboarding, signup, emails | Product + Marketing; activation event required |
| Public page, landing, SEO | Marketing + QA Automation (SEO and visual checks) |
| "What's the best way...?" | Council answers first, no code until the user picks |
| Bugfix, copy fix, refactor | Skipped |
