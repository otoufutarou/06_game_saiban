(() => {
  "use strict";
  const DATA_FILE = "%E4%BA%BA%E7%89%A9%E3%83%87%E3%83%BC%E3%82%BF_%E6%9C%80%E7%B5%82%E7%89%88.json";
  const SAVE_KEY = "tengoku-shinsa-v1";
  const GROUPS = [["08", "01", "06"], ["07", "03", "12"], ["11", "02", "05"], ["10", "04", "13"], ["14", "09", "15"]];
  const WELCOME = "死者審査所 人間部門\n報告書審査部 審査課\nへようこそ";
  const TUTORIAL = [
    "トレーナーの ベガ です\nさっそくですがあなたには、\n天国行きの審査を行ってもらいます",
    "次の3人のうちから\n1人 天国行きを選んでください",
    "いきなりすぎる？\n天上界公務員試験を突破したあなたなら\nきっと大丈夫です",
    "それでは早速お願いします！"
  ];
  const RESULT = "想像以上に見込みがあります。\nこのまま最後までやってしまいましょう";
  const DATA_ERROR = "報告書の読み込みに失敗しました。HTTPサーバーで起動し、データファイルを確認してください。";
  const scene = document.querySelector("#scene");
  const game = document.querySelector("#game");
  const transition = document.querySelector("#transition");
  const dialog = document.querySelector("#confirmation");
  const notices = new Set();
  let characters = new Map(), state, saved = null, busy = false, pending = null, returnFocus = null;

  function notice(message) {
    notices.add(message);
    document.querySelector("#notice").textContent = [...notices].join(" ／ ");
  }
  function element(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }
  function button(text, action, className = "") {
    const node = element("button", className, text);
    node.type = "button";
    node.addEventListener("click", () => { if (!busy) action(node); });
    return node;
  }
  function freshState() {
    return { schemaVersion: 1, screen: "tutorial", tutorialStep: 0, review: 0, candidate: 1, scrolls: {}, choices: Array(5).fill(null) };
  }
  function validSave(value) {
    if (!value || value.schemaVersion !== 1 || !["tutorial", "review", "detail", "result", "complete"].includes(value.screen)) return false;
    if (!Number.isInteger(value.review) || value.review < 0 || value.review > 4 ||
        !Number.isInteger(value.candidate) || value.candidate < 0 || value.candidate > 2 ||
        !Number.isInteger(value.tutorialStep) || value.tutorialStep < 0 || value.tutorialStep > 3) return false;
    if (!Array.isArray(value.choices) || value.choices.length !== 5 ||
        !value.choices.every((id, i) => id === null || GROUPS[i].includes(id))) return false;
    const committed = value.screen === "result" || value.screen === "complete";
    if (!value.choices.every((id, i) => (i < value.review || (i === value.review && committed)) ? id !== null : id === null)) return false;
    if (value.screen === "tutorial" && (value.review !== 0 || value.choices.some(Boolean))) return false;
    if (value.screen === "complete" && value.review !== 4) return false;
    if (!value.scrolls || typeof value.scrolls !== "object" || Array.isArray(value.scrolls)) return false;
    return Object.entries(value.scrolls).every(([id, scroll]) => characters.has(id) && Number.isFinite(scroll) && scroll >= 0 && scroll <= 10000000);
  }
  function loadSave() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (raw === null) return;
      const parsed = JSON.parse(raw);
      if (!validSave(parsed)) throw new Error("invalid save");
      saved = parsed;
    } catch {
      saved = null;
      notice("保存データを読み込めません。新しく始められます。");
    }
  }
  function save() {
    saved = structuredClone(state);
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(state)); }
    catch { notice("保存できません。このページを閉じると進行が失われる場合があります。"); }
  }
  function resize() {
    const box = document.querySelector("#viewport").getBoundingClientRect();
    game.style.setProperty("--scale", Math.min(box.width / 864, box.height / 1536));
  }
  window.addEventListener("resize", resize);
  if (window.visualViewport) window.visualViewport.addEventListener("resize", resize);
  resize();

  function change(action) {
    if (busy) return;
    busy = true;
    scene.inert = true;
    transition.replaceChildren();
    for (let row = 0; row < 16; row++) {
      for (let col = 0; col < 9; col++) {
        const tile = element("i", "tile");
        tile.style.left = `${col * 96}px`;
        tile.style.top = `${row * 96}px`;
        tile.style.setProperty("--delay", `${(15 - row) * 4}ms`);
        transition.append(tile);
      }
    }
    transition.classList.add("active");
    window.setTimeout(() => {
      action();
      render();
    }, 350);
    window.setTimeout(() => {
      transition.classList.remove("active");
      transition.replaceChildren();
      busy = false;
      scene.inert = false;
      const target = scene.querySelector("[data-focus], h1, h2, button");
      if (target) { if (!target.matches("button")) target.tabIndex = -1; target.focus({ preventScroll: true }); }
    }, 800);
  }
  function angel() {
    const image = element("img", "angel");
    image.src = "無題34_20261025000459.png";
    image.alt = "";
    scene.append(image);
  }
  function speech(text, action, hint) {
    const node = action ? button("", action, "speech") : element("section", "speech");
    if (!action) node.setAttribute("aria-label", "ベガの案内");
    node.append(element("p", "", text));
    if (hint) node.append(element("small", "", hint));
    scene.append(node);
  }
  function title() {
    const mark = element("header", "title-mark");
    mark.append(element("h1", "", "天国審査"), element("p", "", "死者審査所 人間部門"));
    const menu = element("nav", "menu");
    menu.setAttribute("aria-label", "タイトルメニュー");
    menu.append(button("はじめから", () => {
      if (saved) openConfirmation("保存データを上書きして\nはじめから始めますか？", () => startNew());
      else startNew();
    }));
    const resume = button("つづきから", () => change(() => { state = structuredClone(saved); }));
    resume.disabled = !saved;
    menu.append(resume);
    scene.append(mark, menu);
    angel();
    speech(WELCOME);
  }
  function startNew() {
    change(() => { state = freshState(); save(); });
  }
  function topLine() {
    const top = element("header", "topline");
    top.append(element("h1", "", "報告書審査"), element("p", "", `第 ${state.review + 1} 回 / 全5回`));
    scene.append(top);
  }
  function paper(detail = false) {
    const person = characters.get(GROUPS[state.review][state.candidate]);
    const outer = element("article", "paper");
    const image = element("img", "paper-frame");
    image.src = "frame_20261025123011.png";
    image.alt = "";
    const content = element("div", "paper-content");
    content.tabIndex = 0;
    content.setAttribute("aria-label", `${person.name}の基本情報`);
    content.append(element("h2", "", person.name), element("p", "id", `ID ${person.id}`));
    content.append(element("h3", "", "基本情報"), element("p", "", person.basicInfo));
    content.append(element("h3", "", "死因"), element("p", "", person.causeOfDeath));
    content.append(element("h3", "", "家族構成"), element("p", "", person.family.join("\n")));
    if (detail) {
      content.setAttribute("aria-label", `${person.name}の報告書全文`);
      for (const section of person.sections) content.append(element("h3", "", section.label), element("p", "", section.text));
      content.addEventListener("scroll", () => {
        state.scrolls[person.id] = content.scrollTop;
        save();
      }, { passive: true });
      requestAnimationFrame(() => { content.scrollTop = state.scrolls[person.id] || 0; });
    }
    outer.append(image, content);
    if (!detail) outer.append(button("詳しい報告書を読む", () => change(() => { state.screen = "detail"; save(); }), "detail-button"));
    scene.append(outer);
  }
  function select(index) {
    if (index === state.candidate) return;
    change(() => { state.candidate = index; save(); });
  }
  function review() {
    topLine();
    paper();
    for (const [offset, side, label] of [[-1, "left", "前の候補者"], [1, "right", "次の候補者"]]) {
      const index = (state.candidate + offset + 3) % 3;
      const person = characters.get(GROUPS[state.review][index]);
      const mini = button(person.name, () => select(index), `mini ${side}`);
      mini.setAttribute("aria-label", `${label} ${person.name}の報告書`);
      scene.append(mini);
      const arrow = button(side === "left" ? "←" : "→", () => select(index), `arrow ${side}`);
      arrow.setAttribute("aria-label", label);
      scene.append(arrow);
    }
    const choices = element("section", "choices");
    choices.append(element("h2", "", "天国に送る人を1人選んでください"));
    const row = element("div", "choice-row");
    GROUPS[state.review].forEach((id, index) => {
      const person = characters.get(id);
      const choose = button(person.name, () => {
        state.candidate = index;
        save();
        render();
        const replacement = scene.querySelectorAll(".choice-row button")[index];
        openConfirmation(`${person.name}を天国に送りますか？`, () => commit(id), replacement);
      });
      choose.setAttribute("aria-current", String(index === state.candidate));
      choose.setAttribute("aria-label", `${person.name}を天国に送る`);
      row.append(choose);
    });
    choices.append(row);
    scene.append(choices);
    angel();
    speech("報告書を読み、\n天国に送る人を1人選んでください。");
  }
  function openConfirmation(text, action, focus) {
    if (dialog.open || busy) return;
    returnFocus = focus || document.activeElement;
    pending = action;
    document.querySelector("#confirmation-title").textContent = text;
    dialog.showModal();
    document.querySelector("#confirm-no").focus();
  }
  function closeConfirmation() {
    pending = null;
    dialog.close();
    if (returnFocus?.isConnected) returnFocus.focus({ preventScroll: true });
    returnFocus = null;
  }
  document.querySelector("#confirm-no").addEventListener("click", closeConfirmation);
  dialog.addEventListener("cancel", event => { event.preventDefault(); closeConfirmation(); });
  document.querySelector("#confirm-yes").addEventListener("click", () => {
    if (!pending || busy) return;
    const action = pending;
    closeConfirmation();
    action();
  });
  function commit(id) {
    if (busy || state.screen !== "review" || state.choices[state.review] !== null || !GROUPS[state.review].includes(id)) return;
    state.choices[state.review] = id;
    state.screen = "result";
    save();
    change(() => {});
  }
  function result() {
    topLine();
    const panel = element("section", "result-panel");
    panel.append(element("h2", "", "審査結果"));
    const chosen = state.choices[state.review];
    const heaven = element("p", "destination");
    heaven.append(element("strong", "", "天国"), element("span", "", characters.get(chosen).name));
    const hell = element("div", "destination hell");
    hell.append(element("strong", "", "地獄"));
    for (const id of GROUPS[state.review].filter(id => id !== chosen)) hell.append(element("p", "", characters.get(id).name));
    panel.append(heaven, hell);
    scene.append(panel);
    scene.append(button(state.review === 4 ? "審判を終える" : "次の審査へ進む", () => change(() => {
      if (state.review === 4) state.screen = "complete";
      else { state.review++; state.candidate = 1; state.screen = "review"; }
      save();
    }), "proceed"));
    angel();
    speech(RESULT);
  }
  function render() {
    scene.replaceChildren();
    scene.className = state?.screen || "title";
    if (!state) { title(); return; }
    switch (state.screen) {
      case "tutorial":
        angel();
        speech(TUTORIAL[state.tutorialStep], () => change(() => {
          if (state.tutorialStep < 3) state.tutorialStep++;
          else state.screen = "review";
          save();
        }), "タップ / Enter で次へ ▼");
        break;
      case "review": review(); break;
      case "detail":
        topLine();
        paper(true);
        scene.append(button("報告書を閉じる", () => change(() => { state.screen = "review"; save(); }), "close-detail"));
        angel();
        speech("報告書は上下にスクロールできます。");
        break;
      case "result": result(); break;
      case "complete":
        scene.append(element("h1", "complete-message", "全5回の審判が終了しました"));
        break;
    }
  }
  function validData(data) {
    const string = value => typeof value === "string" && value.length > 0;
    return data?.schemaVersion === 1 && Array.isArray(data.characters) && data.characters.length === 15 &&
      new Set(data.characters.map(person => person.id)).size === 15 &&
      data.characters.every(person => GROUPS.flat().includes(person.id) && string(person.name) && string(person.basicInfo) &&
        string(person.causeOfDeath) && Array.isArray(person.family) && person.family.every(string) &&
        Array.isArray(person.sections) && person.sections.every(section => string(section.label) && string(section.text)));
  }
  async function checkFont(data) {
    try {
      await document.fonts.load('28px "KH Dot Kabutochou 16"');
      if (!document.fonts.check('28px "KH Dot Kabutochou 16"')) throw new Error("font unavailable");
      const response = await fetch("fonts/KH-Dot-Kabutochou-16.ttf");
      if (!response.ok) throw new Error("font unavailable");
      const view = new DataView(await response.arrayBuffer());
      let cmap;
      for (let i = 0; i < view.getUint16(4); i++) {
        const pos = 12 + i * 16;
        if (view.getUint32(pos) === 0x636d6170) cmap = view.getUint32(pos + 8);
      }
      if (cmap === undefined) throw new Error("missing cmap");
      const tables = [];
      for (let i = 0; i < view.getUint16(cmap + 2); i++) {
        const offset = cmap + view.getUint32(cmap + 8 + i * 8);
        const format = view.getUint16(offset);
        if (format === 4 || format === 12) tables.push([format, offset]);
      }
      const hasGlyph = code => tables.some(([format, start]) => {
        if (format === 12) {
          for (let i = 0; i < view.getUint32(start + 12); i++) {
            const p = start + 16 + i * 12;
            if (code >= view.getUint32(p) && code <= view.getUint32(p + 4)) return view.getUint32(p + 8) + code - view.getUint32(p) !== 0;
          }
          return false;
        }
        const count = view.getUint16(start + 6) / 2;
        for (let i = 0; i < count; i++) {
          const end = view.getUint16(start + 14 + i * 2);
          const begin = view.getUint16(start + 16 + count * 2 + i * 2);
          if (code < begin || code > end) continue;
          const delta = view.getInt16(start + 16 + count * 4 + i * 2);
          const rangePos = start + 16 + count * 6 + i * 2;
          const range = view.getUint16(rangePos);
          if (!range) return ((code + delta) & 65535) !== 0;
          const glyph = view.getUint16(rangePos + range + (code - begin) * 2);
          return glyph !== 0 && ((glyph + delta) & 65535) !== 0;
        }
        return false;
      });
      const text = JSON.stringify(data) + WELCOME + TUTORIAL.join("") + RESULT +
        "天国審査死者審査所人間部門はじめからつづき第回全報告書基本情報死因家族構成詳しい読む閉じる天国地獄審査結果次の進む審判を終える終了しました保存データ上書き始めますか送はい考え直すタップ上下スクロールできます選んでください ID0123456789/←→▼？";
      const missing = [...new Set([...text].filter(char => !/\s/.test(char) && !hasGlyph(char.codePointAt(0))))];
      if (missing.length) notice(`指定フォントに未収録の文字は端末フォントで表示します：${missing.join("")}`);
    } catch { notice("指定フォントを読み込めません。端末フォントで表示しています。"); }
  }
  async function initialize() {
    scene.replaceChildren(element("p", "loading", "報告書を読み込んでいます…"));
    try {
      const response = await fetch(encodeURIComponent(DATA_FILE));
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      if (!validData(data)) throw new Error("invalid character data");
      characters = new Map(data.characters.map(person => [person.id, person]));
      notices.delete(DATA_ERROR);
      document.querySelector("#notice").textContent = [...notices].join(" ／ ");
      loadSave();
      render();
      checkFont(data);
    } catch {
      scene.replaceChildren(button("報告書を読み込めませんでした。\nもう一度読み込む", initialize, "loading"));
      notice(DATA_ERROR);
    }
  }
  initialize();
})();
