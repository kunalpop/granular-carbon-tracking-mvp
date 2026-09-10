# Sources table — every emission factor and its citation status

Citations verified 2026-08-06 (aluminium, battery, grid electricity, sea
freight) and 2026-08-07 (PCB components, display, packaging, repair,
recycling). **CITED** = a published value verified against its primary
source. **DERIVED FROM CITED** = composed arithmetically from cited component
factors with documented synthetic composition assumptions (stage 2 only).
Activity data is SYNTHETIC throughout and has no source —
see [data-dictionary.md](data-dictionary.md).

| Stage | Factor | Value used | Status | Source |
|---|---|---|---|---|
| 1 | Primary aluminium, cradle-to-gate | 14.8 kgCO₂e/kg (2023 global avg; sector range 4.5–22) | **CITED** | [International Aluminium Institute — Primary Aluminium GHG Emissions Intensity](https://international-aluminium.org/statistics/greenhouse-gas-emissions-primary-aluminium/) |
| 2 | Populated PCB, per kg | 185.7 kgCO₂e/kg, composed as 0.25 kg bare board × 60 kgCO₂e/kg + 20 cm² known-good die × 2.5 kgCO₂e/cm² per 0.35 kg board | **DERIVED FROM CITED** | Component factors: [Lövehagen et al. 2023, RSER 183, 113422](https://doi.org/10.1016/j.rser.2023.113422) (bare PCB ~44 kgCO₂e/m²/layer → ~60 kgCO₂e/kg at 8 layers and 6 kg/m²; ICs ~2.5 kgCO₂e/cm² known-good die). Cross-check: [Negi, Rani & Pan 2026, iScience 29(5), 115559](https://doi.org/10.1016/j.isci.2026.115559) |
| 3 | Li-ion cell production, per kWh | 74 kgCO₂e/kWh (NMC811 median; 5th–95th pct 59–115; LFP median 62) | **CITED** | [Peiseler et al. 2024, Nature Communications — Carbon footprint distributions of lithium-ion batteries](https://www.nature.com/articles/s41467-024-54634-y); methodological lineage [Argonne GREET battery LCA](https://greet.anl.gov/files/Li_battery_update_2017) |
| 4 | LCD module, per m² | 222 kgCO₂e/m² (display industry average) | **CITED** | [Lövehagen et al. 2023, RSER 183, 113422](https://doi.org/10.1016/j.rser.2023.113422); the paper notes the PAIA PCF tool implies ~1,400 kgCO₂e/m² (~6× higher) and attributes the divergence mainly to PAIA's display factors |
| 5 | Grid electricity (assembly) | 445 gCO₂/kWh (2024 global average) | **CITED** | [IEA — Electricity 2025, Emissions](https://www.iea.org/reports/electricity-2025/emissions) (note: CO₂ not full CO₂e; location-specific factor preferable) |
| 6 | Packaging cardboard, per kg | 1.19973 kgCO₂e/kg (primary material production; closed-loop recycled variant 1.09811) | **CITED** | [DESNZ GHG Conversion Factors 2025, flat-format workbook](https://www.gov.uk/government/publications/greenhouse-gas-reporting-conversion-factors-2025), Material use > Paper > Paper and board: board > Primary material production (row 4104, id 19_506_5156_15_1); plastics content excluded, stage scoped to cardboard |
| 7 | Sea container freight, per t·km | 16.12 gCO₂e/t·km | **CITED** | [DESNZ GHG Conversion Factors 2025](https://www.gov.uk/government/publications/greenhouse-gas-reporting-conversion-factors-2025) — Freighting goods > Cargo ship > Container ship > Average (verified in the official workbook 2026-08-06) |
| 8 | Grid electricity (use phase) | 445 gCO₂/kWh (2024 global average) | **CITED** | [IEA — Electricity 2025, Emissions](https://www.iea.org/reports/electricity-2025/emissions) (IEA forecasts 415 by 2026; a service-life average would track this decline) |
| 9 | Repair = one replacement battery, per kWh capacity | 74 kgCO₂e/kWh (embodied carbon of the replacement cell) | **CITED** | [Peiseler et al. 2024](https://www.nature.com/articles/s41467-024-54634-y); repair-shop electricity (~1–2 kWh, <1 kgCO₂e at the IEA grid factor) excluded and stated |
| 10 | E-waste recycling credit, per kg | −1.1704 kgCO₂e/kg (−1.0618 MTCO₂E/short ton, Portable Electronic Devices; Mixed Electronics alternative −0.9039) | **CITED** | [US EPA WARM v16, December 2023](https://www.epa.gov/waste-reduction-model/versions-waste-reduction-model), factor read from the Excel tool's internal factor sheet; documentation in the WARM electronics chapter |

## Realism-anchor sources (used only to sanity-check generated totals)

| Anchor | Value | Source |
|---|---|---|
| Dell business laptop, cradle-to-grave | 300–400 kgCO₂e | [Dell whitepaper](https://i.dell.com/sites/content/corporate/corp-comm/en/Documents/dell-laptop-carbon-footprint-whitepaper.pdf) |
| LCA benchmark across models | median 215.1, typical 157.9–286.7 kgCO₂e | [Devera benchmark](https://devera.ai/benchmarks/carbon-footprint-of-a-laptop) |
| Representative 2020 laptop embodied emissions | 200 kgCO₂e | [Lövehagen et al. 2023, RSER 183, 113422](https://doi.org/10.1016/j.rser.2023.113422) |
| Manufacturing share of footprint | ~75–85% for many models; displays ~30% and mainboards ~43% of manufacturing (Dell) | [Circular Computing](https://circularcomputing.com/news/carbon-footprint-laptop/); Dell whitepaper above |

**Summary: 9 of 10 stage factors carry verified citations; the stage-2
populated-board factor is composed from two cited component factors with
documented synthetic composition assumptions. No placeholder values remain
in the factor library.** The on-chain events of the executed run (product 5)
immutably carry the factor library as it stood at execution time; the
factors above are the library of record for the dataset and all future runs.
