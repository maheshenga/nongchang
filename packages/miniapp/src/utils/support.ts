export function buildSupportMessage(contact: string): string {
  const normalized = contact.trim();
  return normalized ? `请联系平台管理员：${normalized}` : '请联系平台管理员';
}
