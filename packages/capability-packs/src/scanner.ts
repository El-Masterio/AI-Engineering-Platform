import type { LoadedPack } from "./loader.js";

/**
 * Prompt-injection scanner for untrusted capability packs (ADR-005, §17 Control 4).
 *
 * What this is NOT: a solution to prompt injection. §17 states the position
 * plainly — "there is no complete solution to prompt injection. We therefore
 * assume it succeeds and constrain the blast radius." The real boundary is the
 * tool allowlist, and `confinement.ts` is where that is enforced. This scanner
 * raises the cost of the obvious attacks and refuses the ones we can name.
 * Treating it as the boundary would be the actual security failure.
 *
 * Two design choices worth stating, because both look like bugs:
 *
 * **No context downgrade.** A pattern inside a fenced code block or a table cell
 * scores the same as a bare imperative line. Downgrading fenced content is the
 * obvious way to reduce false positives and it is unsound: the agent reads the
 * whole document, fences included, so a payload in a fence reaches the model
 * exactly as one outside it would. Any rule an attacker can satisfy by adding
 * three backticks is not a rule.
 *
 * **Documented attack patterns therefore trip it.** A pack that TEACHES injection
 * detection contains the strings it teaches about — `skill-security-audit` in the
 * seed corpus is full of them. That is a true positive by this scanner's
 * definition, handled by trust rather than by cleverness: platform packs are
 * authored by us and reviewed in Git, and are not scanned as untrusted input.
 * `platform-corpus.test.ts` pins the exact set of platform packs that trip the
 * scanner, so a NEW one becomes a build failure.
 *
 * Every pattern is anchored on a verb phrase rather than a keyword, and the
 * false-positive fixture is what forced that. `"ignore"`, `"system prompt"`,
 * `"run any command"` and `"skip the security review"` all appear in legitimate
 * engineering prose; `benign-lookalike` in the test corpus contains every one of
 * them, and the first version of these rules refused it five times over.
 */

export const SEVERITIES = ["critical", "high", "medium"] as const;
export type Severity = (typeof SEVERITIES)[number];

/** `fail` refuses the pack; `warn` records it; `pass` is clean. */
export type Verdict = "pass" | "warn" | "fail";

export type Finding = {
  readonly rule: string;
  readonly severity: Severity;
  /** `SKILL.md` or an attachment path — nested injection names its own file. */
  readonly file: string;
  /** 1-indexed, so the message points at something a human can open. */
  readonly line: number;
  readonly excerpt: string;
  readonly why: string;
};

export type ScanResult = {
  readonly verdict: Verdict;
  readonly findings: readonly Finding[];
};

type Rule = {
  readonly rule: string;
  readonly severity: Severity;
  readonly pattern: RegExp;
  readonly why: string;
};

/**
 * A negation immediately before an imperative inverts it.
 *
 * "Do not skip the security review" and "Never send secrets in it" are sentences a
 * *good* org pack contains, and both matched the first version of these rules.
 * Variable-length lookbehind is supported in V8, so the alternatives are spelled
 * out rather than approximated.
 */
const NOT = String.raw`(?<!\b(?:do\s+not|don'?t|never|cannot|can'?t|must\s+not|should\s+not|shall\s+not|won'?t|will\s+not|avoid|refuse\s+to)\s)`;

/** Zero-width and bidi controls: invisible to a reviewer, present for the model. */
const INVISIBLE = /[\u{200B}-\u{200F}\u{202A}-\u{202E}\u{2060}-\u{2064}\u{FEFF}]/u;

/**
 * The same class, global, for rewriting an excerpt.
 *
 * Built from `.source` with the `u` flag carried over explicitly. `new
 * RegExp(INVISIBLE, "g")` drops it, and `\u{200B}` without `u` is not a code
 * point escape at all — it reads as a quantified literal `u`, so the class
 * silently stops matching and every excerpt comes back looking clean.
 */
const INVISIBLE_GLOBAL = new RegExp(INVISIBLE.source, "gu");

/**
 * The rule set, seeded from `skills/skill-security-audit` (§13 names it as the
 * seed) and narrowed to what a *document* can attempt. The script-execution half
 * of that pack's threat model does not apply to prose: a pack shipping an
 * executable is caught structurally below rather than by a text pattern.
 */
const RULES: readonly Rule[] = [
  {
    rule: "system-override",
    severity: "critical",
    pattern: new RegExp(
      String.raw`\b(?:ignore|disregard|forget|override)\s+(?:all\s+|any\s+|the\s+)?(?:previous|prior|above|earlier|preceding|system)\s+(?:instructions?|prompts?|rules?|directives?|guidelines?)`,
      "i",
    ),
    why: "attempts to discard the agent's own instructions",
  },
  {
    rule: "role-hijack",
    severity: "critical",
    // "You are now" must ASSIGN AN IDENTITY. "You are now reading the second half
    // of this guide" is a sentence in a real document, and the first version of
    // this rule refused it.
    pattern: new RegExp(
      String.raw`\b(?:(?:you\s+are\s+now|from\s+now\s+on\s+you\s+are)\s+(?:a\s+|an\s+|the\s+)?(?:\w+[-\s])?(?:agent|assistant|model|ai|bot|admin(?:istrator)?|root|superuser|operator|system|unrestricted|unrestrained|jailbroken|uncensored)` +
        String.raw`|act\s+as\s+(?:root|an?\s+admin(?:istrator)?|sudo|an?\s+unrestricted)` +
        String.raw`|pretend\s+(?:that\s+)?you\s+(?:have\s+no|are\s+not))`,
      "i",
    ),
    why: "attempts to replace the agent's role or claimed privileges",
  },
  {
    rule: "safety-bypass",
    severity: "critical",
    pattern: new RegExp(
      NOT +
        String.raw`\b(?:skip|disable|bypass|turn\s+off)\s+(?:the\s+|all\s+|any\s+)?(?:safety|security)\s*(?:checks?|filters?|guardrails?|rules?|reviews?|scans?)?`,
      "i",
    ),
    why: "attempts to disable a control the platform requires",
  },
  {
    rule: "approval-bypass",
    severity: "critical",
    // §17: irreversible actions require a human approval event, "not configurable
    // away at any autonomy level" — so a document asking for it attacks the one
    // gate that never negotiates.
    pattern: new RegExp(
      String.raw`\b(?:do\s+not|don'?t|never|no\s+need\s+to)\s+(?:ask|request|wait|seek)\s+(?:for\s+)?(?:human\s+|user\s+|any\s+)?(?:approval|permission|confirmation|review|sign-?off)`,
      "i",
    ),
    why: "attempts to remove a human approval gate that §17 makes non-negotiable",
  },
  {
    rule: "exfiltration",
    severity: "critical",
    pattern: new RegExp(
      NOT +
        String.raw`\b(?:send|post|upload|transmit|exfiltrate|leak|forward)\s+(?:the\s+|all\s+|your\s+)?(?:contents?\s+of\s+|files?|secrets?|tokens?|credentials?|api\s*keys?|env(?:ironment)?\s+variables?|\.env)`,
      "i",
    ),
    why: "attempts to move data out of the sandbox",
  },
  {
    rule: "credential-access",
    severity: "critical",
    pattern: /(?:~|\$HOME)\/\.(?:ssh|aws|kube|docker|npmrc|gnupg)\b|\bcat\s+\S*\.env\b/i,
    why: "reads a credential store that no capability pack has business naming",
  },
  {
    rule: "tool-escalation",
    severity: "high",
    // "run any command" needs a permission claim around it. A runbook saying "run
    // any command from the runbook only after sign-off" is the opposite of an
    // escalation request, and it matched the first version of this rule.
    pattern: new RegExp(
      String.raw`\b(?:(?:may|can|should|able\s+to|allowed\s+to|permission\s+to|ability\s+to)\s+(?:run|execute)\s+any\s+(?:command|shell|code)` +
        String.raw`|(?:run|execute)\s+any\s+(?:command|shell|code)\b(?=[^.\n]*\b(?:without|freely|unrestricted|no\s+approval|you\s+(?:want|like|choose))\b)` +
        String.raw`|arbitrary\s+(?:command|code|shell)\s+execution` +
        String.raw`|full\s+(?:filesystem|disk|system|root)\s+access` +
        String.raw`|unrestricted\s+(?:access|permissions?))`,
      "i",
    ),
    why: "asks for capability beyond any agent's allowlist",
  },
  {
    rule: "hidden-unicode",
    severity: "high",
    pattern: INVISIBLE,
    why: "invisible characters — content a human reviewer cannot see in a diff",
  },
  {
    rule: "hidden-directive",
    severity: "high",
    // An HTML comment is invisible in rendered markdown and present in the text
    // the model reads. Only flagged when it carries an imperative.
    pattern:
      /<!--(?:(?!-->)[\s\S])*?\b(?:ignore|you\s+are|instead|must|always|never|do\s+not|send|execute|run)\b(?:(?!-->)[\s\S])*?-->/i,
    why: "an HTML comment carrying an instruction — invisible when rendered",
  },
  {
    rule: "instruction-to-model",
    severity: "medium",
    // Turn-structure markers only. A bare mention of "system prompt" is ordinary
    // engineering prose — a pack about LLM integration says it repeatedly — and
    // flagging it made the rule noise rather than signal.
    pattern:
      /<\/?(?:system|assistant|human)>|\[\/?INST\]|<\|im_(?:start|end)\|>|^###\s*(?:System|Instruction)s?:/i,
    why: "imitates prompt or turn structure rather than reading as documentation",
  },
];

/** Files a markdown-only format has no reason to ship. */
const EXECUTABLE_ATTACHMENT = /\.(?:py|sh|bash|js|mjs|cjs|ts|exe|dll|so|bat|ps1)$/i;

function scanText(file: string, text: string): Finding[] {
  const lines = text.split(/\r?\n/);
  return RULES.map((rule) => firstMatch(rule, file, lines)).filter(
    (finding): finding is Finding => finding !== undefined,
  );
}

/**
 * The first line a rule matches, or nothing.
 *
 * One finding per rule per file: ten hits of the same rule is the same problem,
 * and a report nobody reads to the end is a report that fails.
 */
function firstMatch(rule: Rule, file: string, lines: readonly string[]): Finding | undefined {
  for (const [index, line] of lines.entries()) {
    if (!rule.pattern.test(line)) continue;
    return {
      rule: rule.rule,
      severity: rule.severity,
      file,
      line: index + 1,
      excerpt: excerpt(line),
      why: rule.why,
    };
  }
  return undefined;
}

/** A short excerpt, with invisible characters made visible. */
function excerpt(line: string): string {
  // An excerpt that renders a zero-width character as nothing tells the reviewer
  // their file is fine.
  const visible = line.replaceAll(INVISIBLE_GLOBAL, "␣").trim();
  return visible.length > 120 ? `${visible.slice(0, 117)}...` : visible;
}

/**
 * Scan a pack: body, every attachment, and its declared tool requests.
 *
 * Attachments matter more than the body. §13's nested case is a payload in
 * `references/*.md` that `SKILL.md` never mentions, and a scanner reading only the
 * entry point would report PASS on it.
 */
export function scanPack(pack: LoadedPack): ScanResult {
  const findings: Finding[] = [
    ...scanText("SKILL.md", pack.body),
    ...pack.attachments.flatMap((attachment) => scanText(attachment.file, attachment.text)),
  ];

  // A markdown pack shipping a script is a structural finding, not a textual one.
  // Nothing in the format loads it — which is exactly why nobody would look at it.
  const executables = pack.attachments.filter((attachment) =>
    EXECUTABLE_ATTACHMENT.test(attachment.file),
  );
  for (const executable of executables) {
    findings.push({
      rule: "executable-attachment",
      severity: "high",
      file: executable.file,
      line: 1,
      excerpt: executable.file,
      why: "a capability pack is markdown; nothing loads this, so nothing reviews it",
    });
  }

  // Declaring a tool request is legitimate and is never honoured. Surfacing it
  // still matters: it says what the author expected to get.
  if (pack.requestsTools.length > 0) {
    findings.push({
      rule: "requests-tools",
      severity: "medium",
      file: "SKILL.md",
      line: 1,
      excerpt: `requests-tools: [${pack.requestsTools.join(", ")}]`,
      why: "recorded, never granted — capability comes from the agent spec (ADR-005)",
    });
  }

  return { verdict: verdictFor(findings), findings };
}

function verdictFor(findings: readonly Finding[]): Verdict {
  if (findings.some((finding) => finding.severity === "critical")) return "fail";
  return findings.length > 0 ? "warn" : "pass";
}

/**
 * A pack was refused entry to an agent context.
 *
 * The message lists findings with file and line, because the organization that
 * authored the pack has to be able to fix it — "rejected for security reasons" is
 * a support ticket, not an error.
 */
export class PackRefusedError extends Error {
  readonly result: ScanResult;

  constructor(packName: string, result: ScanResult) {
    const detail = result.findings
      .filter((finding) => finding.severity === "critical")
      .map(
        (finding) =>
          `  ${finding.file}:${finding.line} [${finding.rule}] ${finding.why}\n    ${finding.excerpt}`,
      )
      .join("\n");
    super(`capability pack "${packName}" was refused:\n${detail}`);
    this.name = "PackRefusedError";
    this.result = result;
  }
}
