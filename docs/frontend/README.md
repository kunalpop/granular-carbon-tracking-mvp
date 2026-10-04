This folder contains the frontend documentation for the current implementation. Use the links below to jump directly to the relevant markdown files in this directory.

## Content

- [User Guide](guide.md) — end-to-end workflow and role-aware product lifecycle guidance
- [Pages](pages.md) — route-by-route description of the frontend pages
- [Components](components.md) — component inventory for the application
- [Hooks](hooks.md) — hooks, services, and shared UI helper documentation
- [Data](data.md) — on-chain and localStorage data model summary
- [Implementation](implementation.md) — technical implementation details and routing flow
- [Studies](studies.md) — Tampering, Aggregation, and Performance studies
- [Structure](structure.md) — repository and frontend folder structure

## Overview

The frontend is a role-aware React workflow for tracking a product carbon footprint from participant registration through lifecycle recording, governance review, and evaluation studies.

The main workflow is:

1. Register participant accounts and stage permissions.
2. Select or create a product and mint the passport.
3. Record 10 lifecycle events in order.
4. Review corrections, voting, governance thresholds, and escalations.
5. Run Tampering, Aggregation, and Performance studies.
6. Clear local browser state to start a new simulation.

### Current route overview

The app currently exposes these routes in the app shell:

- `/participants`
- `/product`
- `/events`
- `/results`
- `/audit`
- `/voting`
- `/governance`
- `/escalations`

Later workflow pages are gated by account role and product state.

## Structure

```text
frontend/src/
├── App.tsx
├── main.tsx
├── components/
│   ├── audit/
│   ├── events/
│   ├── governance/
│   ├── participants/
│   ├── product/
│   └── results/
├── hooks/
├── services/
├── shared/
└── assets/
```
