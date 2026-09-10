// Figure build pipeline for Word.
//   masters:  svg/figN-*.svg   (editable; figs 6-9 extracted from the Study C
//                               chart page so charts stay in sync with data)
//   exports:  png/figN-*.png   300 dpi at A4 text width (15.92 cm -> 1881 px)
//             emf/figN-*.emf   vector for Word (via Inkscape)
//   text:     captions.md      all captions in figure order
//             overview.html    every figure with its caption beneath it
// Run:  node dissertation-results/figures/build-figures.js
const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");
const sharp = require("sharp");

const DIR = __dirname;
const SVG = path.join(DIR, "svg");
const PNG = path.join(DIR, "png");
const EMF = path.join(DIR, "emf");
const INKSCAPE = "C:\\Program Files\\Inkscape\\bin\\inkscape.exe";
const TARGET_PX = 1881; // 15.92 cm (A4 minus 2.54 cm margins) at 300 dpi

// ---------------- figure set and captions (single source of truth) ---------
const FIGURES = [
  { file: "fig1-architecture.svg", caption:
    "Figure 1. Layered architecture of the prototype. The five layers separate identity (permissioned actor accounts), consensus (a QBFT proof-of-authority network), the six smart contracts, the off-chain data and oracle layer, and the application and audit layer; the right-hand margin names the design principles and functional requirements instantiated at each layer. Data enters at Layer 4, is committed through Layers 1–3, and is reconstructed and verified at Layer 5, with the spreadsheet and SQLite replicas (dashed) serving only as Study A comparators." },
  { file: "fig2-network-topology.svg", caption:
    "Figure 2. Permissioned network topology, instantiating DP2 (distributed verification). Four QBFT validators form a fully connected consensus mesh (solid links) producing finalised blocks every two seconds, and with N = 4 = 3f + 1 the network tolerates one Byzantine validator. The regulator node (dashed) replicates and verifies the complete ledger without holding a consensus vote — the configuration toggle from Archetype 2 towards Archetypes 3/4 — and node permissioning restricts membership to the enode allowlist. The proof-of-authority design involves no mining, grounding DP9 (environmental proportionality)." },
  { file: "fig3-hash-chain.svg", caption:
    "Figure 3. Hash-linked emission-event chain with hybrid evidence anchoring, instantiating DP1 (granularity with hybrid hash architecture). Each event stores the keccak-256 hash of all its fields, and every subsequent event embeds its predecessor's hash, so the events of one product form a tamper-evident chain; bulky evidence remains off-chain with only its fingerprint anchored on-chain (FR7). Altering any recorded field, or substituting an evidence file, invalidates the stored hashes of every later event, as summarised in the lower panel (FR4)." },
  { file: "fig4-governed-correction.svg", caption:
    "Figure 4. The governed correction pathway, instantiating DP4 (governed immutability) and DP5 (automated escalation). The event registry (left) exposes no update or delete functions, so recorded events are never modified; corrections (right) are appended, role-gated records that cross-reference the original event by index and hash, announce themselves through CorrectionLogged events, and may themselves be superseded, forming a visible chain. Reporting applies the latest correction (the effective total) while the raw total remains recomputable, so the difference between the two figures is exactly the logged correction history; threshold breaches raise EscalationRaised events, and logic upgrades require the 2-of-3 consortium multisig." },
  { file: "fig5-study-a-matrix.svg", caption:
    "Figure 5. Study A outcome matrix: three tampering threats applied to three systems holding identical records, operationalising DP4 and DP5. Red cells mark attacks that succeed silently and cannot be attributed to a person (a competent insider recomputes the file-internal hash columns, defeating file-only audits); amber cells mark attacks caught only by a business-rule heuristic and only if an audit is run; green cells mark the ledger, where no silent alteration path exists and every attempt or restatement is signed and attributed. Full results including the naive-attacker condition are given in the accompanying results table." },
  { file: "fig6-throughput.svg", caption:
    "Figure 6. Sustained throughput of the prototype under open-loop load (300 recordEvent transactions of ≈407,000 gas each from five writer accounts), for the 4-validator and 7-validator configurations. The decline at seven validators reflects both QBFT's quadratically growing message complexity and CPU contention among co-located containers on the single benchmark host, and is therefore an upper bound on the protocol effect (single laptop; hardware specification in the Study C report)." },
  { file: "fig7-latency.svg", caption:
    "Figure 7. Transaction latency (submission to finalised receipt) under burst load, mean and 95th percentile, for the 4-validator and 7-validator configurations. Because all 300 transactions were submitted within seconds, latency is dominated by queueing for block space; steady-state latency would approach the two-second block interval. Under QBFT, inclusion latency equals time-to-finality, as finality is immediate and deterministic at block inclusion." },
  { file: "fig8-block-time.svg", caption:
    "Figure 8. Observed block interval under load, computed from block timestamps across the block range occupied by the benchmark. The 4-validator network held its configured two-second block period; the 7-validator network stretched to three seconds as consensus rounds lengthened under message overhead and host CPU saturation." },
  { file: "fig9-energy.svg", caption:
    "Figure 9. First-order energy per transaction of the proof-of-authority prototype (green, measured via container CPU utilisation and nominal processor TDP) contrasted with the published estimates of Sedlmeir et al. (2020) (red), on a logarithmic scale, instantiating DP9 (environmental proportionality). The prototype's ≈0.6 J per transaction lies about nine orders of magnitude below Bitcoin proof-of-work (~10^9 J), about three orders below large non-PoW permissionless networks (~10^3 J), and directly corroborates the ~1 J estimate for small permissioned deployments." },
];

// ---------------- 1. extract the four chart SVGs from the Study C page ------
const chartPage = fs.readFileSync(
  path.join(DIR, "..", "..", "evaluation", "results", "study-c-report.html"), "utf8");
const chartSvgs = chartPage.match(/<svg[\s\S]*?<\/svg>/g) ?? [];
if (chartSvgs.length !== 4) throw new Error(`expected 4 chart SVGs, found ${chartSvgs.length}`);
const chartNames = ["fig6-throughput.svg", "fig7-latency.svg", "fig8-block-time.svg", "fig9-energy.svg"];
chartSvgs.forEach((svg, i) => {
  let s = svg.replace("<svg", `<svg font-family="Segoe UI, Arial, sans-serif"`);
  // white background for print
  const vb = s.match(/viewBox="0 0 (\d+) (\d+(?:\.\d+)?)"/);
  s = s.replace(/(<svg[^>]*>)/, `$1<rect x="0" y="0" width="${vb[1]}" height="${vb[2]}" fill="#ffffff"/>`);
  fs.writeFileSync(path.join(SVG, chartNames[i]), s + "\n");
});
console.log("Extracted 4 chart SVGs from the Study C report.");

// ---------------- 2. convert every figure ----------------
fs.mkdirSync(PNG, { recursive: true });
fs.mkdirSync(EMF, { recursive: true });
(async () => {
  for (const fig of FIGURES) {
    const svgPath = path.join(SVG, fig.file);
    const base = fig.file.replace(/\.svg$/, "");
    const buf = fs.readFileSync(svgPath);
    const vbWidth = Number(String(buf).match(/viewBox="0 0 (\d+)/)[1]);

    // PNG at exactly 1881 px wide == 15.92 cm at 300 dpi
    const density = (72 * TARGET_PX) / vbWidth;
    await sharp(buf, { density })
      .resize({ width: TARGET_PX })
      .png()
      .withMetadata({ density: 300 })
      .toFile(path.join(PNG, `${base}.png`));

    // EMF via Inkscape
    const r = spawnSync(INKSCAPE, [
      svgPath, "--export-type=emf",
      `--export-filename=${path.join(EMF, `${base}.emf`)}`,
    ], { encoding: "utf8", timeout: 120000 });
    const emfOk = fs.existsSync(path.join(EMF, `${base}.emf`));
    console.log(`${base}: png OK${emfOk ? ", emf OK" : `, EMF FAILED (${(r.stderr || "").slice(0, 80)})`}`);
  }

  // ---------------- 3. captions.md ----------------
  fs.writeFileSync(path.join(DIR, "captions.md"),
    `# Figure captions\n\nIn figure order, ready to paste into Word. Files: ` +
    `\`png/\` (300 dpi raster, sized for the A4 text block at 15.92 cm), ` +
    `\`emf/\` (vector for Word), \`svg/\` (editable masters).\n\n` +
    FIGURES.map((f) => f.caption).join("\n\n") + "\n");

  // ---------------- 4. overview.html ----------------
  const sections = FIGURES.map((f) => {
    const svg = fs.readFileSync(path.join(SVG, f.file), "utf8");
    return `<section>${svg}<p class="caption">${f.caption
      .replace(/&/g, "&amp;").replace(/</g, "&lt;")}</p></section>`;
  }).join("\n");
  fs.writeFileSync(path.join(DIR, "overview.html"), `<!doctype html><html><head>
<meta charset="utf-8"><title>Dissertation figures - overview</title>
<style>
  body { font-family: Georgia, serif; max-width: 54rem; margin: 2rem auto; padding: 0 1rem; }
  section { margin: 2.5rem 0; page-break-inside: avoid; }
  svg { width: 100%; height: auto; border: 1px solid #eee; }
  .caption { font-size: 0.95rem; line-height: 1.5; margin-top: 0.6rem; }
</style></head><body>
<h1>Figures 1-9 with captions</h1>
<p>Masters in <code>svg/</code>; Word-ready exports in <code>png/</code> (300 dpi)
and <code>emf/</code> (vector). Captions are also collected in
<code>captions.md</code>.</p>
${sections}
</body></html>`);
  console.log("Wrote captions.md and overview.html");
})();
