/**
 * Markdown rendering utility — SF-4
 *
 * Parses markdown (from AI assistant responses) to sanitized HTML.
 * Uses marked for parsing + DOMPurify for XSS protection.
 * Only used for assistant messages — user messages render as plain text.
 */

import { marked } from 'marked';
import DOMPurify from 'dompurify';

marked.setOptions({
  breaks: true,
  gfm: true,
});

const ALLOWED_TAGS = [
  'p', 'br', 'strong', 'em', 'code', 'pre', 'blockquote',
  'ul', 'ol', 'li', 'h3', 'h4', 'h5', 'h6', 'a', 'table',
  'thead', 'tbody', 'tr', 'th', 'td', 'del', 'hr',
];

const ALLOWED_ATTR = ['href', 'target', 'rel', 'class'];

const ALLOWED_URI_REGEXP = /^(?:(?:https?|mailto):|[^a-z]|[a-z+.\-]+(?:[^a-z+.\-:]|$))/i;

// Register DOMPurify hook lazily (only in browser where addHook exists)
let hookRegistered = false;
function ensureHook(): void {
  if (hookRegistered || typeof DOMPurify.addHook !== 'function') return;
  DOMPurify.addHook('afterSanitizeAttributes', (node) => {
    if (node.tagName === 'A') {
      node.setAttribute('target', '_blank');
      node.setAttribute('rel', 'noopener noreferrer');
    }
  });
  hookRegistered = true;
}

/**
 * Parse markdown to sanitized HTML. Browser-only.
 * Links get target="_blank" and rel="noopener noreferrer" via DOMPurify hook.
 */
export function renderMarkdown(text: string): string {
  ensureHook();
  const rawHtml = marked.parse(text) as string;
  return DOMPurify.sanitize(rawHtml, {
    ALLOWED_TAGS,
    ALLOWED_ATTR,
    ALLOWED_URI_REGEXP,
  });
}
