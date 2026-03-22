/**
 * Markdown rendering utility — SF-4
 *
 * Parses markdown (from AI assistant responses) to sanitized HTML.
 * Uses marked for parsing + DOMPurify for XSS protection.
 * Only used for assistant messages — user messages render as plain text.
 */

import { marked } from 'marked';
import DOMPurify from 'dompurify';

// Configure marked once at module level
marked.setOptions({
  breaks: true, // GFM line breaks (single \n → <br>)
  gfm: true, // GitHub-flavored: tables, task lists, strikethrough
});

const ALLOWED_TAGS = [
  'p', 'br', 'strong', 'em', 'code', 'pre', 'blockquote',
  'ul', 'ol', 'li', 'h3', 'h4', 'h5', 'h6', 'a', 'table',
  'thead', 'tbody', 'tr', 'th', 'td', 'del', 'hr',
];

const ALLOWED_ATTR = ['href', 'target', 'rel', 'class'];

/**
 * Parse markdown to sanitized HTML.
 * Safe for rendering via innerHTML — all dangerous tags/attributes stripped.
 */
export function renderMarkdown(text: string): string {
  const rawHtml = marked.parse(text) as string;
  return DOMPurify.sanitize(rawHtml, {
    ALLOWED_TAGS,
    ALLOWED_ATTR,
    ADD_ATTR: ['target'],
  });
}
