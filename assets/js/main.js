/* PACER project page — renders the data-driven parts of index.html from
   window.PACER (assets/js/data.js) and wires the page behaviour:
   top bar links, scroll reveal, lazy videos, copy buttons, Fig. 2 steps, KaTeX.

   Classic script (no ES modules, no fetch) so the page works from file://.
   Every number on the page is rendered from window.PACER via [data-bind].
   Public API for later scripts (charts.js, explainer.js):
     PACERUI.lazyVideos(root)   observe video[data-src] under root (load near view, loop while visible)
     PACERUI.copyButtons(root)  wire [data-copy="<element id>"] buttons under root
     PACERUI.renderDemos(el, demos), PACERUI.bind(root), PACERUI.renderMath()
*/
(function () {
  "use strict";

  var D = window.PACER;
  var doc = document;
  var root = doc.documentElement;
  var reduceMotion = !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  var hasIO = "IntersectionObserver" in window;

  /* ------------------------------------------------------------ helpers */

  function $(sel, ctx) { return (ctx || doc).querySelector(sel); }
  function $$(sel, ctx) { return Array.prototype.slice.call((ctx || doc).querySelectorAll(sel)); }

  // h("a", {class: "btn", href: "#x", text: "Go"}, [child, "text"])
  function h(tag, attrs, kids) {
    var e = doc.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) {
      var v = attrs[k];
      if (v === null || v === undefined || v === false) return;
      if (k === "class") e.className = v;
      else if (k === "text") e.textContent = v;
      else e.setAttribute(k, v === true ? "" : String(v));
    });
    (kids || []).forEach(function (c) {
      if (c !== null && c !== undefined) e.appendChild(typeof c === "string" ? doc.createTextNode(c) : c);
    });
    return e;
  }

  function icon(id, cls) {
    var NS = "http://www.w3.org/2000/svg";
    var svg = doc.createElementNS(NS, "svg");
    svg.setAttribute("class", "icon" + (cls ? " " + cls : ""));
    svg.setAttribute("aria-hidden", "true");
    var use = doc.createElementNS(NS, "use");
    use.setAttribute("href", "#" + id);
    svg.appendChild(use);
    return svg;
  }

  function play(video) {
    var p = video.play();
    if (p && typeof p.catch === "function") p.catch(function () { /* autoplay refused or no decoder */ });
  }

  // "π_θ0 (initial SFT)" -> π<sub>θ0</sub> (initial SFT)
  function label(text) {
    var frag = doc.createDocumentFragment();
    String(text).split("π_θ0").forEach(function (part, i) {
      if (i > 0) {
        frag.appendChild(doc.createTextNode("π"));
        frag.appendChild(h("sub", { text: "θ0" }));
      }
      if (part) frag.appendChild(doc.createTextNode(part));
    });
    return frag;
  }

  /* ------------------------------------------------------- data binding */

  var derived = {};

  function computeDerived() {
    var s = D.tldr.success;
    derived.delta_points = s.pacer - s.vanilla_post_sft;
  }

  // "results.methods.clean_only.overall": a segment that is not an array property picks the
  // array item with that id, so bindings name a method instead of its position.
  function resolve(path) {
    var parts = path.split(".");
    var node = D;
    if (parts[0] === "derived") { node = derived; parts.shift(); }
    for (var i = 0; i < parts.length; i++) {
      if (node === null || node === undefined) return undefined;
      var key = parts[i];
      node = Array.isArray(node) && !(key in node)
        ? node.filter(function (x) { return x && x.id === key; })[0]
        : node[key];
    }
    return node;
  }

  var formats = {
    list: function (v) { return v.join(" · "); },
    dp2: function (v) { return Number(v).toFixed(2); }   /* protocol constants as the paper prints them (0.80) */
  };

  function bind(ctx) {
    $$("[data-bind]", ctx).forEach(function (e) {
      var v = resolve(e.getAttribute("data-bind"));
      if (v === undefined || v === null) return;
      var f = formats[e.getAttribute("data-format")];
      e.textContent = f ? f(v) : String(v);
    });
  }

  /* -------------------------------------------------------- link states */

  // A link is live when the data gives it a URL; otherwise it is the "soon" placeholder:
  // visibly disabled, announced as unavailable, with no href (so it is never a dead link).
  // The hero buttons and the top bar both go through here, so they cannot disagree.
  // Idempotent: the top bar ships as static markup, in the placeholder state for Paper.
  function setLink(a, href, name, soonClass) {
    var tag = $("." + soonClass, a);
    if (href) {
      a.setAttribute("href", href);
      if (/^https?:/.test(href)) a.setAttribute("rel", "noopener");
      ["role", "aria-disabled", "aria-label"].forEach(function (k) { a.removeAttribute(k); });
      if (tag) tag.remove();
      return;
    }
    a.removeAttribute("href");
    a.setAttribute("role", "link");
    a.setAttribute("aria-disabled", "true");
    a.setAttribute("aria-label", name + ", coming soon");
    if (!tag) a.appendChild(h("span", { class: soonClass, text: "soon" }));
  }

  /* --------------------------------------------------------------- hero */

  function renderMasthead() {
    var site = D.site;

    var title = $("[data-render='title']");
    var cut = site.title.indexOf(":");
    var short = cut > 0 ? site.title.slice(0, cut) : site.short;
    var sub = cut > 0 ? site.title.slice(cut + 1).trim() : site.title;
    title.appendChild(h("span", { class: "hero__short", text: short }));
    title.appendChild(h("span", { class: "visually-hidden", text: ": " }));
    title.appendChild(h("span", { class: "hero__sub", text: sub }));

    var authors = $("[data-render='authors']");
    site.authors.forEach(function (a) {
      var name = a.url ? h("a", { href: a.url, rel: "noopener", text: a.name }) : doc.createTextNode(a.name);
      authors.appendChild(h("span", { class: "author" }, [name, h("sup", { text: a.affil.join(",") })]));
    });

    // Full names; phones show the short forms on one line (CSS swaps them).
    var affils = $("[data-render='affiliations']");
    var shortNames = site.affiliations_short || [];
    site.affiliations.forEach(function (name, i) {
      affils.appendChild(h("span", { class: "affil" }, [
        h("sup", { text: String(i + 1) }),
        h("span", { class: "affil__full", text: name }),
        h("span", { class: "affil__short", text: shortNames[i] || name })
      ]));
    });

    var L = site.links;
    var buttons = [
      { key: "paper", text: "Paper", icon: "i-paper", href: L.paper },
      { key: "arxiv", text: "arXiv", icon: "i-arxiv", href: L.arxiv },
      // One source for the citation: the button is live exactly when site.bibtex is set.
      { key: "bibtex", text: "BibTeX", icon: "i-quote", href: site.bibtex ? "#bibtex" : null },
      { key: "code", text: "Code", icon: "i-github", href: L.code, primary: true },
      { key: "video", text: "Video", icon: "i-play", href: "#video" }
    ];
    var row = $("[data-render='links']");
    buttons.forEach(function (b) {
      var a = h("a", { class: "btn" + (b.primary ? " btn--primary" : ""), "data-link": b.key },
        [icon(b.icon), h("span", { text: b.text })]);
      setLink(a, b.href, b.text, "btn__soon");   // no URL yet (Paper, arXiv, BibTeX): the "soon" placeholder
      row.appendChild(a);
    });

    $$("[data-link='repo'], [data-link='footer-code']").forEach(function (a) {
      if (L.code) { a.setAttribute("href", L.code); a.setAttribute("rel", "noopener"); }
    });
  }

  function renderHeroVideo() {
    var v = D.videos.hero;
    var frame = $("[data-render='hero-video']");
    var toggle = $(".hero__toggle", frame);
    var video = h("video", {
      class: "hero__video", poster: v.poster, preload: reduceMotion ? "metadata" : "auto",
      autoplay: !reduceMotion, muted: true, loop: true, playsinline: true,
      "aria-label": "Muted loop: the UR5e robot at work on a desktop motherboard"
    });
    video.muted = true;
    video.defaultMuted = true;
    video.playsInline = true;
    video.setAttribute("src", v.src);
    frame.insertBefore(video, toggle);
    // Placeholder footage is labelled as such and never wears the teal "success" chip.
    frame.insertBefore(h("div", { class: "hero__chips" }, [
      v.placeholder
        ? h("span", { class: "chip chip--preview", text: "Preview footage" })
        : h("span", { class: "chip chip--success", text: v.chip }),
      h("span", { class: "chip chip--speed", text: v.speed, "aria-label": "Playback speed " + v.speed })
    ]), toggle);

    var userPaused = reduceMotion;
    function sync(paused) {
      toggle.classList.toggle("is-paused", paused);
      toggle.setAttribute("aria-label", paused ? "Play video" : "Pause video");
    }
    sync(reduceMotion);
    video.addEventListener("play", function () { sync(false); });
    video.addEventListener("pause", function () { sync(true); });
    toggle.addEventListener("click", function () {
      if (video.paused) { userPaused = false; play(video); }
      else { userPaused = true; video.pause(); }
    });
    // Pause while scrolled away; resume on return unless the viewer paused it.
    if (hasIO && !reduceMotion) {
      new IntersectionObserver(function (entries) {
        entries.forEach(function (e) {
          if (e.isIntersecting) { if (!userPaused && video.paused) play(video); }
          else if (!video.paused) video.pause();
        });
      }).observe(video);
    }
  }

  /* ---------------------------------------------------- motivation video */

  function renderMotivation() {
    var m = D.videos.motivation;
    var fig = $("[data-render='motivation']");
    var btn = $(".player__play", fig);
    var video = h("video", {
      preload: "none", playsinline: true, poster: m.poster,
      "data-src": m.src, "data-src-small": m.src720,
      "aria-label": "Narrated motivation video"
    });
    // Ruling R12: Chromium blocks <track> files under file://, so the caption
    // text inlined by build_data.py is attached as a Blob URL.
    var trackSrc = null;
    if (m.vtt_text && window.Blob && window.URL && URL.createObjectURL) {
      trackSrc = URL.createObjectURL(new Blob([m.vtt_text], { type: "text/vtt" }));
    } else if (m.vtt) {
      trackSrc = m.vtt;
    }
    // Ruling R45: iPhone WebKit rejects the source (MEDIA_ERR_SRC_NOT_SUPPORTED) when a
    // <track> is already present as loading starts, so the captions are attached only
    // once the metadata has loaded, and switched on explicitly.
    function attachCaptions() {
      if (!trackSrc || video.querySelector("track")) return;
      var t = h("track", { kind: "captions", srclang: "en", label: "English", default: true, src: trackSrc });
      video.appendChild(t);
      if (t.track) t.track.mode = "showing";
    }
    video.addEventListener("loadedmetadata", attachCaptions);
    var frame = h("div", { class: "player__frame" }, [video, btn]);
    fig.insertBefore(frame, fig.firstChild);

    btn.addEventListener("click", function () {
      loadVideo(video);
      video.controls = true;
      fig.classList.add("is-started");
      play(video);
      video.focus();
    });
  }

  /* -------------------------------------------------------- lazy videos */

  function loadVideo(v) {
    if (v.getAttribute("src")) return;
    var small = v.getAttribute("data-src-small");
    var src = small && window.innerWidth < 900 ? small : v.getAttribute("data-src");
    if (src) v.setAttribute("src", src);
  }

  var loadIO = null, playIO = null;

  function lazyVideos(ctx) {
    var vids = $$("video[data-src]", ctx || doc).filter(function (v) { return !v.__pacerLazy; });
    if (!hasIO) { vids.forEach(loadVideo); return; }
    if (!loadIO) {
      // Attach the source shortly before a video scrolls into view (preload="none" until then).
      loadIO = new IntersectionObserver(function (entries) {
        entries.forEach(function (e) {
          if (e.isIntersecting) { loadVideo(e.target); loadIO.unobserve(e.target); }
        });
      }, { rootMargin: "200px 0px" });
      // Muted loops play only while visible.
      playIO = new IntersectionObserver(function (entries) {
        entries.forEach(function (e) {
          var v = e.target;
          if (e.isIntersecting) { loadVideo(v); if (!reduceMotion) play(v); }
          else if (!v.paused) v.pause();
        });
      }, { threshold: 0.25 });
    }
    vids.forEach(function (v) {
      v.__pacerLazy = true;
      loadIO.observe(v);
      if (v.hasAttribute("data-autoplay")) playIO.observe(v);
    });
  }

  /* ------------------------------------------------------- demo gallery */

  // A filled slot: a muted loop (lazy, plays while visible) with its speed chip.
  function renderSlot(s) {
    var portrait = s.aspect === "9:16";
    var fig = h("figure", { class: "slot" + (portrait ? " slot--portrait" : ""), "data-label": s.label });
    var media = h("div", { class: "slot__media" });
    var v = h("video", {
      muted: true, loop: true, playsinline: true, preload: "none",
      "data-src": s.src, "data-autoplay": true, poster: s.poster, "aria-label": s.label
    });
    v.muted = true;
    v.defaultMuted = true;
    if (reduceMotion) v.controls = true;
    media.appendChild(v);
    if (s.speed) media.appendChild(h("span", { class: "chip chip--speed", text: s.speed, "aria-label": "Playback speed " + s.speed }));
    var cap = h("figcaption", { class: "slot__label" });
    cap.appendChild(label(s.label));
    fig.appendChild(media);
    fig.appendChild(cap);
    return fig;
  }

  function renderDemos(container, demos) {
    container.textContent = "";
    demos.forEach(function (g) {
      // One malformed group is reported and skipped; it never takes the gallery down.
      safely("renderDemos: demo group '" + (g && g.group) + "'", function () { renderGroup(container, g); });
    });
    lazyVideos(container);
    observeReveal(container);
  }

  // Only slots that have a clip (src set) are shown, and a group with none is skipped. The
  // empty slots stay in the data, so a clip appears here as soon as its src is filled in.
  // Built off-document and appended only when complete, so a bad group leaves no half-drawn block.
  function renderGroup(container, g) {
    if (!g || !Array.isArray(g.slots) || !g.slots.length) throw new Error("needs a non-empty slots list");
    var filled = g.slots.filter(function (s) { return s && s.src; });
    var n = filled.length;
    if (!n) return;
    var portrait = n === 1 && filled[0].aspect === "9:16";
    var cls = "demo-group" +
      (n === 1 ? " demo-group--feature" : "") +
      (portrait ? " has-portrait" : "") +
      (n > 6 ? " demo-group--wide" : "");
    var group = h("section", { class: cls + " reveal", "data-group": g.group, "aria-labelledby": "demo-" + g.group });
    group.appendChild(h("div", { class: "demo-group__head" }, [
      h("p", { class: "demo-group__kicker", text: n + (n === 1 ? " clip" : " clips") }),
      h("div", { class: "demo-group__text" }, [
        h("h3", { class: "demo-group__title", id: "demo-" + g.group, text: g.title }),
        h("p", { class: "demo-group__note", text: g.note })
      ])
    ]));
    var grid = h("div", { class: "demo-grid" });
    filled.forEach(function (s) { grid.appendChild(renderSlot(s)); });
    group.appendChild(grid);
    container.appendChild(group);
  }

  /* ------------------------------------------------------------- BibTeX */

  function renderBibtex() {
    var box = $("[data-render='bibtex']");
    var code = $("#bibtex-text");
    if (D.site.bibtex) {
      code.textContent = D.site.bibtex;
      return;
    }
    code.appendChild(h("span", {
      class: "is-placeholder",
      text: "BibTeX coming soon — it will be posted with the camera-ready paper."
    }));
    $("[data-copy]", box).setAttribute("aria-disabled", "true");
  }

  /* ------------------------------------------------------- copy buttons */

  function legacyCopy(text) {
    return new Promise(function (resolve, reject) {
      var ta = h("textarea", { readonly: true, "aria-hidden": "true" });
      ta.value = text;
      ta.style.cssText = "position:fixed;top:0;left:0;opacity:0;pointer-events:none";
      doc.body.appendChild(ta);
      ta.select();
      var ok = false;
      try { ok = doc.execCommand("copy"); } catch (err) { ok = false; }
      doc.body.removeChild(ta);
      if (ok) resolve(); else reject(new Error("copy failed"));
    });
  }

  function copyText(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text).catch(function () { return legacyCopy(text); });
    }
    return legacyCopy(text);
  }

  function copyButtons(ctx) {
    $$("[data-copy]", ctx || doc).forEach(function (btn) {
      if (btn.__pacerCopy) return;
      btn.__pacerCopy = true;
      var lab = $(".copy__label", btn) || btn;
      var use = $("use", btn);
      var original = lab.textContent;
      lab.setAttribute("aria-live", "polite");
      function flash(msg, ok) {
        lab.textContent = msg;
        btn.classList.toggle("is-done", ok);
        if (use && ok) use.setAttribute("href", "#i-check");
        clearTimeout(btn.__pacerTimer);
        btn.__pacerTimer = setTimeout(function () {
          lab.textContent = original;
          btn.classList.remove("is-done");
          if (use) use.setAttribute("href", "#i-copy");
        }, 1800);
      }
      btn.addEventListener("click", function () {
        if (btn.getAttribute("aria-disabled") === "true") return;
        var target = doc.getElementById(btn.getAttribute("data-copy"));
        if (!target) return;
        copyText(target.textContent.replace(/\s+$/, "")).then(
          function () { flash("Copied", true); },
          function () { flash("Select and copy", false); }
        );
      });
    });
  }

  /* ---------------------------------------------------------------- nav */

  // The top bar is static markup (visible from the first paint, nothing to show or hide on scroll).
  // Here it only takes its two data-driven items from the same links the hero buttons use:
  // Paper is a link once site.links.paper is set, and Code opens the repository in a new tab.
  function renderNav() {
    var L = D.site.links;
    var paper = $("#topnav [data-nav='paper']");
    var code = $("#topnav [data-nav='code']");
    setLink(paper, L.paper, "Paper", "topnav__soon");
    setLink(code, L.code, "Code", "topnav__soon");
    // Without JS (or without a repository URL) Code is the in-page #code link: the
    // external-link mark and "(opens in a new tab)" show only once it really opens one.
    if (L.code) {
      code.setAttribute("target", "_blank");
      code.classList.add("is-external");
    }
  }

  /* ------------------------------------------------------------- reveal */

  var revealIO = null;

  function observeReveal(ctx) {
    if (!root.classList.contains("js-reveal")) return;
    if (!revealIO) {
      revealIO = new IntersectionObserver(function (entries) {
        entries.forEach(function (e) {
          if (e.isIntersecting) { e.target.classList.add("is-in"); revealIO.unobserve(e.target); }
        });
      }, { rootMargin: "0px 0px -6% 0px", threshold: 0.01 });
    }
    $$(".reveal", ctx || doc).forEach(function (el) {
      if (!el.classList.contains("is-in")) revealIO.observe(el);
    });
  }

  function initReveal() {
    // index.html adds .js-reveal in <head> (to avoid a flash) only when motion is allowed.
    if (reduceMotion || !hasIO) { root.classList.remove("js-reveal"); return; }
    observeReveal(doc);
  }

  /* ------------------------------------------- Fig. 2 and its five steps */

  // The animated figure, its controls, its scroll cue and the step buttons live in
  // fig2.js (window.PACERFig2, loaded before this script).
  function initSteps() {
    if (window.PACERFig2) window.PACERFig2.mount($("#method .fig2"), $$("#method .step"), { reduceMotion: reduceMotion });
  }

  /* -------------------------------------------------------------- KaTeX */

  function renderMath() {
    $$(".eq[data-tex]").forEach(function (el) {
      if (el.__pacerMath === "katex") return;
      var tex = el.getAttribute("data-tex");
      if (window.katex) {
        el.textContent = "";
        el.classList.remove("eq--fallback");
        window.katex.render(tex, el, { displayMode: true, throwOnError: false });
        el.__pacerMath = "katex";
      } else if (!el.__pacerMath) {
        el.textContent = tex;               // CDN unreachable: show the TeX source
        el.classList.add("eq--fallback");
        el.__pacerMath = "fallback";
      }
    });
  }

  function initMath() {
    if (window.katex) { renderMath(); return; }
    var s = doc.getElementById("katex-js");
    if (s) {
      s.addEventListener("load", renderMath);
      s.addEventListener("error", renderMath);
    }
    $$("details.math").forEach(function (d) {
      d.addEventListener("toggle", function () { if (d.open) renderMath(); });
    });
  }

  /* --------------------------------------------------------------- init */

  window.PACERUI = {
    lazyVideos: lazyVideos,
    copyButtons: copyButtons,
    renderDemos: renderDemos,
    bind: bind,
    renderMath: renderMath,
    observeReveal: observeReveal,
    reduceMotion: reduceMotion
  };

  // Each step is isolated (as in charts.js): one failure is logged, the rest still runs.
  function safely(name, fn) {
    try { fn(); } catch (err) {
      if (window.console) window.console.error("PACERUI." + name + " failed:", err);
    }
  }

  function init() {
    // Reveal first: whatever fails below, nothing stays hidden at opacity 0.
    safely("initReveal", initReveal);
    if (!D) { root.classList.remove("js-reveal"); return; }
    safely("computeDerived", computeDerived);
    safely("renderMasthead", renderMasthead);
    safely("renderHeroVideo", renderHeroVideo);
    safely("renderMotivation", renderMotivation);
    safely("renderDemos", function () { renderDemos($("[data-render='demos']"), D.demos || []); });
    safely("renderBibtex", renderBibtex);
    safely("bind", function () { bind(doc); });
    safely("copyButtons", function () { copyButtons(doc); });
    safely("lazyVideos", function () { lazyVideos(doc); });
    safely("renderNav", renderNav);
    safely("initSteps", initSteps);
    safely("initMath", initMath);
    root.setAttribute("data-ready", "1");
  }

  if (doc.readyState === "loading") doc.addEventListener("DOMContentLoaded", init);
  else init();
})();
