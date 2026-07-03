"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Ports the original single-file site's behaviour (motion layer, menus,
 * eligibility checker, apply modal, Aria chat, module demos) and rewires:
 *  - Aria  -> POST /api/aria   (server-side Claude; no API key in browser)
 *  - Apply -> POST /api/leads  (real lead capture in Firestore)
 * The markup ships as verbatim HTML (body.html); inline onclick handlers
 * resolve to the window globals registered here.
 */
import { useEffect } from "react";

let booted = false;

function init() {
  const w = window as any;
  const d = document;
  const REDUCED = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const FINE = matchMedia("(hover:hover) and (pointer:fine)").matches;
  const $ = (id: string) => d.getElementById(id);

  /* ---------- image fallbacks ---------- */
  const HERO_FB = [
    "https://images.unsplash.com/photo-1521587760476-6c12a4b040da?q=80&w=1600&auto=format&fit=crop",
    "https://images.unsplash.com/photo-1505664194779-8beaceb93744?q=80&w=1600&auto=format&fit=crop",
  ];
  w.heroFallback = (img: any) => {
    const i = +(img.dataset.fi || 0);
    if (i < HERO_FB.length) {
      img.dataset.fi = i + 1;
      img.src = HERO_FB[i];
    } else img.remove();
  };
  w.imgFail = (img: any) => {
    const dv = d.createElement("div");
    dv.className = "img-fallback " + img.className;
    dv.style.width = img.style.width || "100%";
    dv.style.height = img.style.height || "100%";
    dv.innerHTML =
      '<svg width="34" height="34" viewBox="0 0 48 48" fill="none" aria-hidden="true"><path d="M24 4l18 8v11c0 11-7.5 18-18 21C16.5 41 9 34 9 23V12l15-8z" stroke="#caa450" stroke-width="1.5"/><path d="M24 15v13M18 22h12" stroke="#caa450" stroke-width="1.4"/></svg><span>' +
      (img.dataset.label || "City Law College") +
      "</span>";
    img.replaceWith(dv);
  };

  /* ---------- header / reveal / counters ---------- */
  const hdr = $("hdr");
  addEventListener(
    "scroll",
    () => hdr && hdr.classList.toggle("scrolled", scrollY > 40),
    { passive: true }
  );
  const io = new IntersectionObserver(
    (es) => es.forEach((e) => e.isIntersecting && e.target.classList.add("in")),
    { threshold: 0.12 }
  );
  d.querySelectorAll(".reveal").forEach((el) => io.observe(el));
  const cio = new IntersectionObserver(
    (es) =>
      es.forEach((e) => {
        if (!e.isIntersecting) return;
        const el = e.target as HTMLElement,
          t = +el.dataset.count!,
          sfx = el.dataset.suffix || "";
        if (REDUCED) {
          el.textContent = t + sfx;
          cio.unobserve(el);
          return;
        }
        let n = 0;
        const step = Math.max(1, t / 45);
        const iv = setInterval(() => {
          n += step;
          if (n >= t) {
            n = t;
            clearInterval(iv);
          }
          el.textContent = Math.floor(n) + sfx;
        }, 22);
        cio.unobserve(el);
      }),
    { threshold: 0.5 }
  );
  d.querySelectorAll("[data-count]").forEach((el) => cio.observe(el));
  setTimeout(() => {
    const n = $("aiNudge");
    if (n) n.style.display = "none";
  }, 9000);

  /* ---------- parallax + tilt ---------- */
  const parallaxEls = [...d.querySelectorAll<HTMLElement>(".parallax")];
  if (!REDUCED && parallaxEls.length) {
    let ticking = false;
    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        const y = scrollY;
        parallaxEls.forEach((el) => {
          const sp = parseFloat(el.dataset.speed || "0.1");
          el.style.transform = "translate3d(0," + y * sp + "px,0)";
        });
        ticking = false;
      });
    };
    addEventListener("scroll", onScroll, { passive: true });
    onScroll();
  }
  if (!REDUCED && !matchMedia("(hover:none)").matches) {
    d.querySelectorAll<HTMLElement>("[data-tilt]").forEach((card) => {
      const MAX = 7;
      card.addEventListener("pointermove", (e) => {
        const r = card.getBoundingClientRect();
        const px = (e.clientX - r.left) / r.width,
          py = (e.clientY - r.top) / r.height;
        const rx = (0.5 - py) * MAX * 2,
          ry = (px - 0.5) * MAX * 2;
        card.classList.add("tilting");
        card.style.transform =
          "perspective(900px) rotateX(" +
          rx.toFixed(2) +
          "deg) rotateY(" +
          ry.toFixed(2) +
          "deg) translateY(-4px)";
        const g = card.querySelector<HTMLElement>(".tilt-glare");
        if (g) {
          g.style.setProperty("--gx", px * 100 + "%");
          g.style.setProperty("--gy", py * 100 + "%");
        }
      });
      card.addEventListener("pointerleave", () => {
        card.classList.remove("tilting");
        card.style.transform = "";
      });
    });
  }

  /* ---------- premium motion layer ---------- */
  const sp = $("scrollProgress");
  let spTick = false;
  const updProgress = () => {
    if (!sp) return;
    const h = d.documentElement;
    const max = h.scrollHeight - h.clientHeight;
    sp.style.width = (max > 0 ? (scrollY / max) * 100 : 0) + "%";
  };
  addEventListener(
    "scroll",
    () => {
      if (spTick) return;
      spTick = true;
      requestAnimationFrame(() => {
        updProgress();
        spTick = false;
      });
    },
    { passive: true }
  );
  updProgress();

  (function motes() {
    const box = $("motes");
    if (!box || REDUCED) return;
    const N = innerWidth < 700 ? 14 : 24;
    let html = "";
    for (let i = 0; i < N; i++) {
      const x = (Math.random() * 100).toFixed(1),
        dur = 8 + Math.random() * 12,
        delay = (-Math.random() * dur).toFixed(1),
        s = (2 + Math.random() * 3).toFixed(1);
      html +=
        '<span style="left:' +
        x +
        "%;width:" +
        s +
        "px;height:" +
        s +
        "px;animation-duration:" +
        dur.toFixed(1) +
        "s;animation-delay:" +
        delay +
        's"></span>';
    }
    box.innerHTML = html;
  })();

  const toTop = $("toTop");
  addEventListener(
    "scroll",
    () => toTop && toTop.classList.toggle("show", scrollY > 700),
    { passive: true }
  );

  const spyIds = [
    "top",
    "about",
    "programs",
    "eligibility",
    "outcomes",
    "campus-life",
    "visit",
  ];
  const spySections = spyIds
    .map((id) => $(id))
    .filter(Boolean) as HTMLElement[];
  const dotLinks = [...d.querySelectorAll(".dot-rail a")];
  const navLinks = [...d.querySelectorAll(".menu a")];
  const spyObs = new IntersectionObserver(
    (es) => {
      es.forEach((e) => {
        if (e.isIntersecting) {
          const id = (e.target as HTMLElement).id;
          dotLinks.forEach((a) =>
            a.classList.toggle("active", a.getAttribute("href") === "#" + id)
          );
          navLinks.forEach((a) =>
            a.classList.toggle("active", a.getAttribute("href") === "#" + id)
          );
        }
      });
    },
    { rootMargin: "-45% 0px -50% 0px" }
  );
  spySections.forEach((s) => spyObs.observe(s));

  if (!REDUCED && FINE) {
    d.querySelectorAll<HTMLElement>(".spotlight").forEach((el) => {
      el.addEventListener("pointermove", (e) => {
        const r = el.getBoundingClientRect();
        el.style.setProperty("--mx", e.clientX - r.left + "px");
        el.style.setProperty("--my", e.clientY - r.top + "px");
        el.classList.add("glow");
      });
      el.addEventListener("pointerleave", () => el.classList.remove("glow"));
    });
    d.querySelectorAll<HTMLElement>(".btn-gold").forEach((b) => {
      b.addEventListener("pointermove", (e) => {
        const r = b.getBoundingClientRect();
        const mx = (e.clientX - r.left - r.width / 2) / (r.width / 2);
        const my = (e.clientY - r.top - r.height / 2) / (r.height / 2);
        b.style.transform =
          "translate(" + (mx * 6).toFixed(1) + "px," + (my * 6).toFixed(1) + "px)";
      });
      b.addEventListener("pointerleave", () => {
        b.style.transform = "";
      });
    });
  }
  d.querySelectorAll(".prog-grid, .fac-grid, .out-grid, .voices").forEach(
    (grid) => {
      [...grid.children].forEach((c, i) => {
        if (c.classList.contains("reveal"))
          (c as HTMLElement).style.transitionDelay = i * 0.08 + "s";
      });
    }
  );

  /* ---------- mobile menu ---------- */
  const burger = $("burger"),
    mm = $("mobileMenu");
  w.toggleMenu = () => {
    if (!mm || !burger) return;
    const open = mm.classList.toggle("open");
    burger.setAttribute("aria-expanded", String(open));
    mm.setAttribute("aria-hidden", String(!open));
    d.body.style.overflow = open ? "hidden" : "";
    burger.setAttribute("aria-label", open ? "Close menu" : "Open menu");
  };
  w.closeMenu = () => {
    if (!mm || !burger) return;
    mm.classList.remove("open");
    burger.setAttribute("aria-expanded", "false");
    mm.setAttribute("aria-hidden", "true");
    d.body.style.overflow = "";
    burger.setAttribute("aria-label", "Open menu");
  };

  /* ---------- segmented controls + eligibility ---------- */
  w.segPick = (btn: HTMLElement, target: string) => {
    btn.parentNode!.querySelectorAll("button").forEach((b) =>
      b.classList.remove("on")
    );
    btn.classList.add("on");
    ($(target) as HTMLInputElement).value = (btn as any).dataset.v;
  };
  const RULES: any = {
    ballb: { name: "BA LL.B (Hons.)", gen: 45, res: 40, base: "10+2" },
    llb: { name: "LL.B", gen: 50, res: 50, base: "graduation" },
  };
  w.fullCheck = () => {
    const c = ($("cCourse") as HTMLInputElement).value,
      m = +($("cMarks") as HTMLInputElement).value,
      cat = ($("cCat") as HTMLInputElement).value;
    const cResult = $("cResult")!;
    if (!m) {
      cResult.innerHTML =
        '<div class="placeholder">Enter your marks to see your result →</div>';
      return;
    }
    const r = RULES[c],
      need = cat === "res" ? r.res : r.gen,
      ok = m >= need;
    cResult.innerHTML =
      '<div class="verdict"><div class="badge ' +
      (ok ? "yes" : "no") +
      '">' +
      (ok
        ? '<svg width="22" height="22" viewBox="0 0 16 16" aria-hidden="true"><path d="M3 8l3.5 3.5L13 5" stroke="#34c759" stroke-width="2.2" fill="none"/></svg>'
        : '<svg width="20" height="20" viewBox="0 0 16 16" aria-hidden="true"><path d="M5 5l6 6M11 5l-6 6" stroke="#ff8c78" stroke-width="2.2"/></svg>') +
      "</div><h4>" +
      (ok ? "You are eligible" : "Just short — let's talk") +
      '</h4></div><div class="check-line"><span>Programme</span><b>' +
      r.name +
      '</b></div><div class="check-line"><span>Required</span><b>' +
      need +
      "% in " +
      r.base +
      '</b></div><div class="check-line"><span>Your marks</span><b>' +
      m +
      "%</b></div><button class=\"btn btn-gold\" style=\"width:100%;justify-content:center;margin-top:18px\" onclick=\"openAI('" +
      (ok
        ? "I am eligible for " + r.name + " with " + m + "%. Help me apply."
        : "I have " + m + "% for " + r.name + ", what are my options?") +
      "')\">" +
      (ok ? "Continue with Aria →" : "Discuss options with Aria →") +
      "</button>";
    // record the check against the lead (if one exists yet) — best effort
    postJSON("/api/leads", {
      leadId: sessionStorage.getItem("clc_leadId") || undefined,
      event: {
        type: ok ? "eligibility_pass" : "eligibility_fail",
        detail: { course: c, marks: m, category: cat },
      },
      patch: {
        course: c === "ballb" ? "ba_llb" : "llb",
        qualifyingPercent: m,
        category: cat === "res" ? "sc_st" : "general",
        eligibilityStatus: ok ? "eligible" : "not_eligible",
      },
      source: "eligibility_checker",
    }).catch(() => {});
  };

  /* ---------- apply modal ---------- */
  const modal = $("modal")!;
  w.openModal = (c?: string) => {
    modal.classList.add("open");
    if (c)
      ($("mCourse") as HTMLSelectElement).value =
        c === "ballb" ? "BA LL.B (Hons.)" : "LL.B";
    setTimeout(() => $("mName")?.focus(), 120);
  };
  w.closeModal = () => modal.classList.remove("open");
  modal.addEventListener("click", (e) => {
    if (e.target === modal) w.closeModal();
  });
  w.submitApp = async () => {
    const name = ($("mName") as HTMLInputElement).value,
      phone = ($("mPhone") as HTMLInputElement).value,
      course = ($("mCourse") as HTMLSelectElement).value;
    if (!name || !phone) {
      w.toast("Please add your name and number");
      return;
    }
    crmState.lead.name = name;
    crmState.lead.phone = phone;
    crmState.lead.course = course;
    crmState.readiness = Math.max(crmState.readiness, 90);
    crmState.stage = 2;
    crmState.mood = "ready";
    crmState.temp = "hot";
    renderCRM();
    w.closeModal();
    try {
      const res = await postJSON("/api/leads", {
        leadId: sessionStorage.getItem("clc_leadId") || undefined,
        patch: {
          name,
          phone,
          course: course.startsWith("BA") ? "ba_llb" : "llb",
          stage: "applied",
        },
        event: { type: "application_submitted" },
        source: "apply_form",
      });
      if (res?.leadId) sessionStorage.setItem("clc_leadId", res.leadId);
      w.toast("Application received — saved to CRM ✓");
    } catch {
      w.toast("Application noted — we'll follow up shortly");
    }
  };
  w.toast = (m: string) => {
    $("toastMsg")!.textContent = m;
    const t = $("toast")!;
    t.classList.add("show");
    setTimeout(() => t.classList.remove("show"), 2600);
  };

  addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      if (mm?.classList.contains("open")) w.closeMenu();
      if (modal.classList.contains("open")) w.closeModal();
      if (panel?.classList.contains("open")) w.closeAI();
      if (wamodal?.classList.contains("open")) w.closeWA();
      if (demoModal?.classList.contains("open")) w.closeDemo();
    }
  });

  /* ================= ARIA (server-backed) ================= */
  const panel = $("aiPanel")!,
    log = $("aiLog")!,
    cards = $("aiCards")!;
  let started = false;
  const history: { role: string; content: string }[] = [];
  const crmState: any = {
    mood: "neutral",
    stage: 0,
    readiness: 0,
    temp: "cold",
    lead: { name: null, phone: null, course: null },
    nba: "Greet warmly; surface the student's goal.",
  };
  const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

  async function postJSON(url: string, body: any) {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error("HTTP " + res.status);
    return res.json();
  }

  const CARD_SETS: any = {
    start: [
      { emo: "🎓", t: "I want to apply", msg: "I want to apply for admission. Please guide me." },
      { emo: "❓", t: "Am I eligible?", msg: "Can you check if I am eligible? I will tell you my marks." },
      { emo: "💰", t: "Fees & scholarships", msg: "What are the fees and are there any scholarships?" },
      { emo: "⚖️", t: "Why this college?", msg: "Why should I choose City Law College over others in Lucknow?" },
      { emo: "🗺️", t: "Visit campus", msg: "I want to visit the campus. How do I reach and when can I come?" },
    ],
  };
  function renderCards(set: string) {
    const list = CARD_SETS[set] || [];
    cards.innerHTML = list
      .map(
        (c: any) =>
          `<button class="ai-card" onclick="quick('${c.msg.replace(/'/g, "\\'")}')"><span class="emo">${c.emo}</span>${c.t}</button>`
      )
      .join("");
    cards.style.display = "flex";
  }
  function renderChips(arr: string[]) {
    if (!arr || !arr.length) {
      cards.style.display = "none";
      return;
    }
    cards.innerHTML = arr
      .slice(0, 3)
      .map(
        (c) =>
          `<button class="ai-card" onclick="quick('${("" + c).replace(/'/g, "\\'")}')">${c}</button>`
      )
      .join("");
    cards.style.display = "flex";
  }
  const hideCards = () => (cards.style.display = "none");

  w.openAI = (prefill?: string) => {
    panel.classList.add("open");
    $("aiFab")!.style.display = "none";
    if (!started) {
      started = true;
      (async () => {
        await botSayHuman(
          "Namaste! 🙏 I'm Aria, your personal admissions counsellor at City Law College.\n\nNo forms, no pressure — just tap what's on your mind and I'll take it from there. 👇"
        );
        renderCards("start");
      })();
    }
    if (prefill) {
      hideCards();
      setTimeout(() => {
        ($("aiInput") as HTMLInputElement).value = prefill;
        w.send();
      }, 400);
    }
  };
  w.closeAI = () => {
    panel.classList.remove("open");
    $("aiFab")!.style.display = "flex";
  };
  w.toggleCRM = () => panel.classList.toggle("show-crm");
  w.quick = (t: string) => {
    hideCards();
    ($("aiInput") as HTMLInputElement).value = t;
    w.send();
  };
  function meSay(t: string) {
    const r = d.createElement("div");
    r.className = "row me";
    r.innerHTML = '<div class="bubble"></div>';
    r.querySelector(".bubble")!.textContent = t;
    log.appendChild(r);
    const tk = d.createElement("div");
    tk.className = "tick";
    tk.textContent = "Delivered";
    log.appendChild(tk);
    log.scrollTop = log.scrollHeight;
  }
  function themSay(t: string) {
    const r = d.createElement("div");
    r.className = "row them";
    r.innerHTML = '<div class="bubble"></div>';
    r.querySelector(".bubble")!.textContent = t;
    log.appendChild(r);
    log.scrollTop = log.scrollHeight;
  }
  function showTyping() {
    const r = d.createElement("div");
    r.className = "row them";
    r.id = "typing";
    r.innerHTML = '<div class="typing-b"><span></span><span></span><span></span></div>';
    log.appendChild(r);
    log.scrollTop = log.scrollHeight;
  }
  const hideTyping = () => $("typing")?.remove();

  function splitMsg(t: string) {
    const parts = t
      .split(/\n{2,}/)
      .map((s) => s.trim())
      .filter(Boolean);
    const out: string[] = [];
    parts.forEach((p) => {
      if (p.length > 150) {
        const s = p.match(/[^.!?]+[.!?]+|\s*[^.!?]+$/g) || [p];
        let buf = "";
        s.forEach((x) => {
          if ((buf + x).length > 150) {
            if (buf) out.push(buf.trim());
            buf = x;
          } else buf += x;
        });
        if (buf) out.push(buf.trim());
      } else out.push(p);
    });
    return out.slice(0, 3);
  }
  async function botSayHuman(text: string) {
    const parts = splitMsg(text);
    for (let i = 0; i < parts.length; i++) {
      showTyping();
      await wait(Math.min(2200, 650 + parts[i].length * 22));
      hideTyping();
      themSay(parts[i]);
      await wait(300);
    }
  }

  w.send = async () => {
    const input = $("aiInput") as HTMLInputElement;
    const text = input.value.trim();
    if (!text) return;
    input.value = "";
    meSay(text);
    history.push({ role: "user", content: text });
    hideCards();
    showTyping();
    let p: any = null;
    try {
      p = await postJSON("/api/aria", {
        leadId: sessionStorage.getItem("clc_leadId") || undefined,
        conversationId: sessionStorage.getItem("clc_convId") || undefined,
        channel: "web_chat",
        messages: history.slice(-24),
      });
      if (p?.leadId) sessionStorage.setItem("clc_leadId", p.leadId);
      if (p?.conversationId)
        sessionStorage.setItem("clc_convId", p.conversationId);
    } catch {
      p = null;
    }
    hideTyping();
    if (!p || !p.reply) p = localFallback(text);
    await botSayHuman(p.reply);
    history.push({ role: "assistant", content: p.reply });
    applyCRM(p);
    renderChips(p.chips);
  };

  function applyCRM(p: any) {
    if (p.sentiment) crmState.mood = p.sentiment;
    if (typeof p.stage === "number") crmState.stage = p.stage;
    if (typeof p.readiness === "number") crmState.readiness = p.readiness;
    if (p.temp) crmState.temp = p.temp;
    if (p.lead)
      ["name", "phone", "course"].forEach((k) => {
        if (p.lead[k]) crmState.lead[k] = p.lead[k];
      });
    if (p.nba) crmState.nba = p.nba;
    if (crmState.lead.phone && crmState.readiness >= 70) crmState.temp = "hot";
    renderCRM();
    if (crmState.lead.name && crmState.lead.phone)
      w.toast("Lead captured to CRM ✓");
  }
  const FACES: any = {
    excited: "🤩",
    curious: "🧐",
    anxious: "😟",
    skeptical: "🤨",
    neutral: "🙂",
    frustrated: "😣",
    ready: "🥳",
  };
  const TEMP: any = {
    cold: ["❄️ Cold", "temp-cold"],
    warm: ["🌤️ Warm", "temp-warm"],
    hot: ["🔥 Hot", "temp-hot"],
  };
  function renderCRM() {
    if (!$("crmFace")) return;
    $("crmFace")!.textContent = FACES[crmState.mood] || "🙂";
    $("crmMood")!.textContent = crmState.mood;
    const tb = $("crmTemp")!;
    const tv = TEMP[crmState.temp] || TEMP.cold;
    tb.textContent = tv[0];
    tb.className = "temp-badge " + tv[1];
    $("waSync")!.classList.toggle(
      "on",
      crmState.temp !== "cold" && !!crmState.lead.phone
    );
    [0, 1, 2].forEach((i) =>
      $("st" + i)!.classList.toggle("active", i <= crmState.stage)
    );
    $("crmReady")!.textContent = crmState.readiness;
    ($("crmReadyBar") as HTMLElement).style.width = crmState.readiness + "%";
    $("ldName")!.textContent = crmState.lead.name || "—";
    $("ldPhone")!.textContent = crmState.lead.phone || "—";
    $("ldCourse")!.textContent = crmState.lead.course || "—";
    $("crmNBA")!.textContent = crmState.nba;
  }

  /* offline fallback — used only if /api/aria is unreachable */
  function localFallback(t: string) {
    const q = t.toLowerCase();
    const lead = { ...crmState.lead };
    const pm = t.match(/\b\d{10}\b/);
    if (pm) lead.phone = pm[0];
    const nm = t.match(/(?:i am|i'm|my name is|naam|this is|myself)\s+([a-z]{3,})/i);
    if (nm) lead.name = nm[1].replace(/^\w/, (c) => c.toUpperCase());
    if (/ba.?ll|integrated|5.?year|12th|after 12/.test(q))
      lead.course = "BA LL.B (Hons.)";
    else if (/ll\.?b|3.?year|graduat/.test(q) && !lead.course) lead.course = "LL.B";
    let reply: string,
      sentiment = "curious",
      stage = 1,
      readiness = Math.min(95, crmState.readiness + 12),
      temp = "warm",
      chips: string[] = [];
    if (/fee|fees|cost|kitni|kitna|price|scholarship/.test(q)) {
      reply =
        "Great question!\n\nFees depend on the programme and current session, and I'd rather give you the exact figure than a guess — so our team will send the full structure (and any scholarships) today.\n\nMay I have your name and mobile number?";
      chips = ["My name is…", "BA LL.B", "Call me on…"];
    } else if (/eligib|percent|%|marks|qualify|hoga|chance/.test(q)) {
      const mm2 = t.match(/(\d{2,3})\s?%?/);
      const m = mm2 ? +mm2[1] : null;
      if (m) {
        const ok = m >= 45;
        reply = ok
          ? `Wonderful — with ${m}% you comfortably meet our BA LL.B cut-off (45%, or 40% SC/ST). You're in a strong spot! 🎉\n\nShall I help you apply? What's your name and number?`
          : `${m}% is not the end of the story — far from it. There are real options worth exploring together. 💪\n\nCould I have your name and number so a counsellor guides you personally?`;
        readiness = ok ? 80 : 60;
        sentiment = ok ? "excited" : "anxious";
        temp = ok ? "hot" : "warm";
        chips = ok
          ? ["Yes, help me apply", "My name is…"]
          : ["What are my options?", "My name is…"];
      } else {
        reply =
          "Happy to check instantly!\n\nBA LL.B needs 45% in 12th (40% SC/ST); LL.B needs 50% in graduation. What were your marks?";
        chips = ["I got 60% in 12th", "52% in graduation"];
        sentiment = "anxious";
      }
    } else if (/apply|application|admission|join|enroll|guide/.test(q)) {
      reply =
        "Lovely — applying is simple and fully merit-based, and I'll walk you through every step. 🙌\n\nTo start, what's your name, mobile number, and which programme interests you?";
      sentiment = "ready";
      stage = 2;
      readiness = Math.max(readiness, 82);
      temp = "hot";
      chips = ["BA LL.B (after 12th)", "LL.B (after graduation)", "My name is…"];
    } else if (/visit|campus|reach|location|address|direction|come/.test(q)) {
      reply =
        "You're very welcome to visit! 😊\n\nWe're in Sector 9, Jankipuram Vistar, on the AKTU–CDRI Road.\n\nShall I have a counsellor fix a convenient time? What's your name and number?";
      chips = ["Fix a visit for me", "Get directions"];
    } else {
      reply =
        "That's a thoughtful question — and the fact you're asking tells me you'd take law seriously. 🙂\n\nTell me a little about your goal, and your name and number, so I can guide you the right way?";
      chips = ["I want to apply", "Am I eligible?", "Just exploring"];
    }
    if (lead.name && lead.phone) {
      stage = 2;
      readiness = Math.max(readiness, 86);
      sentiment = "ready";
      temp = "hot";
    }
    const nba =
      temp === "hot"
        ? "🔥 Hot lead — call within the hour; queue WhatsApp follow-up."
        : stage >= 1
          ? "Warm lead — capture phone next, then nudge to apply."
          : "Build rapport; surface motivation.";
    return { reply, sentiment, stage, readiness, temp, lead, nba, chips };
  }

  /* voice input inside chat */
  let rec: any = null,
    recording = false;
  w.toggleMic = () => {
    const SR = w.SpeechRecognition || w.webkitSpeechRecognition;
    if (!SR) {
      w.toast("Voice not supported here — try Chrome");
      return;
    }
    if (recording) {
      if (rec) rec.stop();
      return;
    }
    rec = new SR();
    rec.lang = "en-IN";
    rec.interimResults = false;
    recording = true;
    $("micBtn")!.classList.add("rec");
    rec.onresult = (e: any) => {
      ($("aiInput") as HTMLInputElement).value = e.results[0][0].transcript;
      w.send();
    };
    rec.onerror = () => w.toast("Didn't catch that");
    rec.onend = () => {
      recording = false;
      $("micBtn")!.classList.remove("rec");
    };
    rec.start();
  };
  renderCRM();

  /* ================= WHATSAPP DEMO (scripted showcase) ================= */
  const waScript: any[] = [
    { s: "out", t: "Hi Aarav! 👋 This is Riya from City Law College admissions.", d: 900 },
    { s: "out", t: "You were just looking at BA LL.B on our website — so glad you're considering law! 😊", d: 1500 },
    { s: "in", t: "Yeah… but I'm not sure my 58% in 12th is enough 😕", d: 1800 },
    { s: "out", t: "58% comfortably clears our BA LL.B cut-off — you absolutely qualify! 🎉", d: 1600 },
    { s: "out", t: "And honestly? The students who do best here are the curious ones, not just the toppers.", d: 1700 },
    { s: "out", t: "Can I ask — what draws you to law? ⚖️", d: 1300 },
    { s: "in", t: "I want to fight for people who can't afford lawyers", d: 2000 },
    { s: "out", t: "That genuinely gave me goosebumps 🙌", d: 1200 },
    { s: "out", t: "That's exactly the spirit our legal-aid clinic is built around — you'd thrive here.", d: 1700 },
    { s: "out", t: "Shall I block a campus visit for you this week and keep your seat in view? You're in Lucknow, right?", d: 1700 },
    { s: "in", t: "Yes, Aliganj", d: 1400 },
    { s: "out", t: "Perfect — barely 20 mins away 🚗 I'll have our counsellor Ankit call you today at 5 PM to fix it. Talk soon, Aarav! 💛", d: 1700 },
    { tag: "🔥 Lead qualified as HOT — handed to human counsellor" },
  ];
  const wamodal = $("wamodal")!,
    waBody = $("waBody")!,
    waStatus = $("waStatus")!,
    waReplay = $("waReplay")!;
  let waRunning = false;
  w.openWA = () => {
    wamodal.classList.add("open");
    w.playWA();
  };
  w.closeWA = () => {
    wamodal.classList.remove("open");
    waRunning = false;
  };
  wamodal.addEventListener("click", (e) => {
    if (e.target === wamodal) w.closeWA();
  });
  w.playWA = async () => {
    if (waRunning) return;
    waRunning = true;
    (waReplay as HTMLElement).style.display = "none";
    waBody.innerHTML = "";
    for (const m of waScript) {
      if (!waRunning) return;
      if (m.tag) {
        const dv = d.createElement("div");
        dv.className = "wa-tag";
        dv.textContent = m.tag;
        waBody.appendChild(dv);
        waBody.scrollTop = waBody.scrollHeight;
        continue;
      }
      if (m.s === "out") {
        waStatus.textContent = "typing…";
        const tp = d.createElement("div");
        tp.className = "wa-typing";
        tp.innerHTML = "<span></span><span></span><span></span>";
        waBody.appendChild(tp);
        waBody.scrollTop = waBody.scrollHeight;
        await wait(m.d);
        if (!waRunning) return;
        tp.remove();
        waStatus.textContent = "online";
      } else {
        await wait(m.d);
        if (!waRunning) return;
      }
      const b = d.createElement("div");
      b.className = "wa-msg " + (m.s === "out" ? "wa-out" : "wa-in");
      const now = new Date();
      const hh = now.getHours() % 12 || 12,
        mm2 = ("" + now.getMinutes()).padStart(2, "0");
      b.innerHTML =
        m.t.replace(/</g, "&lt;") +
        '<span class="meta">' +
        hh +
        ":" +
        mm2 +
        (m.s === "out" ? ' <span class="t2">✓✓</span>' : "") +
        "</span>";
      waBody.appendChild(b);
      waBody.scrollTop = waBody.scrollHeight;
      await wait(350);
    }
    waRunning = false;
    (waReplay as HTMLElement).style.display = "block";
  };

  /* ================= GENERIC LIVE-DEMO ENGINE ================= */
  const demoModal = $("demoModal")!,
    demoFeed = $("demoFeed")!,
    demoSide = $("demoSide")!,
    demoTitle = $("demoTitle")!,
    demoTag = $("demoTag")!,
    demoReplay = $("demoReplay")!;
  let currentDemo: string | null = null;

  function dTyping() {
    const r = d.createElement("div");
    r.className = "d-row them";
    r.dataset.typing = "1";
    r.innerHTML = '<div class="d-typing"><span></span><span></span><span></span></div>';
    demoFeed.appendChild(r);
    demoFeed.scrollTop = demoFeed.scrollHeight;
    return r;
  }
  function dBubble(side: string, text: string) {
    const r = d.createElement("div");
    r.className = "d-row " + side;
    if (side === "sys") {
      r.innerHTML = '<div class="d-sys"></div>';
      r.querySelector(".d-sys")!.textContent = text;
    } else {
      r.innerHTML = '<div class="d-bub"></div>';
      r.querySelector(".d-bub")!.textContent = text;
    }
    demoFeed.appendChild(r);
    demoFeed.scrollTop = demoFeed.scrollHeight;
    return r;
  }
  function paintScore(i: number, v: number) {
    const el = $("dc_sc" + i);
    if (!el) return;
    el.textContent = String(v);
    el.style.color = v >= 80 ? "#ffb0a3" : v >= 55 ? "#ffcf8f" : "#9cc6ff";
  }
  function setScore(v: number) {
    const s = $("dq_score"),
      f = $("dq_fill");
    if (!s || !f) return;
    let n = +s.textContent!;
    const iv = setInterval(() => {
      n += Math.max(1, Math.round((v - n) / 5));
      if (n >= v) {
        n = v;
        clearInterval(iv);
      }
      s.textContent = String(n);
      (f as HTMLElement).style.width = n + "%";
    }, 40);
  }
  function setStep(i: number, val: string, note?: string) {
    const s = $("dq_s" + i);
    if (s) {
      s.classList.add("on");
      $("dq_v" + i)!.textContent = val;
    }
    const r = $("dq_route");
    if (r && note) r.textContent = note + "…";
  }
  const setStepP = (i: number) => $("dp_s" + i)?.classList.add("on");

  const DEMOS: any = {
    lead: {
      tag: "Module 01 · Live Demo",
      title: "Lead Qualification Engine",
      side: `<h6><span class="pulse" style="width:7px;height:7px"></span> Real-Time Qualification</h6>
      <div class="d-card"><div class="lbl">Lead Score</div><div class="d-score"><span id="dq_score">0</span>/100</div><div class="d-bar"><div class="d-fill" id="dq_fill"></div></div></div>
      <div class="d-card"><div class="lbl">Qualifying Signals</div>
        <div class="d-step" id="dq_s0"><div class="dot">✓</div><div><b>Stream</b><span id="dq_v0">—</span></div></div>
        <div class="d-step" id="dq_s1"><div class="dot">✓</div><div><b>Location</b><span id="dq_v1">—</span></div></div>
        <div class="d-step" id="dq_s2"><div class="dot">✓</div><div><b>Career goal</b><span id="dq_v2">—</span></div></div>
        <div class="d-step" id="dq_s3"><div class="dot">✓</div><div><b>Contact</b><span id="dq_v3">—</span></div></div>
      </div>
      <div class="d-card"><div class="lbl">Routing</div><div class="d-route" id="dq_route">Listening…</div></div>`,
      steps: async () => {
        dBubble("sys", "Aria is qualifying this visitor in real time");
        await wait(700);
        let t = dTyping();
        await wait(1100);
        t.remove();
        dBubble("them", "Hi! I saw the BA LL.B page — is it good for someone who wants to do corporate law? 👔");
        setScore(18);
        setStep(0, "BA LL.B (Hons.)", "Curiosity detected");
        await wait(1400);
        dBubble("me", "Great aim! 🎯 BA LL.B is the perfect 5-year route into corporate law. Are you in Lucknow, or would you be relocating?");
        await wait(1500);
        t = dTyping();
        await wait(1100);
        t.remove();
        dBubble("them", "I'm in Kanpur, would shift to Lucknow for a good college");
        setScore(44);
        setStep(1, "Kanpur → relocating", "High intent");
        await wait(1400);
        dBubble("me", "That commitment says a lot. 👏 Corporate law especially rewards it — what draws you to that field?");
        await wait(1500);
        t = dTyping();
        await wait(1100);
        t.remove();
        dBubble("them", "Honestly the placements and salary, I want a corporate job after");
        setScore(68);
        setStep(2, "Corporate · placement-driven", "Goal captured");
        await wait(1300);
        dBubble("me", "Clear and ambitious — I love it. Drop your number and I'll have our corporate-law mentor call you with the full placement picture. 📞");
        await wait(1600);
        t = dTyping();
        await wait(1000);
        t.remove();
        dBubble("them", "Sure — 98XXXXXX21");
        setScore(91);
        setStep(3, "98XXXXXX21", "✓ captured");
        await wait(900);
        $("dq_route")!.innerHTML =
          '🔥 <b style="color:#fff">HOT</b> — auto-routed to counsellor\'s phone now. Conversation attached.';
        dBubble("sys", "🔥 Hot lead routed to counsellor — full transcript attached");
      },
    },
    parent: {
      tag: "Module 03 · Live Demo",
      title: "Parent-Aware Nurture",
      cls: "parent",
      side: `<h6><span class="pulse" style="width:7px;height:7px"></span> Tone Detection</h6>
      <div class="d-card"><div class="lbl">Who is speaking?</div><div class="mood"><span class="face" id="dp_face">🙂</span><span class="mlabel" id="dp_who" style="font-size:1.05rem;font-weight:600">Detecting…</span></div></div>
      <div class="d-card"><div class="lbl">Script Mode</div><div class="d-pill" id="dp_mode" style="background:rgba(90,160,230,.16);color:#9cc6ff;border:1px solid #4a86c9">Student · casual</div></div>
      <div class="d-card"><div class="lbl">Emphasis Switched To</div>
        <div class="d-step" id="dp_s0"><div class="dot">✓</div><div><b>University of Lucknow affiliation</b></div></div>
        <div class="d-step" id="dp_s1"><div class="dot">✓</div><div><b>Placement outcomes &amp; ROI</b></div></div>
        <div class="d-step" id="dp_s2"><div class="dot">✓</div><div><b>Reputation &amp; safety</b></div></div>
      </div>`,
      steps: async () => {
        dBubble("sys", "A new person takes over the chat mid-conversation");
        await wait(700);
        let t = dTyping();
        await wait(1100);
        t.remove();
        dBubble("them", "Hello. I am Aarav's father. I would like to understand what return this degree offers for the fees.");
        $("dp_face")!.textContent = "👨";
        $("dp_who")!.textContent = "Parent · formal";
        const mode = $("dp_mode")!;
        mode.textContent = "Parent · formal ROI";
        mode.style.background = "rgba(255,180,80,.16)";
        mode.style.color = "#ffcf8f";
        mode.style.border = "1px solid #d99a35";
        await wait(1400);
        dBubble("sys", "Tone shift detected → switching to formal, ROI-focused script");
        await wait(1000);
        t = dTyping();
        await wait(1300);
        t.remove();
        dBubble("me", "Good evening, Sir. Thank you for taking the time — I'll be precise.");
        setStepP(0);
        await wait(1300);
        dBubble("me", "The degree is awarded by the University of Lucknow (College Code 1238) — an established public university, not a private title.");
        await wait(1700);
        t = dTyping();
        await wait(1000);
        t.remove();
        dBubble("them", "And after the degree? Placements?");
        setStepP(1);
        await wait(1200);
        dBubble("me", "Our Training & Placement Cell runs internships across Lucknow's courts and chambers, plus structured corporate-law preparation. I can email you the outcomes summary.");
        await wait(1800);
        setStepP(2);
        t = dTyping();
        await wait(1000);
        t.remove();
        dBubble("them", "That would be helpful. Please do.");
        await wait(900);
        dBubble("me", "Certainly, Sir. May I have your email and a convenient time for our senior counsellor to call you personally?");
        dBubble("sys", "✓ Parent engaged on ROI terms — handed to senior counsellor");
      },
    },
    crm: {
      tag: "Module 04 · Live Demo",
      title: "CRM with AI Follow-Up Scoring",
      side: `<h6><span class="pulse" style="width:7px;height:7px"></span> AI Score Signals</h6>
      <div class="d-card"><div class="lbl">Signals detected (this lead)</div>
        <div class="d-step" id="dc_s0"><div class="dot">✓</div><div><b>Opened WhatsApp</b><span>+18</span></div></div>
        <div class="d-step" id="dc_s1"><div class="dot">✓</div><div><b>Visited fee page</b><span>+22</span></div></div>
        <div class="d-step" id="dc_s2"><div class="dot">✓</div><div><b>Asked about eligibility</b><span>+27</span></div></div>
        <div class="d-step" id="dc_s3"><div class="dot">✓</div><div><b>Replied within 5 min</b><span>+24</span></div></div>
      </div>
      <div class="d-card"><div class="lbl">Focus the top ~20%</div><div class="d-route" id="dc_focus">Counsellors call the top scorers; the rest nurture on autopilot.</div></div>`,
      steps: async () => {
        dBubble("sys", "The CRM scores every lead automatically as signals arrive");
        await wait(800);
        const board = d.createElement("div");
        board.id = "dc_board";
        demoFeed.appendChild(board);
        const leads = [
          { n: "Aarav R.", c: "#caa450", sub: "BA LL.B · Kanpur", score: 0, target: 91, hot: true },
          { n: "Sneha K.", c: "#6b1f2a", sub: "LL.B · Lucknow", score: 0, target: 74 },
          { n: "Mohit V.", c: "#16344a", sub: "BA LL.B · Sitapur", score: 0, target: 58 },
          { n: "Priya S.", c: "#a87f2d", sub: "LL.B · Unnao", score: 0, target: 33 },
        ];
        board.innerHTML = leads
          .map(
            (l, i) =>
              `<div class="crm-lead-row" id="dc_l${i}"><div class="av2" style="background:${l.c};color:#fff">${l.n
                .split(" ")
                .map((x) => x[0])
                .join("")}</div><div class="nm"><b>${l.n}</b><span>${l.sub}</span></div><div class="sc" id="dc_sc${i}" style="color:#9cc6ff">0</div></div>`
          )
          .join("");
        demoFeed.scrollTop = demoFeed.scrollHeight;
        await wait(600);
        const sigs = ["dc_s0", "dc_s1", "dc_s2", "dc_s3"];
        for (let s = 0; s < sigs.length; s++) {
          $(sigs[s])!.classList.add("on");
          for (let i = 0; i < leads.length; i++) {
            const inc = Math.round((leads[i].target / 4) * (0.7 + Math.random() * 0.6));
            leads[i].score = Math.min(leads[i].target, leads[i].score + inc);
            paintScore(i, leads[i].score);
          }
          await wait(950);
        }
        leads.forEach((l, i) => {
          leads[i].score = l.target;
          paintScore(i, l.target);
        });
        await wait(500);
        $("dc_l0")!.style.boxShadow = "0 0 0 1.5px var(--gold)";
        $("dc_sc0")!.style.color = "#ffb0a3";
        dBubble("sys", "🔥 Aarav crosses the threshold → flagged HOT for a call. Others keep nurturing automatically.");
      },
    },
  };

  async function runDemo(key: string) {
    const dd = DEMOS[key];
    if (!dd) return;
    demoReplay.classList.remove("show");
    demoFeed.innerHTML = "";
    demoFeed.className = "demo-feed " + (dd.cls || "");
    try {
      await dd.steps();
    } catch {}
    demoReplay.classList.add("show");
  }
  w.openDemo = (key: string) => {
    const dd = DEMOS[key];
    if (!dd) return;
    currentDemo = key;
    demoTag.textContent = dd.tag;
    demoTitle.textContent = dd.title;
    demoSide.innerHTML = dd.side;
    demoModal.classList.add("open");
    runDemo(key);
  };
  w.closeDemo = () => {
    demoModal.classList.remove("open");
    demoFeed.innerHTML = "";
  };
  w.replayDemo = () => {
    if (currentDemo) runDemo(currentDemo);
  };
  demoModal.addEventListener("click", (e) => {
    if (e.target === demoModal) w.closeDemo();
  });

  /* deep links: /#aria opens the chat (used by quiz & voice pages) */
  if (location.hash === "#aria") {
    const prefill = sessionStorage.getItem("clc_aria_prefill");
    sessionStorage.removeItem("clc_aria_prefill");
    setTimeout(() => w.openAI(prefill || undefined), 600);
  }
}

export default function SiteRuntime() {
  useEffect(() => {
    if (booted) return;
    booted = true;
    init();
  }, []);
  return null;
}
