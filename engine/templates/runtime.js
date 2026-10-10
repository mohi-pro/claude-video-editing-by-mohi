// Editor runtime: builds ONE paused, seekable GSAP timeline from the static DOM + #hf-plan.
// Timing lives in data-start/data-duration (editable in HyperFrames Studio); motion lives here.
(function () {
  var P = JSON.parse(document.getElementById("hf-plan").textContent);
  var BN = "০১২৩৪৫৬৭৮৯";
  var num = function (s) { return P.numerals === "bn" ? String(s).replace(/[0-9]/g, function (d) { return BN[d]; }) : String(s); };
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var css = getComputedStyle(document.documentElement);
  var ORANGE = css.getPropertyValue("--orange").trim() || "#FF7A1A";
  var CREAM = css.getPropertyValue("--cream").trim() || "#FFF4E6";
  var seed = 7;
  var rnd = function () { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  var startOf = function (el) { return parseFloat(el.getAttribute("data-start")) || 0; };
  var durOf = function (el) { return parseFloat(el.getAttribute("data-duration")) || 0; };

  var tl = gsap.timeline({ paused: true });
  var OY = (P.originY || 0.4) * 100;
  var ring = $("#bubble-ring");
  if (ring && P.bubble) {
    ring.style.setProperty("--br-d", (P.bubble.r * 2 + 20) + "px");
    ring.style.left = (P.bubble.x * P.W) + "px";
    ring.style.top = (P.bubble.y * P.H) + "px";
  }

  tl.set("#flash", { opacity: 0 }, 0);

  // ---------- camera: jump-zoom shots with constant drift ----------
  var prev = null;
  P.shots.forEach(function (sh, i) {
    var d = sh.e - sh.s;
    var big = prev && (Math.abs(sh.x - prev.x) > 8 || Math.abs((sh.y || 0) - (prev.y || 0)) > 8);
    if (big) {
      var t = Math.min(0.45, d * 0.5);
      tl.fromTo("#cam-zoom", { scale: prev.z * (1 + prev.drift), xPercent: prev.x, yPercent: prev.y || 0 }, { scale: sh.z, xPercent: sh.x, yPercent: sh.y || 0, duration: t, ease: "power3.inOut", immediateRender: false }, sh.s);
      tl.fromTo("#cam-zoom", { scale: sh.z, xPercent: sh.x, yPercent: sh.y || 0 }, { scale: sh.z * (1 + sh.drift), xPercent: sh.x, yPercent: sh.y || 0, duration: d - t, ease: "none", immediateRender: false }, sh.s + t);
    } else {
      tl.fromTo("#cam-zoom", { scale: sh.z, xPercent: sh.x, yPercent: sh.y || 0 }, { scale: sh.z * (1 + sh.drift), xPercent: sh.x, yPercent: sh.y || 0, duration: d, ease: "none", immediateRender: i === 0 }, sh.s);
    }
    prev = sh;
  });

  // ---------- auto-framing: follow the smoothed face track (seek-safe proxy) ----------
  if (P.track && $("#cam-track")) {
    var T = P.track, trk = $("#cam-track"), n = T.s.length, o = { t: 0 };
    var at = function (arr, f) { var i = Math.min(n - 1, Math.floor(f)), j = Math.min(n - 1, i + 1), u = f - Math.floor(f); return arr[i] + (arr[j] - arr[i]) * u; };
    var apply = function () {
      var f = Math.max(0, o.t * T.fps);
      trk.style.transformOrigin = (at(T.ox, f) * 100).toFixed(2) + "% " + (at(T.oy, f) * 100).toFixed(2) + "%";
      trk.style.transform = "translate(" + (at(T.tx, f) * P.W).toFixed(1) + "px," + (at(T.ty, f) * P.H).toFixed(1) + "px) scale(" + at(T.s, f).toFixed(4) + ")";
    };
    apply();
    tl.fromTo(o, { t: 0 }, { t: P.D, duration: P.D, ease: "none", onUpdate: apply }, 0);
  }

  // ---------- punches (emphasis words) ----------
  P.punches.forEach(function (t) {
    tl.fromTo("#cam-punch", { scale: 1 }, { scale: 1 + P.punch, duration: 0.08, ease: "power2.out", immediateRender: false }, t);
    tl.to("#cam-punch", { scale: 1, duration: 0.32, ease: "power2.inOut" }, t + 0.08);
  });

  // ---------- shake + flash on hits ----------
  function hit(t, power) {
    var p = power || 1;
    tl.to("#cam-shake", { keyframes: [
      { x: 20 * p, y: -12 * p, rotation: 0.6 * p, duration: 0.035 },
      { x: -18 * p, y: 12 * p, rotation: -0.5 * p, duration: 0.035 },
      { x: 10 * p, y: -6 * p, rotation: 0.3 * p, duration: 0.035 },
      { x: -5 * p, y: 3 * p, rotation: 0, duration: 0.035 },
      { x: 0, y: 0, rotation: 0, duration: 0.04 }
    ] }, t);
    if (P.flash) {
      tl.fromTo("#flash", { opacity: 0 }, { opacity: 0.5 * Math.min(1.6, p), duration: 0.035, immediateRender: false }, t);
      tl.to("#flash", { opacity: 0, duration: 0.17, ease: "power2.out" }, t + 0.035);
    }
  }
  function hitNoFlash(t, p) {
    tl.to("#cam-shake", { keyframes: [{ x: 16 * p, y: -10 * p, duration: 0.035 }, { x: -14 * p, y: 9 * p, duration: 0.035 }, { x: 6 * p, y: -4 * p, duration: 0.035 }, { x: 0, y: 0, duration: 0.04 }] }, t);
  }
  P.shakes.forEach(function (t, i) { if (i === 0 && P.hook && P.hook.instant) hitNoFlash(t, 1); else hit(t, i === 0 ? 1.4 : 0.8); });

  // ---------- hook ----------
  var hook = $("#hook");
  if (hook && P.hook) {
    var E = P.hook.end;
    var hw = $$(".hw", hook);
    var step = Math.min(0.09, (E * 0.42) / Math.max(1, hw.length));
    tl.fromTo("#cam-punch", { scale: P.hook.instant ? 1.1 : 1.28 }, { scale: 1, duration: Math.min(0.7, E * 0.6), ease: "power3.out" }, 0);
    if (!P.hook.instant) tl.fromTo($(".hook-scrim", hook), { opacity: 0 }, { opacity: 1, duration: 0.1 }, 0);
    hw.forEach(function (w, i) {
      var t = 0.03 + i * step;
      if (P.hook.instant) {
        // legible from frame 0 (muted autoplay previews): gentle settle, the highlight word slams
        if (w.classList.contains("hl")) tl.fromTo(w, { scale: 0.4, opacity: 0, rotation: -8 }, { scale: 1, opacity: 1, rotation: 0, duration: 0.32, ease: "back.out(2.6)" }, 0.08);
        else tl.fromTo(w, { scale: 1.12, opacity: 0.85 }, { scale: 1, opacity: 1, duration: 0.25, ease: "power2.out" }, 0);
        return;
      }
      tl.fromTo(w, { scale: 2.6, opacity: 0, rotation: i % 2 ? -7 : 7, filter: "blur(10px)" }, { scale: 1, opacity: 1, rotation: 0, filter: "blur(0px)", duration: 0.22, ease: "back.out(2.2)" }, t);
      if (w.classList.contains("hl")) {
        tl.to(w, { scale: 1.14, duration: 0.12, ease: "power2.out" }, t + 0.24);
        tl.to(w, { scale: 1, duration: 0.18, ease: "power2.inOut" }, t + 0.36);
      }
    });
    var hls = hw.filter(function (w) { return w.classList.contains("hl"); });
    (P.hook.pulses || []).forEach(function (t) {
      if (hls.length) {
        tl.to(hls, { scale: 1.18, rotation: -3, duration: 0.1, ease: "power2.out" }, t);
        tl.to(hls, { scale: 1, rotation: 0, duration: 0.22, ease: "back.out(2)" }, t + 0.1);
      }
    });
    var em = $(".hook-emoji", hook);
    if (em) {
      tl.fromTo(em, { scale: 0, rotation: -35 }, { scale: 1, rotation: 0, duration: 0.34, ease: "back.out(3)" }, 0.12);
      tl.to(em, { rotation: 10, duration: 0.18, yoyo: true, repeat: Math.max(1, Math.floor((E - 0.5) / 0.18)), ease: "sine.inOut" }, 0.46);
    }
    var sub = $(".hook-sub", hook);
    if (sub) tl.fromTo(sub, { y: 40, opacity: 0 }, { y: 0, opacity: 1, duration: 0.22, ease: "power3.out" }, 0.03 + hw.length * step + 0.05);
    tl.fromTo($(".hook-inner", hook), { scale: 1 }, { scale: 1.06, duration: Math.max(0.2, E - 0.2), ease: "none" }, 0.2);
    tl.to($(".hook-inner", hook), { scale: 1.25, opacity: 0, filter: "blur(10px)", duration: 0.16, ease: "power2.in" }, E - 0.16);
    tl.to($(".hook-scrim", hook), { opacity: 0, duration: 0.16 }, E - 0.16);
  }

  // ---------- captions ----------
  $$(".cap").forEach(function (c) {
    var s = startOf(c);
    var inner = $(".cap-inner", c);
    tl.fromTo(inner, { scale: 0.72, y: 26, opacity: 0 }, { scale: 1, y: 0, opacity: 1, duration: 0.13, ease: "back.out(2.4)" }, s);
    $$(".w", c).forEach(function (w) {
      var t0 = parseFloat(w.getAttribute("data-t0")), t1 = parseFloat(w.getAttribute("data-t1"));
      if (w.classList.contains("em") && P.capStyle === "minimal") {
        tl.fromTo(w, { scale: 0.7 }, { scale: P.capEmph, duration: 0.18, ease: "back.out(3)", immediateRender: false }, Math.max(s, t0 - 0.02));
        tl.fromTo(w, { backgroundPosition: "100% 0%" }, { backgroundPosition: "0% 0%", duration: Math.max(0.15, t1 - t0), ease: "none", immediateRender: false }, Math.max(s, t0));
      } else if (w.classList.contains("em")) {
        tl.fromTo(w, { scale: 0.45, rotation: -9 }, { scale: P.capEmph, rotation: -3, duration: 0.2, ease: "back.out(3)", immediateRender: false }, Math.max(s, t0 - 0.02));
      } else {
        if (P.capActiveColor) tl.set(w, { color: ORANGE }, Math.max(s, t0));
        tl.fromTo(w, { scale: 1 }, { scale: 1.1, duration: 0.07, ease: "power2.out", immediateRender: false }, Math.max(s, t0));
        tl.to(w, { scale: 1, duration: 0.12 }, Math.max(s, t0) + 0.07);
        if (P.capActiveColor) tl.set(w, { color: CREAM }, Math.max(t1, t0 + 0.14));
      }
    });
  });

  // ---------- beats ----------
  var ENTER = [
    function (el, t) { tl.fromTo(el, { yPercent: -115, opacity: 0 }, { yPercent: 0, opacity: 1, duration: 0.28, ease: "back.out(1.5)" }, t); },
    function (el, t) { tl.fromTo(el, { scale: 0.45, opacity: 0, rotation: -5 }, { scale: 1, opacity: 1, rotation: 0, duration: 0.26, ease: "back.out(2)" }, t); },
    function (el, t) { tl.fromTo(el, { clipPath: "inset(0% 100% 0% 0% round 30px)" }, { clipPath: "inset(0% 0% 0% 0% round 30px)", duration: 0.3, ease: "power3.out" }, t); },
    function (el, t) { tl.fromTo(el, { rotationX: -85, opacity: 0, transformPerspective: 1400, transformOrigin: "50% 0%" }, { rotationX: 0, opacity: 1, duration: 0.32, ease: "back.out(1.4)" }, t); }
  ];
  var meta = {};
  P.beats.forEach(function (b) { meta[b.k] = b; });
  var variant = 0;

  function countUp(el, t, dur) {
    if (!el) return;
    var to = parseFloat(el.getAttribute("data-to")), dec = parseInt(el.getAttribute("data-dec") || "0", 10);
    var o = { v: 0 };
    var put = function () { el.textContent = num(o.v.toLocaleString("en-US", { minimumFractionDigits: dec, maximumFractionDigits: dec })); };
    tl.fromTo(o, { v: 0 }, { v: to, duration: dur, ease: "power2.out", onUpdate: put, immediateRender: false }, t);
  }

  $$(".beat").forEach(function (sec) {
    var k = parseInt(sec.getAttribute("data-k"), 10), b = meta[k] || {};
    var s = startOf(sec), d = durOf(sec), e = s + d;
    var inner = $(".beat-inner", sec);
    var pos = b.pos;
    if (b.type === "split") return; // animated in its own block below
    if (b.type === "title") return animTitle(sec, b, s, d, e);
    if (b.type === "scene") return animScene(sec, b, s, d, e);
    if (pos === "full") tl.fromTo(inner, { scale: 1.25, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.22, ease: "power3.out" }, s);
    else if (pos === "side") tl.fromTo(inner, { xPercent: 115, opacity: 0 }, { xPercent: 0, opacity: 1, duration: 0.42, ease: "power3.out" }, s);
    else ENTER[variant++ % ENTER.length](inner, s);
    // never static: slow breathe while on screen
    tl.fromTo(inner, { y: 0 }, { y: -10, duration: Math.max(0.3, d - 0.5), ease: "sine.inOut", immediateRender: false }, s + 0.3);
    if (pos === "side") tl.to(inner, { xPercent: 115, opacity: 0, duration: 0.3, ease: "power3.in" }, e - 0.3);
    else tl.to(inner, { scale: 0.9, opacity: 0, duration: 0.15, ease: "power2.in" }, e - 0.15);

    content(b.type, sec, s, d, e, b);
  });

  function content(type, sec, s, d, e, b) {
    var c0 = s + 0.06;
    switch (type) {
      case "text": {
        var big = $(".bt-big", sec), sub = $(".bt-sub", sec), emo = $(".bt-emoji", sec);
        if (big) {
          tl.fromTo(big, { scale: 2.2, opacity: 0, filter: "blur(12px)" }, { scale: 1, opacity: 1, filter: "blur(0px)", duration: 0.24, ease: "back.out(1.8)" }, c0);
          tl.fromTo(big, { scale: 1 }, { scale: 1.06, duration: Math.max(0.3, d - 0.6), ease: "none", immediateRender: false }, c0 + 0.24);
        }
        if (sub) tl.fromTo(sub, { y: 46, opacity: 0 }, { y: 0, opacity: 1, duration: 0.22, ease: "power3.out" }, c0 + 0.22);
        if (emo) {
          tl.fromTo(emo, { scale: 0, rotation: -40 }, { scale: 1, rotation: 0, duration: 0.3, ease: "back.out(3)" }, c0 + 0.08);
          tl.to(emo, { rotation: 12, duration: 0.2, yoyo: true, repeat: Math.max(1, Math.floor((d - 0.6) / 0.2)), ease: "sine.inOut" }, c0 + 0.4);
        }
        break;
      }
      case "stat": {
        var cd = Math.min(1.0, d * 0.5), cs = b.countAt ? Math.max(c0, b.countAt - cd) : c0; // countAt = when the number should land
        if (b.countAt) tl.set([$(".bt-stat", sec), $(".bt-sub", sec)].filter(Boolean), { opacity: 0 }, 0);
        tl.fromTo($(".bt-stat", sec), { scale: 0.6, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.22, ease: "back.out(2)", immediateRender: !b.countAt }, b.countAt ? cs : c0);
        countUp($(".val", sec), cs, cd);
        var m = $(".bt-meter i", sec);
        if (m) tl.fromTo(m, { scaleX: 0 }, { scaleX: parseFloat(m.getAttribute("data-frac")), duration: cd, ease: "power2.out" }, cs);
        tl.to($(".bt-stat", sec), { scale: 1.12, duration: 0.1, yoyo: true, repeat: 1 }, cs + cd);
        var ss = $(".bt-sub", sec);
        if (ss) tl.fromTo(ss, { y: 40, opacity: 0 }, { y: 0, opacity: 1, duration: 0.2, immediateRender: !b.countAt }, (b.countAt ? cs : c0) + 0.2);
        break;
      }
      case "bars": {
        var cols = $$(".col i", sec);
        tl.fromTo(cols, { scaleY: 0 }, { scaleY: 1, duration: 0.45, ease: "back.out(1.3)", stagger: Math.min(0.12, (d * 0.3) / Math.max(1, cols.length)) }, c0);
        tl.fromTo($$(".v", sec), { y: 30, opacity: 0 }, { y: 0, opacity: 1, duration: 0.2, stagger: 0.08 }, c0 + 0.3);
        tl.fromTo($$(".l", sec), { opacity: 0 }, { opacity: 1, duration: 0.2, stagger: 0.05 }, c0);
        var hi = $$(".bar.hi .col i", sec);
        if (hi.length) tl.to(hi, { scaleX: 1.08, duration: 0.12, yoyo: true, repeat: 1 }, c0 + 0.7);
        break;
      }
      case "line": {
        var dd = Math.min(0.9, d * 0.45);
        tl.fromTo($(".stroke", sec), { strokeDashoffset: 1 }, { strokeDashoffset: 0, duration: dd, ease: "power2.inOut" }, c0);
        tl.fromTo($(".area", sec), { opacity: 0 }, { opacity: 1, duration: dd }, c0 + 0.2);
        var dots = $$(".dot", sec);
        tl.fromTo(dots, { scale: 0, transformOrigin: "50% 50%" }, { scale: 1, duration: 0.18, ease: "back.out(3)", stagger: dd / Math.max(1, dots.length) }, c0);
        tl.fromTo($(".end-val", sec), { scale: 0.4, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.24, ease: "back.out(2.5)" }, c0 + dd);
        tl.fromTo($$(".xl span", sec), { opacity: 0 }, { opacity: 1, duration: 0.2, stagger: 0.05 }, c0);
        break;
      }
      case "donut": {
        var arc = $(".arc", sec), fr = parseFloat(arc.getAttribute("data-frac"));
        var ad = Math.min(1.0, d * 0.5);
        tl.fromTo($(".bt-donut", sec), { scale: 0.6, rotation: -60, opacity: 0 }, { scale: 1, rotation: 0, opacity: 1, duration: 0.3, ease: "back.out(1.8)" }, c0);
        tl.fromTo(arc, { strokeDashoffset: 1 }, { strokeDashoffset: 1 - fr, duration: ad, ease: "power2.out" }, c0 + 0.1);
        countUp($(".val", sec), c0 + 0.1, ad);
        break;
      }
      case "list": {
        $$(".li", sec).forEach(function (li, j) {
          var t = s + 0.35 + j * (b.step || 0.3);
          tl.fromTo(li, { x: -80, opacity: 0 }, { x: 0, opacity: 1, duration: 0.22, ease: "power3.out" }, t);
          tl.fromTo($(".ck", li), { scale: 0, rotation: -90 }, { scale: 1, rotation: 0, duration: 0.24, ease: "back.out(3)" }, t + 0.08);
        });
        break;
      }
      case "compare": {
        tl.fromTo($(".bad", sec), { xPercent: -60, opacity: 0 }, { xPercent: 0, opacity: 1, duration: 0.26, ease: "power3.out" }, c0);
        tl.fromTo($(".good", sec), { xPercent: 60, opacity: 0 }, { xPercent: 0, opacity: 1, duration: 0.26, ease: "power3.out" }, c0 + 0.12);
        tl.fromTo($(".vs", sec), { scale: 0, rotation: -180 }, { scale: 1, rotation: 0, duration: 0.32, ease: "back.out(2.5)" }, c0 + 0.26);
        break;
      }
      case "image": {
        tl.fromTo($(".bt-img img", sec), { scale: 1.2 }, { scale: 1.0, duration: d, ease: "none" }, s);
        var cap = $(".bt-cap", sec);
        if (cap) tl.fromTo(cap, { y: 60, opacity: 0 }, { y: 0, opacity: 1, duration: 0.22, ease: "back.out(2)" }, c0 + 0.12);
        break;
      }
      case "map": {
        var camEl = $(".map-cam", sec);
        tl.fromTo(camEl, { scale: 0.55, rotation: -4 }, { scale: 1, rotation: 0, duration: 0.7, ease: "power3.inOut" }, s);
        tl.fromTo(camEl, { scale: 1 }, { scale: 1.08, duration: Math.max(0.3, d - 0.9), ease: "none", immediateRender: false }, s + 0.7);
        var his = $$(".hi", sec);
        if (his.length) {
          tl.fromTo(his, { strokeDashoffset: 1, fillOpacity: 0 }, { strokeDashoffset: 0, duration: 0.5, ease: "power2.inOut" }, s + 0.3);
          tl.to(his, { fillOpacity: 1, duration: 0.25 }, s + 0.65);
        }
        var rt = $(".route", sec);
        if (rt) tl.fromTo(rt, { strokeDashoffset: 1 }, { strokeDashoffset: 0, duration: 0.7, ease: "power2.inOut" }, s + 0.75);
        $$(".pin", sec).forEach(function (pn, j) {
          tl.fromTo($("i", pn), { y: -120, scale: 0.4, opacity: 0 }, { y: 0, scale: 1, opacity: 1, duration: 0.3, ease: "bounce.out" }, s + 0.7 + j * 0.25);
          var lb = $("span", pn);
          if (lb) tl.fromTo(lb, { x: -20, opacity: 0 }, { x: 0, opacity: 1, duration: 0.2 }, s + 0.9 + j * 0.25);
        });
        var ml = $(".map-label", sec);
        if (ml) tl.fromTo(ml, { y: 60, opacity: 0 }, { y: 0, opacity: 1, duration: 0.24, ease: "back.out(2)" }, s + 0.85);
        break;
      }
      case "tryon": {
        var outs = $$(".outfit", sec), pa = b.pressAt || (s + 0.9), btn = $(".ph-btn", sec), sc2 = $(".scan", sec);
        tl.fromTo($(".ph", sec), { y: 80, opacity: 0, scale: 0.92 }, { y: 0, opacity: 1, scale: 1, duration: 0.32, ease: "power3.out" }, s);
        outs.forEach(function (o, j) { tl.set(o, { opacity: j === 0 ? 1 : 0 }, 0); });
        var up = $(".ph-up", sec), person = $(".ph-person", sec);
        if (up && b.uploadAt) {
          tl.set(person, { opacity: 0 }, 0);
          tl.to(up, { opacity: 0, scale: 0.9, duration: 0.2 }, b.uploadAt);
          tl.fromTo(person, { opacity: 0, y: 40 }, { opacity: 1, y: 0, duration: 0.3, ease: "back.out(1.8)", immediateRender: false }, b.uploadAt + 0.05);
        } else if (up) tl.set(up, { opacity: 0 }, 0);
        tl.to(btn, { scale: 0.92, duration: 0.08 }, pa);
        tl.to(btn, { scale: 1, duration: 0.22, ease: "back.out(3)" }, pa + 0.08);
        tl.set(sc2, { opacity: 1, y: 0 }, pa + 0.1);
        tl.fromTo(sc2, { y: 0 }, { y: 512, duration: 0.5, ease: "power2.inOut", immediateRender: false }, pa + 0.1);
        tl.set(sc2, { opacity: 0 }, pa + 0.6);
        var per = Math.max(0.45, (e - pa - 0.7) / Math.max(1, outs.length - 1));
        outs.forEach(function (o, j) {
          if (!j) return;
          var t = pa + 0.35 + (j - 1) * per;
          tl.set(outs[j - 1], { opacity: 0 }, t);
          tl.fromTo(o, { opacity: 0, scale: 1.08, transformOrigin: "50% 60%" }, { opacity: 1, scale: 1, duration: 0.2, ease: "power2.out", immediateRender: false }, t);
        });
        break;
      }
      case "waveform": {
        var bars = $$(".bt-wave i", sec), env = P.env || [], nb = bars.length, wo = { t: s };
        var drawW = function () {
          var f = Math.floor(wo.t * 30);
          bars.forEach(function (bar, i) {
            var k = f - Math.abs(i - (nb - 1) / 2) * 0.6;           // centre = now, edges = a moment ago (mirrored)
            var v = env[Math.max(0, Math.min(env.length - 1, Math.round(k)))] || 0;
            var wob = 0.75 + 0.25 * Math.sin(i * 1.7 + f * 0.45);
            bar.style.height = (12 + v * wob * 320).toFixed(1) + "px";
          });
        };
        tl.fromTo(wo, { t: s }, { t: e, duration: e - s, ease: "none", immediateRender: false, onUpdate: drawW }, s);
        var cap = $(".bt-sub", sec);
        if (cap) tl.fromTo(cap, { y: 40, opacity: 0 }, { y: 0, opacity: 1, duration: 0.25, ease: "power3.out" }, s + 0.35);
        break;
      }
      case "prompt": {
        var pls = $$(".pr-lines .ptx", sec), total = pls.reduce(function (a, x) { return a + x.textContent.length; }, 0);
        var typeDur = b.typeDur || Math.min(1.3, d * 0.55), t0 = s + 0.25;
        tl.fromTo($(".pr-box", sec), { y: 60, opacity: 0, scale: 0.94 }, { y: 0, opacity: 1, scale: 1, duration: 0.3, ease: "power3.out" }, s);
        tl.fromTo($(".pr-label", sec), { opacity: 0 }, { opacity: 1, duration: 0.2 }, s + 0.1);
        pls.forEach(function (x) {
          var share = typeDur * x.textContent.length / Math.max(1, total), o = { p: 100 };
          tl.set(x, { clipPath: "inset(-20% 100% -20% 0)" }, 0);
          tl.fromTo(o, { p: 100 }, { p: 0, duration: share, ease: "steps(" + Math.max(1, x.textContent.length) + ")", immediateRender: false,
            onUpdate: function () { x.style.clipPath = "inset(-20% " + o.p.toFixed(1) + "% -20% 0)"; } }, t0);
          t0 += share;
        });
        var cr = $(".pr-caret", sec);
        if (cr) tl.fromTo(cr, { opacity: 1 }, { opacity: 0, duration: 0.25, yoyo: true, repeat: Math.max(1, Math.floor(d / 0.25) - 1), ease: "steps(1)" }, s);
        var send = $(".pr-send", sec), sa = b.sendAt || (t0 + 0.2);
        tl.to(send, { scale: 0.82, duration: 0.08 }, sa);
        tl.to(send, { scale: 1, duration: 0.25, ease: "back.out(3)" }, sa + 0.08);
        tl.to($(".pr-box", sec), { y: -40, duration: 0.35, ease: "power2.in" }, sa + 0.15);
        break;
      }
      case "chip": {
        tl.fromTo($(".bt-chip", sec), { scale: 0.6, opacity: 0, y: -20 }, { scale: 1, opacity: 1, y: 0, duration: 0.3, ease: "back.out(2.2)" }, s);
        var dot = $(".bt-chip i", sec);
        if (dot) tl.fromTo(dot, { scale: 1 }, { scale: 1.35, duration: 0.3, yoyo: true, repeat: Math.max(1, Math.floor(d / 0.3) - 1), ease: "sine.inOut" }, s + 0.3);
        break;
      }
      case "terminal": {
        var st0 = b.step || 0.3;
        $$(".bt-term .tl", sec).forEach(function (ln, j) {
          if (ln.classList.contains("cur")) {
            tl.set(ln, { opacity: 0 }, 0);
            tl.set(ln, { opacity: 1 }, s + 0.25 + st0 * j);
            tl.fromTo($(".caret", ln), { opacity: 1 }, { opacity: 0, duration: 0.25, yoyo: true, repeat: Math.max(1, Math.floor((e - s) / 0.25)), ease: "steps(1)" }, s + 0.25 + st0 * j);
            return;
          }
          var t = s + 0.25 + st0 * j, tx = $(".tx", ln), nchar = parseInt(tx.getAttribute("data-n") || "10", 10);
          tl.set(ln, { opacity: 0 }, 0);
          tl.set(ln, { opacity: 1 }, t);
          if (ln.classList.contains("cmd")) {
            var tp = { p: 100 };
            tl.set(tx, { clipPath: "inset(0 100% 0 0)" }, 0);
            tl.fromTo(tp, { p: 100 }, { p: 0, duration: Math.min(0.7, nchar * 0.03), ease: "steps(" + Math.max(1, nchar) + ")", immediateRender: false,
              onUpdate: function () { tx.style.clipPath = "inset(0 " + tp.p.toFixed(1) + "% 0 0)"; } }, t);
          }
          else tl.fromTo(ln, { x: -24, opacity: 0 }, { x: 0, opacity: 1, duration: 0.18, ease: "power2.out", immediateRender: false }, t);
          if (ln.classList.contains("ok")) tl.fromTo($(".pfx", ln), { scale: 0 }, { scale: 1, duration: 0.22, ease: "back.out(3)" }, t + 0.05);
        });
        break;
      }
      case "emoji": {
        $$(".bt-burst span", sec).forEach(function (sp, j) {
          var a = rnd() * Math.PI * 2, r = 260 + rnd() * 260;
          tl.fromTo(sp, { x: 0, y: 0, scale: 0, rotation: 0 }, { x: Math.cos(a) * r, y: Math.sin(a) * r * 1.3, scale: 0.8 + rnd() * 0.8, rotation: (rnd() - 0.5) * 120, duration: 0.5, ease: "power3.out" }, s + j * 0.035);
          tl.to(sp, { y: "+=120", opacity: 0, duration: 0.3, ease: "power2.in" }, e - 0.35);
        });
        var bb = $(".bt-big", sec);
        if (bb) tl.fromTo(bb, { scale: 2, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.22, ease: "back.out(2)" }, c0);
        break;
      }
    }
  }

  // ---------- stylish titles over footage ----------
  function animTitle(sec, b, s, d, e) {
    var wrap = $(".title-wrap", sec), chs = $$(".t-main .ch", sec), n = Math.max(1, chs.length);
    var fx = b.effect || "slam";
    var st = Math.min(0.055, 0.42 / n);
    if (fx === "type") {
      var ts = Math.min(0.07, (d * 0.45) / n);
      chs.forEach(function (c, i) { tl.set(c, { display: "none" }, 0); tl.set(c, { display: "inline-block" }, s + i * ts); });
      var caret = $(".t-caret", sec);
      if (caret) tl.fromTo(caret, { opacity: 1 }, { opacity: 0, duration: 0.18, yoyo: true, repeat: Math.max(1, Math.floor(d / 0.18) - 1), ease: "steps(1)" }, s);
    } else if (fx === "split") {
      chs.forEach(function (c, i) { tl.fromTo(c, { y: i % 2 ? 140 : -140, opacity: 0 }, { y: 0, opacity: 1, duration: 0.26, ease: "power4.out" }, s + i * st); });
    } else {
      tl.fromTo(chs, { scale: fx === "echo" ? 1 : 2.4, y: fx === "echo" ? 120 : 0, opacity: 0, filter: "blur(8px)" }, { scale: 1, y: 0, opacity: 1, filter: "blur(0px)", duration: 0.24, ease: "back.out(1.9)", stagger: st }, fx === "marker" ? s + 0.14 : s);
    }
    if (fx === "echo") {
      var ec = $$(".t-echo", sec), off = [-96, 96, -192];
      ec.forEach(function (el, i) {
        tl.fromTo(el, { yPercent: 0, opacity: 0 }, { yPercent: off[i], opacity: i === 2 ? 0.45 : 0.85, duration: 0.38, ease: "power3.out" }, s + 0.16 + i * 0.05);
        tl.to(el, { yPercent: off[i] * 1.06, duration: Math.max(0.3, d - 0.8), ease: "none" }, s + 0.6);
      });
    }
    if (fx === "glitch") {
      $$(".t-glitch", sec).forEach(function (el, i) {
        var dir = i ? -1 : 1;
        [s, s + d * 0.55].forEach(function (t0) {
          tl.to(el, { keyframes: [
            { opacity: 0.9, x: 16 * dir, duration: 0.04 }, { x: -10 * dir, duration: 0.04 }, { x: 22 * dir, duration: 0.04 },
            { x: -6 * dir, duration: 0.04 }, { x: 0, opacity: 0, duration: 0.05 }] }, t0);
        });
      });
      tl.to($(".t-main", sec), { keyframes: [{ skewX: 18, duration: 0.04 }, { skewX: -12, duration: 0.04 }, { skewX: 0, duration: 0.05 }] }, s + d * 0.55);
    }
    var mk = $(".t-markpath path", sec);
    if (mk) tl.fromTo(mk, { strokeDashoffset: 1 }, { strokeDashoffset: 0, duration: 0.45, ease: "power2.inOut" }, s + 0.35);
    var un = $(".t-under", sec);
    if (un) tl.fromTo(un, { scaleX: 0 }, { scaleX: 1, duration: 0.4, ease: "power3.out" }, s + Math.min(0.6, n * st + 0.15));
    if (fx === "marker") tl.fromTo($(".t-mark", sec), { scaleX: 0 }, { scaleX: 1, duration: 0.26, ease: "power3.out" }, s);
    var sub = $(".t-sub", sec);
    if (sub) tl.fromTo(sub, { y: 40, opacity: 0, scale: 0.8 }, { y: 0, opacity: 1, scale: 1, duration: 0.25, ease: "back.out(2.4)" }, b.subAt || (s + Math.min(0.45, n * st + 0.1)));
    tl.fromTo(wrap, { scale: 1 }, { scale: 1.05, duration: Math.max(0.3, d - 0.2), ease: "none", immediateRender: false }, s);
    if (P.flash) tl.to(wrap, { scale: 1.18, opacity: 0, filter: "blur(10px)", duration: 0.16, ease: "power2.in" }, e - 0.16);
  }

  // ---------- full-screen scene layers (b-roll with colored backgrounds) ----------
  function animScene(sec, b, s, d, e) {
    var bg = $("#sbg" + b.k), sc = $(".scene-content", sec), T = b.transition || "iris";
    tl.set(bg, { opacity: 0 }, 0);
    var IN = 0.34, OUT = 0.26;
    // clip-paths are driven through numeric proxies (GSAP can't tween circle()/polygon() strings reliably)
    function clipTween(el, fmt, from, to, dur, ease, at) {
      var o = { v: from };
      tl.fromTo(o, { v: from }, { v: to, duration: dur, ease: ease, immediateRender: false, onUpdate: function () { el.style.clipPath = fmt(o.v); } }, at);
    }
    var circ = function (r) { return "circle(" + r.toFixed(1) + "px at 50% " + OY + "%)"; };
    tl.set(bg, { opacity: 1 }, s);
    if (b.pip) {
      // the footage shrinking into the bubble IS the transition; the layer underneath is simply there
      tl.to(bg, { opacity: 0, duration: 0.2 }, e - 0.2);
    } else if (T === "iris") {
      tl.set(bg, { clipPath: circ(0) }, 0);
      clipTween(bg, circ, 0, 2600, IN + 0.1, "power3.in", s);
      clipTween(bg, circ, 2600, 0, OUT + 0.06, "power3.in", e - OUT - 0.06);
    } else if (T === "whip") {
      tl.fromTo(bg, { xPercent: 100, filter: "blur(30px)" }, { xPercent: 0, filter: "blur(0px)", duration: IN - 0.06, ease: "power3.out" }, s);
      tl.to(bg, { xPercent: -100, filter: "blur(30px)", duration: OUT, ease: "power3.in" }, e - OUT);
    } else if (T === "wipe") {
      var wp = function (p) { var a = -30 + p * 160; return "polygon(0% 0%, " + (a + 30) + "% 0%, " + a + "% 100%, -30% 100%)"; };
      var wq = function (p) { var a = -30 + p * 160; return "polygon(" + (a + 30) + "% 0%, 130% 0%, 100% 100%, " + a + "% 100%)"; };
      tl.set(bg, { clipPath: wp(0) }, 0);
      clipTween(bg, wp, 0, 1, IN, "power3.inOut", s);
      clipTween(bg, wq, 0, 1, OUT, "power3.in", e - OUT);
    } else if (T === "zoom") {
      tl.fromTo(bg, { scale: 0.25, rotation: -10, opacity: 0 }, { scale: 1, rotation: 0, opacity: 1, duration: IN, ease: "back.out(1.4)" }, s);
      tl.to(bg, { scale: 1.5, opacity: 0, duration: OUT, ease: "power2.in" }, e - OUT);
    } else if (T === "cut") {
      // hard cut: on at s, off at e — no animated transition
    } else if (T === "focus") {
      tl.fromTo(bg, { opacity: 0 }, { opacity: 1, duration: 0.25, ease: "power1.out", immediateRender: false }, s);
      tl.to(bg, { opacity: 0, duration: 0.3, ease: "power1.in" }, e - 0.3);
    } else { // glitch
      tl.to(bg, { keyframes: [{ opacity: 1, x: 30, duration: 0.04 }, { opacity: 0, x: -20, duration: 0.04 }, { opacity: 1, x: 12, duration: 0.04 }, { opacity: 0.4, x: -6, duration: 0.04 }, { opacity: 1, x: 0, duration: 0.05 }] }, s);
      tl.to(bg, { keyframes: [{ opacity: 0.3, x: -24, duration: 0.04 }, { opacity: 1, x: 18, duration: 0.04 }, { opacity: 0, x: 0, duration: 0.05 }] }, e - 0.14);
    }
    tl.set(bg, { opacity: 0 }, e);
    // decorations keep moving
    $$(".sb-row", bg).forEach(function (r, i) { tl.fromTo(r, { xPercent: i % 2 ? -18 : 0 }, { xPercent: i % 2 ? 0 : -18, duration: d, ease: "none" }, s); });
    $$(".sb-blob", bg).forEach(function (bl, i) { tl.fromTo(bl, { x: 0, y: 0, scale: 1 }, { x: i ? -180 : 160, y: i ? -120 : 140, scale: 1.25, duration: d, ease: "sine.inOut" }, s); });
    var gr = $(".sb-grain", bg);
    if (gr) tl.fromTo(gr, { backgroundPosition: "0px 0px" }, { backgroundPosition: "300px 210px", duration: d, ease: "steps(" + Math.max(2, Math.round(d * 12)) + ")" }, s);
    var pitch = $(".sb-pitch", bg);
    if (pitch && b.zoomout) {
      var za = s + (b.zoomAt != null ? b.zoomAt - s : d * 0.55);
      tl.set(pitch, { scale: 2.6, opacity: 0.6 }, 0);
      tl.to(pitch, { scale: 1, opacity: 1, duration: Math.min(1.2, e - za), ease: "power3.inOut" }, za);
    }
    var fl = $(".sb-floor", bg);
    if (fl) tl.fromTo(fl, { backgroundPositionY: "0px" }, { backgroundPositionY: (240 * d) + "px", duration: d, ease: "none" }, s);
    // face bubble: the real footage shrinks into a ringed circle while the scene plays
    if (b.pip && P.bubble) {
      var B = P.bubble, sc0 = B.r / B.src;
      var dx = B.x * P.W - P.W / 2, dy = B.y * P.H - (OY / 100) * P.H;
      var camEl = $("#cam");
      tl.set(camEl, { transformOrigin: "50% " + OY + "%" }, 0);
      clipTween(camEl, circ, 2600, B.src, 0.45, "power3.inOut", s);
      tl.fromTo(camEl, { x: 0, y: 0, scale: 1 }, { x: dx, y: dy, scale: sc0, duration: 0.45, ease: "power3.inOut", immediateRender: false }, s);
      clipTween(camEl, circ, B.src, 2600, 0.4, "power3.inOut", e - 0.4);
      tl.to(camEl, { x: 0, y: 0, scale: 1, duration: 0.4, ease: "power3.inOut" }, e - 0.4);
      tl.set(camEl, { clipPath: "none" }, e);
      if (ring) {
        tl.fromTo(ring, { scale: 0.3, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.3, ease: "back.out(2)", immediateRender: false }, s + 0.3);
        tl.to(ring, { scale: 1.3, opacity: 0, duration: 0.2 }, e - 0.42);
      }
    } else if (T !== "cut") {
      hit(e, 0.7);
      tl.fromTo("#cam-punch", { scale: 1.22 }, { scale: 1, duration: 0.4, ease: "power3.out", immediateRender: false }, e);
    }
    var vf = $(".vf", sec);
    if (vf) {
      tl.fromTo($$(".vf .c", sec), { scale: 1.25, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.3, ease: "power3.out", stagger: 0.03 }, s + 0.05);
      tl.fromTo([$(".vf-rec", sec), $(".vf-tc", sec)], { opacity: 0 }, { opacity: 1, duration: 0.2 }, s + 0.15);
      tl.to($(".vf-rec b", sec), { opacity: 0.2, duration: 0.3, yoyo: true, repeat: Math.max(1, Math.floor(d / 0.3) - 1), ease: "steps(1)" }, s + 0.2);
      var tcEl = $(".vf-tc", sec), tco = { t: s };
      var pad = function (n) { return (n < 10 ? "0" : "") + n; };
      tl.fromTo(tco, { t: s }, { t: e, duration: d, ease: "none", immediateRender: false, onUpdate: function () {
        var f = Math.floor(tco.t * 30); tcEl.textContent = "00:00:" + pad(Math.floor(f / 30)) + ":" + pad(f % 30); } }, s);
    }
    if (b.metaphor) { animMetaphor(sec, b, s, d, e, T); return; }
    // content
    var c0 = s + 0.12;
    if (b.enter === "left") tl.fromTo(sc, { xPercent: -110 }, { xPercent: 0, duration: 0.3, ease: "power3.out" }, s);
    var lg = $(".sc-logo", sec) || $(".sc-wordmark", sec);
    if (lg) tl.fromTo(lg, { scale: 0.7, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.28, ease: "back.out(2)" }, s + 0.04);
    var icon = $(".sc-icon", sec);
    if (icon) {
      tl.fromTo(icon, { scale: 0, rotation: -40 }, { scale: 1, rotation: 0, duration: 0.32, ease: "back.out(3)" }, c0);
      tl.to(icon, { rotation: 8, y: -12, duration: 0.3, yoyo: true, repeat: Math.max(1, Math.floor((d - 0.6) / 0.3)), ease: "sine.inOut" }, c0 + 0.35);
    }
    var kchs = $$(".sc-kicker .k-main .ch", sec);
    if (kchs.length) tl.fromTo(kchs, { y: 160, opacity: 0, rotation: 8 }, { y: 0, opacity: 1, rotation: 0, duration: 0.3, ease: "back.out(1.7)", stagger: Math.min(0.045, 0.36 / kchs.length) }, c0);
    $$(".sc-kicker .k-echo", sec).forEach(function (el, i) {
      tl.fromTo(el, { yPercent: 0, opacity: 0 }, { yPercent: i ? 92 : -92, opacity: 0.8, duration: 0.36, ease: "power3.out" }, c0 + 0.22);
    });
    var hw = $$(".sc-head .hw2", sec);
    if (hw.length) tl.fromTo(hw, { scale: 2.2, opacity: 0, filter: "blur(8px)" }, { scale: 1, opacity: 1, filter: "blur(0px)", duration: 0.22, ease: "back.out(2)", stagger: Math.min(0.08, 0.5 / hw.length) }, c0 + (kchs.length ? 0.3 : 0.05));
    var en = $(".sc-en", sec);
    var bot = $(".scene-bot", sec);
    if (bot) tl.to(bot, { opacity: 0, duration: 0.18 }, e - 0.2);
    if (en) {
      tl.fromTo(en, { x: -80, rotation: -8, opacity: 0 }, { x: 0, rotation: -3, opacity: 1, duration: 0.3, ease: "back.out(2)" }, c0 + 0.45);
      tl.to(en, { rotation: 2, duration: 0.4, yoyo: true, repeat: Math.max(1, Math.floor((d - 1) / 0.4)), ease: "sine.inOut" }, c0 + 0.8);
    }
    var panel = $(".sc-panel", sec);
    if (panel && b.inner) content(b.inner, panel, s + 0.1, d - 0.1, e, b);
    tl.fromTo(sc, { scale: 1 }, { scale: 1.04, duration: Math.max(0.3, d - 0.3), ease: "none", immediateRender: false }, s);
    if (T !== "cut") tl.to(sc, { scale: 0.85, opacity: 0, duration: 0.18, ease: "power2.in" }, e - 0.2);
  }

  // ---------- visual-metaphor explainer stage ----------
  function animMetaphor(sec, b, s, d, e, T) {
    var st = $(".mx-stage", sec);
    // one continuous camera: slow push the whole time; focus-pull in and out
    tl.fromTo(st, { scale: T === "focus" ? 1.18 : 1, filter: T === "focus" ? "blur(22px)" : "blur(0px)" }, { scale: 1, filter: "blur(0px)", duration: 0.5, ease: "power3.out" }, s);
    tl.fromTo(st, { scale: 1 }, { scale: 1.07, duration: Math.max(0.3, d - 0.8), ease: "none", immediateRender: false }, s + 0.5);
    tl.to(st, { scale: 1.12, opacity: 0, filter: "blur(18px)", duration: 0.3, ease: "power2.in" }, e - 0.3);
    var hz = $(".mx-horizon", sec);
    if (hz) tl.fromTo(hz, { rotation: -9 }, { rotation: 7, duration: d, ease: "sine.inOut" }, s);
    var ra = s + (b.revealAt != null ? b.revealAt - s : d * 0.35);
    var ph = $(".mx-photo", sec);
    if (ph) {
      tl.fromTo(ph, { opacity: 0, scale: 0.88 }, { opacity: 1, scale: 1, duration: 0.4, ease: "power2.out" }, s + 0.05);
      if (b.reveal === "split") {
        var dd = parseFloat(ph.getAttribute("data-split")) || 200;
        tl.to($(".mx-half.l", sec), { x: -dd, duration: 0.5, ease: "power3.inOut" }, ra);
        tl.to($(".mx-half.r", sec), { x: dd, duration: 0.5, ease: "power3.inOut" }, ra);
        tl.to($(".mx-outline", sec), { opacity: 0, duration: 0.2 }, ra);
        tl.fromTo($$(".mx-lines line", sec), { strokeDashoffset: 1 }, { strokeDashoffset: 0, duration: 0.4, ease: "power2.out", stagger: 0.04 }, ra + 0.3);
      }
    }
    var pl = $(".mx-plate", sec);
    if (pl) tl.fromTo(pl, { scale: 0.3, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.45, ease: "back.out(1.4)" }, s + 0.05);
    var ob = $(".mx-obj", sec);
    if (ob) {
      var ot = ph && b.reveal === "split" ? ra + 0.08 : s + 0.08;
      tl.fromTo(ob, { scale: ph ? 0.55 : 1.35, opacity: 0, filter: "blur(20px)" }, { scale: 1, opacity: 1, filter: "blur(0px)", duration: 0.55, ease: "power3.out" }, ot);
      tl.fromTo(ob, { rotation: -3 }, { rotation: 3, duration: Math.max(0.4, e - ot - 0.5), ease: "sine.inOut", immediateRender: false }, ot + 0.55);
    }
    var bm = $(".mx-beam", sec), ba = s + (b.beamAt != null ? b.beamAt - s : d * 0.3);
    if (bm) {
      tl.fromTo(bm, { opacity: 0, rotation: -70 }, { opacity: 1, rotation: -20, duration: 0.5, ease: "power2.out" }, ba);
      tl.to(bm, { rotation: 75, duration: Math.max(0.4, e - ba - 0.8), ease: "sine.inOut" }, ba + 0.5);
    }
    var btx = $(".mx-beamtext", sec);
    if (btx) tl.fromTo(btx, { opacity: 0, scale: 1.3, filter: "blur(10px)" }, { opacity: 1, scale: 1, filter: "blur(0px)", duration: 0.35, ease: "power3.out" }, ba + 0.3);
    if (b.zoomout) {
      var za = s + (b.zoomAt != null ? b.zoomAt - s : d * 0.55), zd = Math.min(1.2, e - za - 0.2);
      [ob, pl].forEach(function (el) { if (el) tl.to(el, { scale: 0.34, duration: zd, ease: "power3.inOut" }, za); });
      if (bm) tl.to(bm, { scale: 0.6, duration: zd, ease: "power3.inOut" }, za);
      if (btx) tl.to(btx, { opacity: 0, duration: 0.25 }, za);
    }
    // phrase groups replace each other (one idea on screen at a time)
    var kgs = $$(".mx-kin .kg", sec);
    kgs.forEach(function (g, i) {
      if (i === kgs.length - 1) return;
      var nx = $(".kw", kgs[i + 1]);
      var tn = Math.max(s, parseFloat(nx.getAttribute("data-t0")));
      tl.to(g, { opacity: 0, y: -40, filter: "blur(8px)", duration: 0.18, ease: "power2.in" }, tn - 0.12);
    });
    $$(".mx-kin .kw.strike", sec).forEach(function (w) {
      var ts = parseFloat(w.getAttribute("data-ts")), sk = $(".sk", w);
      tl.set(sk, { scaleX: 0 }, 0);
      tl.fromTo(sk, { scaleX: 0 }, { scaleX: 1, duration: 0.22, ease: "power3.out", immediateRender: false }, ts);
      tl.to(w, { opacity: 0.55, duration: 0.2 }, ts + 0.15);
    });
    // size-contrast kinetic type: each word lands when spoken; key words slam big
    $$(".mx-kin .kw", sec).forEach(function (w) {
      var t0 = Math.max(s, parseFloat(w.getAttribute("data-t0")));
      tl.set(w, { opacity: 0 }, 0);
      if (w.classList.contains("key")) tl.fromTo(w, { opacity: 0, scale: 1.6, filter: "blur(12px)", transformOrigin: "0% 60%" }, { opacity: 1, scale: 1, filter: "blur(0px)", duration: 0.28, ease: "power3.out", immediateRender: false }, t0);
      else tl.fromTo(w, { opacity: 0, y: 18 }, { opacity: 1, y: 0, duration: 0.16, ease: "power2.out", immediateRender: false }, t0);
    });
  }

  // ---------- behind-the-speaker: background swap + giant keyword (subject cut-out on top) ----------
  $$(".behind").forEach(function (sec) {
    var s = startOf(sec), d = durOf(sec), e = s + d;
    var bgl = $(".bh-bg", sec), tx = $(".bh-text", sec);
    if (bgl) {
      tl.fromTo(bgl, { opacity: 0, scale: 1.15 }, { opacity: 1, scale: 1, duration: 0.3, ease: "power3.out" }, s);
      tl.fromTo(bgl, { x: 0 }, { x: -24, duration: Math.max(0.3, d - 0.3), ease: "none", immediateRender: false }, s + 0.3);
      tl.to(bgl, { opacity: 0, duration: 0.14 }, e - 0.14);
      $$(".pt", sec).forEach(function (p, i) { tl.fromTo(p, { y: 0, scale: 0.6, opacity: 0 }, { y: -40 - (i % 3) * 20, scale: 1, opacity: 0.9, duration: d, ease: "power1.out" }, s + (i % 7) * 0.02); });
      hit(s, 0.6);
    }
    if (tx) {
      var big = $(".bh-big", sec), chs = $$(".bh-big .ch", sec), t0 = s + (bgl ? 0.1 : 0);
      if (chs.length > 1) tl.fromTo(chs, { y: 160, opacity: 0, scale: 1.3 }, { y: 0, opacity: 1, scale: 1, duration: 0.32, ease: "back.out(1.6)", stagger: Math.min(0.04, 0.3 / chs.length) }, t0);
      else tl.fromTo(big, { scale: 1.8, opacity: 0, filter: "blur(14px)" }, { scale: 1, opacity: 1, filter: "blur(0px)", duration: 0.32, ease: "power3.out" }, t0);
      tl.fromTo(big, { scale: 1 }, { scale: 1.07, duration: Math.max(0.3, d - 0.4), ease: "none", immediateRender: false }, t0 + 0.35);
      $$(".bh-small .sw", sec).forEach(function (w) {
        var tw = Math.max(s, parseFloat(w.getAttribute("data-t0")));
        tl.fromTo(w, { opacity: 0, y: 14 }, { opacity: 1, y: 0, duration: 0.12, ease: "power2.out" }, tw);
      });
      var sm = $(".bh-small", sec);
      if (sm && !$(".sw", sm)) tl.fromTo(sm, { opacity: 0, y: 20 }, { opacity: 1, y: 0, duration: 0.2 }, t0 + 0.1);
      tl.to(tx, { opacity: 0, scale: 1.1, duration: 0.14 }, e - 0.14);
      if (!bgl) hit(t0, 0.9);
    }
    var card = $(".bh-card", sec);
    if (card) {
      var g = $(".bhc-glass", card), shp = $$(".bhc-orb, .bhc-ring, .bhc-dot", card), cch = $$(".bhc-title .ch", card), rows = $$(".bhc-row", card), c0 = s + (bgl ? 0.1 : 0);
      tl.fromTo(g, { opacity: 0, y: -46, scale: 0.9 }, { opacity: 1, y: 0, scale: 1, duration: 0.42, ease: "power3.out" }, c0);
      tl.fromTo(shp, { scale: 0 }, { scale: 1, duration: 0.5, ease: "back.out(1.7)", stagger: 0.05 }, c0 + 0.06);
      tl.fromTo(shp, { y: 0, rotation: 0 }, { y: function (i) { return i % 2 ? -24 : 20; }, rotation: function (i) { return i % 2 ? 14 : -10; }, duration: Math.max(0.4, d - 0.6), ease: "sine.inOut", immediateRender: false }, c0 + 0.56);
      if (cch.length) tl.fromTo(cch, { y: 70, opacity: 0 }, { y: 0, opacity: 1, duration: 0.3, ease: "power3.out", stagger: Math.min(0.035, 0.3 / cch.length) }, c0 + 0.1);
      tl.fromTo(g, { "--sheen": "-130%" }, { "--sheen": "130%", duration: 0.9, ease: "power2.inOut" }, c0 + 0.35);
      rows.forEach(function (r) {
        var tr = Math.max(c0 + 0.15, parseFloat(r.getAttribute("data-t")) || c0 + 0.3);
        tl.fromTo(r, { opacity: 0, x: -34 }, { opacity: 1, x: 0, duration: 0.26, ease: "power2.out" }, tr);
        var ic = $(".bhc-ic", r); if (ic) tl.fromTo(ic, { scale: 0, rotation: -90 }, { scale: 1, rotation: 0, duration: 0.3, ease: "back.out(2.2)" }, tr + 0.04);
      });
      tl.fromTo(card, { scale: 1 }, { scale: 1.03, duration: Math.max(0.4, d - 0.4), ease: "none", immediateRender: false }, c0 + 0.4);
      tl.to(card, { opacity: 0, y: -24, duration: 0.2, ease: "power2.in" }, e - 0.2);
    }
  });

  // ---------- split: bad prompt vs good prompt ----------
  $$(".type-split").forEach(function (sec) {
    var k = parseInt(sec.getAttribute("data-k"), 10), b = meta[k] || {}, s = startOf(sec), d = durOf(sec), e = s + d;
    var L = $(".sp-side.bad", sec), R = $(".sp-side.good", sec), la = b.leftAt || s, ra = b.rightAt || (s + d * 0.4);
    tl.set([L, R], { opacity: 0 }, 0);
    tl.fromTo(L, { xPercent: -100, opacity: 1 }, { xPercent: 0, duration: 0.28, ease: "power3.out", immediateRender: false }, la);
    tl.fromTo($(".sp-ic", L), { scale: 0, rotation: -90 }, { scale: 1, rotation: 0, duration: 0.3, ease: "back.out(2.5)" }, la + 0.15);
    tl.fromTo(R, { xPercent: 100, opacity: 1 }, { xPercent: 0, duration: 0.28, ease: "power3.out", immediateRender: false }, ra);
    tl.fromTo($(".sp-ic", R), { scale: 0, rotation: 90 }, { scale: 1, rotation: 0, duration: 0.3, ease: "back.out(2.5)" }, ra + 0.15);
    $$(".hl", R).forEach(function (h, j) { var ht = parseFloat(h.getAttribute("data-t")) || (ra + 0.6 + j * 0.5); tl.fromTo(h, { scale: 1 }, { scale: 1.1, duration: 0.14, yoyo: true, repeat: 1, ease: "power2.out" }, ht); });
    if (b.winAt) {
      tl.to(L, { opacity: 0.35, filter: "grayscale(1)", duration: 0.25 }, b.winAt);
      tl.to(R, { scale: 1.03, duration: 0.3, ease: "power2.out" }, b.winAt);
    }
    if (P.flash) tl.to([L, R], { opacity: 0, duration: 0.12 }, e - 0.12);
  });
  if (P.fadeOut && $("#fadeout")) tl.fromTo("#fadeout", { opacity: 0 }, { opacity: 1, duration: P.fadeOut, ease: "power1.in", immediateRender: false }, P.D - P.fadeOut);

  // ---------- b-roll cutaways (video timing lives on the <video>) ----------
  $$(".broll").forEach(function (w) {
    var s = parseFloat(w.getAttribute("data-s")), e = parseFloat(w.getAttribute("data-e"));
    var wa = w.getAttribute("data-w");
    tl.set(w, { opacity: 0 }, 0);
    tl.set(w, { opacity: 1 }, s);
    if (wa === "" || wa === null) {
      tl.fromTo(w, { scale: 1.18 }, { scale: 1, duration: e - s, ease: "power1.out" }, s);
      hit(s, 0.7);
    } else {
      // before/after: raw plays as-is, then a glowing line wipes it away to reveal the finished edit
      var wt = s + parseFloat(wa), wd = Math.min(0.55, e - wt), m = $(".br-media", w), ln = $(".br-line", w);
      var o = { p: 0 };
      tl.set(m, { clipPath: "inset(0% 0% 0% 0%)" }, 0);
      tl.fromTo(o, { p: 0 }, { p: 100, duration: wd, ease: "power2.inOut", immediateRender: false, onUpdate: function () { m.style.clipPath = "inset(0% 0% 0% " + o.p.toFixed(2) + "%)"; } }, wt);
      if (ln) { tl.set(ln, { opacity: 1 }, wt); tl.fromTo(ln, { x: 0 }, { x: P.W, duration: wd, ease: "power2.inOut", immediateRender: false }, wt); tl.set(ln, { opacity: 0 }, wt + wd); }
      var lb = $(".br-label.before", w), la = $(".br-label.after", w);
      if (lb) { tl.fromTo(lb, { opacity: 0, x: -30 }, { opacity: 1, x: 0, duration: 0.25 }, s + 0.1); tl.to(lb, { opacity: 0, duration: 0.15 }, wt); }
      if (la) { tl.fromTo(la, { opacity: 0, scale: 0.7 }, { opacity: 1, scale: 1, duration: 0.3, ease: "back.out(2)" }, wt + wd * 0.6); tl.to(la, { opacity: 0, duration: 0.2 }, e - 0.2); }
      tl.fromTo("#cam-punch", { scale: 1.08 }, { scale: 1, duration: 0.6, ease: "power3.out", immediateRender: false }, wt + wd);
    }
    tl.set(w, { opacity: 0 }, e);
  });

  // ---------- CTA ----------
  var cta = $("#cta");
  if (cta && P.cta) {
    var ci = $(".cta-inner", cta);
    tl.fromTo(ci, { y: 90, scale: 0.7, opacity: 0 }, { y: 0, scale: 1, opacity: 1, duration: 0.32, ease: "back.out(2.2)" }, P.cta.s);
    tl.to($(".cta-arrow", cta), { x: 14, duration: 0.22, yoyo: true, repeat: Math.max(1, Math.floor((P.cta.e - P.cta.s - 0.4) / 0.22)), ease: "sine.inOut" }, P.cta.s + 0.35);
    tl.fromTo($(".cta-dot", cta), { scale: 1 }, { scale: 1.5, duration: 0.25, yoyo: true, repeat: Math.max(1, Math.floor((P.cta.e - P.cta.s) / 0.25) - 1), ease: "sine.inOut" }, P.cta.s);
  }

  // ---------- progress bar ----------
  if ($("#progress-fill")) tl.fromTo("#progress-fill", { scaleX: 0 }, { scaleX: 1, duration: P.D, ease: "none" }, 0);

  tl.set({}, {}, P.D);
  window.__timelines["main"] = tl;
})();
