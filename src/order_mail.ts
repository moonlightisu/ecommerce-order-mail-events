import { z } from "zod";
import { infrai, type MailEvent } from "./infrai_mail.ts";

export const orderRequest = z.object({
  orderId: z.string().min(1).max(80),
  to: z.string().email(),
  kind: z.enum(["checkout", "fulfillment", "receipt", "update"]),
  amountCents: z.number().int().nonnegative().optional(),
  detail: z.string().min(1).max(500).optional(),
  idempotencyKey: z.string().min(1).max(120),
}).strict().superRefine((value, ctx) => {
  if (value.kind === "receipt" && value.amountCents === undefined) ctx.addIssue({ code: "custom", path: ["amountCents"], message: "Required for receipt" });
  if ((value.kind === "fulfillment" || value.kind === "update") && !value.detail) ctx.addIssue({ code: "custom", path: ["detail"], message: "Required for this update" });
});
export type OrderRequest = z.infer<typeof orderRequest>;

export function mailForOrder(order: OrderRequest, bounced: boolean): { to: string; subject: string; body: string } | null {
  if (bounced) return null;
  const label = `Order ${order.orderId}`;
  const content = {
    checkout: [`${label} confirmed`, `We received your order ${order.orderId}.`],
    fulfillment: [`${label} shipped`, `Shipping update for ${label}: ${order.detail}`],
    receipt: [`Receipt for ${label}`, `Receipt for ${label}: $${((order.amountCents ?? 0) / 100).toFixed(2)}.`],
    update: [`Update for ${label}`, `Update for ${label}: ${order.detail}`],
  }[order.kind];
  return { to: order.to, subject: content[0], body: content[1] };
}

export function eventCounts(events: MailEvent[]) {
  return {
    opens: events.filter((item) => (item.type ?? item.event) === "opened").length,
    bounces: events.filter((item) => (item.type ?? item.event) === "bounced").length,
  };
}

const sent = new Map<string, { message_id: string; orderId: string; to: string }>();
const bouncedAddresses = new Set<string>();

export async function sendOrderMail(order: OrderRequest) {
  const previous = sent.get(order.idempotencyKey);
  if (previous) {
    if (previous.orderId !== order.orderId || previous.to !== order.to) throw new Error("Idempotency key belongs to another order");
    return { status: "sent" as const, message_id: previous.message_id };
  }
  const message = mailForOrder(order, bouncedAddresses.has(order.to));
  if (!message) return { status: "suppressed" as const };
  const result = await infrai.email.send(message, order.idempotencyKey);
  sent.set(order.idempotencyKey, { ...result, orderId: order.orderId, to: order.to });
  return { status: "sent" as const, message_id: result.message_id };
}

export async function inspectOrderMail(messageId: string, to: string) {
  const data = await infrai.email.event.list(messageId);
  const events = Array.isArray(data) ? data : data.events;
  const counts = eventCounts(events);
  if (counts.bounces > 0) bouncedAddresses.add(to);
  return { message_id: messageId, ...counts };
}
