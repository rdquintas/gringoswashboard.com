/* =========================================================
   Gringo's Washboard Band — main script (no dependencies)
   ========================================================= */
(function () {
  "use strict";

  document.documentElement.classList.add("js");
  var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  // Textos criados pelo JS: na língua da página (<html lang>), português por omissão
  var en = document.documentElement.lang === "en";
  function t(pt, enText) { return en ? enText : pt; }

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

  /* ---------- Tour ---------- */
  var tour = document.querySelector(".tour-list");
  if (tour) {
    // O build só pôs os concertos futuros à data do build: tirar os que já passaram desde então
    var hoje = new Date();
    var hojeIso = [hoje.getFullYear(), hoje.getMonth() + 1, hoje.getDate()]
      .map(function (n) { return String(n).padStart(2, "0"); }).join("-");
    tour.querySelectorAll("li[data-date]").forEach(function (li) {
      if (li.dataset.date < hojeIso) li.remove();
    });
    // Toda a linha é clicável: um clique fora dos links segue o link do local
    tour.addEventListener("click", function (e) {
      if (e.target.closest("a, button") || String(window.getSelection())) return;
      var li = e.target.closest("li");
      var venue = li && li.querySelector(".venue");
      if (venue) venue.click();
    });
  }

  /* ---------- "Records on the table": random tilt per cover ---------- */
  document.querySelectorAll(".covers-grid img").forEach(function (img) {
    var r = (Math.random() * 8 - 4).toFixed(1);
    img.style.setProperty("--rot", r + "deg");
  });

  /* ---------- Lightbox: a capa clicada abre em tamanho total; Esc ou clique fora fecha ---------- */
  var coverLinks = document.querySelectorAll(".covers-big a, .covers-grid a");
  if (coverLinks.length && window.HTMLDialogElement) {
    var box = document.createElement("dialog");
    box.className = "lightbox";
    var boxImg = document.createElement("img");
    var boxClose = document.createElement("button");
    boxClose.type = "button";
    boxClose.className = "lightbox-close";
    boxClose.setAttribute("aria-label", t("Fechar", "Close"));
    boxClose.innerHTML = '<i class="fa-solid fa-xmark" aria-hidden="true"></i>';
    box.append(boxImg, boxClose);
    document.body.appendChild(box);

    coverLinks.forEach(function (link) {
      link.addEventListener("click", function (e) {
        e.preventDefault();
        var img = link.querySelector("img");
        boxImg.src = link.href;
        boxImg.alt = img ? img.alt : "";
        box.showModal();
      });
    });
    boxClose.addEventListener("click", function () { box.close(); });
    // Um clique no próprio <dialog> (e não na imagem) é um clique no fundo
    box.addEventListener("click", function (e) { if (e.target === box) box.close(); });
    box.addEventListener("close", function () { boxImg.removeAttribute("src"); });
  }

  /* ---------- YouTube: swap the thumbnail for the player on click ---------- */
  function youtubePlayer(id, title) {
    var iframe = document.createElement("iframe");
    iframe.src = "https://www.youtube-nocookie.com/embed/" + id + "?autoplay=1&rel=0";
    iframe.title = title;
    iframe.allow = "autoplay; encrypted-media; picture-in-picture; fullscreen";
    iframe.allowFullscreen = true;
    iframe.referrerPolicy = "strict-origin-when-cross-origin";
    return iframe;
  }

  // Thumbnail links (a.video-thumb): the link is replaced by the player
  document.querySelectorAll(".video-thumb[data-youtube]").forEach(function (link) {
    link.addEventListener("click", function (e) {
      e.preventDefault();
      var wrap = document.createElement("div");
      wrap.className = "video-thumb video-thumb--playing";
      var iframe = youtubePlayer(link.dataset.youtube, link.getAttribute("aria-label").replace(/^[^:]*: /, ""));
      wrap.appendChild(iframe);
      link.replaceWith(wrap);
      iframe.focus();
    });
  });

  // Embeds (div.embed): the player replaces the still, bar and play button;
  // links with data-play="<embed id>" start it too
  document.querySelectorAll(".embed[data-youtube]").forEach(function (embed) {
    function play(e) {
      if (e) e.preventDefault();
      if (embed.classList.contains("is-playing")) return;
      var iframe = youtubePlayer(embed.dataset.youtube, embed.dataset.title || t("Vídeo do YouTube", "YouTube video"));
      embed.classList.add("is-playing");
      embed.replaceChildren(iframe);
      iframe.focus();
    }
    embed.addEventListener("click", play);
    if (embed.id) {
      document.querySelectorAll('[data-play="' + embed.id + '"]').forEach(function (a) {
        a.addEventListener("click", function (e) {
          play(e);
          embed.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "center" });
        });
      });
    }
  });

  /* ---------- Newsletter (mock) ---------- */
  document.querySelectorAll(".newsletter").forEach(function (form) {
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var msg = form.querySelector(".newsletter-msg");
      var email = form.querySelector('input[type="email"]');
      if (!email.value || !email.checkValidity()) {
        msg.textContent = t("Introduz um e-mail válido.", "Please enter a valid email.");
        email.focus();
        return;
      }
      msg.textContent = t("Obrigado! Já estás na lista. Tem a tábua de lavar à mão.", "Thanks! You're on the list. Keep your washboard handy.");
      form.reset();
    });
  });

  /* ---------- Footer year ---------- */
  document.querySelectorAll("[data-year]").forEach(function (el) { el.textContent = new Date().getFullYear(); });
})();
