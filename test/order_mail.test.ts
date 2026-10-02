import { test } from "node:test";
import { deepStrictEqual, strictEqual } from "node:assert";
import { eventCounts, mailForOrder, orderRequest } from "../src/order_mail.ts";

test("a bounced recipient receives no further order update", () => {
  const order = orderRequest.parse({ orderId: "H-42", to: "patient@example.org", kind: "update", detail: "Ready for pickup", idempotencyKey: "H-42-update" });
  deepStrictEqual(eventCounts([{ type: "opened" }, { type: "bounced" }]), { opens: 1, bounces: 1 });
  strictEqual(mailForOrder(order, true), null);
  strictEqual(mailForOrder(order, false)?.subject, "Update for Order H-42");
});
