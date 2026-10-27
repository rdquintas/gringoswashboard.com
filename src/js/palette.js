/* =========================================================
   Paletas de cores alternativas (experimentação)
   Com `?palete_id=<id>` no URL, carrega palettes/<id>.css (gerado pelo build a partir de
   conteudo/paletas.yaml) por cima do style.css e mantém o parâmetro nos links para as outras
   páginas. Sem parâmetro, ou com um id que o build não gerou, fica o tema original.
   ========================================================= */
(function () {
  "use strict";

  // id → versão do CSS (cache busting); preenchido pelo build.
  var PALETAS = /* @paletas */ {};
  var script = document.currentScript;
  var id = (new URLSearchParams(location.search).get("palete_id") || "").toLowerCase();
  if (!script || !Object.prototype.hasOwnProperty.call(PALETAS, id)) return;

  // Ao lado de js/: o caminho vem do próprio script, que nas páginas em en/ já leva ../
  var link = document.createElement("link");
  link.rel = "stylesheet";
  link.setAttribute("blocking", "render");
  link.href = script.src.replace(/js\/palette\.js(\?.*)?$/, "palettes/" + id + ".css?v=" + PALETAS[id]);
  document.head.appendChild(link);

  // Links relativos para páginas do site (ex.: epk.html, ../en/index.html#tour)
  document.addEventListener("DOMContentLoaded", function () {
    document.querySelectorAll("a[href]").forEach(function (a) {
      if (!/^[^:?#]*\.html(#.*)?$/.test(a.getAttribute("href"))) return;
      var url = new URL(a.href);
      url.searchParams.set("palete_id", id);
      a.href = url.href;
    });
  });
})();
