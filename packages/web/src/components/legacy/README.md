# Legacy Components

This directory contains retired or reference-only UI surfaces that are not part of the production SaaS console.

`MobileView.tsx` is kept only as historical reference for the older mobile demo. It contains simulated workflows, local-only interactions, mock sensor values, and non-production copy. Do not import it from `App.tsx`, `navigation.ts`, routed production pages, or shared production UI.

If a real mobile workflow is needed, implement it in `packages/miniapp` or behind a new production plan with real API contracts and tests.
