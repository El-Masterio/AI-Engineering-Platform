import { pino, type Logger as PinoLogger } from "pino";
import { currentCorrelation, currentTraceIds } from "./correlation.js";
import { redact, type RedactionOptions } from "./redaction.js";

/**
 * Structured JSON logging (NFR-OBS-2).
 *
 * pino does the transport and level handling; what this file adds is the part
 * that must not be optional:
 *
 *   - **Redaction runs on every payload**, by key and by value shape, before
 *     anything is serialised. It is a formatter hook rather than a courtesy the
 *     caller is asked to remember, because "remember to redact" is not a
 *     control (§17, and the same reasoning as ADR-007).
 *   - **Correlation and trace ids are attached automatically**, read from
 *     AsyncLocalStorage and the active span. A caller cannot forget them and
 *     cannot get them wrong.
 *
 * The message string is redacted too. That is not paranoia — the realistic leak
 * is `logger.error(\`failed to connect to ${databaseUrl}\`)`, not someone
 * logging a field literally called `password`.
 */

export type LogLevel = "trace" | "debug" | "info" | "warn" | "error" | "fatal";

export type LoggerOptions = {
  /** Emitted as `service` on every line, so one stream can carry several. */
  service: string;
  level?: LogLevel;
  redaction?: RedactionOptions;
  /** Pretty output for local development. JSON always, in every other case. */
  pretty?: boolean;
  /** Test seam: where lines are written. Defaults to stdout. */
  destination?: NodeJS.WritableStream;
};

export type Logger = PinoLogger;

export function createLogger(options: LoggerOptions): Logger {
  const { service, level = "info", redaction, pretty = false, destination } = options;

  const base = pino(
    {
      level,
      base: { service },
      // Seconds-since-epoch is pino's default and is awkward in a log viewer.
      timestamp: () => `,"time":"${new Date().toISOString()}"`,
      formatters: {
        // Ship the level as a word. `30` means nothing to whoever is on call.
        level: (label) => ({ level: label }),
        /**
         * The single choke point. Every log line passes through here, so
         * redaction and correlation cannot be bypassed by a caller who used a
         * different method or forgot a helper.
         */
        log: (object: Record<string, unknown>) => {
          const correlation = currentCorrelation();
          const traceIds = currentTraceIds();
          return {
            ...(redact(object, redaction) as Record<string, unknown>),
            ...(correlation && {
              correlationId: correlation.correlationId,
              ...(correlation.requestId !== undefined && { requestId: correlation.requestId }),
            }),
            ...traceIds,
          };
        },
      },
      hooks: {
        // `formatters.log` never sees the message argument, so it is redacted
        // here. This is the leak that actually happens.
        logMethod(args, method) {
          const redacted = args.map((argument) =>
            typeof argument === "string" ? redact(argument, redaction) : argument,
          );
          // pino binds `this` to the logger when it invokes this hook. That is
          // its documented API; there is no other handle on the logger here.
          // eslint-disable-next-line unicorn/no-this-outside-of-class -- justified: see above
          method.apply(this, redacted as Parameters<typeof method>);
        },
      },
      ...(pretty && { transport: { target: "pino-pretty" } }),
    },
    destination ?? process.stdout,
  );

  return base;
}
