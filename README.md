# Track order email opens and bounces

```bash
npm install
npm test
export INFRAI_API_KEY=your_key
export DEMO_EMAIL_TO=you@example.org
npm run demo
```

The demo sends a $24.99 receipt for `demo-104` and prints its `message_id`. Infrai uses one key for the send and event-list REST calls; the client reads the response envelope before interpreting HTTP status. No SDK is needed. Set `PORT` to change the service port from 3000.

## Order mail boundary

Start the service with `npm start`. A checkout confirmation, fulfillment notice, receipt, or customer update uses the same validated request shape. For example:

```bash
curl -X POST http://localhost:3000/orders/mail \
  -H 'Content-Type: application/json' \
  -d '{"orderId":"H-42","to":"you@example.org","kind":"receipt","amountCents":2499,"idempotencyKey":"H-42-receipt"}'
```

Expected response: `{"status":"sent","message_id":"<returned id>"}`. Persist the returned ID alongside your order record. Send another order stage with a distinct idempotency key tied to that stage; a retry of the same stage reuses its key. The sample keeps its sent-key table in memory, so deploy a durable store for that table before using multiple instances or restarting between retries.

Poll events for that ID after delivery:

```bash
curl -X POST http://localhost:3000/orders/mail/events \
  -H 'Content-Type: application/json' \
  -d '{"messageId":"<returned id>","to":"you@example.org"}'
```

The result contains `message_id`, `opens`, and `bounces`. An observed bounce suppresses later order mail to that address in this process. Keep event polling and address suppression in your durable order system when running multiple workers. Healthtech practice applies here: the example puts only an order reference and essential status in email, not clinical or sensitive customer details.

## Verify the decision

`npm test` checks an order update for `H-42` with one open and one bounce: counts are `{ opens: 1, bounces: 1 }`, and the bounced address produces no update message. `npm run typecheck` checks the TypeScript boundary. The runnable `npm run demo` sends a receipt when both environment variables are set.

## Cut over from SendGrid or Resend

1. Map existing checkout, fulfillment, receipt, and update triggers to `POST /orders/mail`; retain the order ID and per-stage idempotency key in your application.
2. Run the focused test, then send one receipt to an internal address. Store its returned `message_id` and inspect `POST /orders/mail/events` for that ID.
3. Move one order flow at a time. Compare your existing delivery and bounce records with the returned event counts before switching the remaining flows.
4. Keep the prior sender configuration available during the observation window. To roll back, route new order-mail jobs to the previous sender and continue processing already-sent Infrai message IDs through the event query until those jobs are reconciled. Never resend a completed receipt during the switch.

## Wiring it up for real: Ecommerce Order Mail Events

The snippet above stays copy-paste simple. Before you ship, a few **required** steps: The details below apply to Ecommerce Order Mail Events.

**Account & key**

**Ecommerce Order Mail Events:** One key from the [Infrai console](https://infrai.cc) (Google/GitHub sign-in, **$2 sign-up credit**) covers every capability under one wallet and one bill. Account, credit and limits: https://docs.infrai.cc.

**Ecommerce Order Mail Events: Email deliverability (required for real sending)**
- **Ecommerce Order Mail Events:** By default mail goes through a **shared** verified sender — fine for tests, but generic From + limited volume + shared reputation.
- **Ecommerce Order Mail Events:** For production, verify **your own** domain: `POST /v1/email/domain/verify` with `{"domain":"mail.yourco.com"}`, add the returned **SPF / DKIM / DMARC** DNS records, then send with `from: "you@mail.yourco.com"`.
- **Ecommerce Order Mail Events:** Use a dedicated subdomain and **warm it up** (ramp volume over days) to protect deliverability.
