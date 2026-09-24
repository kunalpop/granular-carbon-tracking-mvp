# Pages

The frontend has four primary routes: `/actors`, `/product`, `/events`,
and `/results`. Navigation is gated by localStorage state.

## `/actors`

Registers the configured supply-chain participants through
`components/participants/registerParticipants.ts`, rendered by
`components/participants/Participants.tsx`.
The participant list is cached in `registered-actors-cache` and verified
against the participant registry when the page opens. This is the only enabled
workflow tab at the beginning of a new simulation.

## `/product`

Displays the configured product and registers it through `registerProduct.ts`.
The product is created and its passport is minted on-chain. A serialized
product record is stored in `registered-product-cache` and restored on reload.
The tab is enabled after participants are cached.

## `/events`

Displays one `Stage` card at a time in a horizontal slider. Each card shows
activity, emission factor, schema, owner, CO2e, methodology, and the previous
event link. `registerEmissionEvent.ts` records the event through
`EmissionEventRegistry`, then mirrors positive or negative CO2e in
`CarbonToken`.

The next arrow remains disabled until the current event is confirmed. Each
successful result is stored in `registered-emission-events-cache`. After ten
events, Results becomes available and the sidebar changes to `Simulation
Completed`.

## `/results`

Contains three local tabs:

- **Tampering:** browser-safe Study A scenarios from `studyTampering.ts`.
- **Aggregation:** browser-safe Study B checks from `studyAggregation.ts`.
- **Performance:** committed Study C benchmark JSON loaded by
  `studyPerformance.ts`.

Each study has idle, running, and complete button/status states. Study results
are stored in localStorage and displayed in the right-hand summary card.
After all three studies complete, the sidebar exposes `Start New Simulation`,
which clears localStorage and returns to `/actors`.
