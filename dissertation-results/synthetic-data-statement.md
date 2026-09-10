# Synthetic data statement

Two paragraphs for the dissertation: the first for the methodology section,
the second for the limitations section. Citations to verify before
submission: IAI (2024) primary aluminium GHG intensity statistics; IEA (2025)
*Electricity 2025* emissions chapter; Peiseler et al. (2024) *Nature
Communications* 15 (battery carbon footprint distributions); UK
BEIS/DESNZ GHG conversion factors workbook (2025 edition, container ship
average); Dell product carbon footprint whitepaper; Gregor and Hevner (2013).

## Methodology

All emission data recorded by the prototype is synthetic. Activity quantities
for each of the ten lifecycle stages (component masses, electricity
consumption, tonne-kilometres of freight) were generated from truncated
normal distributions whose parameters — central values, dispersion, and
physical bounds — were specified for a generic 14-inch laptop and are
documented in full in the accompanying data dictionary; a fixed random seed
makes every dataset exactly reproducible. Carbon dioxide equivalents were
then computed by multiplying synthetic activity data by emission factors
drawn, wherever available, from published sources: the International
Aluminium Institute's global-average intensity for primary aluminium
(14.8 kg CO₂e/kg, 2023), the IEA's global-average carbon intensity of
electricity generation (445 g CO₂/kWh, 2024) for the assembly and use phases,
the median cell-production footprint for NMC-chemistry lithium-ion batteries
reported by Peiseler et al. (2024) in the tradition of the Argonne GREET model
(74 kg CO₂e/kWh), and the UK Government's greenhouse-gas conversion factor
for container shipping (0.016 kg CO₂e/t·km). Where no published per-unit
factor was accessible — notably for printed circuit boards, display modules,
packaging materials, repair, and end-of-life recycling credits — clearly
labelled placeholder values were used and are flagged as unsourced in every
data file and in the on-chain provenance field of each recorded event.
Generated footprints were sanity-checked against published cradle-to-grave
laptop assessments: the reference instance (269.6 kg CO₂e) and all 300
generated product instances fall within the range reported by manufacturer
product-carbon-footprint disclosures and independent benchmarks
(approximately 150–450 kg CO₂e), and reproduce the finding that manufacturing
dominates the use phase for many models.

## Limitations

The use of synthetic data bounds the claims this instantiation can support.
Because the artefact is an expository instantiation in the sense of Gregor
and Hevner (2013), its evaluation targets are design properties —
tamper-evidence, granular aggregation correctness, auditability, and
performance — and these properties are demonstrably invariant to the
particular emission values recorded: the integrity mechanisms operate
identically on synthetic and measured data. Synthetic data is therefore
appropriate for demonstrating that the design principles are jointly
satisfiable in running code, while permitting controlled experimentation
(fault injection, tampering scenarios, load scaling) that field data would
not allow. What the prototype cannot claim is that any recorded footprint
corresponds to a real product: the activity model's distributional
assumptions are the author's, five of ten emission factors remain unsourced
placeholders — including the two largest contributing stages (circuit board
and display) — and the published factors used are global averages pending
verification against their primary sources. This is an instance of the
oracle boundary acknowledged throughout: the ledger guarantees fidelity of
data after entry, not truth at entry, and no footprint figure generated here
should be cited as an empirical measurement.
