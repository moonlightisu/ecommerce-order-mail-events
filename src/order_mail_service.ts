import { createServer } from "node:http";
import { z, ZodError } from "zod";
import { MailApiError } from "./infrai_mail.ts";
import { inspectOrderMail, orderRequest, sendOrderMail } from "./order_mail.ts";

const inspectRequest = z.object({ messageId: z.string().min(1), to: z.string().email() }).strict();
const server = createServer(async (req, res) => {
  const reply = (status: number, value: unknown) => {
    res.writeHead(status, { "Content-Type": "application/json" });
    res.end(JSON.stringify(value));
  };
  if (req.method !== "POST" || (req.url !== "/orders/mail" && req.url !== "/orders/mail/events")) {
    reply(404, { error: "Route not found" });
    return;
  }
  try {
    let raw = "";
    for await (const chunk of req) {
      raw += chunk;
      if (raw.length > 16_384) { reply(413, { error: "Request too large" }); return; }
    }
    const body: unknown = JSON.parse(raw);
    if (req.url === "/orders/mail") reply(200, await sendOrderMail(orderRequest.parse(body)));
    else {
      const query = inspectRequest.parse(body);
      reply(200, await inspectOrderMail(query.messageId, query.to));
    }
  } catch (error) {
    if (error instanceof ZodError || error instanceof SyntaxError) reply(400, { error: "Invalid request body" });
    else if (error instanceof MailApiError) reply(error.status >= 400 && error.status < 500 ? error.status : 502, { error: error.code });
    else if (error instanceof Error && error.message === "Idempotency key belongs to another order") reply(409, { error: error.message });
    else reply(502, { error: "Mail operation failed" });
  }
});

server.listen(Number(process.env.PORT ?? 3000), () => console.log(`Order mail listening on ${process.env.PORT ?? 3000}`));
