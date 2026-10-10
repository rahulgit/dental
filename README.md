# DentalCare HMS — Demo

Two-page dental appointment demo built from `../PRD.md` (React + TypeScript + Vite + Tailwind CSS).

```bash
npm install
npm run dev      # http://localhost:5173
npm run build
npm run deploy   # build + wrangler deploy to Cloudflare Workers
```

- `/appointments` — list, search, date/status filters, create & edit appointments
- `/appointments/:sessionId` — clinical record view/edit, procedure editor

## Data / API

Appointments and consultations load from the injomo workflow API through a Cloudflare
Worker (`worker/index.ts`), which also serves the built app. The browser only calls
same-origin `/api/*` routes, so the upstream API needs no CORS headers:

| Route | Upstream |
|---|---|
| `GET /api/appointments` | appointment list |
| `POST /api/consultation/fetch` `{ appointment_id }` | consultation note for an appointment |
| `POST /api/consultation/save` `{ appointment_id, note }` | save consultation (`note` is a JSON string) |

The upstream base URL is the `API_BASE` var in `wrangler.jsonc`. In dev, `@cloudflare/vite-plugin`
runs the same Worker inside `npm run dev`.

- Patient names come from `src/data/patients.csv` (the API returns only `patientId`).
- Creating / editing an appointment has no API yet; those changes are kept in memory for the session.
