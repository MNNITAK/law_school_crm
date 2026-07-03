# City Law College — AI Admissions Management System (Trial Build)

Working prototype of the 4-phase system sold in the concept proposal:

1. **Website** — the approved design, live at `/` (pixel-identical port of the demo).
2. **Aria + live CRM** — real Claude-powered counsellor chat (`Ask Aria` button) writing
   to Firestore; counsellor dashboard at `/admin` updates in realtime.
3. **WhatsApp engine** — Meta Cloud API test number sends the Day 1/3/7 drip to up to 5
   verified numbers; everyone else gets one-click "assisted send" in `/admin/sequences`.
4. **Nurture & reporting** — daily cron runs drips, dead-lead revival and report rollups;
   funnel analytics at `/admin/reports`, CSV export on the leads board.

Also real: **The First Case** quiz (`/first-case`, AI verdict), **Precedent Engine**
(`/precedents`, Firestore-backed, admin-editable at `/admin/precedents`), and the
**Voice Counsel** (`/voice`, live voice conversation — rumik.ai Silk TTS + browser STT,
call outcome filed to the CRM automatically).

## Setup

```bash
npm install
cp .env.example .env.local   # fill in keys (see comments in the file)
npm run dev
```

### One-time service setup

1. **Firebase** — create project → enable Firestore (asia-south1) + Auth (Email/Password)
   → add a counsellor user (Auth → Users → Add user) → download a service-account key
   (Project settings → Service accounts) and put its base64 in `FIREBASE_SERVICE_ACCOUNT_B64`
   → copy the web app config into the `NEXT_PUBLIC_FIREBASE_*` vars
   → paste `firestore.rules` into Firestore → Rules → Publish.
2. **AI provider** — for testing, a free **Groq** key (console.groq.com) in `GROQ_API_KEY`
   is enough; it powers Aria, quiz verdicts and call summaries. For production quality,
   set `ANTHROPIC_API_KEY` instead (console.anthropic.com, **set a ~$25 spend limit**)
   and remove the Groq key — whichever is present wins, Groq first.
3. **rumik.ai** — rotate the API key in the dashboard, put it in `RUMIK_API_KEY`.
4. **WhatsApp (optional for local dev)** — Meta developer app → WhatsApp → copy token +
   phone number ID; add up to 5 test recipients (use the client's phones). Configure the
   webhook: URL `https://<deployment>/api/whatsapp/webhook`, verify token =
   `WHATSAPP_VERIFY_TOKEN`, subscribe to `messages`.
5. **Vercel** — import the repo, add all env vars, deploy. `vercel.json` schedules the
   daily follow-up runner (09:00 IST). Set `CRON_SECRET` to protect it.

## Architecture notes

- **No secret ever ships to the browser.** Aria, TTS, and WhatsApp all go through
  API routes; the old demo's client-side Anthropic call is gone.
- Lead scoring = 50% rule events (auditable in the lead's event log) + 50% LLM-assessed
  readiness. Hot ≥ 70, Warm ≥ 40. Logic in `lib/scoring.ts`.
- Aria's guardrails live in `lib/prompts/aria.ts` — she never states fees/dates; she
  routes those to the office. Verified facts come only from `lib/college.ts`.
- The public site markup is `components/site/body.html` (kept as approved HTML);
  behaviour is attached by `components/site/SiteRuntime.tsx`.
- Automation stops the moment a human takes over (`handoffAt`) or a lead replies on
  WhatsApp — the 24-hour session rule is respected.

## Demo script (for the client walkthrough — use Chrome)

1. Open the site on a phone, chat with Aria as a nervous student in Hinglish; share
   marks + phone. On a second screen keep `/admin` open — watch the lead appear and
   jump columns live, with sentiment, readiness and next-best-action.
2. Ask Aria "fees kitni hai?" — she routes to the office instead of inventing a number.
3. Take `/first-case`, save the verdict — a scored `quiz_done` lead appears.
4. Search `/precedents` for "placements"; add a record in `/admin/precedents` and
   search it live.
5. Call Aria at `/voice`, book a campus visit, hang up — the lead's card now shows
   `visit booked` + AI call summary.
6. Show `/admin/sequences` (drip timeline) and `/admin/reports`; export the CSV.

## Post-trial upgrades (quoted separately)

- Real WABA (business verification) + approved templates → unlimited WhatsApp recipients.
- Outbound telephony call-back (Exotel/Twilio + Silk voice) replacing the in-browser call.
- Custom domain + Vercel Pro (Hobby tier prohibits commercial use).
