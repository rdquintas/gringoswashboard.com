/* =========================================================
   Paletas de cores alternativas (experimentação)
   Com `?palete_id=<id>` no URL, carrega palettes/<id>.css (gerado pelo build a partir de
   conteudo/paletas.yaml) por cima do style.css e mantém o parâmetro nos links para as outras
   páginas. Sem parâmetro, ou com um id que o build não gerou, fica o tema original.
   ========================================================= */
(function () {
  "use strict";

  // id → versão do CSS (cache busting); preenchido pelo build.
  var PALETAS = {"ff6082ffe4f6b26cff705eff":"824e982dd3","4f7d32ffd16af5b52ed9361e":"f0260565b9","d90000ffea938db355000000":"de1f1c2f67","fe7743efeeea273f4f000000":"5c584ebc01","000000830000bc0202ff0000":"35b7fb6ed6","0c0c0c481e149b3922f2613f":"b4281e9fcd","430a5d5f374b8c6a5deee4b1":"e0a431b27c","09251ca55704f3d2aff8eadc":"d1f84b99a8","fef3e2f4ae52d4621a2a1a0e":"e811cc0c6e","236d8c000000ff6600e0ddcf":"e696f58f16"};
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
