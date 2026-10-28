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

  /* ---------- Separadores em parallax: cada faixa do .sep anda a uma velocidade diferente ---------- */
  // Com o separador abaixo do centro do ecrã as faixas descem (juntam-se); acima, sobem (afastam-se).
  var seps = document.querySelectorAll(".sep");
  if (seps.length && !reduceMotion) {
    var SEP_VEL = [22, 12, 4]; // px de deslocamento máximo de cada faixa
    var sepPendente = false;
    var moverSeps = function () {
      sepPendente = false;
      var vh = window.innerHeight;
      seps.forEach(function (sep) {
        var r = sep.getBoundingClientRect();
        if (r.bottom < -100 || r.top > vh + 100) return;
        var p = Math.max(-1, Math.min(1, (r.top + r.height / 2 - vh / 2) / (vh / 2)));
        Array.prototype.forEach.call(sep.children, function (faixa, i) {
          faixa.style.setProperty("--sep-y", (p * (SEP_VEL[i] || 0)).toFixed(1) + "px");
        });
      });
    };
    var pedirSeps = function () {
      if (sepPendente) return;
      sepPendente = true;
      requestAnimationFrame(moverSeps);
    };
    window.addEventListener("scroll", pedirSeps, { passive: true });
    window.addEventListener("resize", pedirSeps);
    moverSeps();
  }

  /* ---------- Logo do header: esconde ao descer, volta ao subir (o CSS só o aplica no mobile) ---------- */
  var logo = document.querySelector(".site-header .logo");
  if (logo) {
    var LOGO_DELTA = 8; // px mínimos de scroll para mudar de estado (evita tremer)
    var ultimoY = window.scrollY;
    var logoPendente = false;
    var atualizarLogo = function () {
      logoPendente = false;
      var y = window.scrollY;
      if (y <= 0) logo.classList.remove("is-escondido");
      else if (Math.abs(y - ultimoY) < LOGO_DELTA) return;
      else logo.classList.toggle("is-escondido", y > ultimoY);
      ultimoY = y;
    };
    window.addEventListener("scroll", function () {
      if (logoPendente) return;
      logoPendente = true;
      requestAnimationFrame(atualizarLogo);
    }, { passive: true });
  }

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

  /* ---------- Lightbox: a capa clicada abre em tamanho total; anterior/seguinte com os botões,
     as setas do teclado ou a deslizar; Esc ou clique fora fecha ---------- */
  var coverLinks = document.querySelectorAll(".covers-grid a");
  if (coverLinks.length && window.HTMLDialogElement) {
    var box = document.createElement("dialog");
    box.className = "lightbox";
    var boxImg = document.createElement("img");
    function boxButton(className, label, icon) {
      var b = document.createElement("button");
      b.type = "button";
      b.className = className;
      b.setAttribute("aria-label", label);
      b.innerHTML = '<i class="fa-solid ' + icon + '" aria-hidden="true"></i>';
      return b;
    }
    var boxClose = boxButton("lightbox-close", t("Fechar", "Close"), "fa-xmark");
    var boxPrev = boxButton("lightbox-nav lightbox-prev", t("Foto anterior", "Previous photo"), "fa-chevron-left");
    var boxNext = boxButton("lightbox-nav lightbox-next", t("Foto seguinte", "Next photo"), "fa-chevron-right");
    boxPrev.hidden = boxNext.hidden = coverLinks.length < 2;
    box.append(boxImg, boxPrev, boxNext, boxClose);
    document.body.appendChild(box);

    // Mostra a foto `i` (dá a volta nas pontas)
    var current = 0;
    function showCover(i) {
      current = (i + coverLinks.length) % coverLinks.length;
      var link = coverLinks[current];
      var img = link.querySelector("img");
      boxImg.src = link.href;
      boxImg.alt = img ? img.alt : "";
    }

    // Capa aberta com o rato: ao fechar, o foco que o <dialog> lhe devolve sai (sem contorno)
    var openedByMouse = null;
    coverLinks.forEach(function (link, i) {
      link.addEventListener("click", function (e) {
        e.preventDefault();
        openedByMouse = e.detail > 0 ? link : null;
        showCover(i);
        box.showModal();
      });
    });
    boxPrev.addEventListener("click", function () { showCover(current - 1); });
    boxNext.addEventListener("click", function () { showCover(current + 1); });
    box.addEventListener("keydown", function (e) {
      if (coverLinks.length < 2) return;
      if (e.key === "ArrowLeft") { e.preventDefault(); showCover(current - 1); }
      if (e.key === "ArrowRight") { e.preventDefault(); showCover(current + 1); }
    });
    // Deslizar na horizontal (ecrãs táteis)
    var touchX = null;
    box.addEventListener("touchstart", function (e) { touchX = e.touches[0].clientX; }, { passive: true });
    box.addEventListener("touchend", function (e) {
      if (touchX === null || coverLinks.length < 2) return;
      var dx = e.changedTouches[0].clientX - touchX;
      touchX = null;
      if (Math.abs(dx) > 50) showCover(current + (dx < 0 ? 1 : -1));
    });
    boxClose.addEventListener("click", function () { box.close(); });
    // Um clique no próprio <dialog> (e não na imagem) é um clique no fundo
    box.addEventListener("click", function (e) { if (e.target === box) box.close(); });
    box.addEventListener("close", function () {
      boxImg.removeAttribute("src");
      if (openedByMouse) openedByMouse.blur();
    });
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

  /* ---------- Newsletter (Brevo) ---------- */
  // O `action` do formulário é o da Brevo (`newsletter_brevo` do site.yaml). Envia como o script
  // da Brevo: POST para `action?isAjax=1`, resposta em JSON ({ success, message, errors }).
  // Sem JS, o formulário é submetido normalmente e a Brevo mostra a página dela.
  // `email_address_check` é o campo-armadilha da Brevo para bots (tem de ir vazio).
  document.querySelectorAll(".newsletter").forEach(function (form) {
    var msg = form.querySelector(".newsletter-msg");
    var email = form.querySelector('input[type="email"]');
    var botao = form.querySelector('[type="submit"]');
    // Mensagens iguais às do formulário criado na Brevo (painéis de sucesso/erro do código dela)
    var emailInvalido = t("O email fornecido é inválido. Por favor corrige e tenta novamente.", "The email you entered is invalid. Please correct it and try again.");
    // tipo: "ok" ou "erro" (painel com ícone, .newsletter-msg--ok/--erro); sem tipo, texto simples
    function mostrar(texto, tipo) {
      msg.textContent = texto;
      msg.classList.toggle("newsletter-msg--ok", tipo === "ok");
      msg.classList.toggle("newsletter-msg--erro", tipo === "erro");
    }
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      if (!email.value || !email.checkValidity()) {
        mostrar(emailInvalido, "erro");
        email.focus();
        return;
      }
      botao.disabled = true;
      mostrar(t("A enviar…", "Sending…"));
      fetch(form.action + "?isAjax=1", { method: "POST", body: new FormData(form) })
        .then(function (r) { return r.json(); })
        .then(function (res) {
          if (res.success) {
            mostrar(t("Subscrição feita com sucesso!", "You're subscribed!"), "ok");
            form.reset();
          } else if (res.errors && res.errors.EMAIL) {
            mostrar(emailInvalido, "erro");
            email.focus();
          } else {
            throw res;
          }
        })
        .catch(function () {
          mostrar(t("Não conseguimos guardar a tua subscrição. Tenta outra vez, por favor.", "We couldn't save your subscription. Please try again."), "erro");
        })
        .then(function () { botao.disabled = false; });
    });
  });

  /* ---------- Cookies + Google Analytics ---------- */
  // O build põe o ID do GA (site.yaml) em <meta name="ga-id">; sem ele não há GA nem aviso.
  // O GA só é carregado depois de o visitante aceitar; a escolha fica no localStorage e pode ser
  // mudada no botão "Preferências de cookies" (footer) ou em [data-cookies] na política de cookies.
  var gaMeta = document.querySelector('meta[name="ga-id"]');
  var gaId = gaMeta && gaMeta.content;
  var CONSENTIMENTO = "cookies-consentimento";
  function lerConsentimento() {
    try { return localStorage.getItem(CONSENTIMENTO); } catch (e) { return null; }
  }
  function guardarConsentimento(valor) {
    try { localStorage.setItem(CONSENTIMENTO, valor); } catch (e) { /* sem storage: pergunta outra vez na próxima página */ }
  }
  var gaCarregado = false;
  function carregarAnalytics() {
    window["ga-disable-" + gaId] = false;
    if (gaCarregado) return;
    gaCarregado = true;
    window.dataLayer = window.dataLayer || [];
    window.gtag = function () { window.dataLayer.push(arguments); };
    window.gtag("js", new Date());
    window.gtag("config", gaId);
    var s = document.createElement("script");
    s.async = true;
    s.src = "https://www.googletagmanager.com/gtag/js?id=" + encodeURIComponent(gaId);
    document.head.appendChild(s);
  }
  // Ao recusar depois de ter aceitado: desliga o GA e apaga os cookies dele (_ga, _ga_*)
  function desligarAnalytics() {
    window["ga-disable-" + gaId] = true;
    var partes = location.hostname.split(".");
    document.cookie.split(";").forEach(function (c) {
      var nome = c.split("=")[0].trim();
      if (!/^_ga(_|$)/.test(nome)) return;
      for (var i = 0; i < partes.length; i++) {
        var dominio = partes.slice(i).join(".");
        document.cookie = nome + "=; Max-Age=0; path=/; domain=" + dominio;
      }
      document.cookie = nome + "=; Max-Age=0; path=/";
    });
  }

  if (gaId) {
    var aviso = document.createElement("div");
    aviso.className = "cookies";
    aviso.setAttribute("role", "region");
    aviso.setAttribute("aria-label", t("Aviso de cookies", "Cookie notice"));
    aviso.hidden = true;
    aviso.innerHTML =
      '<p>' + t(
        'Usamos cookies do Google Analytics para perceber como o site é usado. Só os ativamos se aceitares. <a href="politica-cookies.html">Política de cookies</a>',
        'We use Google Analytics cookies to understand how the site is used. We only turn them on if you accept. <a href="politica-cookies.html">Cookie policy</a>'
      ) + '</p>' +
      '<div class="cookies-botoes">' +
      '<button class="btn btn--black" type="button" data-escolha="recusado">' + t("Recusar", "Decline") + '</button>' +
      '<button class="btn btn--gold" type="button" data-escolha="aceite">' + t("Aceitar", "Accept") + '</button>' +
      '</div>';
    document.body.appendChild(aviso);
    aviso.querySelectorAll("[data-escolha]").forEach(function (botao) {
      botao.addEventListener("click", function () {
        var escolha = botao.dataset.escolha;
        guardarConsentimento(escolha);
        if (escolha === "aceite") carregarAnalytics(); else desligarAnalytics();
        aviso.hidden = true;
      });
    });
    document.querySelectorAll("[data-cookies]").forEach(function (botao) {
      botao.hidden = false;
      botao.addEventListener("click", function () {
        aviso.hidden = false;
        aviso.querySelector('[data-escolha="aceite"]').focus();
      });
    });

    var consentimento = lerConsentimento();
    if (consentimento === "aceite") carregarAnalytics();
    else if (consentimento !== "recusado") aviso.hidden = false;
  }

  /* ---------- Footer year ---------- */
  document.querySelectorAll("[data-year]").forEach(function (el) { el.textContent = new Date().getFullYear(); });
})();
