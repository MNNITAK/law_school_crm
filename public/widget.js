/* Aria chat widget loader — City Law College.
   Embed with:  <script src="https://<our-domain>/widget.js" async></script>
   Injects a floating chat bubble; the chat UI itself is an iframe served
   from our server (/widget), so nothing else runs on the host page. */
(function () {
  if (window.__clcAriaWidget) return; // double-injection guard
  window.__clcAriaWidget = true;

  var script = document.currentScript;
  if (!script || !script.src) return;
  var ORIGIN = new URL(script.src).origin;

  var Z = 2147483000;
  var fab, container, iframe;
  var isOpen = false;

  function el(tag, styles) {
    var e = document.createElement(tag);
    for (var k in styles) e.style[k] = styles[k];
    return e;
  }

  function isMobile() {
    return window.matchMedia("(max-width: 640px)").matches;
  }

  function sizeContainer() {
    if (!container) return;
    if (isMobile()) {
      container.style.top = "0";
      container.style.left = "0";
      container.style.right = "0";
      container.style.bottom = "0";
      container.style.width = "100%";
      container.style.height = "100dvh";
      container.style.borderRadius = "0";
    } else {
      container.style.top = "auto";
      container.style.left = "auto";
      container.style.right = "20px";
      container.style.bottom = "90px";
      container.style.width = "min(400px, calc(100vw - 40px))";
      container.style.height = "min(640px, calc(100dvh - 120px))";
      container.style.borderRadius = "16px";
    }
  }

  function ensureIframe() {
    if (iframe) return;
    container = el("div", {
      position: "fixed",
      zIndex: String(Z),
      display: "none",
      overflow: "hidden",
      boxShadow: "0 24px 80px -12px rgba(0,0,0,.45)",
      background: "#f2f2f7",
    });
    iframe = document.createElement("iframe");
    iframe.src = ORIGIN + "/widget";
    iframe.title = "Aria — AI admissions counsellor";
    iframe.allow = "microphone";
    iframe.style.border = "0";
    iframe.style.width = "100%";
    iframe.style.height = "100%";
    container.appendChild(iframe);
    document.body.appendChild(container);
    sizeContainer();
  }

  function open() {
    ensureIframe();
    isOpen = true;
    sizeContainer();
    container.style.display = "block";
    fab.style.display = "none";
    if (iframe.contentWindow)
      iframe.contentWindow.postMessage(
        { source: "clc-aria", type: "visibility", open: true },
        ORIGIN
      );
  }

  function close() {
    isOpen = false;
    if (container) container.style.display = "none";
    fab.style.display = "flex";
    if (iframe && iframe.contentWindow)
      iframe.contentWindow.postMessage(
        { source: "clc-aria", type: "visibility", open: false },
        ORIGIN
      );
  }

  function mount() {
    fab = el("button", {
      position: "fixed",
      right: "20px",
      bottom: "20px",
      zIndex: String(Z),
      width: "60px",
      height: "60px",
      borderRadius: "50%",
      border: "none",
      cursor: "pointer",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      background: "linear-gradient(180deg,#0a84ff,#0066d6)",
      color: "#fff",
      fontSize: "26px",
      boxShadow: "0 10px 30px -6px rgba(10,132,255,.6)",
      transition: "transform .2s",
    });
    fab.type = "button";
    fab.setAttribute("aria-label", "Chat with Aria, AI admissions counsellor");
    fab.innerHTML = "💬";
    fab.onmouseenter = function () {
      fab.style.transform = "scale(1.08)";
    };
    fab.onmouseleave = function () {
      fab.style.transform = "scale(1)";
    };
    fab.onclick = open;
    document.body.appendChild(fab);

    window.addEventListener("resize", function () {
      if (isOpen) sizeContainer();
    });

    window.addEventListener("message", function (e) {
      if (e.origin !== ORIGIN) return;
      var d = e.data;
      if (!d || d.source !== "clc-aria") return;
      if (d.type === "close") close();
      /* d.type === "ready" / "unread" reserved for future use */
    });
  }

  if (document.readyState === "loading")
    document.addEventListener("DOMContentLoaded", mount);
  else mount();
})();
