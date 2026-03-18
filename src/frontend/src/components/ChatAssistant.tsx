/**
 * AI Chat Assistant Island — T-FE-11
 * Farm-aware chat using POST /api/v1/chat.
 */

import { useState, useRef, useEffect } from 'preact/hooks';
import { sendChat } from '../lib/api';
import { t } from '../i18n/i18n';

interface Message {
  role: 'user' | 'assistant';
  text: string;
}

const INITIAL_SUGGESTIONS = [
  'What should I check today?',
  'Any frost risk this week?',
  'How is my farm doing?',
];

export interface Props {
  farmId: string;
}

export default function ChatAssistant({ farmId }: Props) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [suggestions, setSuggestions] = useState<string[]>(INITIAL_SUGGESTIONS);
  const bottomRef = useRef<HTMLDivElement>(null);

  const effectiveFarmId =
    (typeof window !== 'undefined' && localStorage.getItem('litcrop-farmId')) || farmId;

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  async function send(text: string) {
    const trimmed = text.trim();
    if (!trimmed || loading) return;
    setMessages((prev) => [...prev, { role: 'user', text: trimmed }]);
    setInput('');
    setSuggestions([]);
    setLoading(true);
    try {
      const res = await sendChat({ message: trimmed, farm_id: effectiveFarmId });
      setMessages((prev) => [...prev, { role: 'assistant', text: res.reply }]);
      if (res.suggestions.length > 0) setSuggestions(res.suggestions);
    } catch {
      setMessages((prev) => [...prev, { role: 'assistant', text: t('chat.error') }]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      style="display:flex;flex-direction:column;height:420px;border:var(--border-default);border-radius:var(--radius-lg);overflow:hidden;background:var(--color-surface)"
      aria-label="AI farm assistant"
    >
      {/* Message thread */}
      <div
        style="flex:1;overflow-y:auto;padding:var(--space-3);display:flex;flex-direction:column;gap:var(--space-3)"
        role="log"
        aria-live="polite"
        aria-label="Chat messages"
      >
        {messages.length === 0 && (
          <div style="text-align:center;color:var(--color-gray-500);padding-top:var(--space-8)">
            <span style="font-size:40px" aria-hidden="true">🌿</span>
            <p style="margin-top:var(--space-2);font-size:var(--font-size-sm)">
              {t('chat.placeholder')}
            </p>
          </div>
        )}
        {messages.map((msg, i) => (
          <div
            key={i}
            style={`display:flex;justify-content:${msg.role === 'user' ? 'flex-end' : 'flex-start'}`}
          >
            <div
              style={`max-width:80%;padding:var(--space-3);border-radius:var(--radius-md);font-size:var(--font-size-sm);line-height:var(--line-height-relaxed);${
                msg.role === 'user'
                  ? 'background-color:var(--color-primary);color:#FFFFFF'
                  : 'background-color:var(--color-gray-100);color:var(--color-text)'
              }`}
            >
              {msg.text}
            </div>
          </div>
        ))}
        {loading && (
          <div style="display:flex;justify-content:flex-start">
            <div
              style="padding:var(--space-3);background-color:var(--color-gray-100);border-radius:var(--radius-md);font-size:var(--font-size-sm);color:var(--color-gray-500)"
              aria-busy="true"
            >
              {t('chat.thinking')}
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Suggestions */}
      {suggestions.length > 0 && (
        <div
          style="display:flex;gap:var(--space-2);overflow-x:auto;padding:var(--space-2) var(--space-3);border-top:var(--border-default);scrollbar-width:none"
          aria-label="Suggested questions"
        >
          {suggestions.map((s, i) => (
            <button
              key={i}
              onClick={() => send(s)}
              style="flex-shrink:0;height:32px;padding:0 var(--space-3);border-radius:var(--radius-full);background:var(--color-primary-light);color:var(--color-primary-dark);font-size:var(--font-size-xs);font-weight:var(--font-weight-medium);font-family:inherit;border:none;cursor:pointer;white-space:nowrap"
              aria-label={`Ask: ${s}`}
            >
              {s}
            </button>
          ))}
        </div>
      )}

      {/* Input row */}
      <div
        style="display:flex;gap:var(--space-2);padding:var(--space-3);border-top:var(--border-default);background:var(--color-surface)"
      >
        <input
          type="text"
          class="form-input"
          placeholder={t('chat.placeholder')}
          value={input}
          onInput={(e) => setInput((e.target as HTMLInputElement).value)}
          onKeyDown={(e) => e.key === 'Enter' && send(input)}
          disabled={loading}
          aria-label="Chat message input"
          style="flex:1;height:var(--touch-target-min)"
        />
        <button
          class="btn-primary"
          onClick={() => send(input)}
          disabled={loading || !input.trim()}
          aria-label={t('chat.send')}
          style="flex-shrink:0;padding:0 var(--space-4)"
        >
          {t('chat.send')}
        </button>
      </div>
    </div>
  );
}
