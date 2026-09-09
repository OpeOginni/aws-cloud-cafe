# Cloud Café

A small coffee-ordering demo for a Frankfurt meetup. Plain Node.js, HTML, CSS, and JavaScript. No external dependencies.

## Local development

Requires Node.js 20 or newer.

```bash
npm start          # http://localhost:3000
npm run dev        # auto-restart on changes
npm test           # unit and integration tests
```

Use `APP_PORT=8080 npm start` for a different port. The app ignores the generic `PORT` variable because GitTerm reserves it.

## AWS deployment

The app deploys to AWS using SAM (CloudFront + S3 + API Gateway + Lambda) in `eu-central-1`.

```bash
bash infra/deploy.sh
```

Requires `aws`, `sam`, and valid AWS credentials with the `cloud-cafe-*` resource pattern. The script creates a secured artifact bucket, builds the Lambda, deploys the CloudFormation stack, syncs static assets to S3, and invalidates CloudFront.

## What it does

- Browse four drinks and treats and adjust quantities.
- Get server-calculated prices for meetup pickup or office delivery.
- Confirm a demo coffee run for the current visit; nothing is stored or charged.
- Copy order support details, including a request ID and deployed commit.

Two flat whites cost **€8.40 with free pickup** or **€13.30 with delivery**. All calculations use integer cents.

## Structure

- `server.mjs` — Node HTTP server for local development.
- `api/pricing.mjs` — menu, input validation, and pricing (shared by server and Lambda).
- `web/` — responsive frontend (served from S3 via CloudFront in production).
- `test/` — basic pricing and HTTP tests.
- `template.yaml` — SAM/CloudFormation template.
- `infra/lambda/handler.mjs` — Lambda adapter for API Gateway.
- `infra/deploy.sh` — idempotent deployment script.
