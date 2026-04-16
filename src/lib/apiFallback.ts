export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  if (error && typeof error === 'object' && 'message' in error) {
    const maybeMessage = (error as { message?: unknown }).message;
    if (typeof maybeMessage === 'string') return maybeMessage;
  }
  return '';
}

export function shouldFallbackToDirectDb(error: unknown): boolean {
  const message = getErrorMessage(error).toLowerCase();
  if (!message) return false;

  if (message.includes('failed to fetch')) return true;
  if (message.includes('networkerror')) return true;

  return /(request failed with status|status)\s*(404|405|500|502|503|504)\b/i.test(message);
}

export function isMissingRelationError(error: unknown): boolean {
  if (error && typeof error === 'object' && 'code' in error) {
    const code = String((error as { code?: unknown }).code || '');
    if (code === '42P01') return true;
  }
  const message = getErrorMessage(error).toLowerCase();
  return message.includes('relation') && message.includes('does not exist');
}

