import { beforeEach, describe, expect, it, vi } from "vitest";
import { EmailDeliveryError } from "@atelier/domain";

/**
 * The one thing worth testing here is the failure path, and it is worth testing
 * precisely because it is counter-intuitive: **Resend reports rejection in the
 * response body rather than by throwing**. A bare `await client.emails.send()`
 * therefore succeeds on every rejected message, and the bug is invisible until
 * users report that verification emails never arrive.
 *
 * The SDK is mocked because the alternative is a network call and a vendor
 * account in CI. That is a real limitation — this proves our handling of a
 * shape, not that the shape is right — so the shape is taken from Resend's
 * documented `{ data, error }` response and pinned here.
 */

const send = vi.fn();
vi.mock("resend", () => ({
  Resend: class {
    emails = { send };
  },
}));

const { createResendEmailAdapter } = await import("./resend.adapter.js");

const message = { to: "ada@example.test", subject: "Verify", text: "link" };
const adapterOptions = { apiKey: "re_test", from: "Atelier <noreply@example.test>" };

// Without this, mock.calls accumulates across the file and calls[0] is whatever
// the FIRST test sent - which is how the html assertion below read undefined.
beforeEach(() => {
  send.mockClear();
});

describe("createResendEmailAdapter", () => {
  it("resolves when Resend accepts the message", async () => {
    send.mockResolvedValueOnce({ data: { id: "msg_1" }, error: null });
    await expect(createResendEmailAdapter(adapterOptions).send(message)).resolves.toBeUndefined();
  });

  it("THROWS when Resend rejects in the body rather than by throwing", async () => {
    // The whole reason this file exists.
    send.mockResolvedValueOnce({
      data: null,
      error: { name: "validation_error", message: "The from address is not verified." },
    });

    await expect(createResendEmailAdapter(adapterOptions).send(message)).rejects.toThrow(
      EmailDeliveryError,
    );
  });

  it("reports the stable error name, not the vendor's prose", async () => {
    // `message` is prose that has historically echoed the request; `name` is a
    // stable enum. §17 — no provider payload crosses the boundary.
    send.mockResolvedValueOnce({
      data: null,
      error: { name: "invalid_from_address", message: "api_key=re_live_SECRET rejected" },
    });

    let error: unknown;
    try {
      await createResendEmailAdapter(adapterOptions).send(message);
    } catch (error_: unknown) {
      error = error_;
    }

    expect((error as Error).message).toContain("invalid_from_address");
    expect((error as Error).message).not.toContain("re_live_SECRET");
  });

  it("hands the raw failure to onError, for the redacting logger", async () => {
    const seen: unknown[] = [];
    send.mockResolvedValueOnce({
      data: null,
      error: { name: "rate_limit_exceeded", message: "x" },
    });

    try {
      await createResendEmailAdapter({
        ...adapterOptions,
        onError: (error) => {
          seen.push(error);
        },
      }).send(message);
    } catch {
      /* the rejection is not what this test is about */
    }

    expect(seen).toHaveLength(1);
  });

  it("omits html entirely when absent rather than sending undefined", async () => {
    send.mockResolvedValueOnce({ data: { id: "1" }, error: null });
    await createResendEmailAdapter(adapterOptions).send(message);

    expect(Object.hasOwn(send.mock.calls[0]?.[0] as object, "html")).toBe(false);
  });

  it("passes html through when present", async () => {
    send.mockResolvedValueOnce({ data: { id: "1" }, error: null });
    await createResendEmailAdapter(adapterOptions).send({ ...message, html: "<p>link</p>" });

    expect((send.mock.calls[0]?.[0] as { html?: string }).html).toBe("<p>link</p>");
  });
});
