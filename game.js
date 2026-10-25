(() => {
  "use strict";
  const DATA_FILE = "%E4%BA%BA%E7%89%A9%E3%83%87%E3%83%BC%E3%82%BF_%E6%9C%80%E7%B5%82%E7%89%88.json";
  const SAVE_KEY = "tengoku-shinsa-v1";
  const GROUPS = [["08", "01", "06"], ["07", "03", "12"], ["11", "02", "05"], ["10", "04", "13"], ["14", "09", "15"]];
  const WELCOME = "死者審査所 人間部門\n報告書審査部 審査課\nへようこそ";
  const TYPEWRITER_INTERVAL_MS = 50;
  const FIRST_RESULT_DIALOGUE = "想像以上に見込みがあります。\nこのまま最後までやってしまいましょう";
  const RANDOM_RESULT_DIALOGUES = [
    "ガンガン行きましょう",
    "新人さんは有能ですね",
    "仕事って面倒ですよねえ",
    "私は155年間この仕事をしているんです…"
  ];
  const TUTORIAL = [
    "トレーナーの ベガ です\nさっそくですがあなたには、\n天国行きの審査を行ってもらいます",
    "次の3人のうちから\n1人 天国行きを選んでください",
    "いきなりすぎる？\n天上界公務員試験を突破したあなたなら\nきっと大丈夫です",
    "それでは早速お願いします！"
  ];
  const DATA_ERROR = "報告書の読み込みに失敗しました。HTTPサーバーで起動し、データファイルを確認してください。";
  const scene = document.querySelector("#scene");
  const game = document.querySelector("#game");
  const dialog = document.querySelector("#confirmation");
  const transitionDuration = window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 100;
  const notices = new Set();
  let characters = new Map(), state, saved = null, busy = false, pending = null, returnFocus = null, scrollSaveFrame = null;
  let dialogue = null;

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
    return { schemaVersion: 1, screen: "tutorial", tutorialStep: 0, review: 0, candidate: 1, scrolls: {}, choices: Array(5).fill(null), resultDialogues: Array(5).fill(null) };
  }
  function resultDialogueFor(review, previous) {
    if (review === 0) return FIRST_RESULT_DIALOGUE;
    const choices = RANDOM_RESULT_DIALOGUES.filter(dialogue => dialogue !== previous);
    return choices[Math.floor(Math.random() * choices.length)];
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
    if (value.resultDialogues !== undefined &&
        (!Array.isArray(value.resultDialogues) || value.resultDialogues.length !== 5 ||
         !value.resultDialogues.every((line, i) => {
           const completed = i < value.review || (i === value.review && committed);
           const validLine = line === null || line === FIRST_RESULT_DIALOGUE || RANDOM_RESULT_DIALOGUES.includes(line);
           return validLine && (completed ? line !== null : line === null);
         }))) return false;
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
      if (parsed.screen === "detail") parsed.screen = "review";
      if (!Array.isArray(parsed.resultDialogues)) parsed.resultDialogues = Array(5).fill(null);
      let migrated = false;
      for (let i = 0; i < 5; i++) {
        const completed = i < parsed.review || ((parsed.screen === "result" || parsed.screen === "complete") && i === parsed.review);
        if (completed && parsed.resultDialogues[i] === null) {
          parsed.resultDialogues[i] = resultDialogueFor(i, parsed.resultDialogues[i - 1]);
          migrated = true;
        }
      }
      if (migrated) {
        try { localStorage.setItem(SAVE_KEY, JSON.stringify(parsed)); } catch { /* Existing progress remains usable in memory. */ }
      }
      saved = parsed;
    } catch {
      saved = null;
      notice("保存データを読み込めません。新しく始められます。");
    }
  }
  function save() {
    if (scrollSaveFrame !== null) cancelAnimationFrame(scrollSaveFrame);
    scrollSaveFrame = null;
    saved = structuredClone(state);
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(state)); }
    catch { notice("保存できません。このページを閉じると進行が失われる場合があります。"); }
  }
  function scheduleScrollSave() {
    if (scrollSaveFrame !== null) return;
    scrollSaveFrame = requestAnimationFrame(() => { scrollSaveFrame = null; save(); });
  }
  function flushScrollSave() {
    if (scrollSaveFrame !== null) save();
  }
  window.addEventListener("pagehide", flushScrollSave);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") flushScrollSave();
  });
  function resize() {
    const box = document.querySelector("#viewport").getBoundingClientRect();
    const scale = box.width / 864;
    const verticalCrop = Math.max(0, 1536 - box.height / scale);
    const verticalOffset = Math.max(0, (box.height - 1536 * scale) / 2);
    document.documentElement.style.setProperty("--scale", scale);
    document.documentElement.style.setProperty("--vertical-crop", `${verticalCrop}px`);
    document.documentElement.style.setProperty("--vertical-offset", `${verticalOffset}px`);
  }
  window.addEventListener("resize", resize);
  if (window.visualViewport) window.visualViewport.addEventListener("resize", resize);
  resize();

  function change(action) {
    if (busy) return;
    busy = true;
    scene.inert = true;
    if (transitionDuration) scene.classList.add("fading");
    window.setTimeout(() => {
      action();
      render();
      scene.classList.remove("fading");
      window.setTimeout(() => {
        busy = false;
        scene.inert = false;
        const target = scene.querySelector("[data-focus], h1, h2, button");
        if (target) { if (!target.matches("button")) target.tabIndex = -1; target.focus({ preventScroll: true }); }
      }, transitionDuration);
    }, transitionDuration);
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
    titleMark();
    const menu = element("nav", "menu");
    menu.setAttribute("aria-label", "タイトルメニュー");
    const start = button("はじめから", () => {
      if (saved) openConfirmation("保存データを上書きして\nはじめから始めますか？", () => startNew());
      else startNew();
    }, "menu-start");
    start.setAttribute("aria-label", "▶ はじめから");
    menu.append(start);
    const resume = button("つづきから", () => change(() => { state = structuredClone(saved); }));
    resume.disabled = !saved;
    menu.append(resume);
    scene.append(menu);
    speech(WELCOME);
  }
  function titleMark() {
    const mark = element("header", "title-mark");
    mark.append(element("h1", "", "天国審査"), element("p", "", "死者審査所 人間部門"));
    scene.append(mark);
  }
  function startNew() {
    state = freshState();
    save();
    render();
  }
  function stopDialogueTyping() {
    if (dialogue && dialogue.timer !== null) window.clearInterval(dialogue.timer);
    if (dialogue) dialogue.timer = null;
  }
  function typeDialogueLine() {
    stopDialogueTyping();
    dialogue.text = dialogue.lines[dialogue.line];
    dialogue.segments = typeof Intl.Segmenter === "function"
      ? [...new Intl.Segmenter("ja", { granularity: "grapheme" }).segment(dialogue.text)].map(part => part.segment)
      : Array.from(dialogue.text);
    dialogue.index = 0;
    dialogue.content.textContent = "";
    const writeNext = () => {
      dialogue.index++;
      dialogue.content.textContent = dialogue.segments.slice(0, dialogue.index).join("");
      if (dialogue.index >= dialogue.segments.length) stopDialogueTyping();
    };
    if (dialogue.segments.length) {
      writeNext();
      if (dialogue.index < dialogue.segments.length) dialogue.timer = window.setInterval(writeNext, TYPEWRITER_INTERVAL_MS);
    }
  }
  function startDialogue(lines, line, content, onAdvance, onComplete) {
    stopDialogueTyping();
    dialogue = { lines, line, content, onAdvance, onComplete, timer: null };
    typeDialogueLine();
  }
  function advanceDialogue() {
    if (!dialogue || busy || dialog.open) return;
    if (dialogue.index < dialogue.segments.length) {
      stopDialogueTyping();
      dialogue.index = dialogue.segments.length;
      dialogue.content.textContent = dialogue.text;
      return;
    }
    if (dialogue.line < dialogue.lines.length - 1) {
      dialogue.line++;
      dialogue.onAdvance(dialogue.line);
      typeDialogueLine();
      return;
    }
    const onComplete = dialogue.onComplete;
    stopDialogueTyping();
    dialogue = null;
    onComplete();
  }
  document.querySelector("#viewport").addEventListener("click", event => {
    if (!dialogue || busy || dialog.open) return;
    event.preventDefault();
    event.stopPropagation();
    advanceDialogue();
  }, { capture: true });
  function topLine() {
    const top = element("header", "topline");
    const counter = element("p", "review-counter");
    counter.setAttribute("aria-label", `審査回数 ${state.review + 1}/5`);
    const plate = element("img");
    plate.src = "無題42_20261025183115.png";
    plate.alt = "";
    counter.append(plate, element("span", "", `${state.review + 1}/5`));
    top.append(element("h1", "", "報告書審査"), counter);
    scene.append(top);
  }
  function capturePaperScroll() {
    const content = scene.querySelector(".paper-content");
    if (state?.screen === "review" && content?.dataset.restored === "true") {
      state.scrolls[GROUPS[state.review][state.candidate]] = content.scrollTop;
    }
  }
  function paper() {
    const person = characters.get(GROUPS[state.review][state.candidate]);
    const outer = element("article", "paper");
    const image = element("img", "paper-frame");
    image.src = "frame_20261025170920.png";
    image.alt = "";
    const viewport = element("div", "report-viewport");
    const content = element("div", "paper-content");
    content.tabIndex = 0;
    content.setAttribute("aria-label", `${person.name}の報告書全文`);
    content.append(element("h2", "", person.name), element("p", "id", `ID ${person.id}`));
    content.append(element("h3", "", "基本情報"), element("p", "", person.basicInfo));
    content.append(element("h3", "", "死因"), element("p", "", person.causeOfDeath));
    content.append(element("h3", "", "家族構成"), element("p", "", person.family.join("\n")));
    for (const section of person.sections) content.append(element("h3", "", section.label), element("p", "", section.text));
    content.addEventListener("scroll", () => {
      if (content.dataset.restored !== "true") return;
      state.scrolls[person.id] = content.scrollTop;
      scheduleScrollSave();
    }, { passive: true });
    requestAnimationFrame(() => {
      content.scrollTop = state.scrolls[person.id] || 0;
      requestAnimationFrame(() => { content.dataset.restored = "true"; });
    });
    viewport.append(content);
    outer.append(image, viewport);
    return outer;
  }
  function candidateCards() {
    const cards = [];
    for (const [offset, side, label] of [[-1, "left", "前の候補者"], [1, "right", "次の候補者"]]) {
      const index = (state.candidate + offset + 3) % 3;
      const person = characters.get(GROUPS[state.review][index]);
      const mini = button("", () => select(index), `mini ${side}`);
      const copy = element("span", "mini-copy");
      copy.append(element("small", "", `ID ${person.id}`), element("span", "", person.name), element("span", "mini-info", person.basicInfo));
      mini.append(copy);
      mini.setAttribute("aria-label", `${label} ${person.name}の報告書`);
      cards.push(mini, button(side === "left" ? "◀︎" : "▶︎", () => select(index), `arrow ${side}`));
      cards[cards.length - 1].setAttribute("aria-label", label);
    }
    return cards;
  }
  function reviewContent() {
    const content = element("div", "review-content");
    content.append(paper(), ...candidateCards());
    return content;
  }
  function select(index) {
    if (index === state.candidate) return;
    capturePaperScroll();
    if (scrollSaveFrame !== null) cancelAnimationFrame(scrollSaveFrame);
    scrollSaveFrame = null;
    state.candidate = index;
    save();
    scene.querySelector(".review-content").replaceWith(reviewContent());
    scene.querySelectorAll(".choice-row button").forEach((choice, choiceIndex) => {
      choice.setAttribute("aria-current", String(choiceIndex === index));
    });
  }
  function review() {
    topLine();
    scene.append(reviewContent());
    const choices = element("section", "choices");
    choices.append(element("h2", "", "天国に送る人を1人選んでください"));
    const row = element("div", "choice-row");
    GROUPS[state.review].forEach((id, index) => {
      const person = characters.get(id);
      const choose = button(person.name, () => {
        select(index);
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
  document.querySelector("#confirm-yes").setAttribute("aria-label", "▶ はい");
  document.querySelector("#confirm-yes").addEventListener("click", () => {
    if (!pending || busy) return;
    const action = pending;
    closeConfirmation();
    action();
  });
  function commit(id) {
    if (busy || state.screen !== "review" || state.choices[state.review] !== null || !GROUPS[state.review].includes(id)) return;
    capturePaperScroll();
    state.choices[state.review] = id;
    state.resultDialogues[state.review] = resultDialogueFor(state.review, state.resultDialogues[state.review - 1]);
    state.screen = "result";
    save();
    change(() => {});
  }
  function result() {
    const panel = element("section", "result-panel");
    panel.append(element("h2", "", `第${state.review + 1}回 審査結果`));
    const chosen = state.choices[state.review];
    panel.append(element("p", "destination", `${characters.get(chosen).name}を天国に送りました`));
    const hell = element("div", "destination hell");
    hell.append(element("strong", "", "地獄"));
    for (const id of GROUPS[state.review].filter(id => id !== chosen)) hell.append(element("p", "", characters.get(id).name));
    panel.append(hell);
    const proceed = button(state.review === 4 ? "審判を終える" : "次の審査へ進む", () => change(() => {
      if (state.review === 4) state.screen = "complete";
      else { state.review++; state.candidate = 1; state.screen = "review"; }
      save();
    }), "proceed");
    proceed.setAttribute("aria-label", `▶ ${state.review === 4 ? "審判を終える" : "次の審査へ進む"}`);
    panel.append(proceed);
    scene.append(element("p", "result-dialogue", state.resultDialogues[state.review]));
    scene.append(panel);
  }
  function render() {
    stopDialogueTyping();
    dialogue = null;
    const fading = scene.classList.contains("fading");
    scene.replaceChildren();
    scene.className = state?.screen || "title";
    if (fading) scene.classList.add("fading");
    if (!state) { title(); return; }
    switch (state.screen) {
      case "tutorial":
        titleMark();
        const tutorialSpeech = button("", advanceDialogue, "speech");
        const tutorialContent = element("p");
        tutorialSpeech.append(tutorialContent, element("small", "", "タップ / Enter で次へ ▼"));
        scene.append(tutorialSpeech);
        startDialogue(TUTORIAL, state.tutorialStep, tutorialContent, line => {
          state.tutorialStep = line;
          save();
        }, () => change(() => {
          state.screen = "review";
          save();
        }));
        break;
      case "review": review(); break;
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
    for (const message of notices) {
      if (message.startsWith("指定フォント")) notices.delete(message);
    }
    document.querySelector("#notice").textContent = [...notices].join(" ／ ");
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
      const text = JSON.stringify(data) + WELCOME + TUTORIAL.join("") + FIRST_RESULT_DIALOGUE + RANDOM_RESULT_DIALOGUES.join("") +
        "天国審査死者審査所人間部門はじめからつづき第回全報告書基本情報死因家族構成天国地獄審査結果次の進む審判を終える終了しました保存データ上書き始めますか送はい考え直す上下にスクロールできます選んでください ID0123456789/←→▼？";
      const missing = [...new Set([...text].filter(char => !/\s/.test(char) && !hasGlyph(char.codePointAt(0))))];
      if (missing.length) {
        const sample = missing.slice(0, 20).join("") + (missing.length > 20 ? ` ほか${missing.length - 20}文字` : "");
        notice(`指定フォントに未収録の文字があります。ゲームを開始できません：${sample}`);
        return false;
      }
      return true;
    } catch {
      notice("指定フォントを読み込めません。代替フォントには切り替えず、ゲームの開始を停止しています。");
      return false;
    }
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
      if (!await checkFont(data)) {
        scene.replaceChildren(button("指定フォントを確認できませんでした。\n再読み込みして確認する", () => window.location.reload(), "loading"));
        return;
      }
      loadSave();
      render();
    } catch {
      scene.replaceChildren(button("報告書を読み込めませんでした。\nもう一度読み込む", initialize, "loading"));
      notice(DATA_ERROR);
    }
  }
  initialize();
})();
