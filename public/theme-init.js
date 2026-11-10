// Aplica o tema escuro antes da página aparecer (evita "piscar" branco).
// Fica em arquivo separado porque a Content-Security-Policy bloqueia scripts inline.
try {
  var t = localStorage.getItem("theme") || "system";
  var d = t === "dark" || (t === "system" && matchMedia("(prefers-color-scheme: dark)").matches);
  if (d) document.documentElement.classList.add("dark");
} catch (e) {}
