import { BATTLES } from "./battles.js";
import {
  clamp,
  createEffects,
  drawBattle,
  ensureBake,
  resetEffects,
  sampleBattle,
  stepEffects,
  validateBattles,
} from "./engine.js";

validateBattles(BATTLES);

const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const app = document.querySelector("#app");

const state = {
  mode: "menu",
  preview: 0,
  battle: BATTLES[0],
  time: 0,
  playing: false,
  speed: 1,
  ambient: 0,
  last: 0,
  phaseShown: -1,
  scrubbing: false,
  fx: createEffects(),
};

const canvas = document.createElement("canvas");
const ctx = canvas.getContext("2d");

const menu = document.createElement("div");
menu.className = "menu";
const preview = document.createElement("div");
preview.className = "preview";
const stage = document.createElement("div");
stage.className = "stage";
const caption = document.createElement("div");
caption.className = "caption";
preview.append(caption);

const hud = document.createElement("div");
hud.className = "hud";
const bubble = document.createElement("section");
bubble.className = "bubble";
bubble.setAttribute("aria-live", "polite");
const kickerRow = document.createElement("div");
kickerRow.className = "kicker-row";
const kicker = document.createElement("p");
kicker.className = "kicker";
const count = document.createElement("p");
count.className = "count";
kickerRow.append(kicker, count);
const progress = document.createElement("div");
progress.className = "phase-progress";
progress.setAttribute("aria-hidden", "true");
const progressFill = document.createElement("span");
progress.append(progressFill);
const bubbleTitle = document.createElement("h2");
const bubbleBody = document.createElement("p");
bubbleBody.className = "bubble-copy";
bubble.append(kickerRow, progress, bubbleTitle, bubbleBody);

const top = document.createElement("div");
top.className = "top-actions";
const backBtn = document.createElement("button");
backBtn.type = "button";
backBtn.textContent = "All battles";
top.append(backBtn);

const bar = document.createElement("div");
bar.className = "bar";
const playBtn = document.createElement("button");
playBtn.type = "button";
const speedBtn = document.createElement("button");
speedBtn.type = "button";
speedBtn.textContent = "1×";
speedBtn.setAttribute("aria-label", "Playback speed");
const timeEl = document.createElement("div");
timeEl.className = "time";
const phaseName = document.createElement("div");
phaseName.className = "phase-name";
const rail = document.createElement("div");
rail.className = "rail";
const ticks = document.createElement("div");
ticks.className = "ticks";
const range = document.createElement("input");
range.type = "range";
range.min = "0";
range.step = "0.1";
range.value = "0";
range.setAttribute("aria-label", "Battle time");
rail.append(ticks, range);
const legend = document.createElement("div");
legend.className = "legend";
bar.append(playBtn, speedBtn, timeEl, phaseName, rail, legend);
hud.append(bubble, top, bar);

const list = document.createElement("div");
list.className = "list";
list.setAttribute("role", "listbox");
list.setAttribute("aria-label", "Battles");

const buttons = BATTLES.map((battle, index) => {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "battle-btn";
  button.setAttribute("role", "option");
  button.dataset.index = String(index);
  const year = document.createElement("span");
  year.className = "year";
  year.textContent = battle.year;
  const name = document.createElement("span");
  name.className = "bname";
  name.textContent = battle.short;
  const match = document.createElement("span");
  match.className = "match";
  match.textContent = battle.sides.map((s) => s.name).join("   ·   ");
  button.append(year, name, match);
  button.addEventListener("pointerenter", () => {
    if (state.mode === "menu") setPreview(index);
  });
  button.addEventListener("focus", () => {
    if (state.mode === "menu") setPreview(index);
  });
  button.addEventListener("click", () => {
    location.hash = battle.id;
  });
  list.append(button);
  return button;
});

menu.append(
  el("p", "eyebrow", "Subject 2"),
  el("h1", null, "Seven battles"),
  el(
    "p",
    "lede",
    "Choose a field. The ground stays in view, and a dispatch in the corner keeps the story with the movement. Each one runs about a minute and a half, and each one is a sketch of the decisive ground, not a roll of every unit.",
  ),
  list,
  el("p", "hint", "Keys 1–7 start a battle. Arrows move through the list. Enter plays. Space pauses."),
);

app.append(menu, preview, stage, hud);
preview.append(canvas);

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
}

function setPreview(index) {
  state.preview = index;
  state.battle = BATTLES[index];
  buttons.forEach((button, i) => {
    const on = i === index;
    button.classList.toggle("is-active", on);
    button.setAttribute("aria-selected", on ? "true" : "false");
  });
  const battle = BATTLES[index];
  caption.replaceChildren();
  caption.append(el("p", "cap-kicker", battle.when));
  caption.append(el("h2", null, battle.name));
  caption.append(el("p", "cap-where", battle.where));
  battle.leaders.forEach((name, i) => {
    const row = document.createElement("p");
    row.className = "cap-leader";
    const pip = document.createElement("i");
    pip.className = "pip";
    pip.style.background = battle.sides[i]?.color || "#ccc";
    row.append(pip, document.createTextNode(name));
    caption.append(row);
  });
  caption.append(el("p", "cap-blurb", battle.blurb));
  buttons[index].scrollIntoView({ block: "nearest" });
}

function fmt(t) {
  const s = Math.max(0, Math.floor(t));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

function applyMode() {
  const battleMode = state.mode === "battle";
  app.classList.toggle("is-battle", battleMode);
  const parent = battleMode ? stage : preview;
  if (canvas.parentElement !== parent) parent.append(canvas);
  resize();
}

function resize() {
  const parent = canvas.parentElement;
  const rect = parent.getBoundingClientRect();
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  canvas.style.width = `${rect.width}px`;
  canvas.style.height = `${rect.height}px`;
  canvas.width = Math.max(1, Math.round(rect.width * dpr));
  canvas.height = Math.max(1, Math.round(rect.height * dpr));
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  state.view = { w: rect.width, h: rect.height };
}

function openMenu() {
  state.mode = "menu";
  state.playing = false;
  const idx = Math.max(0, BATTLES.findIndex((b) => b.id === state.battle?.id));
  setPreview(idx);
  applyMode();
  document.title = "Subject 2 — Seven Battles";
}

function openBattle(battle, fromQuery) {
  state.mode = "battle";
  state.battle = battle;
  state.preview = BATTLES.indexOf(battle);
  state.time = 0;
  state.playing = !reduce;
  state.speed = 1;
  state.phaseShown = -1;
  resetEffects(state.fx);
  speedBtn.textContent = "1×";
  if (fromQuery) {
    const params = new URLSearchParams(location.search);
    if (params.has("t")) {
      const q = Number(params.get("t"));
      if (Number.isFinite(q)) {
        state.time = clamp(q, 0, battle.duration);
        state.playing = false;
      }
    }
  }
  range.max = String(battle.duration);
  ticks.replaceChildren();
  battle.phases.forEach((phase) => {
    const tick = document.createElement("button");
    tick.type = "button";
    tick.className = "tick";
    tick.style.left = `${(phase.t / battle.duration) * 100}%`;
    tick.title = phase.title;
    tick.setAttribute("aria-label", phase.title);
    tick.addEventListener("click", () => seek(phase.t));
    ticks.append(tick);
  });
  legend.replaceChildren();
  battle.sides.forEach((side) => {
    const item = document.createElement("span");
    const pip = document.createElement("i");
    pip.className = "pip";
    pip.style.background = side.color;
    item.append(pip, document.createTextNode(side.name));
    legend.append(item);
  });
  applyMode();
  document.title = `${battle.short} — Subject 2`;
  canvas.setAttribute("aria-label", `${battle.name}. Schematic battle animation.`);
}

function seek(t) {
  const battle = state.battle;
  state.time = clamp(t, 0, battle.duration);
  resetEffects(state.fx);
  if (state.time >= battle.duration - 0.05) state.playing = false;
}

function togglePlay() {
  const battle = state.battle;
  if (state.time >= battle.duration - 0.05) {
    state.time = 0;
    resetEffects(state.fx);
    state.playing = true;
    return;
  }
  state.playing = !state.playing;
}

function syncHash(fromQuery) {
  const id = location.hash.replace("#", "");
  const battle = BATTLES.find((item) => item.id === id);
  if (battle) openBattle(battle, fromQuery);
  else openMenu();
}

playBtn.addEventListener("click", togglePlay);
speedBtn.addEventListener("click", () => {
  state.speed = state.speed === 1 ? 2 : 1;
  speedBtn.textContent = `${state.speed}×`;
});
backBtn.addEventListener("click", () => {
  location.hash = "";
});
range.addEventListener("pointerdown", () => {
  state.scrubbing = true;
});
range.addEventListener("pointerup", () => {
  state.scrubbing = false;
});
range.addEventListener("pointercancel", () => {
  state.scrubbing = false;
});
range.addEventListener("input", () => {
  seek(Number(range.value));
});

window.addEventListener("hashchange", () => syncHash(false));
window.addEventListener("resize", resize);

window.addEventListener("keydown", (event) => {
  const tag = event.target?.tagName;
  if (state.mode === "menu") {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const dir = event.key === "ArrowDown" ? 1 : -1;
      setPreview((state.preview + dir + BATTLES.length) % BATTLES.length);
    } else if (event.key === "Enter") {
      location.hash = BATTLES[state.preview].id;
    } else if (event.key >= "1" && event.key <= "7") {
      location.hash = BATTLES[Number(event.key) - 1].id;
    }
    return;
  }
  if (event.key === "Escape") {
    location.hash = "";
    return;
  }
  if (event.code === "Space" && tag !== "BUTTON" && tag !== "INPUT") {
    event.preventDefault();
    togglePlay();
  } else if ((event.key === "ArrowLeft" || event.key === "ArrowRight") && tag !== "INPUT") {
    event.preventDefault();
    seek(state.time + (event.key === "ArrowRight" ? 5 : -5));
  } else if (event.key === "Home") {
    seek(0);
    state.playing = true;
  }
});

function occluders() {
  const canvasRect = canvas.getBoundingClientRect();
  const nodes = state.mode === "battle" ? [bubble, bar, top] : [caption];
  const rects = [];
  for (const node of nodes) {
    const rect = node.getBoundingClientRect();
    if (rect.width < 2 || rect.height < 2) continue;
    rects.push({
      x: rect.left - canvasRect.left - 8,
      y: rect.top - canvasRect.top - 8,
      w: rect.width + 16,
      h: rect.height + 16,
    });
  }
  return rects;
}

function updateHud(sample) {
  const battle = state.battle;
  const phase = sample.phase;
  if (state.phaseShown !== sample.phaseIndex) {
    state.phaseShown = sample.phaseIndex;
    kicker.textContent = `${battle.short}  ·  ${battle.year}`;
    count.textContent = `${String(sample.phaseIndex + 1).padStart(2, "0")}  /  ${String(battle.phases.length).padStart(2, "0")}`;
    bubbleTitle.textContent = phase.title;
    bubbleBody.textContent = phase.body;
    if (!reduce) {
      bubbleBody.classList.remove("in");
      void bubbleBody.offsetWidth;
      bubbleBody.classList.add("in");
    }
  }
  const nextT = battle.phases[sample.phaseIndex + 1]?.t ?? battle.duration;
  const span = Math.max(0.001, nextT - phase.t);
  progressFill.style.width = `${clamp((sample.time - phase.t) / span, 0, 1) * 100}%`;
  phaseName.textContent = phase.title;
  timeEl.textContent = `${fmt(sample.time)}  /  ${fmt(battle.duration)}`;
  const atEnd = sample.time >= battle.duration - 0.05;
  playBtn.textContent = atEnd ? "Replay" : state.playing ? "Pause" : "Play";
  if (!state.scrubbing) range.value = String(sample.time);
  range.style.setProperty("--p", `${(sample.time / battle.duration) * 100}%`);
  ticks.querySelectorAll(".tick").forEach((tick, i) => {
    tick.classList.toggle("is-on", i <= sample.phaseIndex);
  });
}

let errorNode = null;
function showError(error) {
  console.error(error);
  if (!errorNode) {
    errorNode = document.createElement("pre");
    errorNode.className = "err";
    document.body.append(errorNode);
  }
  errorNode.textContent = error?.message || String(error);
}

function frame(stamp) {
  requestAnimationFrame(frame);
  let dt = state.last ? (stamp - state.last) / 1000 : 0;
  state.last = stamp;
  if (dt > 0.05) dt = 0.05;
  if (!(reduce && !(state.mode === "battle" && state.playing))) state.ambient += dt;

  if (state.mode === "battle" && state.playing && !state.scrubbing) {
    state.time = Math.min(state.battle.duration, state.time + dt * state.speed);
    if (state.time >= state.battle.duration) state.playing = false;
  }

  try {
    const battle = state.mode === "battle" ? state.battle : BATTLES[state.preview];
    const simTime = state.mode === "battle" ? state.time : 0;
    const sample = sampleBattle(battle, simTime);
    if (state.mode === "battle") {
      stepEffects(state.fx, dt, battle, sample, state.playing && !state.scrubbing);
      updateHud(sample);
    }
    let camera = sample.camera;
    if (state.mode === "menu" && !reduce) {
      camera = {
        ...camera,
        x: camera.x + Math.sin(state.ambient * 0.15) * 8,
        zoom: camera.zoom + Math.sin(state.ambient * 0.12) * 0.012,
      };
    }
    drawBattle(ctx, battle, sample, state.ambient, state.ambient, state.fx, state.view, {
      camera,
      unitLabels: state.mode === "battle",
      occlude: occluders(),
    });
  } catch (error) {
    showError(error);
  }
}

setPreview(0);
syncHash(true);
window.__APP = {
  state,
  battles: BATTLES,
  seek,
  togglePlay,
  sampleBattle,
};
requestAnimationFrame(frame);

let baked = 1;
function bakeNext() {
  if (baked >= BATTLES.length) return;
  ensureBake(BATTLES[baked]);
  baked += 1;
  window.setTimeout(bakeNext, 60);
}
window.setTimeout(bakeNext, 400);
