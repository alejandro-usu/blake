#!/usr/bin/env node
/*
  Sanity check for the "Where's Blake?" page. Needs Node 18+, nothing else.

    node tools/check.js [path/to/page.html]

  Loads the page's script against a fake DOM, simulates several visitors for a
  few hours each, and fails if Blake teleports, cuts diagonally across a block,
  leaves the map, crashes, or ends up with a blank status line. Then it prints
  every status line, activity and log entry the page can show, so a person (or
  Claude) can read them over and make sure they all sound right.
*/
"use strict";
const fs = require("fs");

const VISITORS = [1, 777, 12345, 31415926, 987654321, 2718281828, 4000000000];
const HOURS = 3;
const STEP_MS = 50;
const MAX_JUMP = 0.5; // blocks per step; a normal run moves about 0.15

function findPage(arg) {
  if (arg) return arg;
  const known = ["index.html", "blake-is-out-front.html"].find(f => fs.existsSync(f));
  if (known) return known;
  const html = fs.readdirSync(".").filter(f => f.endsWith(".html"));
  if (html.length === 1) return html[0];
  throw new Error("Couldn't tell which page to check. Run: node tools/check.js path/to/page.html");
}

const file = findPage(process.argv[2]);
const script = (fs.readFileSync(file, "utf8").match(/<script>([\s\S]*?)<\/script>/) || [])[1];
if (!script) throw new Error(`No inline <script> found in ${file}`);
const hook = "globalThis.__blake = { stateAt, plan, wordsFor, recentEvents, draw, pointAt, slotOf, slotStart, PLACES, B };";
const testable = script.replace(/\}\)\(\);\s*$/, `${hook} })();`);
if (testable === script) throw new Error("Couldn't find the end of the page script (it should end with `})();`)");

function fakeEl() {
  return {
    attrs: {}, children: [], style: {}, textContent: "", dateTime: "",
    setAttribute(k, v) { this.attrs[k] = String(v); },
    appendChild(c) { this.children.push(c); return c; },
    append(...c) { this.children.push(...c); },
    replaceChildren(...c) { this.children = c; }
  };
}

function loadVisitor(seed) {
  const els = {};
  Object.assign(globalThis, {
    window: globalThis,
    document: {
      getElementById: id => els[id] || (els[id] = fakeEl()),
      createElementNS: () => fakeEl(),
      createElement: () => fakeEl(),
      documentElement: { style: { setProperty() {} } }
    },
    matchMedia: () => ({ matches: false }),
    requestAnimationFrame: () => {},
    localStorage: { getItem: () => String(seed), setItem() {} }
  });
  (0, eval)(testable);
  return globalThis.__blake;
}

const problems = [];
const flag = msg => problems.push(msg);
const when = t => new Date(t).toISOString().slice(11, 19);

// The places themselves
const first = loadVisitor(VISITORS[0]);
first.PLACES.forEach((p, i) => {
  const who = p.name || `place #${i + 1}`;
  for (const key of ["name", "phrase", "icon"]) if (!p[key]) flag(`${who}: missing "${key}"`);
  if (!Array.isArray(p.here) || !p.here.length) flag(`${who}: "here" needs at least one phrase`);
  if (!Array.isArray(p.activities) || !p.activities.length) flag(`${who}: "activities" needs at least one line`);
  if (!Number.isFinite(p.north) || !Number.isFinite(p.east)) flag(`${who}: north and east must be numbers`);
});

// Simulate visitors
const lines = new Set();
const logs = new Set();
const stopped = first.PLACES.map(() => 0);
let stoppedTotal = 0;
const start = Date.UTC(2026, 0, 5, 15, 0, 0);
const end = start + HOURS * 3600e3;

for (const seed of VISITORS) {
  const T = loadVisitor(seed);
  let prev = null;
  for (let t = start; t < end; t += STEP_MS) {
    let s;
    let words;
    try {
      T.draw(t);
      s = T.stateAt(t);
      words = T.wordsFor(s, t);
    } catch (e) {
      flag(`visitor ${seed}: crashed at ${when(t)}: ${e.message}`);
      break;
    }
    let x;
    let y;
    if (s.moving) {
      const p = s.p;
      const at = T.pointAt(p.route, p.cum, ((t - p.start) / (p.end - p.start)) * p.len);
      x = at.x;
      y = at.y;
    } else {
      x = T.PLACES[s.place].x;
      y = T.PLACES[s.place].y;
      stopped[s.place]++;
      stoppedTotal++;
    }
    if (x < T.B.minX || x > T.B.maxX || y < T.B.minY || y > T.B.maxY) {
      flag(`visitor ${seed}: off the map at (${x.toFixed(2)}, ${y.toFixed(2)}) at ${when(t)}`);
    }
    if (prev) {
      const jump = Math.hypot(x - prev[0], y - prev[1]);
      if (jump > MAX_JUMP) flag(`visitor ${seed}: teleported ${jump.toFixed(2)} blocks at ${when(t)}`);
    }
    prev = [x, y];
    if (!words.line || words.stats.some(([k, v]) => !k || !v)) flag(`visitor ${seed}: blank status text at ${when(t)}`);
    lines.add(words.line);
  }
  for (let k = T.slotOf(start); k < T.slotOf(end); k++) {
    const p = T.plan(k);
    if (p.kind === "stay") continue;
    if (p.start < T.slotStart(k) || p.end > T.slotStart(k + 1)) flag(`visitor ${seed}: a "${p.kind}" spills outside its time slot`);
    if (!Number.isFinite(p.mph) || p.mph <= 0) flag(`visitor ${seed}: bad speed on a "${p.kind}"`);
    for (let i = 1; i < p.route.length; i++) {
      const [ax, ay] = p.route[i - 1];
      const [bx, by] = p.route[i];
      if (Math.abs(ax - bx) > 1e-9 && Math.abs(ay - by) > 1e-9) {
        flag(`visitor ${seed}: diagonal step in a "${p.kind}" route, (${ax}, ${ay}) to (${bx}, ${by})`);
        break;
      }
    }
  }
  for (const e of T.recentEvents(end, 60)) {
    logs.add(e.text.replace(/(Spotted at|Turned around near) .*/, "$1 <street corner>").replace(/Ran \d+ laps/, "Ran <n> laps"));
  }
}

// Report
const sorted = set => [...set].sort((a, b) => a.localeCompare(b));
console.log(`Checked ${file}: ${VISITORS.length} visitors x ${HOURS} hours each.\n`);
console.log("Status lines:");
sorted(lines).forEach(l => console.log(`  ${l}`));
console.log("\nActivities:");
first.PLACES.forEach(p => console.log(`  ${p.name}: ${p.activities.join(" | ")}`));
console.log("\nLog entries:");
sorted(logs).forEach(l => console.log(`  ${l}`));
console.log("\nTime spent stopped at each place:");
first.PLACES.forEach((p, i) => console.log(`  ${p.name}: ${Math.round((100 * stopped[i]) / Math.max(1, stoppedTotal))}%`));

if (problems.length) {
  console.log(`\nFAILED with ${problems.length} problem(s):`);
  problems.slice(0, 25).forEach(m => console.log(`  - ${m}`));
  if (problems.length > 25) console.log(`  ...and ${problems.length - 25} more`);
  process.exit(1);
}
console.log("\nAll checks passed.");
