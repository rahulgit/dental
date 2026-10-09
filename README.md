# DentalCare HMS — Demo

Two-page dental appointment demo built from `../PRD.md` (React + TypeScript + Vite + Tailwind CSS).

```bash
npm install
npm run dev      # http://localhost:5173
npm run build
```

- `/appointments` — list, search, date/status filters, create & edit appointments
- `/appointments/:sessionId` — clinical record view/edit, procedure editor

Seed clinical record: `src/data/clinical-record.json` (the supplied JSON, unchanged).
Scheduling demo data: `src/data/seed.ts` (kept separate from the clinical record, linked by `sessionId`).
Edits persist to `localStorage`; use **Reset demo data** in the header to restore the seed.
