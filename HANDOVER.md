# City Law College — AI Admissions System: Handover Guide

Welcome! This short guide covers everything your team needs to use the system.
There is nothing to install or maintain on your side — the entire system runs on
our servers and is managed by us.

---

## 1. What you have

**Aria — your 24/7 AI admissions counsellor.** Aria talks to prospective
students in Hinglish/English across three channels:

- **Website chat** — a chat bubble on your own website (setup below)
- **WhatsApp** — students message your WhatsApp number, Aria replies instantly
- **Phone calls** — promising students automatically receive a friendly AI
  counselling call

**Admissions Dashboard (CRM)** — one place where every enquiry from every
channel lands as a lead, scored and ready for your counsellors.

---

## 2. Your Admissions Dashboard

**URL:** `https://law-school-crm.vercel.app/admin`

**Login:** use the email and password we have shared with you separately
(never share these with anyone outside your admissions team). To add or remove
a counsellor login, or to reset a password, just contact us.

Day-to-day use:

- **Leads board** — every enquiry appears as a card, sorted by temperature:
  🔥 **Hot** (ready to act — call them first), 🌤️ **Warm**, ❄️ **Cold**.
- **Open a lead** to see the full conversation transcript, the student's
  details (name, phone, course interest, marks), and Aria's suggested next step.
- **"Call now (AI)"** — one click places an AI counselling call to that student;
  the call summary and outcome appear back on the lead automatically.
- **Follow-ups** — students who go quiet receive automatic, polite WhatsApp
  nudges; you'll see these in the lead's timeline.
- **Export** — download all leads as a spreadsheet anytime from the dashboard.

---

## 3. Add Aria to your website (one line)

Ask your website person to paste this single line into your website's HTML,
just before the closing `</body>` tag — ideally in the shared footer/template
so it appears on every page:

```html
<script src="https://law-school-crm.vercel.app/widget.js" async></script>
```

That's it. A blue chat bubble appears at the bottom-right of your site.**
Visitors tap it, chat with Aria, and every conversation lands in your
dashboard as a lead — with the student's name, phone and interest captured.

Notes:

- The widget works on any website (WordPress, plain HTML,PHP,anything) — no
  plugins, no code changes beyond that one line.
- It looks great on mobile too (opens full-screen).
- Updates and improvements to the widget happen automatically on our side;
  you never need to touch that line again.

---

## 4. WhatsApp & phone calls — nothing to do

Both channels run entirely on our servers:

- Students who message the WhatsApp number get instant replies from Aria.
- Hot leads (with a phone number captured) can receive an automatic AI
  counselling call during business hours.

Every WhatsApp chat and phone call — transcript, summary, and outcome —
appears automatically in your dashboard.

---

## 5. Good to know

- **Keep your dashboard login private.** It gives access to all student data.
- If something looks wrong (widget not appearing, login trouble, a lead
  missing), contact us and we'll sort it out — usually the same day.
- The system is hosted, monitored, and updated by us; there are no servers,
  renewals, or technical tasks on your side.
