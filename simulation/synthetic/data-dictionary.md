# Data dictionary — SYNTHETIC emission data generator

Everything produced by `generate.js` is **SYNTHETIC**: activity quantities are
drawn from documented statistical models, not measured from any real product
or supply chain. CO₂e values are synthetic activity × emission factor, where
nine of the ten stage factors are published-and-cited and the stage-2 factor
is composed arithmetically from two cited component factors with documented
synthetic composition assumptions (see [sources.md](sources.md) and
factors-table.json). Nothing in these files is a real product measurement.

## Generation model

- **RNG:** mulberry32, seeded. Default seed **20260806**; identical seed ⇒
  byte-identical output. Each fleet instance uses stream `seed + 7919·instance`.
- **Distributions:** truncated normal (Box–Muller, resampled into [min, max]).
- **Reference laptop:** the distribution central values (no sampling) — one
  fully deterministic, representative instance.
- **Fleet:** N instances (default 300) sampled per stage independently.

## Activity model parameters (all values are ASSUMPTIONS for a generic 14-inch laptop)

| Stage | Quantity (unit) | Mean | SD | Min | Max | Basis of assumption |
|---|---|---|---|---|---|---|
| 1 | Aluminium casing mass (kg) | 1.15 | 0.15 | 0.8 | 1.6 | Typical metal-chassis 14" laptop housing mass |
| 2 | Populated PCB mass (kg) | 0.35 | 0.05 | 0.25 | 0.5 | Mainboard + daughterboards. Factor composition assumes 0.25 kg bare board + ~20 cm² known-good die area per 0.35 kg board (see factors-table.json stage 2) |
| 3 | Battery capacity (kWh) | 0.060 | 0.008 | 0.045 | 0.080 | 45–80 Wh packs common in 13–16" laptops |
| 4 | Screen area (m²) | 0.058 | 0.006 | 0.048 | 0.075 | 13.3"–16" 16:10 panels (14" ≈ 0.0555 m²) |
| 5 | Assembly electricity (kWh) | 25 | 5 | 12 | 40 | Final-assembly energy per unit |
| 6 | Packaging mass (kg) | 0.9 | 0.15 | 0.5 | 1.4 | Box, cushions, inserts |
| 7 | Sea freight (tonne-km) | 65 | 10 | 35 | 95 | ≈3.4 kg shipped mass × ≈19,000 km sea route |
| 8 | Lifetime use electricity (kWh) | 175 | 40 | 80 | 300 | ≈4-year office-use service life |
| 9 | Replacement-battery capacity (kWh) | 0.060 | 0.008 | 0.045 | 0.080 | Repair modelled as one battery replacement (the most common laptop repair); repair-shop electricity (<1 kg CO₂e) excluded and stated |
| 10 | Recycled mass (kg) | 2.0 | 0.2 | 1.5 | 2.6 | Device + battery mass entering recycling |

Known simplifications: stage draws are independent (e.g. shipping tonne-km is
not derived from the sampled masses; casing mass and recycled mass are
uncorrelated); every instance has exactly one event per stage; factors do not
vary across instances (factors are process properties; activity varies per
unit).

## Files and fields

### `output/reference-laptop.json`
Consumed directly by the chain simulation (`npm run simulate:synthetic`).

| Field | Meaning |
|---|---|
| `_DATA_STATUS` | SYNTHETIC banner — carried into any derived output |
| `generator` | script, seed, and mode used |
| `realismCheck` | total vs published anchor range; manufacturing-dominance check |
| `stages[].stageId`, `name` | lifecycle stage (1–10); name suffixed `[SYNTHETIC]` |
| `stages[].actorRole` | which permissioned actor records the stage on-chain |
| `stages[].activityValue`, `activityUnit` | SYNTHETIC activity quantity |
| `stages[].emissionFactor_gCO2ePerUnit` | factor from factors-table.json (g CO₂e per unit) |
| `stages[].factorStatus` | `CITED` (published, verified) or `DERIVED_FROM_CITED` (composed from cited components, stage 2) |
| `stages[].efSource` | provenance string written on-chain with each event |
| `stages[].co2e_kg` | synthetic activity × factor (the chain recomputes this on-chain in grams) |

### `output/fleet-SYNTHETIC.csv`
One row per instance-stage (fleet of N ⇒ N×10 rows).

| Column | Meaning |
|---|---|
| `data_status` | literally `SYNTHETIC` on every row |
| `product_instance` | 1…N |
| `stage_id`, `stage_name` | lifecycle stage |
| `synthetic_activity_value`, `activity_unit` | the sampled activity quantity |
| `emission_factor_gCO2e_per_unit`, `factor_status` | factor and its citation status |
| `co2e_kg` | activity × factor |

### `output/fleet-summary.json`
Distribution statistics of instance totals (min/p05/median/p95/max/mean),
the anchor range, and the count of instances outside it.

## Realism anchoring

Generated totals are checked against published cradle-to-grave laptop
footprints (see `realismAnchor` in factors-table.json): Dell's whitepaper
(300–400 kg CO₂e), the Devera LCA benchmark (median 215, typical 158–287),
and the finding that manufacturing dominates the footprint for many models.
The generator prints a warning if the reference total leaves the range
[150, 450] kg or manufacturing stops dominating the use phase. These anchors
validate *plausibility only* — they do not make the data real.
