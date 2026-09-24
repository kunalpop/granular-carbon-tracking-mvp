# Implementation

## `App.tsx`

`App.tsx` is the application shell and route coordinator. It:

- Renders the top bar, network status, sidebar navigation, and main content area.
- Defines the `/actors`, `/product`, `/events`, and `/results` routes.
- Gates Product, Events, and Results based on localStorage workflow state.
- Listens for participant, product, event, and study completion events.
- Updates the sidebar status from `Simulation Ready` to `Simulation Completed`.
- Displays the `Start New Simulation` button after all three studies complete.
- Clears localStorage and redirects to `/actors` when a new simulation starts.

## `main.tsx`

`main.tsx` is the browser entry point. It:

- Imports the global stylesheet.
- Finds the root DOM element.
- Wraps the application in `React.StrictMode`.
- Provides `BrowserRouter` to `App` for route navigation.
- Mounts the React application with `createRoot`.

The file is named `main.tsx` in the implementation; there is no
`Main.tsx` file.

## Components folder

The `frontend/src/components` folder contains the workflow pages and their
registration or study helpers:

### `participants`

- `participants/Participants.tsx` displays and registers participants.
- `participants/registerParticipants.ts` registers participants and authorises
  lifecycle stages on-chain.

### `product`

- `product/Product.tsx` displays product data and registration state.
- `product/registerProduct.ts` creates the product and mints its passport.

### `simulation`

- `simulation/Simulation.tsx` controls the stage slider and event progress.
- `simulation/registerEmissionEvent.ts` records events and mirrors CO2e tokens.

### `result`

- `result/Results.tsx` provides the three evaluation tabs.
- `result/studyTampering.ts` runs browser-safe Tampering checks.
- `result/studyAggregation.ts` runs browser-safe Aggregation checks.
- `result/studyPerformance.ts` loads and compares Performance benchmark data.

## Current completion behavior

The implemented lifecycle proceeds through these stages:

1. **Participant registration** — `/actors` registers configured participants,
   authorises their lifecycle stages, and caches their confirmed details.
2. **Product registration** — `/product` creates the product, mints its
   passport, and caches the confirmed product record.
3. **Event registration** — `/events` displays one Stage card at a time.
   The authorised participant records the current event on-chain, and positive
   or negative CO2e is mirrored in the carbon-token contract.
4. **Stage progression** — the next stage is unavailable until the current
   event transaction completes. Ten recorded events unlock Results.
5. **Evaluation** — `/results` runs the Tampering, Aggregation, and Performance
   studies. Their results and completion states persist across refreshes.
6. **Simulation completion** — after all three studies finish, the sidebar
   displays `Start New Simulation`. Clicking it clears localStorage and returns
   to `/actors`.
