# Outbound AI Calling Agent

When a lead turns **HOT** — on WhatsApp, web chat, or by counsellor judgement —
the system places an **immediate, personalised AI phone call** to the lead.

## How the trigger works (already live)

1. Every Aria turn (any channel) rescores the lead (`lib/ariaEngine.ts`).
2. Crossing the HOT threshold (score ≥ 70) or an explicit handoff flag fires
   `placeOrQueueCall()` (`lib/outboundCall.ts`) with the reason, e.g.
   *"went HOT on whatsapp — asked fee structure, phone captured"*.
3. Guards before an automatic call:
   - `OUTBOUND_CALLS_ENABLED=true` (master switch)
   - calling window **9:00–20:00 IST**
   - max **one automated call per lead per 24 h**
   - lead has a phone and isn't `dead`/`enrolled`
4. Counsellors also get a **"📞 Call now (AI)"** button on the lead page —
   manual clicks bypass the business-hours guard (human judgement wins).
5. Without a telephony provider connected, intents land in the `callQueue`
   collection with status `pending_provider` — the trigger logic is fully
   demoable before any telephony spend.

## The call itself

The call prompt is built per-lead from the CRM file: name, programme, city,
marks, parent/student persona, and the last ~6 messages of their conversation
— so Aria opens with *"aapne WhatsApp pe fees ke baare mein poocha tha…"*, not
a script. Guardrails carry over: no invented fees/dates, sub-5-minute calls,
instant polite exit if asked.

Latency/quality stack (all set in code — `lib/outboundCall.ts` — the Vapi
dashboard only holds the phone number): LLM `gpt-4o-mini` capped at 150 tokens
(fast first word, short spoken replies), Vapi native **V2** voice `Naina`
(Indian female; the old `Neha` was retired), Deepgram `nova-3` with
`language: multi` for live Hindi↔English code-switching, and a tuned
`startSpeakingPlan` so Aria replies ~1s after the caller stops talking.
Env overrides: `VAPI_MODEL`, `VAPI_VOICE_PROVIDER/ID`, `VAPI_STT_MODEL/LANG`.

After the call, Vapi posts an end-of-call report to
`/api/voice/outbound-webhook` → the transcript is attached to the lead, an AI
summary files the outcome (`visit_booked` → stage `visit_scheduled`,
`not_interested` → `dead`, etc.), and the board updates live.

## Connecting the telephony (one-time, ~30 min)

1. Create an account at **dashboard.vapi.ai** → copy the API key.
2. Get a phone number:
   - fastest: buy a number inside Vapi (US number — works, but Indian leads
     see a foreign caller ID → lower pickup), or
   - better for India: import a **Twilio India** number or SIP trunk
     (Exotel/Plivo) into Vapi → local caller ID, DLT-compliant route.
3. Vercel env: `VAPI_API_KEY`, `VAPI_PHONE_NUMBER_ID`,
   `OUTBOUND_WEBHOOK_SECRET` (any random string), `APP_BASE_URL`,
   and flip `OUTBOUND_CALLS_ENABLED=true` → redeploy.
4. Test: open a lead with your own phone number in `/admin` → **Call now (AI)**.

## Cost (quote to client as the phase-2 upgrade)

- Vapi platform ≈ $0.05/min + bundled STT/LLM/voice ≈ $0.08–0.14/min all-in
  (≈ ₹7–12/min) + telephony leg (Twilio India outbound ≈ ₹1–3/min).
- A 4-minute qualified-lead call ≈ **₹35–60**. If 10% of 1,000 monthly leads
  get one auto-call: ~100 calls ≈ **₹4,000–6,000/month**.
- Compare: one admission's fees vs. the cost of calling every hot lead within
  60 seconds of them asking — this is the strongest ROI line in the pitch.

## Compliance notes (India)

- These are **transactional callbacks** to people who just enquired — not
  cold telemarketing — and the prompt ends the call immediately on request.
- If the college later runs cold-call campaigns, TRAI/DLT telemarketing
  registration applies; keep the agent on enquiry-callbacks to stay clear.
