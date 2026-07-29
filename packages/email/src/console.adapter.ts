import { EmailDeliveryError, type EmailMessage, type EmailPort } from "@atelier/domain";

/**
 * The adapter development and tests use.
 *
 * Not a stub. It is a recording adapter, which is what makes assertions like
 * "the reset email contained a single-use token" ordinary — the alternative is
 * mocking the Resend SDK, which tests the mock.
 *
 * It also means the whole test suite runs with no network and no vendor
 * account. A suite that needs an API key is a suite that gets skipped.
 */

export type SentEmail = EmailMessage & { readonly sentAt: number };

export type ConsoleEmailAdapterOptions = {
  /**
   * Where to write the human-readable line. Defaults to no output.
   *
   * Off by default because tests import this adapter constantly and a suite
   * that prints an email per test is a suite whose real failures scroll past.
   * `apps/api` passes its logger in development so the verification link is
   * actually clickable in the terminal.
   */
  readonly write?: (line: string) => void;
  /** Fail the next `send` — for exercising delivery-failure paths. */
  readonly failWith?: string;
};

export type ConsoleEmailAdapter = EmailPort & {
  /** Everything sent, oldest first. */
  readonly sent: readonly SentEmail[];
  /** Most recent message, or undefined. The common assertion. */
  readonly last: SentEmail | undefined;
  clear: () => void;
};

export function createConsoleEmailAdapter(
  options: ConsoleEmailAdapterOptions = {},
): ConsoleEmailAdapter {
  const sent: SentEmail[] = [];

  return {
    get sent() {
      return sent;
    },
    get last() {
      return sent.at(-1);
    },
    clear() {
      sent.length = 0;
    },
    send(message: EmailMessage): Promise<void> {
      if (options.failWith !== undefined) {
        return Promise.reject(new EmailDeliveryError(message.to, options.failWith));
      }

      sent.push({ ...message, sentAt: Date.now() });
      // The link is the point of printing it at all — a developer verifying an
      // account locally needs something to click, not a delivery receipt.
      options.write?.(`[email] to=${message.to} subject=${message.subject}\n${message.text}`);
      return Promise.resolve();
    },
  };
}
