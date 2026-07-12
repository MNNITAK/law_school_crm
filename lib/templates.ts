/**
 * WhatsApp message template library — psychology-tuned nurture messages.
 * Isomorphic (no server imports): used by the drip runner, the send API and
 * the admin dashboard's manual trigger panel. {name} is replaced at send time.
 */
export type WaTemplate = {
  id: string;
  label: string;
  /** when this fires automatically (shown in admin so the client understands) */
  scenario: string;
  /** the psychological lever, shown as a hint in the admin panel */
  psychology: string;
  student: string;
  parent: string;
};

export const WA_TEMPLATES: WaTemplate[] = [
  {
    id: "welcome_details",
    label: "Welcome + college details",
    scenario: "Instantly, when someone messages the bot for the first time",
    psychology: "Instant response builds trust; complete info removes friction",
    student:
      "Welcome to City Law College, Lucknow!\n\n*BA LL.B (Hons.)* — 5-year integrated, after Class 12 (min 45%, 40% SC/ST)\n*LL.B* — 3-year, after graduation (min 50%)\n\nUniversity of Lucknow degree (College Code 1238) · Sector 9, Jankipuram Vistar · 120 seats each, pure merit.\n\nMain Aria hoon, aapki admissions counsellor — kuch bhi poochiye.",
    parent:
      "Namaste, and welcome to City Law College, Lucknow. 🙏\n\nWe offer the 5-year BA LL.B (Hons.) and 3-year LL.B, both awarded by the University of Lucknow (College Code 1238), with a 100% merit-based intake.\n\nOur campus in Sector 9, Jankipuram Vistar houses a moot court hall, law library and Training & Placement Cell.\n\nI would be glad to assist with any question — or arrange a call with our senior counsellor: +91 81770 01081.",
  },
  {
    id: "day1_eligibility",
    label: "Day 1 — eligibility confirmed",
    scenario: "1 day after WhatsApp opt-in",
    psychology: "Positive affirmation — 'you're in' feeling before they've applied",
    student:
      "Hi {name}, Aria from City Law College. Good news — based on what you shared, you're *eligible* to apply for 2026–27. Shall I walk you through the next step? It takes 5 minutes.",
    parent:
      "Namaste, this is the admissions office of City Law College, Lucknow (University of Lucknow, Code 1238). Following up on your enquiry — your ward is eligible to apply for 2026–27. We would be glad to assist with the application or arrange a campus visit. — +91 81770 01081",
  },
  {
    id: "nudge_24h",
    label: "24-hour re-engagement nudge",
    scenario: "When a lead hasn't replied for ~24 hours",
    psychology: "Open loop + low-pressure check-in — feels human, not salesy",
    student:
      "Hi {name} 🙂 kal aapne law admission ke baare mein poocha tha — koi doubt reh gaya kya? Chhota sa sawal bhi ho toh poochiye, main yahin hoon.",
    parent:
      "Namaste {name} ji. Yesterday you had enquired about admission at City Law College. If any question remained unanswered — fees, campus, placements — our team would be happy to assist personally: +91 81770 01081.",
  },
  {
    id: "scarcity_seats",
    label: "Seat scarcity — merit pressure",
    scenario: "Warm lead going quiet during admission season",
    psychology: "Scarcity + loss aversion — merit seats fill; waiting has a cost",
    student:
      "{name}, ek update — BA LL.B ki 120 seats merit basis pe fill hoti hain, aur applications rolling review pe hain. Jitna pehle apply, utni strong standing. Aapka profile accha hai — apply karein?",
    parent:
      "An update from City Law College: admissions for 2026–27 are progressing on a rolling, merit basis — 120 seats per programme. Early applications carry a stronger standing. We would be glad to reserve a counselling slot for your ward this week. — +91 81770 01081",
  },
  {
    id: "social_proof_story",
    label: "Success story — moot court",
    scenario: "Day 3 of the nurture drip",
    psychology: "Social proof + identity — 'students like you succeed here'",
    student:
      "Quick story {name} — ek student thi jo pehle moot court mein bolne se darti thi. Final year tak woh High Court advocate ke saath intern kar rahi thi. Yahi 5 saal ka difference hai. Aapko kya banna hai — litigator, judge, corporate lawyer?",
    parent:
      "A note from City Law College: our Training & Placement Cell arranges structured internships across Lucknow's courts and chambers for every batch — many students argue before practising advocates in our moot court from year one. Happy to share programme details for your ward. — +91 81770 01081",
  },
  {
    id: "day7_visit_invite",
    label: "Campus visit invite",
    scenario: "Day 7 of the nurture drip, or any warm lead",
    psychology: "Commitment device — a physical visit is the strongest conversion step",
    student:
      "{name}, college choose karne ka best tareeqa hai campus khud dekhna. Aaiye — moot court hall, library dekhiye, seniors se miliye. Sector 9, Jankipuram Vistar. Kaunsa din suit karega? Main visit fix kar deti hoon.",
    parent:
      "You are warmly invited to visit City Law College with your ward — Sector 9, Jankipuram Vistar (AKTU–CDRI Road), Lucknow. Our team can arrange a guided visit at a time convenient to you. Kindly share a preferred day, or call +91 81770 01081.",
  },
  {
    id: "revival_1",
    label: "Dead-lead revival",
    scenario: "Lead quiet for 14+ days",
    psychology: "Fresh start + FOMO — re-opens the door without guilt",
    student:
      "Hi {name}, kaafi din ho gaye. Admissions 2026–27 ke liye seats merit pe fill ho rahi hain — aapka interest genuine tha isliye yaad dila rahi hoon. Law ka plan abhi bhi hai? Main yahin hoon.",
    parent:
      "Greetings from City Law College, Lucknow. Admissions for 2026–27 are underway and seats are allotted on merit. If your ward is still considering law, our team would be glad to assist. — +91 81770 01081",
  },
  {
    id: "call_followup",
    label: "Post-call thank you + summary",
    scenario: "After a phone call with Aria or a counsellor",
    psychology: "Reciprocity + written record — cements verbal commitments",
    student:
      "{name}, aaj baat karke accha laga! Jo bhi humne discuss kiya — agla step main guide kar doongi. Koi bhi sawaal ho, kabhi bhi message kariye. Aur campus visit ka plan pakka rakhiye.",
    parent:
      "Thank you for speaking with us today. As discussed, our admissions team remains available for any further assistance — +91 81770 01081. We look forward to welcoming you at the campus.",
  },
];

export function renderTemplate(
  id: string,
  persona: "student" | "parent",
  name?: string | null
): string {
  const t = WA_TEMPLATES.find((x) => x.id === id);
  if (!t) return "";
  const tmpl = persona === "parent" ? t.parent : t.student;
  return tmpl.replace(/\{name\}/g, name || "there");
}
