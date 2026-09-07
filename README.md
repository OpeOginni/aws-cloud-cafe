# Cloud Café

A small coffee-ordering demo for a Frankfurt meetup. Plain Node.js, HTML, CSS, and JavaScript. No dependencies, cloud services, database, or build step.

## Run

Requires Node.js 22 or newer.

```bash
npm start
```

Open **http://localhost:3000**. Use `npm run dev` for automatic server restarts while editing, or `PORT=8080 npm start` for a different port. The server listens on all interfaces so it can be previewed from a remote workspace.

```bash
npm test
```

## What it does

- Browse four drinks and treats and adjust quantities.
- Get server-calculated prices for meetup pickup or office delivery.
- Confirm a demo coffee run for the current visit; nothing is stored or charged.
- Copy order support details, including a request ID.

Two flat whites cost **€8.40 with free pickup** or **€13.30 with delivery**. All calculations use integer cents.

## Structure

- `server.mjs` — Node HTTP server serving the website and JSON API.
- `api/pricing.mjs` — menu, input validation, and pricing.
- `web/` — responsive frontend.
- `test/` — basic pricing and HTTP tests.

The application starts healthy. There is no AWS implementation, deployment tooling, CI/CD, or injected bug in this starting version.
