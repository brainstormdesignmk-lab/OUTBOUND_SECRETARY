export function cleanResponse(text, fallback = '') {
  if (!text || !text.trim()) return fallback;

  let cleaned = text.trim();

  cleaned = cleaned.replace(/<think>[\s\S]*?<\/think>/gi, '');
  cleaned = cleaned.replace(/<\/?think>/gi, '');
  cleaned = cleaned.replace(/```[\s\S]*?```/g, '');
  cleaned = cleaned.replace(/\s+/g, ' ').trim();

  if (cleaned.length > 300) {
    cleaned = cleaned.substring(0, 297) + '...';
  }

  return cleaned;
}
