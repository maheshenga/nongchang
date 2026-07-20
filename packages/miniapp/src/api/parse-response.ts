interface RuntimeSchema<T> { parse(value: unknown): T }

export function parseResponse<T>(schema: RuntimeSchema<T>, value: unknown, label: string): T {
  try {
    return schema.parse(value);
  } catch (cause) {
    const error = new Error(`Invalid ${label} response`);
    (error as Error & { cause?: unknown }).cause = cause;
    throw error;
  }
}
