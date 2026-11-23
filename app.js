// Python Quest — движок викторины. Данные курса лежат в course.js.
const KEY = "python-quest-v1";
const app = document.getElementById("app");

const KIND = {
  output: "Что выведет код?",
  fill: "Заполни пропуск",
  bug: "Найди ошибку",
  choice: "Выбери ответ",
  order: "Расставь по порядку",
  logic: "Задача на логику",
  trace: "Следи за значением",
};

function loadState() {
  try {
    const s = JSON.parse(localStorage.getItem(KEY));
    if (s && typeof s === "object") return { xp: s.xp || 0, best: s.best || {}, mistakes: s.mistakes || [], tab: s.tab || "bot" };
  } catch (e) {}
  return { xp: 0, best: {}, mistakes: [], tab: "bot" };
}
let state = loadState();
function saveState() {
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) {}
}

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// У каждого вопроса появляется id вида "lists-3" — по нему копим ошибки
const ALL = {};
SECTIONS.forEach((s) => s.blocks.forEach((b) => b.questions.forEach((q, i) => {
  q.id = b.id + "-" + i; q.section = s.id; ALL[q.id] = q;
})));

function home() {
  const section = SECTIONS.find((s) => s.id === state.tab) || SECTIONS[0];
  const mistakes = state.mistakes.filter((id) => ALL[id] && ALL[id].section === section.id);
  app.innerHTML = `
    <header class="top"><h1>Python Quest</h1><div class="xp">⭐ ${state.xp} XP</div></header>
    <div class="tabs">${SECTIONS.map((s) =>
      `<button class="tab${s.id === section.id ? " on" : ""}" data-tab="${s.id}">${esc(s.title)}</button>`).join("")}</div>
    <p class="lead">${esc(section.intro)}</p>
    ${mistakes.length ? `<button class="btn review" id="review">🔁 Повторить ошибки (${mistakes.length})</button>` : ""}
    <div class="blocks">
      ${section.blocks.map((b, i) => {
        const best = state.best[b.id];
        return `<button class="block" data-i="${i}">
          <span class="num">${String(i + 1).padStart(2, "0")}</span>
          <span class="bt"><b>${esc(b.title)}</b><small>${esc(b.intro)}</small></span>
          <span class="score">${best == null ? "" : best + "/" + b.questions.length}</span>
        </button>`;
      }).join("")}
    </div>`;
  app.querySelectorAll(".block").forEach((el) => {
    el.onclick = () => { const b = section.blocks[el.dataset.i]; start(b.questions, b); };
  });
  app.querySelectorAll(".tab").forEach((el) => {
    el.onclick = () => { state.tab = el.dataset.tab; saveState(); home(); };
  });
  const r = document.getElementById("review");
  if (r) r.onclick = () => start(shuffle(mistakes.map((id) => ALL[id])), null);
  window.scrollTo(0, 0);
}

let run;
function start(questions, block) {
  run = { qs: questions.slice(), block, i: 0, score: 0, total: questions.length, retried: new Set() };
  show();
}

function show() {
  const q = run.qs[run.i];
  const pct = Math.round((run.i / run.qs.length) * 100);
  let html = `
    <div class="bar"><i style="width:${pct}%"></i></div>
    <div class="qhead"><button class="link" id="exit" aria-label="Выйти">✕</button><span>${run.i + 1} / ${run.qs.length}</span></div>
    <p class="kind">${KIND[q.type] || KIND.choice}</p>
    <h2>${esc(q.q)}</h2>
    ${q.code ? `<pre><code>${esc(q.code)}</code></pre>` : ""}`;

  if (q.type === "order") {
    html += `<div class="built" id="built"></div><div class="pool" id="pool"></div>
      <button class="btn" id="check" disabled>Проверить</button>`;
  } else {
    const order = shuffle(q.opts.map((_, i) => i));
    html += `<div class="opts">${order.map((i) =>
      `<button class="opt" data-i="${i}">${q.mono ? `<code>${esc(q.opts[i])}</code>` : esc(q.opts[i])}</button>`
    ).join("")}</div>`;
  }
  html += `<div id="fb"></div>`;
  app.innerHTML = html;
  window.scrollTo(0, 0);
  document.getElementById("exit").onclick = home;

  if (q.type === "order") setupOrder(q);
  else {
    app.querySelectorAll(".opt").forEach((btn) => {
      btn.onclick = () => {
        const ok = Number(btn.dataset.i) === q.a;
        app.querySelectorAll(".opt").forEach((b) => {
          b.disabled = true;
          if (Number(b.dataset.i) === q.a) b.classList.add("ok");
        });
        if (!ok) btn.classList.add("bad");
        answer(q, ok);
      };
    });
  }
}

function setupOrder(q) {
  const built = [];
  let pool = shuffle(q.lines.map((_, i) => i));
  const builtEl = document.getElementById("built");
  const poolEl = document.getElementById("pool");
  const check = document.getElementById("check");
  function draw() {
    builtEl.innerHTML = built.map((i, k) => `<button class="chip" data-k="${k}">${esc(q.lines[i])}</button>`).join("")
      || `<p class="muted center" style="margin:12px 0">Нажимай строки снизу по порядку</p>`;
    poolEl.innerHTML = pool.map((i, k) => `<button class="chip" data-k="${k}">${esc(q.lines[i])}</button>`).join("");
    builtEl.querySelectorAll(".chip").forEach((c) => c.onclick = () => { pool.push(built.splice(c.dataset.k, 1)[0]); draw(); });
    poolEl.querySelectorAll(".chip").forEach((c) => c.onclick = () => { built.push(pool.splice(c.dataset.k, 1)[0]); draw(); });
    check.disabled = pool.length > 0;
  }
  draw();
  check.onclick = () => {
    // Сравниваем текст строк, а не номера: одинаковые строки взаимозаменяемы
    const ok = built.every((i, k) => q.lines[i] === q.lines[k]);
    builtEl.classList.add(ok ? "ok" : "bad");
    builtEl.querySelectorAll(".chip").forEach((c) => c.disabled = true);
    check.remove();
    answer(q, ok);
  };
}

function answer(q, ok) {
  const firstTry = !run.retried.has(q.id);
  if (ok) {
    if (firstTry) { run.score++; state.xp += 10; }
    else state.xp += 5;
    if (!run.block) state.mistakes = state.mistakes.filter((id) => id !== q.id); // исправил ошибку в режиме повторения
  } else {
    if (!state.mistakes.includes(q.id)) state.mistakes.push(q.id);
    if (firstTry) { run.retried.add(q.id); run.qs.push(q); } // вопрос вернётся в конце блока
  }
  saveState();

  const fb = document.getElementById("fb");
  fb.innerHTML = `<div class="fb">
      <b class="${ok ? "ok" : "bad"}">${ok ? "✅ Верно!" : "❌ Не совсем." + (firstTry ? " Вопрос вернётся в конце." : "")}</b>
      ${q.type === "order" && !ok ? `<pre><code>${esc(q.lines.join("\n"))}</code></pre>` : ""}
      <p>${esc(q.why)}</p>
    </div>
    <button class="btn" id="next">${run.i + 1 < run.qs.length ? "Дальше" : "Итоги"}</button>`;
  document.getElementById("next").onclick = () => { run.i++; run.i < run.qs.length ? show() : finish(); };
  fb.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

function finish() {
  const b = run.block;
  if (b) {
    const prev = state.best[b.id];
    if (prev == null || run.score > prev) state.best[b.id] = run.score;
    saveState();
  }
  const perfect = run.score === run.total;
  app.innerHTML = `
    <p class="big">${perfect ? "🏆" : "💪"}</p>
    <h2 class="center">${b ? esc(b.title) : "Повторение ошибок"}</h2>
    <p class="center">С первой попытки: <b>${run.score} из ${run.total}</b></p>
    <p class="center muted">${perfect ? "Чисто! Можно идти дальше." : "Ошибки сохранены — повтори их позже с главного экрана."}</p>
    ${b && b.glossary ? `<h2>English of the block</h2>
      <table class="gloss">${b.glossary.map(([en, ru]) => `<tr><td>${esc(en)}</td><td>${esc(ru)}</td></tr>`).join("")}</table>` : ""}
    <button class="btn" id="home">На главную</button>
    ${b ? `<button class="btn ghost" id="again">Пройти ещё раз</button>` : ""}`;
  document.getElementById("home").onclick = home;
  const again = document.getElementById("again");
  if (again) again.onclick = () => start(b.questions, b);
  window.scrollTo(0, 0);
}

home();
