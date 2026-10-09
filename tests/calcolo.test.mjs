/* Test di Reckoning: calcolo (VAN, payback, TIR) e disegno delle schede con le formule spiegate.
   Carica lo script di index.html in una sandbox con un DOM finto. Si lancia con: node tests/calcolo.test.mjs */
import { readFileSync } from "node:fs";
import vm from "node:vm";
import assert from "node:assert/strict";

const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const js = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]).join("\n");

const finto = () => new Proxy(function () {}, {
  get: (_, k) => k === Symbol.toPrimitive ? () => "" : k === Symbol.iterator ? function* () {} : k === "then" ? undefined : finto(),
  set: () => true,
  apply: () => finto()
});
const memoria = new Map();
const ctx = {
  console, setTimeout: () => 0, clearTimeout: () => {}, Promise, Date, Math, JSON, Intl, URL, Blob: function () {},
  localStorage: { getItem: k => memoria.has(k) ? memoria.get(k) : null, setItem: (k, v) => memoria.set(k, String(v)), removeItem: k => memoria.delete(k) },
  document: finto(), navigator: { language: "it-IT" }, matchMedia: () => ({ matches: false, addEventListener() {} }),
  location: { hash: "" }, history: { replaceState() {} }, addEventListener() {}, requestAnimationFrame: () => 0, ResizeObserver: function () { return { observe() {} }; }
};
ctx.window = ctx;
vm.createContext(ctx);
try { vm.runInContext(js, ctx); } catch (e) { /* il disegno iniziale può fallire col DOM finto: il calcolo no */ }

const run = code => vm.runInContext(code, ctx);
let ok = 0;
const test = (nome, fn) => { try { fn(); ok++; console.log("  ✓ " + nome); } catch (e) { console.log("  ✗ " + nome + "\n    " + e.message); process.exitCode = 1; } };
const vicino = (a, b, tol, msg) => assert.ok(Math.abs(a - b) < (tol || 1e-6), (msg || "") + " atteso " + b + ", ottenuto " + a);

/* Caso a mano: 3 anni, tasso 10%. CAPEX 1000 nel primo anno, beneficio 600 nel secondo e nel terzo.
   Netto: −1000, 600, 600. VAN = −1000 + 600/1,1 + 600/1,21 = 41,32.
   Payback semplice: cumulato −1000, −400, 200 → 2 + 400/600 = 2,667. */
function caso() {
  run(`{
    S = nuovoProgetto(2026);
    S.proj.anni = 3; S.proj.tasso = 10; S.proj.criterio = "simple"; S.proj.pbMax = 0;
    const c = nuovaVoce("capex"); c.val = [1000, 0, 0];
    const b = nuovaVoce("ben"); b.val = [0, 600, 600];
    S.voci = [c, b];
    ricalcola();
  }`);
  return run("R.base");
}

console.log("Calcolo");
test("VAN al 10%", () => { const k = caso(); vicino(k.van, -1000 + 600 / 1.1 + 600 / 1.21, 1e-6); });
test("payback semplice", () => { const k = caso(); vicino(k.pbSimple, 2 + 400 / 600, 1e-9); });
test("TIR azzera il VAN", () => { const k = caso(); assert.ok(k.tir > 0.10, "il TIR deve superare il 10% se il VAN è positivo"); vicino(run("vanDi(R.base.net, R.base.tir)"), 0, 1e-6); });

console.log("Formule spiegate");
test("la spiegazione del VAN somma al VAN", () => {
  caso();
  const righe = run("SPG.van(R.base)");
  assert.ok(righe[righe.length - 1].includes(run("fmt(R.base.van)")));
});
test("la spiegazione del payback mostra l'anno di rientro", () => {
  caso();
  const righe = run("SPG.pb(R.base.net, R.base.acc, 'Payback')");
  assert.ok(righe.some(r => r.includes(run("fmt(2 + 400 / 600, 2)"))), righe.join(" | "));
});
test("payback che non rientra", () => {
  run(`{ S = nuovoProgetto(2026); S.proj.anni = 3; const c = nuovaVoce("capex"); c.val = [1000, 0, 0]; S.voci = [c]; ricalcola(); }`);
  const righe = run("SPG.pb(R.base.net, R.base.acc, 'Payback')");
  assert.ok(righe[1].includes("3"), righe.join(" | "));
});

console.log("Disegno (senza errori, con un DOM finto)");
const conEsempio = () => run("S = esempio(); ricalcola();");
["renderVoci", "renderResponso", "renderSens", "renderControlli", "foglio"].forEach(fn => {
  test(fn, () => {
    conEsempio();
    const h = run(fn + "()");
    if (fn !== "renderControlli" && fn !== "foglio") assert.ok(String(h).includes('class="spiega"'), "nessuna cifra spiegata");
  });
});

console.log(ok + " test superati" + (process.exitCode ? ", qualcuno fallito" : ""));
