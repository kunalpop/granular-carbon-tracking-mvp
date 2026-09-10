# Dissertation-ready results

Curated outputs of evaluation Studies A–C, formatted for direct use in the
evaluation chapter. Rebuilt from the raw study outputs with
`npm run results:build` (re-run it after any study is re-executed, e.g. once
real emission factors replace the placeholders).

| File | Contents |
|---|---|
| `summary.md` | One-page plain-English summary of all three studies + limitations |
| `table-study-a.md` / `.csv` | Full tampering matrix (system × threat × attacker level) |
| `table-study-a-headline.md` / `.csv` | Condensed 3×3 headline matrix (strongest attacker) |
| `table-study-b.md` / `.csv` | All 15 aggregation-correctness and fault-injection checks |
| `table-study-c.md` / `.csv` | Performance in Paper 1 Table 1 variables (TPS, block time, TTF) + energy |
| `charts-study-c.html` | TPS / latency / block-time / energy charts (open in a browser) |
| `figures/` | Figures 1–9 for Word: `svg/` editable masters, `png/` 300 dpi rasters sized for the A4 text block, `emf/` vector for Word, `captions.md` all captions in order, `overview.html` every figure with its caption. Rebuild with `node dissertation-results/figures/build-figures.js` |
| `synthetic-data-statement.md` | Methodology + limitations paragraphs on the synthetic data |

`.md` tables paste into most editors; `.csv` versions import into Excel/Word.
Raw data and full method write-ups live in `evaluation/results/`.

**Data quality reminder:** all emission factors in the prototype are
placeholders tagged "SOURCE NEEDED". The integrity/aggregation/performance
results are independent of factor values, but no *footprint* figure from this
prototype may be quoted until factors are replaced with cited values.
