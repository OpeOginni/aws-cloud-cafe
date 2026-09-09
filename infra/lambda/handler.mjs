import { randomUUID } from 'node:crypto';
import { menu, quoteOrder } from './pricing.mjs';

const COMMIT = process.env.GIT_COMMIT || 'unknown';

function jsonResponse(statusCode, body, requestId) {
  return {
    statusCode,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      'x-request-id': requestId,
      'x-commit': COMMIT,
    },
    body: JSON.stringify({ ...body, requestId, commit: COMMIT }),
  };
}

export async function handler(event) {
  const requestId = randomUUID();
  const method = event.requestContext?.http?.method || event.httpMethod;
  const path = event.requestContext?.http?.path || event.path;

  try {
    if (method === 'GET' && path === '/api/menu') {
      return jsonResponse(200, { menu }, requestId);
    }

    if (method === 'POST' && path === '/api/quote') {
      const rawBody = event.isBase64Encoded
        ? Buffer.from(event.body, 'base64').toString('utf8')
        : event.body || '';

      if (rawBody.length > 4096) {
        return jsonResponse(413, { error: 'Request too large' }, requestId);
      }

      let input;
      try {
        input = JSON.parse(rawBody);
      } catch {
        return jsonResponse(400, { error: 'Invalid JSON' }, requestId);
      }

      try {
        const quote = quoteOrder(input);

        // Structured log: one JSON event per quote
        const logEvent = {
          event: 'quote',
          requestId,
          commit: COMMIT,
          fulfillment: quote.fulfillment,
          subtotalCents: quote.subtotalCents,
          configuredFeeCents: quote.configuredFeeCents,
          appliedFeeCents: quote.feeCents,
          totalCents: quote.totalCents,
        };

        if (quote.configuredFeeCents !== quote.feeCents) {
          logEvent.warning = 'configured and applied fees differ';
          console.warn(JSON.stringify(logEvent));
        } else {
          console.log(JSON.stringify(logEvent));
        }

        return jsonResponse(200, { quote }, requestId);
      } catch (error) {
        if (error instanceof TypeError) {
          return jsonResponse(400, { error: error.message }, requestId);
        }
        throw error;
      }
    }

    return jsonResponse(404, { error: 'Not found' }, requestId);
  } catch (error) {
    console.error(JSON.stringify({ event: 'error', requestId, commit: COMMIT, message: error.message }));
    return jsonResponse(500, { error: 'The coffee bar is temporarily unavailable' }, requestId);
  }
}
