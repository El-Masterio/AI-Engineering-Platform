import { describe, expect, it } from "vitest";
import { REDACTED, isSensitiveKey, redact, redactString } from "./redaction.js";

/**
 * M006 acceptance: "a secret-shaped string is redacted in a test."
 *
 * NFR-OBS-2 forbids secrets, PII and customer source code in logs, and §17
 * escalates a secret-shaped string in a log to a P1 incident with rotation.
 * These tests are the check that makes that claim more than an intention.
 */

const SECRETS: [label: string, value: string][] = [
  ["Anthropic key", "sk-ant-api03-AbCdEf0123456789-XyZ"],
  ["OpenAI-style key", "sk-proj0123456789ABCDEFGHIJKLMNOP"],
  ["GitHub PAT", "ghp_0123456789abcdefghijklmnopqrstuvwx"],
  ["GitHub refresh token", "ghr_0123456789abcdefghijklmnopqrstuvwx"],
  ["AWS access key", "AKIAIOSFODNN7EXAMPLE"],
  ["Slack token", "xoxb-123456789012-abcdefghijklmnop"],
  ["JWT", "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N"],
  ["Bearer header", "Bearer abcdef0123456789ABCDEF"],
];

describe("secret-shaped strings are redacted wherever they appear", () => {
  it.each(SECRETS)("redacts a %s in a bare string", (_label, value) => {
    const out = redactString(`credential is ${value} here`);
    expect(out).not.toContain(value);
    expect(out).toContain(REDACTED);
  });

  it.each(SECRETS)("redacts a %s nested in an object", (_label, value) => {
    // The field name is innocuous on purpose: key-based redaction alone would
    // miss every one of these.
    const out = JSON.stringify(redact({ note: { detail: [`saw ${value}`] } }));
    expect(out).not.toContain(value);
  });

  it("redacts a private key block", () => {
    const key = "-----BEGIN RSA PRIVATE KEY-----\nMIIEowIBAAKCAQ\n-----END RSA PRIVATE KEY-----";
    expect(redactString(`key:\n${key}`)).not.toContain("MIIEowIBAAKCAQ");
  });

  it("strips credentials from a connection string but keeps the host", () => {
    // The host is what you need in order to debug; the password is what must go.
    const out = redactString("connect failed: postgresql://atelier:hunter2@db.internal:5432/app");
    expect(out).not.toContain("hunter2");
    expect(out).not.toContain("atelier:");
    expect(out).toContain("db.internal:5432/app");
    expect(out).toContain("postgresql://");
  });
});

describe("sensitive field names are redacted whatever the value looks like", () => {
  it.each([
    "password",
    "passwd",
    "apiKey",
    "api_key",
    "API-KEY",
    "authorization",
    "x-api-key",
    "refresh_token",
    "clientSecret",
    "connection_string",
    "sessionToken",
  ])("treats %s as sensitive", (key) => {
    expect(isSensitiveKey(key)).toBe(true);
    expect((redact({ [key]: "anything at all" }) as Record<string, unknown>)[key]).toBe(REDACTED);
  });

  it.each(["name", "id", "runId", "traceId", "email_verified_at", "count", "status"])(
    "leaves %s alone",
    (key) => {
      expect(isSensitiveKey(key)).toBe(false);
    },
  );
});

describe("redaction does not make logs useless", () => {
  /**
   * The failure mode opposite to leaking: redact so much that nobody can debug
   * anything, at which point the logs get turned off and there is no telemetry
   * at all.
   */
  it("leaves ids, hashes and ordinary text intact", () => {
    const payload = {
      runId: "019fa69a-3f85-76b4-ad2a-431298f548ab",
      traceId: "4bf92f3577b34da6a3ce929d0e0e4736",
      commit: "3fd846f2c1a9b7e4d5f6a8b9c0d1e2f3a4b5c6d7",
      message: "milestone completed in 42s",
      count: 7,
    };
    expect(redact(payload)).toEqual(payload);
  });

  it("keeps a plain URL that carries no credentials", () => {
    const url = "https://api.example.com/v1/runs/019fa69a";
    expect(redactString(url)).toBe(url);
  });
});

describe("PII", () => {
  it("redacts an email address by default", () => {
    expect(redactString("owner is ada@example.com")).not.toContain("ada@example.com");
  });

  it("can be disabled where an address is the thing under test", () => {
    const out = redactString("owner is ada@example.com", { redactPii: false });
    expect(out).toContain("ada@example.com");
  });
});

describe("hostile shapes do not crash the logger", () => {
  it("survives a cycle", () => {
    const node: Record<string, unknown> = { name: "root" };
    node["self"] = node;
    expect(JSON.stringify(redact(node))).toContain("[Circular]");
  });

  it("stops at a depth limit", () => {
    let deep: Record<string, unknown> = { value: "leaf" };
    for (let i = 0; i < 30; i++) deep = { child: deep };
    expect(JSON.stringify(redact(deep))).toContain("max depth");
  });

  it("does not mutate the caller's object", () => {
    // A logger that edits what it is given changes program behaviour depending
    // on whether logging is enabled.
    const original = { password: "hunter2", nested: { token: "abc" } };
    redact(original);
    expect(original.password).toBe("hunter2");
    expect(original.nested.token).toBe("abc");
  });

  it("redacts an Error's message and keeps it serialisable", () => {
    const error = new Error("connect ECONNREFUSED postgresql://u:p@db:5432/x");
    const out = redact({ err: error }) as { err: { name: string; message: string } };
    expect(out.err.name).toBe("Error");
    expect(out.err.message).not.toContain(":p@");
    expect(out.err.message).toContain("ECONNREFUSED");
  });
});
