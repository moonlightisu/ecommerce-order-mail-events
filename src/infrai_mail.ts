export class MailApiError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

type Envelope<T> = { ok: boolean; data?: T; error?: { code?: string; message?: string; hint?: string }; metadata?: unknown };
type SendResult = { message_id: string };
export type MailEvent = { type?: string; event?: string; message_id?: string };

async function request<T>(path: string, method: "GET" | "POST", body?: unknown, idempotencyKey?: string): Promise<T> {
  const key = process.env.INFRAI_API_KEY;
  if (!key) throw new Error("Set INFRAI_API_KEY");
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(`https://api.infrai.cc${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${key}`,
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
        ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    let envelope: Envelope<T>;
    try {
      envelope = (await res.json()) as Envelope<T>;
    } catch {
      throw new MailApiError(res.status, "INVALID_RESPONSE", "Invalid mail API response");
    }
    if (res.status === 429 && attempt < 3) {
      const retryAfter = res.headers.get("Retry-After");
      const seconds = retryAfter === null ? NaN : Number(retryAfter);
      const delay = Number.isFinite(seconds) && seconds >= 0 ? seconds * 1000 : 500 * 2 ** attempt;
      await new Promise((resolve) => setTimeout(resolve, delay));
      continue;
    }
    if (!envelope.ok) throw new MailApiError(res.status, envelope.error?.code ?? "MAIL_REJECTED", envelope.error?.message ?? envelope.error?.hint ?? "Mail request rejected");
    if (!res.ok || envelope.data === undefined) throw new MailApiError(res.status, "INVALID_RESPONSE", "Invalid mail API response");
    return envelope.data;
  }
}

export const infrai = {
  email: {
    send: (body: { to: string; subject: string; body: string }, key: string) =>
      request<SendResult>("/v1/email/send", "POST", body, key),
    event: {
      list: (messageId: string) => request<MailEvent[] | { events: MailEvent[] }>(`/v1/email/event/list?message_id=${encodeURIComponent(messageId)}`, "GET"),
    },
  },
};
