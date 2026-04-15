export function buildConversationKey(senderRole, senderId, receiverRole, receiverId) {
  const a = `${senderRole}:${senderId}`;
  const b = `${receiverRole}:${receiverId}`;
  return [a, b].sort().join('|');
}

export function normalizePagination(query) {
  const limit = Math.min(Math.max(Number(query.limit || 50), 1), 200);
  const offset = Math.max(Number(query.offset || 0), 0);
  return { limit, offset };
}

export function sanitizeCsvFilename(name) {
  return String(name || 'export')
    .replace(/[^a-zA-Z0-9-_]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');
}
