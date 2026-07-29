import { describe, expect, it } from "vitest";
import { EmailDeliveryError } from "@atelier/domain";
import { createConsoleEmailAdapter } from "./console.adapter.js";

const message = { to: "ada@example.test", subject: "Verify your email", text: "link: /verify?t=x" };

describe("createConsoleEmailAdapter", () => {
  it("records what was sent so a test can assert on it", async () => {
    const email = createConsoleEmailAdapter();
    await email.send(message);

    expect(email.sent).toHaveLength(1);
    expect(email.last?.to).toBe("ada@example.test");
    expect(email.last?.text).toContain("/verify?t=x");
  });

  it("stays silent unless a writer is supplied", async () => {
    // The suite imports this adapter constantly; printing an email per test is
    // how real failures end up scrolled off the screen.
    const lines: string[] = [];
    const quiet = createConsoleEmailAdapter();
    const loud = createConsoleEmailAdapter({
      write: (line) => {
        lines.push(line);
      },
    });

    await quiet.send(message);
    expect(lines).toHaveLength(0);

    await loud.send(message);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain("/verify?t=x");
  });

  it("can be told to fail, so delivery-failure paths are testable", async () => {
    const email = createConsoleEmailAdapter({ failWith: "mailbox full" });
    await expect(email.send(message)).rejects.toThrow(EmailDeliveryError);
    expect(email.sent).toHaveLength(0);
  });

  it("names the recipient on failure and nothing else", async () => {
    // §17: the error crosses a boundary, so it carries what a caller can act on
    // and no provider payload.
    const email = createConsoleEmailAdapter({ failWith: "mailbox full" });
    let error: unknown;
    try {
      await email.send(message);
    } catch (error_: unknown) {
      error = error_;
    }

    expect((error as EmailDeliveryError).recipient).toBe("ada@example.test");
    expect(JSON.stringify(error)).not.toContain("link:");
  });

  it("clears", async () => {
    const email = createConsoleEmailAdapter();
    await email.send(message);
    email.clear();
    expect(email.sent).toHaveLength(0);
    expect(email.last).toBeUndefined();
  });

  it("keeps messages in send order", async () => {
    const email = createConsoleEmailAdapter();
    await email.send({ ...message, subject: "first" });
    await email.send({ ...message, subject: "second" });

    expect(email.sent.map((m) => m.subject)).toEqual(["first", "second"]);
    expect(email.last?.subject).toBe("second");
  });
});
