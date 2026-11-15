// World map: x grows east, y grows south. Facing 0 is east, positive turns
// clockwise. A unit's anchor is the front of its formation; its body extends
// backward, opposite the facing.

export const WORLD_W = 1000;
export const WORLD_H = 640;

const ORDERS = new Set(["hold", "march", "charge", "fight", "fire", "rout"]);
const KINDS = new Set(["infantry", "archer", "cavalry", "gun", "ship"]);
const GRAV = 34;

export function hash(x, y = 0) {
  let n = Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263);
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
}

function mulberry32(seed) {
  let a = seed >>> 0;
  return function rand() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function clamp(v, a, b) {
  return Math.max(a, Math.min(b, v));
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function smooth(t) {
  return t * t * (3 - 2 * t);
}

function lerpAngle(a, b, t) {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}

function rgba(hex, a) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

function parseHex(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function validateBattles(battles) {
  const errors = [];
  for (const b of battles) {
    const ids = new Set();
    const sides = new Set((b.sides || []).map((s) => s.id));
    if (!b.units?.length) errors.push(`${b.id} has no units`);
    if (!b.phases?.length || b.phases[0].t !== 0) errors.push(`${b.id} phases must start at 0`);
    for (let i = 1; i < (b.phases || []).length; i++) {
      if (b.phases[i].t <= b.phases[i - 1].t) errors.push(`${b.id} phase order`);
    }
    for (let i = 1; i < (b.camera || []).length; i++) {
      if (b.camera[i].t <= b.camera[i - 1].t) errors.push(`${b.id} camera order`);
    }
    for (const u of b.units || []) {
      if (ids.has(u.id)) errors.push(`duplicate ${b.id}/${u.id}`);
      ids.add(u.id);
      if (!sides.has(u.side)) errors.push(`${u.id} side`);
      if (!KINDS.has(u.kind)) errors.push(`${u.id} kind ${u.kind}`);
      if (!u.keys?.length) errors.push(`${u.id} keys`);
      for (let i = 0; i < u.keys.length; i++) {
        const k = u.keys[i];
        if (i && k.t <= u.keys[i - 1].t) errors.push(`${u.id} key order ${k.t}`);
        if (k.x == null || k.y == null || k.facing == null || !ORDERS.has(k.order)) {
          errors.push(`${u.id} bad key ${k.t}`);
        }
      }
    }
    for (const p of b.phases || []) {
      for (const f of p.focus || []) {
        if (!ids.has(f)) errors.push(`${b.id} focus ${f}`);
      }
    }
  }
  if (errors.length) throw new Error(errors.join("\n"));
}

function inherit(unit) {
  let width = unit.width ?? 80;
  let depth = unit.depth ?? 36;
  let opacity = 1;
  let jitter = 0;
  let target = null;
  for (const k of unit.keys) {
    width = k.width != null ? k.width : width;
    depth = k.depth != null ? k.depth : depth;
    opacity = k.opacity != null ? k.opacity : opacity;
    jitter = k.jitter != null ? k.jitter : jitter;
    target = k.target != null ? k.target : target;
    k.width = width;
    k.depth = depth;
    k.opacity = opacity;
    k.jitter = jitter;
    k.target = target;
  }
}

export function prepareBattle(battle) {
  if (battle._ready) return;
  for (const u of battle.units) inherit(u);
  const trees = [];
  for (const g of battle.groves || []) {
    const rand = mulberry32(g.seed || 1);
    if (g.rows) {
      for (let r = 0; r < g.rows; r++) {
        for (let c = 0; c < g.cols; c++) {
          trees.push({
            x: g.x + c * g.spacing + (rand() - 0.5) * 1.5,
            y: g.y + r * g.spacing + (rand() - 0.5) * 1.5,
            kind: g.kind || "oak",
            s: 0.75 + rand() * 0.45,
            seed: rand() * 40,
          });
        }
      }
    } else {
      const n = g.n || 12;
      for (let i = 0; i < n; i++) {
        const a = rand() * Math.PI * 2;
        const rad = Math.sqrt(rand());
        trees.push({
          x: g.x + Math.cos(a) * (g.rx || 40) * rad,
          y: g.y + Math.sin(a) * (g.ry || 30) * rad,
          kind: g.kind || "oak",
          s: 0.7 + rand() * 0.6,
          seed: rand() * 40,
        });
      }
    }
  }
  const houses = [];
  for (const v of battle.villages || []) {
    const rand = mulberry32(v.seed || 1);
    for (let i = 0; i < v.n; i++) {
      houses.push({
        x: v.x + (rand() - 0.5) * v.rx,
        y: v.y + (rand() - 0.5) * v.ry,
        w: 8 + rand() * 7,
        h: 6 + rand() * 4,
        roof: v.roof || "#7a4034",
        wall: v.wall || "#e4d5ba",
        church: !!(v.church && i === 0),
      });
    }
  }
  const rocks = [];
  for (const r of battle.rocks || []) {
    const rand = mulberry32(r.seed || 1);
    for (let i = 0; i < r.n; i++) {
      rocks.push({
        x: r.x + (rand() - 0.5) * r.rx,
        y: r.y + (rand() - 0.5) * r.ry,
        s: 4 + rand() * (r.big ? 10 : 6),
        seed: rand(),
      });
    }
  }
  battle._trees = trees;
  battle._houses = houses;
  battle._rocks = rocks;
  battle._ready = true;
}

function sampleTrack(keys, t, fields) {
  if (t <= keys[0].t) return { ...keys[0] };
  const last = keys[keys.length - 1];
  if (t >= last.t) return { ...last };
  let lo = 0;
  for (let i = 0; i < keys.length - 1; i++) {
    if (t <= keys[i + 1].t) {
      lo = i;
      break;
    }
  }
  const a = keys[lo];
  const b = keys[lo + 1];
  const e = smooth((t - a.t) / (b.t - a.t || 1));
  const out = { ...a };
  for (const f of fields) {
    if (f === "facing") out.facing = lerpAngle(a.facing, b.facing, e);
    else if (typeof a[f] === "number") out[f] = lerp(a[f], b[f], e);
  }
  if (a.target && b.target) {
    out.target = [lerp(a.target[0], b.target[0], e), lerp(a.target[1], b.target[1], e)];
  }
  out.order = a.order;
  return out;
}

export function sampleBattle(battle, t) {
  prepareBattle(battle);
  const time = clamp(t, 0, battle.duration);
  const camera = sampleTrack(battle.camera, time, ["x", "y", "zoom"]);
  let phaseIndex = 0;
  for (let i = 0; i < battle.phases.length; i++) {
    if (battle.phases[i].t <= time) phaseIndex = i;
  }
  const units = battle.units.map((u) => {
    const s = sampleTrack(u.keys, time, ["x", "y", "facing", "width", "depth", "opacity", "jitter"]);
    return {
      ...u,
      ...s,
      label: u.label,
    };
  });
  return { camera, phase: battle.phases[phaseIndex], phaseIndex, units, time };
}

function elevationAt(battle, x, y) {
  if (!battle.elevation) return 0;
  return battle.elevation(x, y) || 0;
}

function groundLift(battle, x, y) {
  return elevationAt(battle, x, y) * 36;
}

function trace(ctx, poly) {
  ctx.beginPath();
  ctx.moveTo(poly[0][0], poly[0][1]);
  for (let i = 1; i < poly.length; i++) ctx.lineTo(poly[i][0], poly[i][1]);
  ctx.closePath();
}

function strokePolyline(ctx, pts) {
  if (!pts || pts.length < 2) return;
  ctx.beginPath();
  ctx.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
  ctx.stroke();
}

function bake(battle) {
  if (battle._bake) return battle._bake;
  prepareBattle(battle);
  const scale = 2;
  const c = document.createElement("canvas");
  c.width = WORLD_W * scale;
  c.height = WORLD_H * scale;
  const b = c.getContext("2d", { willReadFrequently: true });
  b.setTransform(scale, 0, 0, scale, 0, 0);
  b.fillStyle = battle.ground;
  b.fillRect(0, 0, WORLD_W, WORLD_H);
  for (const region of battle.fill || []) {
    b.fillStyle = region.color;
    trace(b, region.polygon);
    b.fill();
  }
  b.setTransform(1, 0, 0, 1, 0, 0);
  const img = b.getImageData(0, 0, c.width, c.height);
  const data = img.data;
  const elev = battle.elevation;
  let field = null;
  if (elev) {
    field = new Float32Array(WORLD_W * WORLD_H);
    for (let y = 0; y < WORLD_H; y++) {
      for (let x = 0; x < WORLD_W; x++) field[y * WORLD_W + x] = elev(x, y) || 0;
    }
  }
  const tint = battle.hillTint ? parseHex(battle.hillTint) : null;
  const bw = c.width;
  for (let y = 0; y < c.height; y++) {
    const wy = Math.min(WORLD_H - 1, y >> 1);
    for (let x = 0; x < bw; x++) {
      const wx = Math.min(WORLD_W - 1, x >> 1);
      const e = field ? field[wy * WORLD_W + wx] : 0;
      const ex = field ? field[wy * WORLD_W + Math.min(WORLD_W - 1, wx + 4)] : 0;
      const ey = field ? field[Math.min(WORLD_H - 1, wy + 4) * WORLD_W + wx] : 0;
      const slope = (e - ex) * 0.5 + (e - ey) * 0.9;
      let light = 1.04 + e * 0.34 + slope * 2.7;
      if (light < 0.58) light = 0.58;
      if (light > 1.42) light = 1.42;
      const n = (hash(x, y) - 0.5) * 14;
      const i = (y * bw + x) * 4;
      let r = data[i];
      let g = data[i + 1];
      let bl = data[i + 2];
      if (tint && e > 0.06) {
        const m = Math.min(0.5, (e - 0.06) * 0.62);
        r = r * (1 - m) + tint[0] * m;
        g = g * (1 - m) + tint[1] * m;
        bl = bl * (1 - m) + tint[2] * m;
      }
      data[i] = clamp(r * light + n, 0, 255);
      data[i + 1] = clamp(g * light + n, 0, 255);
      data[i + 2] = clamp(bl * light + n * 0.85, 0, 255);
    }
  }
  b.putImageData(img, 0, 0);
  b.setTransform(scale, 0, 0, scale, 0, 0);
  b.lineJoin = "round";
  b.lineCap = "round";
  for (const w of battle.water || []) {
    b.fillStyle = w.color;
    trace(b, w.polygon);
    b.fill();
  }
  for (const s of battle.streams || []) {
    b.strokeStyle = s.color;
    b.lineWidth = s.width || 8;
    strokePolyline(b, s.points);
    b.strokeStyle = "rgba(255,255,255,0.28)";
    b.lineWidth = Math.max(1, (s.width || 8) * 0.28);
    strokePolyline(b, s.points);
  }
  for (const f of battle.fields || []) {
    b.save();
    trace(b, f.polygon);
    b.clip();
    b.strokeStyle = f.color || "rgba(80,60,30,0.2)";
    b.lineWidth = 1;
    b.translate(f.polygon[0][0], f.polygon[0][1]);
    b.rotate(f.angle || 0);
    for (let i = -300; i < 500; i += f.gap || 8) {
      b.beginPath();
      b.moveTo(i, -500);
      b.lineTo(i, 500);
      b.stroke();
    }
    b.restore();
  }
  for (const r of battle.roads || []) {
    b.strokeStyle = "rgba(70, 52, 30, 0.28)";
    b.lineWidth = (r.width || 7) + 2.5;
    strokePolyline(b, r.points);
    b.strokeStyle = r.color || "#d9c7a2";
    b.lineWidth = r.width || 7;
    strokePolyline(b, r.points);
  }
  for (const wall of battle.walls || []) {
    b.strokeStyle = "#8a867c";
    b.lineWidth = 3.2;
    strokePolyline(b, wall.points);
    b.strokeStyle = "rgba(255,255,255,0.35)";
    b.lineWidth = 1;
    strokePolyline(b, wall.points);
  }
  for (const reed of battle.reeds || []) {
    const rand = mulberry32(reed.seed || 1);
    b.strokeStyle = "#2f5a42";
    b.lineWidth = 1;
    for (let i = 0; i < (reed.n || 20); i++) {
      const x = reed.x + (rand() - 0.5) * reed.rx;
      const y = reed.y + (rand() - 0.5) * reed.ry;
      b.beginPath();
      b.moveTo(x, y);
      b.lineTo(x + (rand() - 0.5) * 2, y - 5 - rand() * 7);
      b.stroke();
    }
  }
  b.strokeStyle = "rgba(68, 48, 28, 0.28)";
  b.lineWidth = 1.1;
  b.setLineDash([]);
  for (const ring of battle.rings || []) {
    b.beginPath();
    b.ellipse(ring.x, ring.y, ring.rx, ring.ry, 0, 0, Math.PI * 2);
    b.stroke();
  }
  for (const line of battle.contours || []) {
    b.strokeStyle = "rgba(68, 48, 28, 0.32)";
    b.lineWidth = 1.2;
    b.setLineDash([2, 6]);
    strokePolyline(b, line.points);
    b.setLineDash([]);
  }
  for (const shore of battle.shores || []) {
    b.strokeStyle = "rgba(255,255,255,0.45)";
    b.lineWidth = 1.4;
    strokePolyline(b, shore);
  }
  battle._bake = c;
  return c;
}

export function createEffects() {
  return { particles: [], nextShot: {}, prev: {} };
}

export function resetEffects(fx) {
  fx.particles.length = 0;
  fx.nextShot = {};
  fx.prev = {};
}

function pushParticle(fx, p) {
  if (fx.particles.length > 520) fx.particles.splice(0, fx.particles.length - 480);
  fx.particles.push(p);
}

function frontPoint(u, along, side) {
  const fx = Math.cos(u.facing);
  const fy = Math.sin(u.facing);
  return [u.x + fx * along - fy * side, u.y + fy * along + fx * side];
}

export function stepEffects(fx, dt, battle, sample, spawning) {
  const list = fx.particles;
  for (let i = list.length - 1; i >= 0; i--) {
    const p = list[i];
    p.life -= dt;
    if (p.ballistic) {
      p.vz -= GRAV * dt;
      p.z += p.vz * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      if (p.z <= 0 || p.life <= 0) {
        if (p.kind === "shell") {
          for (let k = 0; k < 3; k++) {
            pushParticle(fx, {
              kind: "smoke",
              x: p.x + (Math.random() - 0.5) * 8,
              y: p.y + (Math.random() - 0.5) * 8,
              z: 1,
              vx: (Math.random() - 0.5) * 8,
              vy: (Math.random() - 0.5) * 8,
              vz: 4 + Math.random() * 4,
              r: 3,
              grow: 10,
              life: 1.3,
              max: 1.3,
              color: "rgba(230,228,220,",
            });
          }
        }
        list.splice(i, 1);
      }
    } else {
      p.x += (p.vx || 0) * dt;
      p.y += (p.vy || 0) * dt;
      p.z = (p.z || 0) + (p.vz || 0) * dt;
      p.r += (p.grow || 0) * dt;
      if (p.life <= 0) list.splice(i, 1);
    }
  }
  if (!spawning) return;
  for (const u of sample.units) {
    if (u.opacity < 0.45) continue;
    const prev = fx.prev[u.id];
    if (prev && dt > 0) {
      const spd = Math.hypot(u.x - prev.x, u.y - prev.y) / dt;
      if (spd > 16 && (u.order === "charge" || u.order === "march" || u.order === "rout")) {
        const [dx, dy] = frontPoint(u, -u.depth * 0.4, (Math.random() - 0.5) * u.width * 0.7);
        pushParticle(fx, {
          kind: "dust",
          x: dx,
          y: dy,
          z: 0,
          vx: (Math.random() - 0.5) * 6,
          vy: (Math.random() - 0.5) * 6,
          vz: 1,
          r: 2.5,
          grow: u.kind === "cavalry" ? 8 : 5,
          life: 0.7,
          max: 0.7,
          color: battle.dust || "rgba(168,140,96,",
        });
      }
    }
    fx.prev[u.id] = { x: u.x, y: u.y };
    if (u.order !== "fire" || !u.volley) continue;
    if (sample.time < (fx.nextShot[u.id] || 0)) continue;
    const cooldown = u.kind === "gun" ? 1.15 : u.volley === "musket" ? 0.72 : 0.42;
    fx.nextShot[u.id] = sample.time + cooldown;
    if (u.kind === "gun") {
      const n = Math.min(u.n || 3, 4);
      for (let i = 0; i < n; i++) {
        const side = n === 1 ? 0 : (i / (n - 1) - 0.5) * u.width;
        const [sx, sy] = frontPoint(u, 4, side);
        const target = u.target || frontPoint(u, 170, side * 0.3);
        const dist = Math.hypot(target[0] - sx, target[1] - sy) || 1;
        const flight = clamp(dist / 78, 0.55, 2.1);
        const vz = (0.5 * GRAV * flight * flight - 3) / flight;
        pushParticle(fx, {
          kind: "shell",
          ballistic: true,
          x: sx,
          y: sy,
          z: 3,
          vx: (target[0] - sx) / flight,
          vy: (target[1] - sy) / flight,
          vz,
          life: flight + 0.2,
          r: 1.4,
        });
        pushParticle(fx, {
          kind: "smoke",
          x: sx,
          y: sy,
          z: 2,
          vx: -Math.cos(u.facing) * 4,
          vy: -Math.sin(u.facing) * 4,
          vz: 2,
          r: 2,
          grow: 7,
          life: 0.9,
          max: 0.9,
          color: "rgba(236,236,232,",
        });
      }
    } else {
      const count = u.volley === "musket" ? 4 : 6;
      for (let i = 0; i < count; i++) {
        const side = (Math.random() - 0.5) * u.width * 0.85;
        const [sx, sy] = frontPoint(u, 2, side);
        const a = u.facing + (Math.random() - 0.5) * 0.32;
        const speed = u.volley === "musket" ? 150 : u.volley === "spear" ? 78 : 108;
        const vz = u.volley === "musket" ? 10 : u.volley === "spear" ? 20 : 28;
        pushParticle(fx, {
          kind: u.volley,
          ballistic: true,
          x: sx,
          y: sy,
          z: 5,
          vx: Math.cos(a) * speed,
          vy: Math.sin(a) * speed,
          vz,
          life: u.volley === "musket" ? 0.7 : 1.7,
        });
      }
    }
  }
}

function roundRect(ctx, x, y, w, h, r) {
  const rr = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  if (w <= 0 || h <= 0) return;
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

function drawShield(ctx, spec) {
  const shape = spec.shieldShape;
  if (!shape) return;
  ctx.fillStyle = spec.shield || spec.coat;
  if (shape === "round") {
    ctx.beginPath();
    ctx.arc(0, 0, 3.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.lineWidth = 0.7;
    ctx.strokeStyle = spec.trim || "rgba(255,236,200,0.7)";
    ctx.stroke();
  } else if (shape === "oval") {
    ctx.beginPath();
    ctx.ellipse(0, 0, 2.5, 4.1, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.lineWidth = 0.6;
    ctx.strokeStyle = "rgba(40,24,16,0.35)";
    ctx.stroke();
  } else if (shape === "zulu") {
    ctx.fillStyle = spec.shield || "#f4f1ea";
    ctx.beginPath();
    ctx.ellipse(0, 0, 2.7, 4.5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#161616";
    ctx.fillRect(-0.9, -4.2, 0.7, 8.4);
    ctx.fillRect(0.55, -4.2, 0.7, 8.4);
  } else if (shape === "scutum") {
    ctx.beginPath();
    ctx.ellipse(0, 0, 2.3, 4.3, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = spec.trim || "#e6d3a2";
    ctx.lineWidth = 0.6;
    ctx.stroke();
  } else if (shape === "kite") {
    ctx.beginPath();
    ctx.moveTo(0, -4.2);
    ctx.lineTo(2.8, -0.4);
    ctx.lineTo(0, 4.4);
    ctx.lineTo(-2.6, -0.4);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = spec.trim || "rgba(255,255,255,0.35)";
    ctx.lineWidth = 0.55;
    ctx.stroke();
  } else if (shape === "wicker") {
    ctx.fillRect(-2.3, -3.8, 4.6, 7.6);
    ctx.strokeStyle = "rgba(70,46,18,0.45)";
    ctx.lineWidth = 0.5;
    ctx.strokeRect(-2.3, -3.8, 4.6, 7.6);
    ctx.beginPath();
    for (let y = -2.4; y <= 2.4; y += 1.5) {
      ctx.moveTo(-2.1, y);
      ctx.lineTo(2.1, y);
    }
    ctx.stroke();
  }
  if (spec.shieldMark === "boss") {
    ctx.fillStyle = "#d1b15a";
    ctx.beginPath();
    ctx.arc(0, 0, 0.75, 0, Math.PI * 2);
    ctx.fill();
  } else if (spec.shieldMark === "cross") {
    ctx.strokeStyle = "#a33b32";
    ctx.lineWidth = 0.9;
    ctx.beginPath();
    ctx.moveTo(0, -2.1);
    ctx.lineTo(0, 2.2);
    ctx.moveTo(-1.5, -0.3);
    ctx.lineTo(1.5, -0.3);
    ctx.stroke();
  }
}

function drawHelm(ctx, spec) {
  if (!spec.helm) return;
  ctx.fillStyle = spec.helmColor || "#b7a48a";
  if (spec.helm === "crest" || spec.helm === "bowl") {
    ctx.beginPath();
    ctx.arc(0, -0.2, 1.45, Math.PI, 0);
    ctx.fill();
  }
  if (spec.helm === "crest") {
    ctx.strokeStyle = spec.crest || "#f4f4f4";
    ctx.lineWidth = 0.95;
    ctx.beginPath();
    ctx.moveTo(0, -1.5);
    ctx.quadraticCurveTo(-0.2, -3.5, -1.5, -2.7);
    ctx.stroke();
  } else if (spec.helm === "cone") {
    ctx.beginPath();
    ctx.moveTo(-1.35, 0.3);
    ctx.lineTo(0.1, -2.5);
    ctx.lineTo(1.6, 0.3);
    ctx.closePath();
    ctx.fill();
  } else if (spec.helm === "shako") {
    ctx.fillRect(-1.15, -2.7, 2.3, 2.5);
    ctx.fillStyle = spec.trim || "#d9c27a";
    ctx.fillRect(-1.15, -1.1, 2.3, 0.45);
  } else if (spec.helm === "kepi") {
    ctx.fillRect(-1.25, -1.7, 2.7, 1.55);
    ctx.fillRect(-1.25, -1.95, 1.15, 0.45);
  } else if (spec.helm === "cap") {
    ctx.beginPath();
    ctx.ellipse(0, -0.3, 1.45, 1.05, 0, Math.PI, 0);
    ctx.fill();
  } else if (spec.helm === "ring") {
    ctx.strokeStyle = "#1a1a1a";
    ctx.lineWidth = 0.75;
    ctx.beginPath();
    ctx.arc(0, 0, 1.35, Math.PI * 1.08, Math.PI * 1.92);
    ctx.stroke();
  }
}

function drawFoot(ctx, spec, time, order) {
  const moving = order === "march" || order === "charge" || order === "rout";
  const pace = order === "charge" ? 13 : 9;
  const bob = moving ? Math.sin(time * pace + spec.phase) * 0.65 : Math.sin(time * 1.6 + spec.phase) * 0.12;
  const stride = moving ? Math.sin(time * pace + spec.phase) : 0;
  ctx.translate(order === "charge" ? 0.8 : 0, bob);
  ctx.strokeStyle = "#2a241c";
  ctx.lineWidth = 0.85;
  ctx.beginPath();
  ctx.moveTo(-1.1, 1.1);
  ctx.lineTo(-1.1 - stride * 1.4, 4.3);
  ctx.moveTo(1.1, 1.1);
  ctx.lineTo(1.1 + stride * 1.4, 4.3);
  ctx.stroke();
  ctx.fillStyle = spec.coat;
  ctx.fillRect(-1.7, -3.3, 3.4, 4.7);
  ctx.save();
  ctx.translate(0.2, -4.7);
  ctx.fillStyle = spec.skin || "#c49a78";
  ctx.beginPath();
  ctx.arc(0, 0, 1.35, 0, Math.PI * 2);
  ctx.fill();
  drawHelm(ctx, spec);
  ctx.restore();
  if (order !== "rout" && spec.shieldShape) {
    ctx.save();
    ctx.translate(3.1, -1.1);
    drawShield(ctx, spec);
    ctx.restore();
  }
  if (order === "rout") return;
  const thrust = order === "fight" ? (Math.sin(time * 11 + spec.phase) * 0.5 + 0.5) * 3.2 : 0;
  const low = order === "charge" || order === "march" || order === "fight";
  ctx.strokeStyle = "#5c4632";
  ctx.lineWidth = 0.85;
  ctx.beginPath();
  if (spec.weapon === "bow") {
    ctx.arc(2.2, -1.2, 3.1, -1.15, 1.15);
    ctx.stroke();
    if (order === "fire") {
      ctx.beginPath();
      ctx.moveTo(2.2, -1.2);
      ctx.lineTo(8.2, -1.5);
      ctx.stroke();
    }
  } else if (spec.weapon === "musket") {
    ctx.strokeStyle = "#2e2a26";
    ctx.beginPath();
    ctx.moveTo(0.4, -1.1);
    ctx.lineTo(9.2 + thrust, -1.5);
    ctx.stroke();
    ctx.strokeStyle = "#e4e0d8";
    ctx.beginPath();
    ctx.moveTo(9.2 + thrust, -1.5);
    ctx.lineTo(11.4 + thrust, -1.7);
    ctx.stroke();
  } else if (spec.weapon === "axe") {
    ctx.moveTo(0.2, -0.4);
    ctx.lineTo(5.2 + thrust, -3.1);
    ctx.stroke();
    ctx.fillStyle = "#d5d8dc";
    ctx.beginPath();
    ctx.ellipse(5.6 + thrust, -3.4, 1.5, 1.05, -0.5, 0, Math.PI * 2);
    ctx.fill();
  } else {
    const len = spec.weapon === "iklwa" ? 7 : spec.weapon === "pilum" ? 11 : spec.weapon === "javelin" ? 8 : 13;
    const y = low ? -2.3 : -6.2;
    const x0 = spec.weapon === "iklwa" ? 0.6 : -0.6;
    ctx.moveTo(x0, -0.2);
    ctx.lineTo(x0 + len + thrust, y);
    ctx.stroke();
    ctx.strokeStyle = "#e7e2d8";
    ctx.beginPath();
    ctx.moveTo(x0 + len + thrust, y);
    ctx.lineTo(x0 + len + thrust + 1.7, y - 0.25);
    ctx.stroke();
  }
}

function drawHorse(ctx, spec, time, order) {
  const moving = order === "march" || order === "charge" || order === "rout";
  const gallop = moving ? time * 13 + spec.phase : time * 1.5;
  ctx.fillStyle = "rgba(40,30,20,0.18)";
  ctx.beginPath();
  ctx.ellipse(0, 3.4, 7, 1.7, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "#3a2c22";
  ctx.lineWidth = 1;
  ctx.beginPath();
  [-4.2, -1.3, 1.7, 4.3].forEach((lx, i) => {
    const s = Math.sin(gallop + i * 1.3) * (moving ? 1.7 : 0.15);
    ctx.moveTo(lx, 0.5);
    ctx.lineTo(lx + s, 3.8);
  });
  ctx.stroke();
  ctx.fillStyle = spec.mount || "#6a4a32";
  ctx.beginPath();
  ctx.ellipse(0, -1.1, 6.3, 2.8, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(4.4, -2);
  ctx.quadraticCurveTo(8.6, -3.6, 8.4, -6.6);
  ctx.quadraticCurveTo(6.5, -5.2, 5.2, -2.2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(8.8, -6.8, 2.1, 1.25, 0.45, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = spec.mount || "#6a4a32";
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(-6.1, -1.8);
  ctx.quadraticCurveTo(-9, 0.4, -7.6, 2.6);
  ctx.stroke();
  ctx.fillStyle = spec.coat;
  ctx.fillRect(-0.2, -6.3, 3.3, 4.1);
  ctx.save();
  ctx.translate(1.8, -7.4);
  ctx.fillStyle = spec.skin || "#c49a78";
  ctx.beginPath();
  ctx.arc(0, 0, 1.25, 0, Math.PI * 2);
  ctx.fill();
  drawHelm(ctx, spec);
  ctx.restore();
  if (order !== "rout") {
    ctx.strokeStyle = "#6b5438";
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    const ext = order === "charge" ? 13 : 8;
    if (spec.weapon === "javelin") {
      ctx.moveTo(1, -5);
      ctx.lineTo(6, -8);
    } else {
      ctx.moveTo(1, -5);
      ctx.lineTo(ext, -7.2);
    }
    ctx.stroke();
    if (spec.shieldShape) {
      ctx.save();
      ctx.translate(2.6, -4.8);
      ctx.scale(0.72, 0.72);
      drawShield(ctx, spec);
      ctx.restore();
    }
  }
}

function drawGun(ctx, spec, time, order) {
  ctx.strokeStyle = "#4a3828";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(-1, 1.5, 2.2, 0, Math.PI * 2);
  ctx.arc(3.2, 1.5, 2.2, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(-1, 0.2);
  ctx.lineTo(-8, 2.6);
  ctx.stroke();
  ctx.strokeStyle = "#2c3138";
  ctx.lineWidth = 1.7;
  ctx.beginPath();
  ctx.moveTo(-1, -1.2);
  ctx.lineTo(8.5, -2.5);
  ctx.stroke();
  if (order === "fire" && Math.sin(time * 18 + (spec.phase || 0)) > 0.55) {
    ctx.fillStyle = "rgba(255, 196, 110, 0.85)";
    ctx.beginPath();
    ctx.arc(9.2, -2.7, 1.7, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawShip(ctx, spec, time) {
  ctx.fillStyle = spec.hull || "#6b4226";
  ctx.beginPath();
  ctx.moveTo(18, 0);
  ctx.quadraticCurveTo(8, -5.2, -12, -4);
  ctx.lineTo(-15, -1.6);
  ctx.lineTo(-15, 1.6);
  ctx.lineTo(-12, 4);
  ctx.quadraticCurveTo(8, 5.2, 18, 0);
  ctx.fill();
  ctx.fillStyle = spec.trim || "#c4a36a";
  ctx.fillRect(2, -1.1, 5, 2.2);
  if (spec.oars) {
    ctx.strokeStyle = "rgba(50,36,22,0.55)";
    ctx.lineWidth = 0.7;
    for (let i = -8; i <= 8; i += 3.2) {
      const sway = Math.sin(time * 2.2 + i) * 0.7;
      ctx.beginPath();
      ctx.moveTo(i, -3);
      ctx.lineTo(i - 1.5, -8.5 - sway);
      ctx.moveTo(i, 3);
      ctx.lineTo(i - 1.5, 8.5 + sway);
      ctx.stroke();
    }
  }
  ctx.strokeStyle = "#3a3028";
  ctx.lineWidth = 0.9;
  ctx.beginPath();
  ctx.moveTo(-1, 0);
  ctx.lineTo(-1, -11);
  ctx.stroke();
  ctx.fillStyle = spec.sail || "#f0e6d2";
  const flap = Math.sin(time * 1.4 + (spec.phase || 0)) * 0.8;
  ctx.beginPath();
  ctx.moveTo(-1, -10.5);
  ctx.quadraticCurveTo(6, -9 + flap, 7.5, -6);
  ctx.lineTo(-1, -4.5);
  ctx.fill();
}

function slotsFor(u) {
  const out = [];
  if (u.kind === "ship") {
    out.push({ x: 0, y: 0, facing: 0, draw: "ship", i: 0 });
    return out;
  }
  if (u.kind === "gun") {
    const n = u.n || 3;
    for (let i = 0; i < n; i++) {
      const right = n === 1 ? 0 : (i / (n - 1) - 0.5) * u.width;
      out.push({ x: 0, y: right, facing: 0, draw: "gun", i });
    }
    return out;
  }
  const n = u.n || 16;
  if (u.shape === "arc") {
    const span = u.span || 1.35;
    const radius = u.radius || 48;
    for (let i = 0; i < n; i++) {
      const a = u.facing + (n === 1 ? 0 : (i / (n - 1) - 0.5) * span);
      out.push({ x: Math.cos(a) * radius, y: Math.sin(a) * radius, facing: a, i });
    }
    return out;
  }
  if (u.shape === "scatter") {
    for (let i = 0; i < n; i++) {
      out.push({
        x: (hash(i + 3, 11) - 0.5) * u.depth,
        y: (hash(i + 3, 17) - 0.5) * u.width,
        facing: 0,
        i,
      });
    }
    return out;
  }
  const ratio = u.width / Math.max(12, u.depth);
  let cols = Math.max(1, Math.min(n, Math.round(Math.sqrt(n * ratio))));
  let rows = Math.ceil(n / cols);
  while (rows > 1 && (rows - 1) * 12 > u.depth && cols < n) {
    cols += 1;
    rows = Math.ceil(n / cols);
  }
  for (let i = 0; i < n; i++) {
    const file = i % cols;
    const rank = Math.floor(i / cols);
    let taper = 1;
    if (u.shape === "wedge" && rows > 1) taper = 0.18 + 0.82 * (rank / (rows - 1));
    const right = cols === 1 ? 0 : (file / (cols - 1) - 0.5) * u.width * taper;
    const forward = rows === 1 ? 0 : -(rank / (rows - 1)) * u.depth;
    out.push({ x: forward, y: right, facing: 0, i });
  }
  return out;
}

function drawTree(ctx, tree, time) {
  const sway = Math.sin(time * 0.7 + tree.seed) * 0.8;
  const s = tree.s;
  ctx.save();
  ctx.translate(tree.x, tree.y);
  ctx.fillStyle = "rgba(40,30,20,0.16)";
  ctx.beginPath();
  ctx.ellipse(1, 2, 5 * s, 2 * s, 0, 0, Math.PI * 2);
  ctx.fill();
  const leaf =
    tree.kind === "olive"
      ? "#6d7a48"
      : tree.kind === "thorn" || tree.kind === "scrub"
        ? "#6a703c"
        : tree.kind === "peach"
          ? "#5f8a48"
          : "#3e6840";
  if (tree.kind !== "scrub") {
    ctx.fillStyle = "#5a4636";
    ctx.fillRect(-0.7 * s, -7 * s, 1.4 * s, 8 * s);
  }
  ctx.fillStyle = leaf;
  const low = tree.kind === "scrub" || tree.kind === "thorn" ? -4 : -11;
  ctx.beginPath();
  ctx.arc(sway, low * s, (tree.kind === "scrub" ? 4.2 : 6.2) * s, 0, Math.PI * 2);
  ctx.arc(4 * s + sway, (low + 3) * s, 4.6 * s, 0, Math.PI * 2);
  ctx.arc(-3.5 * s, (low + 2) * s, 4.2 * s, 0, Math.PI * 2);
  ctx.fill();
  if (tree.kind === "peach") {
    ctx.fillStyle = "#e7b4c2";
    ctx.beginPath();
    ctx.arc(1.5 * s, (low - 1) * s, 1.2 * s, 0, Math.PI * 2);
    ctx.arc(-2 * s, (low + 2) * s, 1 * s, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function drawHouse(ctx, h) {
  ctx.save();
  ctx.translate(h.x, h.y);
  ctx.fillStyle = "rgba(40,30,20,0.18)";
  ctx.beginPath();
  ctx.ellipse(0, h.h * 0.45, h.w * 0.6, 2, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = h.wall;
  ctx.fillRect(-h.w / 2, -h.h / 2, h.w, h.h);
  ctx.fillStyle = h.roof;
  ctx.beginPath();
  ctx.moveTo(-h.w / 2 - 1, -h.h / 2 + 1);
  ctx.lineTo(0, -h.h / 2 - (h.church ? 8 : 4));
  ctx.lineTo(h.w / 2 + 1, -h.h / 2 + 1);
  ctx.closePath();
  ctx.fill();
  if (h.church) {
    ctx.fillRect(-1.2, -h.h / 2 - 12, 2.4, 6);
    ctx.fillRect(-3.2, -h.h / 2 - 8, 6.4, 1.4);
  }
  ctx.restore();
}

function drawRock(ctx, r) {
  ctx.save();
  ctx.translate(r.x, r.y);
  ctx.rotate(r.seed * 6);
  ctx.fillStyle = "#8b8781";
  ctx.beginPath();
  ctx.moveTo(-r.s, r.s * 0.25);
  ctx.lineTo(-r.s * 0.35, -r.s * 0.65);
  ctx.lineTo(r.s * 0.55, -r.s * 0.4);
  ctx.lineTo(r.s * 0.9, r.s * 0.35);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = "rgba(255,255,255,0.22)";
  ctx.beginPath();
  ctx.moveTo(-r.s * 0.15, -r.s * 0.2);
  ctx.lineTo(r.s * 0.35, -r.s * 0.38);
  ctx.lineTo(r.s * 0.1, 0.1);
  ctx.fill();
  ctx.restore();
}

function drawMass(ctx, u, color) {
  ctx.fillStyle = rgba(color, u.shape === "scatter" ? 0.12 : 0.3);
  ctx.strokeStyle = rgba(color, u.shape === "scatter" ? 0.28 : 0.78);
  ctx.lineWidth = 1.35;
  if (u.shape === "arc") {
    ctx.lineWidth = Math.max(14, u.depth || 16);
    ctx.lineCap = "round";
    ctx.strokeStyle = rgba(color, 0.28);
    ctx.beginPath();
    const span = u.span || 1.35;
    ctx.arc(0, 0, u.radius || 48, u.facing - span / 2, u.facing + span / 2);
    ctx.stroke();
    ctx.lineWidth = 1.4;
    ctx.strokeStyle = rgba(color, 0.65);
    ctx.stroke();
    return;
  }
  if (u.shape === "wedge") {
    ctx.beginPath();
    ctx.moveTo(8, 0);
    ctx.lineTo(-u.depth, -u.width / 2);
    ctx.lineTo(-u.depth, u.width / 2);
    ctx.closePath();
  } else if (u.shape === "scatter") {
    ctx.beginPath();
    ctx.ellipse(-u.depth * 0.1, 0, u.depth * 0.55, u.width * 0.5, 0, 0, Math.PI * 2);
  } else {
    roundRect(ctx, -u.depth, -u.width / 2, u.depth + 8, u.width, 6);
  }
  ctx.fill();
  ctx.stroke();
}

function drawUnit(ctx, battle, u, time) {
  if (u.opacity <= 0.03) return;
  const g = groundLift(battle, u.x, u.y);
  const sink = u.sink || 0;
  ctx.save();
  ctx.translate(u.x, u.y - g + sink);
  if (u.shape !== "arc") ctx.rotate(u.facing);
  ctx.globalAlpha = u.opacity;
  const color = u.coat || battle.sides.find((s) => s.id === u.side)?.color || "#888";
  ctx.save();
  ctx.fillStyle = `rgba(40,28,16,${0.13 * u.opacity})`;
  ctx.beginPath();
  if (u.shape === "arc") {
    const radius = u.radius || 48;
    ctx.ellipse(Math.cos(u.facing) * radius, Math.sin(u.facing) * radius, 16, 8, u.facing, 0, Math.PI * 2);
  } else if (u.shape !== "scatter") {
    ctx.ellipse(-u.depth * 0.45, 2, Math.max(6, u.depth * 0.48), Math.max(6, u.width * 0.46), 0, 0, Math.PI * 2);
  }
  ctx.fill();
  ctx.restore();
  drawMass(ctx, u, color);
  const spec = {
    coat: color,
    shield: u.shield || color,
    shieldShape: u.shieldShape,
    shieldMark: u.shieldMark,
    trim: u.trim,
    skin: u.skin,
    helm: u.helm,
    helmColor: u.helmColor,
    crest: u.crest,
    weapon: u.weapon || (u.kind === "archer" ? "bow" : u.weapon === "musket" ? "musket" : "spear"),
    mount: u.mount,
    hull: u.hull,
    sail: u.sail,
    oars: u.oars,
  };
  if (u.kind === "infantry" && !u.weapon) spec.weapon = "spear";
  const fig = u.figScale || (u.kind === "cavalry" ? 1.02 : u.kind === "ship" ? 1.25 : 1);
  for (const s of slotsFor(u)) {
    ctx.save();
    const jx = (hash(s.i + 1, 4) - 0.5) * 2 * (u.jitter || 0);
    const jy = (hash(s.i + 1, 8) - 0.5) * 2 * (u.jitter || 0);
    ctx.translate(s.x + jx, s.y + jy);
    if (u.shape === "arc") ctx.rotate(s.facing);
    ctx.scale(fig, fig);
    spec.phase = s.i * 0.65;
    if (s.draw === "ship" || u.kind === "ship") drawShip(ctx, spec, time);
    else if (s.draw === "gun" || u.kind === "gun") drawGun(ctx, spec, time, u.order);
    else if (u.kind === "cavalry") drawHorse(ctx, spec, time, u.order);
    else drawFoot(ctx, spec, time, u.order);
    ctx.restore();
  }
  if (u.order === "fight") {
    ctx.save();
    if (u.shape === "arc") {
      ctx.rotate(u.facing);
      ctx.translate((u.radius || 48) + 6, 0);
    } else {
      ctx.translate(8, 0);
    }
    const glint = 0.25 + 0.45 * (0.5 + 0.5 * Math.sin(time * 9 + u.x));
    ctx.strokeStyle = `rgba(255, 220, 170, ${glint})`;
    ctx.lineWidth = 1.1;
    for (let k = -1; k <= 1; k++) {
      ctx.beginPath();
      ctx.moveTo(-2, k * 5);
      ctx.lineTo(5, k * 5 - 2);
      ctx.stroke();
    }
    ctx.restore();
  }
  ctx.restore();
}

function drawStandard(ctx, battle, u, time) {
  if (!u.pennon || u.opacity < 0.4) return;
  const g = groundLift(battle, u.x, u.y);
  let x = u.x;
  let y = u.y;
  if (u.shape === "arc") {
    x += Math.cos(u.facing) * (u.radius || 48);
    y += Math.sin(u.facing) * (u.radius || 48);
  } else {
    x -= Math.cos(u.facing) * u.depth * 0.28;
    y -= Math.sin(u.facing) * u.depth * 0.28;
  }
  ctx.save();
  ctx.translate(x, y - g + (u.sink || 0));
  ctx.globalAlpha = u.opacity;
  ctx.strokeStyle = "#3a3228";
  ctx.lineWidth = 0.8;
  ctx.beginPath();
  ctx.moveTo(0, 3);
  ctx.lineTo(0, -16);
  ctx.stroke();
  const wave = Math.sin(time * 2.3 + x * 0.02) * 1.5;
  const color =
    u.pennon === "cross" ? "#f7f3ea" : u.pennon === true ? u.coat || "#888" : u.pennon;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(0, -16);
  ctx.quadraticCurveTo(8, -14 + wave, 15, -12.5);
  ctx.quadraticCurveTo(8, -10 - wave * 0.5, 0, -9);
  ctx.fill();
  if (u.pennon === "cross") {
    ctx.strokeStyle = "#a33b32";
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(7, -14.6);
    ctx.lineTo(7, -11.2);
    ctx.moveTo(5.2, -13);
    ctx.lineTo(8.8, -13);
    ctx.stroke();
  }
  ctx.restore();
}

function drawGuidon(ctx, battle, u) {
  if (u.pennon || u.opacity < 0.35) return;
  const g = groundLift(battle, u.x, u.y);
  const color = u.coat || battle.sides.find((s) => s.id === u.side)?.color || "#888";
  ctx.save();
  ctx.translate(u.x, u.y - g + (u.sink || 0));
  ctx.globalAlpha = Math.min(1, u.opacity);
  ctx.strokeStyle = "#3a3228";
  ctx.lineWidth = 0.7;
  ctx.beginPath();
  ctx.moveTo(0, 2);
  ctx.lineTo(0, -11);
  ctx.stroke();
  ctx.fillStyle = color;
  ctx.fillRect(0, -11, 3.2, 6);
  ctx.restore();
}

function drawParticles(ctx, battle, fx) {
  for (const p of fx.particles) {
    const gy = p.y - groundLift(battle, p.x, p.y) - (p.z || 0);
    if (p.kind === "smoke" || p.kind === "dust") {
      const a = Math.max(0, p.life / (p.max || 1));
      ctx.fillStyle = `${p.color}${a * 0.55})`;
      ctx.beginPath();
      ctx.ellipse(p.x, gy, p.r, p.r * 0.62, 0, 0, Math.PI * 2);
      ctx.fill();
    } else if (p.kind === "shell") {
      ctx.fillStyle = "#2a2e33";
      ctx.beginPath();
      ctx.arc(p.x, gy, 1.5, 0, Math.PI * 2);
      ctx.fill();
    } else {
      const vx = p.vx || 0;
      const vy = p.vy || 0;
      const len = p.kind === "musket" ? 7 : 5;
      const mag = Math.hypot(vx, vy) || 1;
      ctx.strokeStyle = p.kind === "musket" ? "rgba(255,244,214,0.85)" : "rgba(42,32,24,0.8)";
      ctx.lineWidth = p.kind === "musket" ? 1.1 : 0.8;
      ctx.beginPath();
      ctx.moveTo(p.x, gy);
      ctx.lineTo(p.x - (vx / mag) * len, gy - (vy / mag) * len * 0.35 + 0.2);
      ctx.stroke();
    }
  }
}

function drawClashes(ctx, battle, units, time) {
  for (let i = 0; i < units.length; i++) {
    for (let j = i + 1; j < units.length; j++) {
      const a = units[i];
      const b = units[j];
      if (a.side === b.side || a.opacity < 0.4 || b.opacity < 0.4) continue;
      const hotA = a.order === "fight" || a.order === "charge";
      const hotB = b.order === "fight" || b.order === "charge";
      if (!hotA || !hotB) continue;
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      const reach = (Math.min(a.width, 140) + Math.min(b.width, 140)) * 0.16 + 26;
      if (d > reach) continue;
      const mx = (a.x + b.x) / 2;
      const my = (a.y + b.y) / 2;
      const alpha = (1 - d / reach) * 0.28;
      ctx.fillStyle = `rgba(120, 92, 60, ${alpha})`;
      ctx.beginPath();
      const wob = 12 + Math.sin(time * 6 + i) * 2;
      ctx.ellipse(mx, my - groundLift(battle, mx, my), wob + 10, wob * 0.55, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

function drawWaterShine(ctx, battle, time) {
  const waters = battle.water || [];
  if (!waters.length) return;
  ctx.save();
  ctx.lineWidth = 1;
  ctx.strokeStyle = "rgba(255,255,255,0.22)";
  const shift = (time * 14) % 36;
  for (const w of waters) {
    ctx.save();
    trace(ctx, w.polygon);
    ctx.clip();
    for (let x = -40; x < WORLD_W + 40; x += 32) {
      ctx.beginPath();
      ctx.moveTo(x + shift, 0);
      ctx.bezierCurveTo(x + 16 + shift, 180, x - 10 + shift, 420, x + shift, WORLD_H);
      ctx.stroke();
    }
    ctx.restore();
  }
  ctx.restore();
}

function cameraScale(cam, view) {
  return Math.max(view.w / WORLD_W, view.h / WORLD_H) * cam.zoom;
}

function applyCamera(ctx, cam, view) {
  const s = cameraScale(cam, view);
  ctx.translate(view.w / 2, view.h / 2);
  ctx.scale(s, s);
  ctx.translate(-cam.x, -cam.y);
}

function project(cam, view, x, y) {
  const s = cameraScale(cam, view);
  return [view.w / 2 + (x - cam.x) * s, view.h / 2 + (y - cam.y) * s];
}

function intersects(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

function haloText(ctx, text, x, y, fill) {
  ctx.lineWidth = 3.5;
  ctx.strokeStyle = "rgba(244, 239, 228, 0.88)";
  ctx.lineJoin = "round";
  ctx.strokeText(text, x, y);
  ctx.fillStyle = fill;
  ctx.fillText(text, x, y);
}

function labelAnchor(battle, u) {
  const g = groundLift(battle, u.x, u.y) - (u.sink || 0);
  if (u.shape === "arc") {
    return [
      u.x + Math.cos(u.facing) * (u.radius || 48),
      u.y + Math.sin(u.facing) * (u.radius || 48) - g,
    ];
  }
  return [
    u.x - Math.cos(u.facing) * u.depth * 0.15,
    u.y - Math.sin(u.facing) * u.depth * 0.15 - g,
  ];
}

export function drawBattle(ctx, battle, sample, time, ambient, fx, view, options = {}) {
  const cam = options.camera || sample.camera;
  bake(battle);
  ctx.clearRect(0, 0, view.w, view.h);
  ctx.fillStyle = battle.ground;
  ctx.fillRect(0, 0, view.w, view.h);
  ctx.save();
  applyCamera(ctx, cam, view);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(battle._bake, 0, 0, WORLD_W, WORLD_H);
  drawWaterShine(ctx, battle, ambient);
  if (battle.sun) {
    const sun = battle.sun;
    const u = smooth(clamp((sample.time - sun.t0) / ((sun.t1 - sun.t0) || 1), 0, 1));
    if (u > 0.01) {
      const g = ctx.createRadialGradient(sun.x, sun.y, 10, sun.x, sun.y, sun.r || 260);
      g.addColorStop(0, `rgba(255, 214, 150, ${0.2 * u})`);
      g.addColorStop(1, "rgba(255, 214, 150, 0)");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(sun.x, sun.y, sun.r || 260, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  const sprites = [];
  battle._trees.forEach((tree, i) => {
    const lift = groundLift(battle, tree.x, tree.y);
    sprites.push({
      y: tree.y,
      i,
      draw: () => {
        ctx.save();
        ctx.translate(0, -lift);
        drawTree(ctx, tree, ambient);
        ctx.restore();
      },
    });
  });
  battle._houses.forEach((h, i) => {
    const lift = groundLift(battle, h.x, h.y);
    sprites.push({
      y: h.y,
      i,
      draw: () => {
        ctx.save();
        ctx.translate(0, -lift);
        drawHouse(ctx, h);
        ctx.restore();
      },
    });
  });
  battle._rocks.forEach((r, i) => {
    const lift = groundLift(battle, r.x, r.y);
    sprites.push({
      y: r.y,
      i,
      draw: () => {
        ctx.save();
        ctx.translate(0, -lift);
        drawRock(ctx, r);
        ctx.restore();
      },
    });
  });
  sample.units.forEach((u, i) => {
    sprites.push({ y: u.y, i: 1000 + i, draw: () => drawUnit(ctx, battle, u, time) });
  });
  sprites.sort((a, b) => a.y - b.y || a.i - b.i);
  for (const s of sprites) s.draw();
  for (const u of sample.units) drawGuidon(ctx, battle, u);
  for (const u of sample.units) drawStandard(ctx, battle, u, time);
  drawClashes(ctx, battle, sample.units, time);
  drawParticles(ctx, battle, fx);
  if (battle.fog) {
    const fog = battle.fog;
    let a = fog.alpha;
    if (sample.time <= fog.t0) a = fog.alpha;
    else if (sample.time >= fog.t1) a = 0;
    else a = fog.alpha * (1 - smooth((sample.time - fog.t0) / (fog.t1 - fog.t0)));
    if (a > 0.015) {
      for (const p of fog.patches) {
        const grd = ctx.createRadialGradient(p.x, p.y, 10, p.x, p.y, p.r);
        grd.addColorStop(0, `rgba(226, 232, 234, ${a})`);
        grd.addColorStop(1, "rgba(226, 232, 234, 0)");
        ctx.fillStyle = grd;
        ctx.beginPath();
        ctx.ellipse(p.x, p.y, p.rx || p.r, p.ry || p.r * 0.72, 0, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }
  ctx.restore();

  const focus = new Set(options.unitLabels ? sample.phase.focus || [] : []);
  const placed = [];
  const occlude = options.occlude || [];
  ctx.save();
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.letterSpacing = "0.14em";
  ctx.font = '600 11px Inter, "Liberation Sans", sans-serif';
  for (const label of battle.labels || []) {
    const [sx, sy] = project(cam, view, label.x, label.y - groundLift(battle, label.x, label.y) * 0.15);
    const text = label.text.toUpperCase();
    const tw = ctx.measureText(text).width;
    const box = { x: sx - tw / 2, y: sy - 8, w: tw, h: 16 };
    if (sx < 8 || sy < 8 || sx > view.w - 8 || sy > view.h - 8) continue;
    if (occlude.some((r) => intersects(box, r))) continue;
    if (placed.some((p) => Math.abs(p.x - sx) < tw && Math.abs(p.y - sy) < 16)) continue;
    placed.push({ x: sx, y: sy });
    haloText(ctx, text, sx, sy, "rgba(48, 34, 20, 0.78)");
  }
  ctx.letterSpacing = "0px";
  ctx.font = 'italic 600 13px "Liberation Serif", Palatino, Georgia, serif';
  ctx.textBaseline = "bottom";
  for (const u of sample.units) {
    if (!focus.has(u.id) || !u.label || u.opacity < 0.45) continue;
    const [wx, wy] = labelAnchor(battle, u);
    const [sx, sy] = project(cam, view, wx, wy);
    const text = u.label;
    const tw = ctx.measureText(text).width;
    const box = { x: sx - tw / 2, y: sy - 28, w: tw, h: 18 };
    if (occlude.some((r) => intersects(box, r))) continue;
    haloText(ctx, text, sx, sy - 12, "#2a2118");
  }
  ctx.restore();
}

export function ensureBake(battle) {
  bake(battle);
}
