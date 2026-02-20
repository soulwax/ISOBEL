// File: src/utils/redact-secrets.ts

const REDACTED = '[REDACTED]';

const STRING_REDACTION_PATTERNS: Array<[RegExp, string]> = [
  [/([?&](?:key|api[_-]?key|token|access[_-]?token|refresh[_-]?token)=)([^&#\s]+)/gi, `$1${REDACTED}`],
  [/(["']?(?:x-api-key|api[_-]?key|token|access[_-]?token|refresh[_-]?token)["']?\s*[:=]\s*["']?)([^"',\s}]+)/gi, `$1${REDACTED}`],
  [/\b(Bearer\s+)([A-Za-z0-9._~+/=-]+)/gi, `$1${REDACTED}`],
];

export function redactSecrets(input: string): string {
  let output = input;

  for (const [pattern, replacement] of STRING_REDACTION_PATTERNS) {
    output = output.replace(pattern, replacement);
  }

  return output;
}

export function redactUnknown(value: unknown): unknown {
  if (typeof value === 'string') {
    return redactSecrets(value);
  }

  if (value instanceof Error) {
    const message = redactSecrets(value.message);
    const stack = value.stack ? redactSecrets(value.stack) : undefined;
    return stack ? `${message}\n${stack}` : message;
  }

  return value;
}
