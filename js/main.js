/* VD·OS - interface runtime */
(function () {
  "use strict";

  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
  const root = document.documentElement;
  const I = window.I18N;
  const PI = window.PixelIcons;
  const mqFine = matchMedia("(pointer: fine)");
  const mqReduce = matchMedia("(prefers-reduced-motion: reduce)");

  /* if anything below throws, never leave windows invisible */
  window.addEventListener("error", () => $$(".win[data-reveal]").forEach((w) => w.classList.add("is-open")));

  /* ---------- storage ---------- */
  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* private mode */ } },
    sget(k) { try { return sessionStorage.getItem(k); } catch (e) { return null; } },
    sset(k, v) { try { sessionStorage.setItem(k, v); } catch (e) { /* private mode */ } },
  };

  const saved = store.get("vdos-prefs", {}) || {};
  const prefs = {
    theme: root.dataset.theme === "dark" ? "dark" : "light",
    themeSet: !!saved.theme,
    lang: saved.lang || ((navigator.language || "ru").toLowerCase().indexOf("ru") === 0 ? "ru" : "en"),
    crt: !!saved.crt,
    sound: !!saved.sound,
    motion: saved.motion != null ? !!saved.motion : !mqReduce.matches,
  };
  function savePrefs() {
    store.set("vdos-prefs", {
      theme: prefs.themeSet ? prefs.theme : undefined,
      lang: prefs.lang, crt: prefs.crt, sound: prefs.sound, motion: prefs.motion,
    });
  }

  const D = () => I.DYN[prefs.lang];
  const fmt = (s, v) => String(s).replace(/\{(\w+)\}/g, (_, k) => (v && v[k] != null ? v[k] : ""));
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const pad = (n) => String(n).padStart(2, "0");
  const motion = () => prefs.motion;

  /* ---------- sound ---------- */
  let actx = null;
  function blip(freq, dur, type, vol) {
    if (!prefs.sound) return;
    try {
      actx = actx || new (window.AudioContext || window.webkitAudioContext)();
      const o = actx.createOscillator(), g = actx.createGain(), t = actx.currentTime;
      o.type = type || "square";
      o.frequency.value = freq || 880;
      g.gain.setValueAtTime(vol || 0.035, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + (dur || 0.035));
      o.connect(g).connect(actx.destination);
      o.start(t); o.stop(t + (dur || 0.035) + 0.02);
    } catch (e) { /* audio unavailable */ }
  }
  document.addEventListener("pointerdown", (e) => {
    if (e.target.closest(".key")) blip(190, 0.05, "triangle", 0.09);
    else if (e.target.closest("button, a, .dicon")) blip(1240, 0.025, "square", 0.025);
  });

  /* ---------- icons & cursors ---------- */
  PI.hydrate(document);
  function applyCursor() {
    if (mqFine.matches) {
      root.style.setProperty("--cur", PI.cursorURI("arrow") + ", auto");
      root.style.setProperty("--cur-link", PI.cursorURI("hand") + ", pointer");
    } else {
      root.style.removeProperty("--cur");
      root.style.removeProperty("--cur-link");
    }
  }
  applyCursor();

  /* =========================================================
     THEME / LANGUAGE / EFFECTS
     ========================================================= */
  const metaTheme = $('meta[name="theme-color"]');
  function applyTheme(glitch) {
    root.dataset.theme = prefs.theme;
    if (metaTheme) metaTheme.content = prefs.theme === "dark" ? "#161615" : "#D8D5CB";
    if (glitch && motion()) {
      root.classList.remove("glitching"); void root.offsetWidth;
      root.classList.add("glitching");
      setTimeout(() => root.classList.remove("glitching"), 260);
    }
  }
  function setTheme(t, quiet) {
    prefs.theme = t; prefs.themeSet = true; savePrefs(); applyTheme(true);
    if (!quiet) notify("THEME: " + D().themeName[t]);
    syncCfg();
  }

  function applyMotion() { root.classList.toggle("reduce-motion", !prefs.motion); }
  function setMotion(on) { prefs.motion = on; savePrefs(); applyMotion(); if (!on) settleName(); typeLoop(); }
  function applyCrt() { root.classList.toggle("crt-on", prefs.crt); }
  function setCrt(on) { prefs.crt = on; savePrefs(); applyCrt(); syncCfg(); }

  const i18nEls = $$("[data-i18n]");
  i18nEls.forEach((el) => { el._ru = el.innerHTML; });
  const ARIA = [
    [".hero", "aria-label", "Рабочий стол", "Desktop"],
    ["#icons", "aria-label", "Ярлыки", "Shortcuts"],
    [".taskbar", "aria-label", "Панель задач", "Taskbar"],
    ["#stackTabs", "aria-label", "Фильтр", "Filter"],
    ["#reposReload", "aria-label", "Обновить", "Refresh"],
  ];
  function applyLang() {
    root.lang = prefs.lang;
    const en = I.STATIC.en;
    i18nEls.forEach((el) => {
      const v = prefs.lang === "en" ? en[el.dataset.i18n] : el._ru;
      if (v != null && el.innerHTML !== v) el.innerHTML = v;
    });
    ARIA.forEach(([sel, attr, ru, enV]) => { const el = $(sel); if (el) el.setAttribute(attr, prefs.lang === "en" ? enV : ru); });
    $("#langBtn").textContent = prefs.lang.toUpperCase();
    $("#langBtn").setAttribute("aria-label", prefs.lang === "en" ? "Language: English" : "Язык: русский");
    $("#themeBtn").setAttribute("aria-label", D().themeAria);
    labelControls();
    updateAboutChars();
    updateStackStatus();
    if (lastKey) $("#stackHint").textContent = "> " + D().keys[lastKey];
    renderRepos();
    ghosts.forEach((g) => renderGhost(g));
    tick(true);
  }
  function setLang(l) { prefs.lang = l; savePrefs(); applyLang(); typeLoop(); syncCfg(); }

  /* =========================================================
     WINDOW MANAGER
     ========================================================= */
  const allWins = $$(".win[data-task], .win--side");
  const taskWins = $$(".win[data-task]");
  const ghosts = new Set();
  let zTop = 10;

  allWins.forEach((w) => {
    const bar = $(".win__bar", w);
    if (!bar || $(".win__ctrl", bar)) return;
    const c = document.createElement("span");
    c.className = "win__ctrl";
    c.innerHTML = ["min", "max", "close"].map((a) =>
      `<button class="wbtn" type="button" data-win="${a}"><span data-icon="ctl-${a}" data-size="8"></span></button>`).join("");
    bar.appendChild(c);
    PI.hydrate(c);
  });

  function labelControls() {
    const L = D().ctl;
    $$(".wbtn[data-win]").forEach((b) => {
      const w = b.closest(".win");
      let k = b.dataset.win;
      if (k === "max" && w && w.classList.contains("is-max")) k = "restore";
      b.setAttribute("aria-label", L[k]); b.title = L[k];
    });
    $$(".wbtn[data-close], #toastClose").forEach((b) => { b.setAttribute("aria-label", L.close); b.title = L.close; });
  }

  function focusWin(w, raise) {
    if (!w) return;
    allWins.forEach((x) => x !== w && x.classList.remove("is-active"));
    w.classList.add("is-active");
    if (raise && w.closest(".hero")) w.style.zIndex = ++zTop;
    syncTasks();
  }

  function toggleMin(w, force) {
    const on = force != null ? force : !w.classList.contains("is-min");
    if (on && w.classList.contains("is-max")) toggleMax(w, false);
    w.classList.toggle("is-min", on);
    syncTasks();
  }

  function toggleMax(w, force) {
    const on = force != null ? force : !w.classList.contains("is-max");
    if (on === w.classList.contains("is-max")) return;
    if (on) {
      w.classList.remove("is-min");
      const ph = document.createElement("div");
      ph.className = "win-ph";
      ph.style.height = w.offsetHeight + "px";
      ph.style.gridArea = getComputedStyle(w).gridArea;
      w.before(ph); w._ph = ph;
      w.classList.add("is-max");
      document.body.style.overflow = "hidden";
      focusWin(w, true);
    } else {
      w.classList.remove("is-max");
      if (w._ph) { w._ph.remove(); w._ph = null; }
      if (!$(".win.is-max")) document.body.style.overflow = "";
    }
    const mb = $('.wbtn[data-win="max"]', w);
    if (mb) { mb.innerHTML = `<span data-icon="ctl-${on ? "restore" : "max"}" data-size="8"></span>`; PI.hydrate(mb); }
    labelControls();
    syncTasks();
  }

  function renderGhost(g) {
    const w = g._win;
    const name = w.dataset.task || $(".win__name", w).textContent;
    g.innerHTML = `<span>[×] ${esc(fmt(D().ghost, { name }))}</span><button class="btn btn--sm" type="button">${esc(D().reopen)}</button>`;
    $("button", g).addEventListener("click", () => openWin(w, false));
  }

  function closeWin(w) {
    if (w.classList.contains("is-max")) toggleMax(w, false);
    w.classList.add("is-closed");
    w.classList.remove("is-active");
    const g = document.createElement("div");
    g.className = "ghost";
    g.style.gridArea = getComputedStyle(w).gridArea;
    g._win = w; w._ghost = g;
    renderGhost(g);
    w.after(g); ghosts.add(g);
    syncTasks();
  }

  function openWin(w, scroll) {
    if (!w) return;
    if (w._ghost) { ghosts.delete(w._ghost); w._ghost.remove(); w._ghost = null; }
    const wasClosed = w.classList.contains("is-closed");
    w.classList.remove("is-closed", "is-min");
    if (wasClosed) { w.classList.remove("is-open"); launch(w, 0); }
    if (scroll) {
      const target = w.closest(".section") || w;
      target.scrollIntoView({ behavior: motion() ? "smooth" : "auto", block: "start" });
    }
    focusWin(w);
  }

  document.addEventListener("click", (e) => {
    const b = e.target.closest(".wbtn[data-win]");
    if (!b) return;
    const w = b.closest(".win");
    const a = b.dataset.win;
    if (a === "min") toggleMin(w);
    else if (a === "max") toggleMax(w);
    else if (a === "close") closeWin(w);
  });
  document.addEventListener("pointerdown", (e) => {
    const w = e.target.closest(".win");
    if (w && allWins.includes(w) && !e.target.closest(".wbtn")) focusWin(w, true);
  });
  taskWins.forEach((w) => {
    $(".win__bar", w).addEventListener("dblclick", (e) => {
      if (e.target.closest(".wbtn") || w.hasAttribute("data-drag")) return;
      toggleMax(w);
    });
  });

  /* ---------- launch animation ---------- */
  function launch(w, delay) {
    if (!w) return;
    if (!motion()) { w.classList.add("is-open"); w.dispatchEvent(new CustomEvent("vd:open")); return; }
    setTimeout(() => {
      w.classList.remove("is-open");
      w.classList.add("is-launching");
      setTimeout(() => {
        w.classList.remove("is-launching");
        void w.offsetWidth;
        w.classList.add("is-open");
        w.dispatchEvent(new CustomEvent("vd:open"));
      }, 200);
    }, delay || 0);
  }

  const revealIO = "IntersectionObserver" in window ? new IntersectionObserver((entries) => {
    let i = 0;
    entries.forEach((en) => {
      if (!en.isIntersecting) return;
      revealIO.unobserve(en.target);
      launch(en.target, i++ * 110);
    });
  }, { rootMargin: "0px 0px -10% 0px", threshold: 0.04 }) : null;

  /* ---------- taskbar ---------- */
  const tasksEl = $("#tasks");
  taskWins.forEach((w) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "task";
    const ico = ($(".win__ico", w) || {}).dataset ? $(".win__ico", w).dataset.icon : "txt";
    b.innerHTML = `<span data-icon="${ico}" data-size="16"></span><span>${esc(w.dataset.task)}</span>`;
    b.title = w.dataset.task;
    b.setAttribute("aria-label", w.dataset.task);
    b.addEventListener("click", () => {
      const r = w.getBoundingClientRect();
      const visible = r.bottom > 80 && r.top < innerHeight - 80;
      if (w.classList.contains("is-active") && !w.classList.contains("is-min") && visible) { toggleMin(w, true); return; }
      openWin(w, !visible || w.classList.contains("is-min"));
    });
    w._task = b;
    tasksEl.appendChild(b);
  });
  PI.hydrate(tasksEl);
  function syncTasks() {
    taskWins.forEach((w) => {
      const b = w._task;
      b.classList.toggle("is-active", w.classList.contains("is-active"));
      b.classList.toggle("is-min", w.classList.contains("is-min"));
      b.classList.toggle("is-closed", w.classList.contains("is-closed"));
      b.setAttribute("aria-pressed", w.classList.contains("is-active") ? "true" : "false");
    });
  }

  /* scroll-spy: the window crossing the middle of the screen is the active one */
  if ("IntersectionObserver" in window) {
    const spy = new IntersectionObserver((entries) => {
      if ($("dialog[open]") || $(".win.is-max")) return;
      entries.forEach((en) => { if (en.isIntersecting) focusWin(en.target); });
    }, { rootMargin: "-42% 0px -52% 0px" });
    taskWins.forEach((w) => spy.observe(w));
  }

  /* ---------- dragging (hero windows + dialogs) ---------- */
  const canDrag = () => mqFine.matches && innerWidth >= 900;
  function makeDraggable(w) {
    const bar = $(".win__bar", w);
    let st = null;
    bar.addEventListener("pointerdown", (e) => {
      if (!canDrag() || e.button !== 0 || e.target.closest(".wbtn") || w.classList.contains("is-max")) return;
      const r = w.getBoundingClientRect();
      st = { x: e.clientX, y: e.clientY, ox: w._dx || 0, oy: w._dy || 0, r };
      bar.setPointerCapture(e.pointerId);
      w.classList.add("is-dragging");
      e.preventDefault();
    });
    bar.addEventListener("pointermove", (e) => {
      if (!st) return;
      moveTo(w, st, st.r.left + e.clientX - st.x, st.r.top + e.clientY - st.y);
    });
    const end = () => { st = null; w.classList.remove("is-dragging"); };
    bar.addEventListener("pointerup", end);
    bar.addEventListener("pointercancel", end);
    if (w.hasAttribute("data-drag")) {
      bar.addEventListener("dblclick", (e) => { if (!e.target.closest(".wbtn")) resetPos(w); });
    }
  }
  /* the whole screen is the desktop: a window may go anywhere, but always stays fully
     visible sideways and keeps its title bar above the taskbar */
  function moveTo(w, st, left, top) {
    const tb = parseFloat(getComputedStyle(root).getPropertyValue("--tb-h")) || 52;
    const vw = document.documentElement.clientWidth;
    const pad = 10; /* room for the hard shadow */
    left = Math.min(Math.max(left, 4), Math.max(4, vw - st.r.width - pad));
    top = Math.min(Math.max(top, 4), innerHeight - tb - 44);
    w._dx = st.ox + left - st.r.left;
    w._dy = st.oy + top - st.r.top;
    w.style.transform = `translate(${Math.round(w._dx)}px, ${Math.round(w._dy)}px)`;
  }
  function resetPos(w) { w._dx = w._dy = 0; w.style.transform = ""; }
  $$(".win[data-drag], dialog.win").forEach(makeDraggable);
  addEventListener("resize", () => {
    $$(".win[data-drag]").forEach((w) => {
      if (!canDrag()) { resetPos(w); return; }
      if (!w._dx && !w._dy) return;
      const r = w.getBoundingClientRect();
      moveTo(w, { r, ox: w._dx, oy: w._dy }, r.left, r.top);
    });
  });

  /* =========================================================
     DESKTOP ICONS / START MENU / ACTIONS
     ========================================================= */
  function runAction(a) {
    if (a === "terminal") openTerm();
    else if (a === "settings") openSettings();
    else if (a === "trash") openDialog($("#msgbox"));
    else if (a === "shutdown") shutdown();
  }
  function activateIcon(ic) {
    ic.classList.remove("is-selected");
    if (ic.dataset.open) openWin($(ic.dataset.open), true);
    else if (ic.dataset.action) runAction(ic.dataset.action);
  }
  $$(".dicon").forEach((ic) => {
    ic.addEventListener("click", (e) => {
      /* keyboard, touch, or a second click on a selected icon opens it */
      if (e.detail === 0 || !mqFine.matches || ic.classList.contains("is-selected")) { activateIcon(ic); return; }
      $$(".dicon.is-selected").forEach((x) => x.classList.remove("is-selected"));
      ic.classList.add("is-selected");
    });
    ic.addEventListener("dblclick", () => activateIcon(ic));
  });
  document.addEventListener("pointerdown", (e) => {
    if (!e.target.closest(".dicon")) $$(".dicon.is-selected").forEach((x) => x.classList.remove("is-selected"));
  });
  $$("[data-action]").forEach((el) => {
    if (el.classList.contains("dicon") || el.closest("#startMenu")) return;
    el.addEventListener("click", () => runAction(el.dataset.action));
  });

  const startBtn = $("#startBtn"), startMenu = $("#startMenu");
  function toggleStart(open) {
    const on = open != null ? open : startMenu.hidden;
    startMenu.hidden = !on;
    startBtn.setAttribute("aria-expanded", on ? "true" : "false");
    if (on) { const f = $(".sm-item", startMenu); if (f) f.focus({ preventScroll: true }); }
  }
  startBtn.addEventListener("click", () => toggleStart());
  document.addEventListener("pointerdown", (e) => {
    if (!startMenu.hidden && !startMenu.contains(e.target) && !startBtn.contains(e.target)) toggleStart(false);
  });
  startMenu.addEventListener("click", (e) => {
    const it = e.target.closest(".sm-item");
    if (!it) return;
    toggleStart(false);
    const href = it.getAttribute("href") || "";
    if (it.dataset.action) runAction(it.dataset.action);
    else if (href.charAt(0) === "#") { e.preventDefault(); openWin($(href), true); }
  });
  startMenu.addEventListener("keydown", (e) => {
    const items = $$(".sm-item", startMenu);
    const i = items.indexOf(document.activeElement);
    if (e.key === "ArrowDown") { e.preventDefault(); items[(i + 1) % items.length].focus(); }
    else if (e.key === "ArrowUp") { e.preventDefault(); items[(i - 1 + items.length) % items.length].focus(); }
    else if (e.key === "Escape") { toggleStart(false); startBtn.focus(); }
  });

  $("#langBtn").addEventListener("click", () => setLang(prefs.lang === "ru" ? "en" : "ru"));
  $("#themeBtn").addEventListener("click", () => setTheme(prefs.theme === "dark" ? "light" : "dark"));

  /* ---------- dialogs ---------- */
  function openDialog(d) {
    toggleStart(false);
    if (d.open) return;
    if (typeof d.showModal === "function") d.showModal(); else d.setAttribute("open", "");
  }
  $$("dialog").forEach((d) => {
    d.addEventListener("click", (e) => { if (e.target === d) d.close(); });
    $$("[data-close]", d).forEach((b) => b.addEventListener("click", () => d.close()));
    d.addEventListener("close", () => resetPos(d));
  });

  /* ---------- notify ---------- */
  let notifyT = 0;
  function notify(msg) {
    const n = $("#notify");
    n.textContent = msg;
    n.classList.remove("is-on"); void n.offsetWidth; n.classList.add("is-on");
    clearTimeout(notifyT);
    notifyT = setTimeout(() => n.classList.remove("is-on"), 2200);
  }

  /* ---------- keyboard ---------- */
  document.addEventListener("keydown", (e) => {
    const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName);
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") { e.preventDefault(); openTerm(); return; }
    if (!typing && e.key === "`") { e.preventDefault(); openTerm(); return; }
    if (e.key === "Escape") {
      if (!startMenu.hidden) { toggleStart(false); startBtn.focus(); return; }
      const m = $(".win.is-max");
      if (m && !$("dialog[open]")) toggleMax(m, false);
    }
  });

  /* =========================================================
     HERO
     ========================================================= */
  const nameEl = $("#heroName");
  const nameLines = $$(".hello__line", nameEl);
  const chars = [];
  nameLines.forEach((line) => {
    Array.from(line.childNodes).forEach((n) => {
      if (n.nodeType !== 3) return;
      const frag = document.createDocumentFragment();
      Array.from(n.nodeValue.trim()).forEach((c) => {
        const s = document.createElement("span");
        s.className = "ch"; s.textContent = c;
        frag.appendChild(s); chars.push(s);
      });
      n.replaceWith(frag);
    });
  });
  const line1 = $$(".ch", nameLines[0]);
  const base = () => (innerWidth < 640 ? { w: 100, g: 850 } : { w: 125, g: 850 });
  const state = chars.map(() => ({ w: 125, g: 850 }));

  function setChar(c, s) {
    c.style.fontStretch = s.w + "%";
    c.style.fontWeight = s.g;
  }
  function settleName() {
    const b = base();
    chars.forEach((c, i) => { state[i].w = b.w; state[i].g = b.g; setChar(c, b); });
  }
  let fs = 100;
  function fitName() {
    settleName();
    nameEl.style.fontSize = "100px";
    const avail = nameEl.clientWidth;
    /* widest of: line 1, line 2 including its block cursor */
    const left = line1[0].getBoundingClientRect().left;
    const cur = $(".blockcursor", nameEl);
    const w = Math.max(
      line1[line1.length - 1].getBoundingClientRect().right - left,
      (cur ? cur.getBoundingClientRect().right : 0) - left
    );
    if (!w || !avail) return;
    fs = Math.max(30, Math.min(250, (100 * avail) / w * 0.985));
    nameEl.style.fontSize = fs.toFixed(1) + "px";
    cacheCenters();
  }
  function cacheCenters() {
    chars.forEach((c) => {
      const r = c.getBoundingClientRect();
      c._cx = r.left + r.width / 2 + scrollX;
      c._cy = r.top + r.height / 2 + scrollY;
    });
  }
  if ("ResizeObserver" in window) {
    let lastW = 0;
    new ResizeObserver(() => {
      const w = nameEl.clientWidth;
      if (Math.abs(w - lastW) > 1) { lastW = w; fitName(); }
    }).observe(nameEl);
  } else addEventListener("resize", fitName);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(fitName);

  /* letters squash under the pointer - variable-width type as an interface */
  let pX = 0, pY = 0, near = false, raf = 0;
  const helloBody = $("#hello .hello");
  helloBody.addEventListener("pointermove", (e) => {
    if (!mqFine.matches || !motion() || nameEl.classList.contains("is-intro")) return;
    pX = e.clientX + scrollX; pY = e.clientY + scrollY; near = true;
    if (!raf) raf = requestAnimationFrame(frame);
  });
  helloBody.addEventListener("pointerleave", () => { near = false; if (!raf) raf = requestAnimationFrame(frame); });
  function frame() {
    raf = 0;
    const b = base(), R = fs * 2.1;
    let moving = false;
    chars.forEach((c, i) => {
      let tw = b.w, tg = b.g;
      if (near) {
        const d = Math.hypot(pX - c._cx, (pY - c._cy) * 1.3);
        const t = Math.max(0, 1 - d / R);
        const k = t * t * (3 - 2 * t);
        tw = b.w - k * (b.w - 62);
        tg = b.g - k * (b.g - 260);
      }
      const s = state[i];
      s.w += (tw - s.w) * 0.24; s.g += (tg - s.g) * 0.24;
      if (Math.abs(tw - s.w) > 0.4 || Math.abs(tg - s.g) > 2) moving = true; else { s.w = tw; s.g = tg; }
      /* quantised: the type moves in small hard steps, like an old renderer */
      setChar(c, { w: Math.round(s.w / 3) * 3, g: Math.round(s.g / 25) * 25 });
    });
    if (moving) raf = requestAnimationFrame(frame);
  }
  addEventListener("resize", () => { if (!nameEl.classList.contains("is-intro")) cacheCenters(); });

  function nameIntro() {
    fitName();
    if (!motion()) return;
    nameEl.classList.add("is-intro");
    chars.forEach((c, i) => { c.style.transitionDelay = "0ms"; setChar(c, { w: 62, g: 300 }); });
    void nameEl.offsetWidth;
    const b = base();
    chars.forEach((c, i) => { c.style.transitionDelay = i * 45 + "ms"; setChar(c, b); });
    setTimeout(() => {
      nameEl.classList.remove("is-intro");
      chars.forEach((c) => { c.style.transitionDelay = ""; });
      cacheCenters();
    }, 1500);
  }

  /* typed role */
  const typedEl = $("#typed");
  let typeT = 0, roleI = 0;
  function typeLoop() {
    clearTimeout(typeT);
    const roles = D().roles;
    if (!motion()) { typedEl.textContent = roles[0]; return; }
    let txt = roles[roleI % roles.length], i = 0, del = false;
    typedEl.textContent = "";
    (function step() {
      if (!del) {
        i++; typedEl.textContent = txt.slice(0, i);
        if (i >= txt.length) { del = true; typeT = setTimeout(step, 1900); return; }
        typeT = setTimeout(step, 42 + Math.random() * 60);
      } else {
        i--; typedEl.textContent = txt.slice(0, i);
        if (i <= 0) { roleI++; txt = D().roles[roleI % D().roles.length]; del = false; typeT = setTimeout(step, 340); return; }
        typeT = setTimeout(step, 20);
      }
    })();
  }

  /* status.log */
  const logEl = $("#log"), logCount = $("#logCount");
  const LOG_INIT = [
    ["ok", "boot sequence ....... complete"],
    ["ok", "java.runtime ........ loaded"],
    ["ok", "python.runtime ...... loaded"],
    ["ok", "postgres://main ..... connected"],
    ["ok", "api.gateway ......... listening"],
    ["..", "grabyou.app ......... growing"],
    ["ok", "itmo.edu ............ in progress"],
  ];
  const LOG_LOOP = [
    ["ok", "heartbeat ........... 200 OK"],
    ["ok", "redis.cache ......... warm"],
    ["..", "docker build ........ running"],
    ["ok", "docker build ........ done"],
    ["ok", "unit tests .......... green"],
    ["ok", "ci/cd pipeline ...... passed"],
    ["..", "new idea ............ compiling"],
    ["ok", "git push ............ origin/main"],
    ["ok", "coffee.level ........ sufficient"],
  ];
  let logN = 0, logLoopI = 0, logT = 0;
  function logLine(entry) {
    const d = new Date();
    const li = document.createElement("li");
    li.innerHTML = `<time>${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}</time><span class="tag ${entry[0] === "ok" ? "tag--ok" : "tag--run"}">${entry[0] === "ok" ? "OK" : ".."}</span><span class="log__msg">${esc(entry[1])}</span>`;
    logEl.appendChild(li);
    while (logEl.children.length > 12) logEl.firstElementChild.remove();
    logN++;
    logCount.textContent = logN + " lines";
  }
  function startLog() {
    clearTimeout(logT);
    logEl.innerHTML = ""; logN = 0;
    let i = 0;
    (function boot() {
      if (i < LOG_INIT.length) { logLine(LOG_INIT[i++]); logT = setTimeout(boot, motion() ? 260 : 0); }
      else logT = setTimeout(loop, 2600);
    })();
    function loop() {
      if (!document.hidden) logLine(LOG_LOOP[logLoopI++ % LOG_LOOP.length]);
      logT = setTimeout(loop, 3200);
    }
  }

  /* clock */
  const clockEl = $("#clock"), topDate = $("#topDate"), localTime = $("#localTime");
  let lastMin = -1;
  function tick(force) {
    const d = new Date();
    if (!force && d.getMinutes() === lastMin) return;
    lastMin = d.getMinutes();
    clockEl.innerHTML = `${pad(d.getHours())}<span class="colon">:</span>${pad(d.getMinutes())}`;
    clockEl.setAttribute("datetime", d.toISOString());
    const loc = prefs.lang === "en" ? "en-GB" : "ru-RU";
    const wd = new Intl.DateTimeFormat(loc, { weekday: "short" }).format(d).replace(".", "").toUpperCase();
    topDate.textContent = `${wd} ${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()}`;
    let spb = "";
    try { spb = new Intl.DateTimeFormat("ru-RU", { timeZone: "Europe/Moscow", hour: "2-digit", minute: "2-digit" }).format(d); } catch (e) { spb = ""; }
    localTime.textContent = fmt(D().localTime, { t: spb });
  }
  setInterval(tick, 1000);

  /* =========================================================
     SECTIONS
     ========================================================= */
  /* about */
  function updateAboutChars() {
    const n = $("#aboutText").textContent.replace(/\s+/g, " ").trim().length;
    $("#aboutChars").textContent = fmt(D().chars, { n: n.toLocaleString(prefs.lang === "en" ? "en-GB" : "ru-RU") });
  }

  /* stack */
  const stackBody = $("#stackBody");
  const panels = $$(".panel", stackBody);
  const counts = { all: 0 };
  panels.forEach((p) => {
    const n = $$(".key, .list li, .chip", p).length;
    counts[p.dataset.cat] = n; counts.all += n;
    $(".panel__n", p).textContent = n + " obj";
  });
  $$("[data-count]").forEach((b) => { b.textContent = counts[b.dataset.count]; });
  const tabs = $$("#stackTabs .tab");
  function setFilter(f) {
    stackBody.dataset.filter = f;
    tabs.forEach((t) => {
      const on = t.dataset.filter === f;
      t.classList.toggle("is-on", on);
      t.setAttribute("aria-pressed", on ? "true" : "false");
    });
    let match = null;
    panels.forEach((p) => { const m = p.dataset.cat === f; p.classList.toggle("is-match", m); if (m) match = p; });
    updateStackStatus();
    if (match && innerWidth < 1080) match.scrollIntoView({ behavior: motion() ? "smooth" : "auto", block: "nearest" });
  }
  tabs.forEach((t) => t.addEventListener("click", () => setFilter(t.dataset.filter)));
  function updateStackStatus() {
    const f = stackBody.dataset.filter;
    $("#stackStatus").textContent = f === "all"
      ? fmt(D().stackAll, { n: counts.all, c: panels.length })
      : fmt(D().stackSel, { cat: D().cats[f], n: counts[f] });
  }
  let lastKey = null;
  $$(".key").forEach((k) => {
    k.addEventListener("click", () => {
      lastKey = k.dataset.desc;
      const h = $("#stackHint");
      h.textContent = "> " + D().keys[lastKey];
    });
  });

  /* pipeline + meters fill when their window opens */
  const pipe = $("#pipeBar");
  for (let i = 0; i < 24; i++) pipe.appendChild(document.createElement("i"));
  function fillPipe() {
    const cells = $$("i", pipe);
    cells.forEach((c) => (c.className = ""));
    let i = 0;
    const paint = () => {
      const c = cells[i];
      if (!c) return;
      if (i < 18) c.className = "on";
      else if (i < 21) c.className = "on hot";
      else if (i === 21) { c.className = "blink"; return; }
      i++;
      if (motion()) setTimeout(paint, 40); else paint();
    };
    paint();
  }
  $$(".meter").forEach((m) => { for (let i = 0; i < 6; i++) m.appendChild(document.createElement("i")); });
  function fillMeters() {
    $$(".meter").forEach((m, mi) => {
      const lvl = Number(m.dataset.level);
      $$("i", m).forEach((c, i) => {
        if (i >= lvl) return;
        if (motion()) setTimeout(() => c.classList.add("on"), 200 + mi * 160 + i * 90);
        else c.classList.add("on");
      });
    });
  }
  $("#grabyou").addEventListener("vd:open", fillPipe, { once: true });
  $("#locale").addEventListener("vd:open", fillMeters, { once: true });

  /* projects - the repos pinned on GitHub; descriptions written from their READMEs.
     Dates and the total count refresh from the GitHub API, cached per session. */
  const GH = "https://github.com/VladimirDonskov";
  const PINNED = [
    { name: "caesar-cipher-service", tags: ["Java", "Maven", "CLI"], date: "2026-06-12",
      ru: "Консольное приложение для шифрования и расшифровки текстовых файлов шифром Цезаря: подбор ключа перебором и частотный анализ.",
      en: "Console app that encrypts and decrypts text files with the Caesar cipher: key brute force and frequency analysis." },
    { name: "StudyFlow", tags: ["Java", "CLI"], date: "2026-03-13",
      ru: "Консольный менеджер учебных задач: дедлайны и приоритеты, фильтр по предмету, сортировка по сроку.",
      en: "Console task manager for coursework: deadlines and priorities, filtering by subject, sorting by due date." },
    { name: "CipochkaMod", tags: ["Java 21", "Fabric", "Gradle"], date: "2026-03-12",
      ru: "Мод для Minecraft на Fabric: розовые куры и цыплята с собственными моделями и текстурами.",
      en: "Fabric mod for Minecraft: pink chickens and chicks with custom models and textures." },
    { name: "ChronicleFlow", tags: ["C#", "ASP.NET", "Docker", "CI"], date: "2026-06-14",
      ru: "Сервис фоновых задач на ASP.NET: приоритеты и повторные попытки, append-only журнал в JSONL, восстановление после сбоя.",
      en: "ASP.NET background job service: priorities and retries, an append-only JSONL log, recovery after a crash." },
    { name: "floating_point", tags: ["C++", "CMake"], date: "2026-09-12",
      ru: "Эмулятор арифметики IEEE 754 (binary16 и binary32) на битовых операциях: режимы округления, поднормальные числа, FMA и MAD.",
      en: "IEEE 754 arithmetic emulator (binary16 and binary32) on bit operations: rounding modes, subnormals, FMA and MAD." },
  ];
  let repoDates = {}, repoTotal = 17;
  const reposEl = $("#repos");
  function fmtDate(iso) {
    const d = new Date(iso);
    if (isNaN(d)) return "-";
    return prefs.lang === "en"
      ? new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric" }).format(d)
      : `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()}`;
  }
  function plural(n) {
    const w = D().projWords;
    if (prefs.lang === "en") return n === 1 ? w[0] : w[1];
    const m10 = n % 10, m100 = n % 100;
    if (m10 === 1 && m100 !== 11) return w[0];
    if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return w[1];
    return w[2];
  }
  function renderRepos() {
    const cards = PINNED.map((r, i) => `
      <li><a class="proj" href="${GH}/${esc(r.name)}" target="_blank" rel="noopener">
        <span class="proj__top"><span data-icon="folder" data-size="40"></span><span class="proj__idx">${pad(i + 1)}</span></span>
        <span class="proj__name">${esc(r.name)}</span>
        <span class="proj__url">github.com/VladimirDonskov/${esc(r.name)}</span>
        <span class="proj__desc">${esc(r[prefs.lang] || r.ru)}</span>
        <span class="proj__tags">${r.tags.map((t) => `<i>${esc(t)}</i>`).join("")}</span>
        <span class="proj__foot"><span>${fmtDate(repoDates[r.name] || r.date)}</span><span>${esc(D().projOpen)} ↗</span></span>
      </a></li>`).join("");
    const more = Math.max(0, repoTotal - PINNED.length);
    const tile = `
      <li><a class="proj proj--more" href="${GH}?tab=repositories" target="_blank" rel="noopener">
        <span class="proj__plus">+${more}</span>
        <span class="proj__more-t">${esc(fmt(D().projMore, { w: plural(more) }))}</span>
        <span class="proj__more-l">github.com/VladimirDonskov ↗</span>
      </a></li>`;
    reposEl.innerHTML = cards + tile;
    PI.hydrate(reposEl);
    const links = $("#repoLinks");
    links.innerHTML = PINNED.map((r) =>
      `<a class="qlink" href="${GH}/${esc(r.name)}" target="_blank" rel="noopener"><span data-icon="folder" data-size="16"></span>${esc(r.name)}</a>`
    ).join("") + `<a class="qlink qlink--all" href="${GH}?tab=repositories" target="_blank" rel="noopener">${esc(D().projAll)} ↗</a>`;
    PI.hydrate(links);
    $("#reposStatus").textContent = fmt(D().projStatus, { p: PINNED.length, n: repoTotal });
  }
  async function loadRepos(force) {
    const btn = $("#reposReload");
    btn.classList.add("is-spin");
    let data = null;
    if (!force) { try { data = JSON.parse(store.sget("vdos-gh") || "null"); } catch (e) { data = null; } }
    try {
      if (!data) {
        const ctrl = "AbortController" in window ? new AbortController() : null;
        const to = setTimeout(() => ctrl && ctrl.abort(), 8000);
        const r = await fetch("https://api.github.com/users/VladimirDonskov/repos?per_page=100", {
          headers: { Accept: "application/vnd.github+json" }, signal: ctrl ? ctrl.signal : undefined,
        });
        clearTimeout(to);
        if (!r.ok) throw new Error("HTTP " + r.status);
        const j = await r.json();
        if (!Array.isArray(j) || !j.length) throw new Error("empty");
        data = { total: j.length, dates: {} };
        j.forEach((x) => { data.dates[x.name] = x.pushed_at || x.updated_at; });
        store.sset("vdos-gh", JSON.stringify(data));
      }
      repoTotal = data.total;
      repoDates = data.dates;
    } catch (e) { /* keep the built-in dates */ }
    renderRepos();
    setTimeout(() => btn.classList.remove("is-spin"), 300);
  }
  $("#reposReload").addEventListener("click", () => loadRepos(true));

  /* copy e-mail */
  $$("[data-copy]").forEach((b) => b.addEventListener("click", async () => {
    const v = b.dataset.copy;
    let ok = false;
    try { await navigator.clipboard.writeText(v); ok = true; } catch (e) {
      const ta = document.createElement("textarea");
      ta.value = v; ta.setAttribute("readonly", ""); ta.style.position = "fixed"; ta.style.opacity = "0";
      document.body.appendChild(ta); ta.select();
      try { ok = document.execCommand("copy"); } catch (err) { ok = false; }
      ta.remove();
    }
    notify(ok ? fmt(D().copied, { v }) : D().copyFail);
    if (ok) { b.classList.add("is-done"); setTimeout(() => b.classList.remove("is-done"), 1400); }
  }));

  /* footer wordmark */
  const mark = $("#footMark");
  /* each letter lights up in its own system colour (never GrabYou green) */
  const MARK_COLORS = ["var(--accent)", "var(--yellow)", "var(--red)", "var(--teal)", "var(--orange)", "var(--accent-hi)", "var(--yellow)"];
  const markChars = Array.from(mark.textContent.trim())
    .map((c, i) => `<span class="ch" style="--c:${MARK_COLORS[i % MARK_COLORS.length]}">${esc(c)}</span>`).join("");
  mark.innerHTML = markChars;
  function fitMark() {
    const cs = $$(".ch", mark);
    mark.style.fontSize = "100px";
    const w = cs[cs.length - 1].getBoundingClientRect().right - cs[0].getBoundingClientRect().left;
    if (w && mark.clientWidth) mark.style.fontSize = Math.min(420, (100 * mark.clientWidth) / w * 0.99).toFixed(1) + "px";
  }
  fitMark();
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(fitMark);
  addEventListener("resize", fitMark);
  mark.addEventListener("pointerdown", (e) => { const c = e.target.closest(".ch"); if (c) c.classList.toggle("is-lit"); });
  if ("IntersectionObserver" in window) {
    const fio = new IntersectionObserver((en) => {
      if (!en[0].isIntersecting || !motion()) return;
      fio.disconnect();
      $$(".ch", mark).forEach((c, i) => {
        setTimeout(() => c.classList.add("is-lit"), i * 80);
        setTimeout(() => c.classList.remove("is-lit"), i * 80 + 420);
      });
    }, { threshold: 0.6 });
    fio.observe(mark);
  }

  /* =========================================================
     TERMINAL
     ========================================================= */
  const term = $("#term"), termOut = $("#termOut"), termIn = $("#termInput"), termBody = $("#termBody");
  let termReady = false;
  const hist = [];
  let histI = 0;
  function tprint(html, cls) {
    const d = document.createElement("div");
    if (cls) d.className = cls;
    d.innerHTML = html;
    termOut.appendChild(d);
    termBody.scrollTop = termBody.scrollHeight;
  }
  function openTerm() {
    openDialog(term);
    if (!termReady) { termReady = true; tprint(D().termHello, "dim"); }
    setTimeout(() => termIn.focus(), 30);
  }
  const go = (sel) => () => {
    tprint(esc(fmt(D().termGo, { v: sel.slice(1) })), "dim");
    setTimeout(() => { term.close(); openWin($(sel), true); }, 260);
  };
  const openUrl = (u) => () => { tprint(esc(fmt(D().termOpen, { v: u })), "dim"); window.open(u, "_blank", "noopener"); };
  const CMDS = {
    help: () => D().termHelp.forEach(([c, d]) => tprint(`<span>${esc(c)}</span><span>${esc(d)}</span>`, "row")),
    about: go("#about"), stack: go("#stack"), grabyou: go("#grabyou"), projects: go("#projects"),
    edu: go("#edu"), contact: go("#contact"),
    whoami: () => tprint(esc(D().termWho)),
    ls: () => tprint(esc(D().termLs)),
    telegram: openUrl("https://t.me/CipaVibe"),
    github: openUrl("https://github.com/VladimirDonskov"),
    channel: openUrl("https://t.me/GrabYouOfficial"),
    grabyou_site: openUrl("https://grabyou.ru"),
    mail: () => { tprint(esc(fmt(D().termOpen, { v: "mailto:donskov.vd@gmail.com" })), "dim"); location.href = "mailto:donskov.vd@gmail.com"; },
    theme: (a) => {
      const t = a === "graphite" || a === "dark" ? "dark" : a === "paper" || a === "light" ? "light" : prefs.theme === "dark" ? "light" : "dark";
      setTheme(t, true); tprint(`<span class="hl">${esc(fmt(D().termTheme, { v: D().themeName[t] }))}</span>`);
    },
    lang: (a) => {
      const l = a === "en" || a === "ru" ? a : prefs.lang === "ru" ? "en" : "ru";
      setLang(l); tprint(`<span class="hl">${esc(fmt(D().termLang, { v: l.toUpperCase() }))}</span>`);
    },
    crt: () => { setCrt(!prefs.crt); tprint(`<span class="hl">${esc(fmt(D().termCrt, { v: prefs.crt ? "ON" : "OFF" }))}</span>`); },
    date: () => tprint(esc(new Date().toString())),
    echo: (a, raw) => tprint(esc(raw.replace(/^echo\s*/i, ""))),
    clear: () => { termOut.innerHTML = ""; },
    reboot: () => { term.close(); runBoot(true); },
    exit: () => term.close(),
    hire: () => { tprint(`<span class="hl">${esc(D().termHire)}</span>`); window.open("https://t.me/CipaVibe", "_blank", "noopener"); },
    sudo: () => tprint(esc(fmt(D().termSudo, { u: "guest" })), "err"),
  };
  const ALIAS = { "?": "help", cls: "clear", dir: "ls", quit: "exit", tg: "telegram", gh: "github", email: "mail", site: "grabyou_site" };
  $("#termForm").addEventListener("submit", (e) => {
    e.preventDefault();
    const raw = termIn.value.trim();
    termIn.value = "";
    tprint(`<b>vd@os:~$</b> ${esc(raw)}`, "in");
    if (!raw) return;
    hist.push(raw); histI = hist.length;
    const parts = raw.split(/\s+/);
    let cmd = parts[0].toLowerCase();
    cmd = ALIAS[cmd] || cmd;
    const fn = Object.prototype.hasOwnProperty.call(CMDS, cmd) ? CMDS[cmd] : null;
    if (fn) fn((parts[1] || "").toLowerCase(), raw);
    else tprint(fmt(D().termUnknown, { c: esc(parts[0]) }), "err");
  });
  termIn.addEventListener("keydown", (e) => {
    if (e.key === "ArrowUp") { e.preventDefault(); if (histI > 0) termIn.value = hist[--histI]; }
    else if (e.key === "ArrowDown") { e.preventDefault(); histI = Math.min(hist.length, histI + 1); termIn.value = hist[histI] || ""; }
    else if (e.key === "Tab") {
      e.preventDefault();
      const v = termIn.value.trim().toLowerCase();
      if (!v) return;
      const m = Object.keys(CMDS).filter((c) => c.indexOf(v) === 0);
      if (m.length === 1) termIn.value = m[0] + " ";
      else if (m.length > 1) tprint(esc(m.join("  ")), "dim");
    }
  });
  termBody.addEventListener("click", () => { if (!getSelection().toString()) termIn.focus(); });

  /* =========================================================
     SETTINGS
     ========================================================= */
  const cfg = $("#settings"), cfgF = $("#cfgForm").elements;
  function syncCfg() {
    cfgF.namedItem("theme").value = prefs.theme;
    cfgF.namedItem("lang").value = prefs.lang;
    cfgF.namedItem("motion").checked = prefs.motion;
    cfgF.namedItem("crt").checked = prefs.crt;
    cfgF.namedItem("sound").checked = prefs.sound;
  }
  function openSettings() { syncCfg(); openDialog(cfg); }
  $("#cfgForm").addEventListener("change", (e) => {
    const t = e.target;
    if (t.name === "theme") setTheme(t.value, true);
    else if (t.name === "lang") setLang(t.value);
    else if (t.name === "motion") setMotion(t.checked);
    else if (t.name === "crt") setCrt(t.checked);
    else if (t.name === "sound") { prefs.sound = t.checked; savePrefs(); blip(980, 0.05); }
  });

  /* =========================================================
     TOAST
     ========================================================= */
  const toast = $("#toast");
  function hideToast() { toast.hidden = true; }
  function showToast() {
    if ($("dialog[open]") || !$("#shutdown").hidden || !$("#boot").hidden) { setTimeout(showToast, 6000); return; }
    toast.hidden = false;
    store.sset("vdos-toast", "1");
    blip(660, 0.06, "square", 0.03); setTimeout(() => blip(990, 0.06, "square", 0.03), 80);
  }
  $("#toastClose").addEventListener("click", hideToast);
  $("#toastLater").addEventListener("click", hideToast);
  $("#toastOpen").addEventListener("click", hideToast);

  /* =========================================================
     BOOT / SHUTDOWN
     ========================================================= */
  const BOOT = [
    ["VD·OS BIOS 2.6  (c) 2026 Vladimir Donskov", ""],
    ["CPU   : JAVA + PYTHON CORE", "OK"],
    ["MEM   : 640K - ought to be enough", "OK"],
    ["DISK  : /home/vladimir", "OK"],
    ["DB    : postgres · clickhouse · redis", "OK"],
    ["NET   : t.me/CipaVibe", "OK"],
    ["SRV   : grabyou.app", "OK"],
    ["GUI   : starting desktop", "READY"],
  ];
  let started = false;
  function startDesktop() {
    $$("#hello, #sysinfo, #statuslog").forEach((w) => w.classList.remove("is-open"));
    launch($("#hello"), 0);
    launch($("#sysinfo"), 170);
    launch($("#statuslog"), 320);
    setTimeout(nameIntro, motion() ? 220 : 0);
    setTimeout(typeLoop, motion() ? 900 : 0);
    startLog();
    focusWin($("#hello"));
    if (!started) {
      started = true;
      $$(".win[data-reveal]").forEach((w) => {
        if (w.closest(".hero")) return;
        if (revealIO) revealIO.observe(w); else w.classList.add("is-open");
      });
      if (!store.sget("vdos-toast")) setTimeout(showToast, 12000);
    }
  }
  function runBoot(force) {
    const boot = $("#boot");
    if (!force && (store.sget("vdos-boot") || !motion())) { startDesktop(); return; }
    store.sset("vdos-boot", "1");
    const linesEl = $("#bootLines"), bar = $("#bootBar");
    linesEl.innerHTML = ""; bar.innerHTML = "";
    for (let i = 0; i < 32; i++) bar.appendChild(document.createElement("i"));
    const cells = $$("i", bar);
    boot.hidden = false;
    boot.removeAttribute("aria-hidden");
    let i = 0, t = 0, done = false;
    function next() {
      if (i < BOOT.length) {
        const [txt, st] = BOOT[i];
        const row = document.createElement("div");
        row.innerHTML = `<span>${esc(txt)}</span>${st ? `<span class="lead"></span><span class="ok${st === "READY" ? " go" : ""}">${st}</span>` : ""}`;
        linesEl.appendChild(row);
        i++;
        const fill = Math.round((i / BOOT.length) * cells.length);
        cells.forEach((c, k) => c.classList.toggle("on", k < fill));
        blip(420 + i * 60, 0.02, "square", 0.02);
        t = setTimeout(next, i === 1 ? 260 : 140);
      } else t = setTimeout(finish, 360);
    }
    function finish() {
      if (done) return;
      done = true;
      clearTimeout(t);
      removeEventListener("keydown", finish);
      boot.removeEventListener("pointerdown", finish);
      boot.classList.add("is-out");
      setTimeout(() => {
        boot.hidden = true;
        boot.setAttribute("aria-hidden", "true");
        boot.classList.remove("is-out");
        startDesktop();
      }, 420);
    }
    addEventListener("keydown", finish);
    boot.addEventListener("pointerdown", finish);
    next();
  }
  function shutdown() {
    toggleStart(false);
    $$("dialog[open]").forEach((d) => d.close());
    hideToast();
    const s = $("#shutdown");
    s.hidden = false;
    document.body.style.overflow = "hidden";
    blip(330, 0.18, "triangle", 0.06);
    setTimeout(() => $("#powerOn").focus(), 60);
  }
  $("#powerOn").addEventListener("click", () => {
    $("#shutdown").hidden = true;
    document.body.style.overflow = "";
    scrollTo({ top: 0, behavior: "auto" });
    runBoot(true);
  });

  /* =========================================================
     INIT
     ========================================================= */
  applyMotion();
  applyCrt();
  applyTheme(false);
  applyLang();
  syncCfg();
  loadRepos(false);
  runBoot(false);
})();
