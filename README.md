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

## GoodDoc Control Panel

[`@gooddoc/gd-plugin`](https://www.npmjs.com/package/@gooddoc/gd-plugin) adds the GoodDoc panel (ambient scribe, follow-ups,
visit summary) as a drawer: floating **Control Panel** button or **Ctrl+G**. All integration code is in `src/gooddoc/`.

Set the publishable key in `.env.local` (see `.env.example`); without it GoodDoc is off. The key must be registered
for the app's origin (e.g. the `*.workers.dev` URL); if validation fails the panel simply doesn't appear.

| Panel → app | What the app does |
|---|---|
| context | The appointment page sends the patient and appointment on screen |
| `ambient.note` (clinician reviewed + saved) | Saved to that appointment's clinical record via `/api/consultation/save`. Fields the scribe filled replace the chart's; empty ones keep what's charted |
| `appointment.requested` (Book follow-up) | Creates a recall appointment (in memory, like other appointment edits) |
| `host.getRecentActivity` (Visit summary) | Returns the patient's appointments |
| navigate `/patients/:id/visits` | Opens the appointment list filtered to that patient |
