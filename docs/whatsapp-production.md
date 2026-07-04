# WhatsApp Bot — from trial to production

The bot code (webhook → Aria → reply) is identical in both modes; only the
number and token attached to it change.

---

## Phase A — Trial mode (free, ~30 min) — good for the 10-day client demo

Uses Meta's **test number** (+1 555 095-7066). Only works for up to **5
OTP-verified recipient phones** — register yours, the principal's and the
counsellors'. Real students cannot reach it; that's what Phase B is for.

1. **Deploy to Vercel** (the webhook needs a public URL):
   - vercel.com → Add New → Project → import `MNNITAK/law_school_crm`
   - paste all values from `.env.local` into Environment Variables → Deploy
2. **Fresh access token** — the dashboard token expires every ~24 h:
   - developers.facebook.com → My Apps → your app → **WhatsApp → API Setup**
   - **Generate new token** → update `WHATSAPP_TOKEN` in Vercel env → redeploy
   - (do this any day you demo, until the permanent token from Phase B exists)
3. **Configure the webhook** (same API Setup page → Step 2 → Configure Webhooks):
   - Callback URL: `https://<your-app>.vercel.app/api/whatsapp/webhook`
   - Verify token: `clc-webhook-verify-2026`  (must equal `WHATSAPP_VERIFY_TOKEN`)
   - Click **Verify and save** → then **Manage** → subscribe to **`messages`**
4. **Register recipients**: API Setup → "To" field → add each phone → enter the
   OTP Meta sends on WhatsApp.
5. Message the test number from a registered phone → Aria replies, the lead
   appears in `/admin` with name/course/marks extracted.

Troubleshooting silence:
- No reply at all → webhook not verified/subscribed, or your phone isn't a
  registered recipient, or the token expired (check Vercel function logs).
- Reply arrives but slow (~15 s) the first time → cold serverless start; normal.

---

## Phase B — Production mode (real students, real number)

Start this **in parallel** — business verification takes 1–5 days.

### 1. Business portfolio + verification
- business.facebook.com → create a Business Portfolio for the college
  (or the agency, with the college as client).
- Security Centre → **Start business verification**. Needs: legal name +
  documents (GST / PAN / incorporation certificate), address proof, a website
  and an email on the college's domain (info@cgclko.com works).

### 2. A dedicated phone number
- **The number must NOT have an active regular-WhatsApp account.**
  81770 01081 is on WhatsApp today — either that account is deleted
  (WhatsApp → Settings → Account → Delete) so the number can migrate to the
  API, or (recommended) buy a fresh SIM that becomes "the bot number".
- Landlines work too (verification by voice call).

### 3. Register the number on the API
- developers.facebook.com → your app → WhatsApp → API Setup →
  **Step 2 Production setup → Register your WhatsApp phone number**
- Verify by SMS/voice OTP → set display name **"City Law College"** →
  Meta reviews the name (~1 day).
- Copy the new **Phone Number ID** → update `WHATSAPP_PHONE_NUMBER_ID`.

### 4. Permanent access token (replaces the 24-hour dashboard token)
- business.facebook.com → Business settings → Users → **System users** →
  Add (role: admin) → **Assign assets**: the app + the WhatsApp account →
  **Generate new token**, scopes: `whatsapp_business_messaging`,
  `whatsapp_business_management` → save it as `WHATSAPP_TOKEN` in Vercel.
  It never expires.

### 5. Message templates (for the Day 1/3/7 drips)
- Replies to students are free-form and FREE within 24 h of their last
  message — the bot conversation itself costs nothing.
- Business-initiated messages (our drip to a lead who's gone quiet) require
  pre-approved **templates**: WhatsApp Manager → Message templates → create
  the Day-1 / Day-3 / Day-7 texts (category: Marketing or Utility) → approval
  usually < 1 day. Cost ≈ ₹0.12–0.80 per message depending on category.
- New numbers start at 250 business-initiated conversations/day and scale
  automatically with good quality ratings.

### 6. Flip the app to production
- Vercel env: new `WHATSAPP_TOKEN` + new `WHATSAPP_PHONE_NUMBER_ID` → redeploy.
- `lib/college.ts` → `whatsappNumber`: set to the production number
  (see the TRIAL comment there) so the site's WhatsApp buttons point at it.
- Webhook stays exactly the same — it's per-app, not per-number.
- App Review note: for an app serving only your own business's WABA, no
  additional Meta app review is required for these two permissions when used
  via a system-user token on your own assets.

### Compliance
- Students opt in by messaging first (or ticking opt-in on the site/Aria).
- Every drip template should include an opt-out line ("Reply STOP to
  unsubscribe") — the webhook already pauses automation when a human replies.
