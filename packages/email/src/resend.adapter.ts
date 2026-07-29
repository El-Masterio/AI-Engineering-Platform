import { Resend } from "resend";
import { EmailDeliveryError, type EmailMessage, type EmailPort } from "@atelier/domain";

/**
 * Resend, behind the port (ADR-011).
 *
 * This file is the only place in the codebase that knows the vendor's name.
 * That is the whole design: swapping to Postmark is this file and nothing else.
 */

export type ResendEmailAdapterOptions = {
  readonly apiKey: string;
  /**
   * The From address. Must be on a domain verified with Resend, or every send
   * fails — which is the single most likely misconfiguration here, so the
   * error below names it rather than passing the vendor's message through.
   */
  readonly from: string;
  /**
   * Called with the underlying failure. Wire this to the redacting logger
   * (§M006): provider error bodies routinely echo the request, and §17 makes a
   * secret-shaped string in a log a P1. The rejection the caller sees carries
   * no provider payload at all.
   */
  readonly onError?: (error: unknown) => void;
};

export function createResendEmailAdapter(options: ResendEmailAdapterOptions): EmailPort {
  const client = new Resend(options.apiKey);

  return {
    async send(message: EmailMessage): Promise<void> {
      // Resend reports failure in the response body rather than by throwing, so
      // a bare `await` here would silently succeed on every rejected message.
      const result = await client.emails.send({
        from: options.from,
        to: message.to,
        subject: message.subject,
        text: message.text,
        ...(message.html !== undefined && { html: message.html }),
      });

      if (result.error) {
        options.onError?.(result.error);
        throw new EmailDeliveryError(
          message.to,
          // Deliberately not `result.error.message`. The name is a stable enum
          // ("validation_error", "invalid_from_address"); the message is prose
          // that has carried request echoes.
          `Resend rejected the message (${result.error.name}).`,
          { cause: result.error },
        );
      }
    },
  };
}
