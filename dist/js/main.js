/* =========================================================
   Gringo's Washboard Band — main script (no dependencies)
   ========================================================= */
(function () {
  "use strict";

  document.documentElement.classList.add("js");
  var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ---------- Fullscreen menu ---------- */
  var menu = document.querySelector(".menu");
  var burger = document.querySelector(".burger");
  var closeBtn = document.querySelector(".menu-close");

  function openMenu() {
    if (!menu) return;
    menu.classList.add("is-open");
    menu.setAttribute("aria-hidden", "false");
    burger.setAttribute("aria-expanded", "true");
    document.body.classList.add("menu-open");
    // staggered links
    menu.querySelectorAll("nav li").forEach(function (li, i) {
      li.style.transitionDelay = reduceMotion ? "0ms" : 120 + i * 55 + "ms";
    });
    closeBtn.focus();
  }
  function closeMenu() {
    if (!menu) return;
    menu.classList.remove("is-open");
    menu.setAttribute("aria-hidden", "true");
    burger.setAttribute("aria-expanded", "false");
    document.body.classList.remove("menu-open");
    menu.querySelectorAll("nav li").forEach(function (li) { li.style.transitionDelay = "0ms"; });
  }
  if (burger) burger.addEventListener("click", openMenu);
  if (closeBtn) closeBtn.addEventListener("click", closeMenu);
  if (menu) menu.querySelectorAll("a").forEach(function (a) { a.addEventListener("click", closeMenu); });
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && menu && menu.classList.contains("is-open")) { closeMenu(); burger.focus(); }
  });

  /* ---------- Reveal on scroll (fire-once, 10% offsets) ---------- */
  var reveals = document.querySelectorAll(".reveal");
  if ("IntersectionObserver" in window && !reduceMotion) {
    var revealObs = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-visible");
          revealObs.unobserve(entry.target);
        }
      });
    }, { rootMargin: "-10% 0px -10% 0px", threshold: 0 });
    reveals.forEach(function (el) { revealObs.observe(el); });
  } else {
    reveals.forEach(function (el) { el.classList.add("is-visible"); });
  }

  /* ---------- In-n-out highlights: pulse on enter, tada on exit ---------- */
  var inouts = document.querySelectorAll(".fx-inout");
  if ("IntersectionObserver" in window && !reduceMotion) {
    var seen = new WeakSet();
    var inoutObs = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        var el = entry.target;
        el.classList.remove("fx-pulse", "fx-out");
        void el.offsetWidth; // restart animation
        if (entry.isIntersecting) {
          el.classList.add("fx-pulse");
          seen.add(el);
        } else if (seen.has(el)) {
          el.classList.add("fx-out");
        }
      });
    }, { rootMargin: "-10% 0px -10% 0px", threshold: 0 });
    inouts.forEach(function (el) { inoutObs.observe(el); });
  }

  /* ---------- Tada: let the hover animation finish even if the pointer leaves ---------- */
  document.querySelectorAll(".fx-tada").forEach(function (el) {
    el.addEventListener("mouseenter", function () {
      if (reduceMotion || el.classList.contains("is-tada")) return;
      el.classList.add("is-tada");
    });
    el.addEventListener("animationend", function () { el.classList.remove("is-tada"); });
  });

  /* ---------- Review slider ---------- */
  var slider = document.querySelector(".reviews");
  if (slider) {
    var slides = slider.querySelectorAll(".review");
    var dotsWrap = slider.querySelector(".reviews-dots");
    var current = 0;
    var timer = null;

    slides.forEach(function (_, i) {
      var b = document.createElement("button");
      b.type = "button";
      b.setAttribute("aria-label", "Show review " + (i + 1));
      b.addEventListener("click", function () { go(i); restart(); });
      dotsWrap.appendChild(b);
    });
    var dots = dotsWrap.querySelectorAll("button");

    function go(i) {
      current = (i + slides.length) % slides.length;
      slides.forEach(function (s, n) { s.classList.toggle("is-active", n === current); });
      dots.forEach(function (d, n) { d.classList.toggle("is-active", n === current); });
    }
    function restart() {
      clearInterval(timer);
      if (!reduceMotion) timer = setInterval(function () { go(current + 1); }, 5000);
    }
    slider.querySelector(".reviews-arrow--prev").addEventListener("click", function () { go(current - 1); restart(); });
    slider.querySelector(".reviews-arrow--next").addEventListener("click", function () { go(current + 1); restart(); });
    slider.addEventListener("mouseenter", function () { clearInterval(timer); });
    slider.addEventListener("mouseleave", restart);
    go(0);
    restart();
  }

  /* ---------- Tour: tabs + show all ---------- */
  var tour = document.querySelector(".tour-list");
  if (tour) {
    var VISIBLE = 8;
    var moreBtn = document.querySelector(".tour-more");
    var tabs = document.querySelectorAll(".tour-tabs button");
    var expanded = false;
    var mode = "upcoming";

    function renderTour() {
      var rows = tour.querySelectorAll("li");
      var shown = 0;
      var total = 0;
      rows.forEach(function (li) {
        var match = li.dataset.when === mode;
        if (match) total++;
        var show = match && (expanded || shown < VISIBLE);
        if (show) shown++;
        li.classList.toggle("is-hidden", !show);
        li.classList.toggle("is-past", li.dataset.when === "past");
      });
      if (moreBtn) {
        moreBtn.hidden = total <= VISIBLE;
        moreBtn.textContent = expanded ? "Show fewer dates" : "Show all dates";
      }
    }
    tabs.forEach(function (t) {
      t.addEventListener("click", function () {
        mode = t.dataset.mode;
        expanded = false;
        tabs.forEach(function (x) { x.classList.toggle("is-active", x === t); });
        renderTour();
      });
    });
    if (moreBtn) moreBtn.addEventListener("click", function () { expanded = !expanded; renderTour(); });
    renderTour();
  }

  /* ---------- "Records on the table": random tilt per cover ---------- */
  document.querySelectorAll(".covers-grid img").forEach(function (img) {
    var r = (Math.random() * 8 - 4).toFixed(1);
    img.style.setProperty("--rot", r + "deg");
  });

  /* ---------- Newsletter (mock) ---------- */
  document.querySelectorAll(".newsletter").forEach(function (form) {
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var msg = form.querySelector(".newsletter-msg");
      var email = form.querySelector('input[type="email"]');
      if (!email.value || !email.checkValidity()) {
        msg.textContent = "Please enter a valid email.";
        email.focus();
        return;
      }
      msg.textContent = "Thanks! You're on the list. Keep your washboard handy.";
      form.reset();
    });
  });

  /* ---------- Footer year ---------- */
  document.querySelectorAll("[data-year]").forEach(function (el) { el.textContent = new Date().getFullYear(); });
})();
