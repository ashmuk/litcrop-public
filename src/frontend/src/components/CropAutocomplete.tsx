/**
 * CropAutocomplete — searchable crop selector with quick-select chips.
 *
 * Features:
 *   - Type-ahead search across 100+ crops (EN + JA)
 *   - Quick-select chips for top 7 crops
 *   - Category grouping in full list view
 *   - Free-text entry for unlisted crops
 *   - IME composition handling for Japanese input
 *   - WAI-ARIA combobox pattern with keyboard navigation
 */

import { useState, useRef, useEffect } from 'preact/hooks';
import { CROPS, CROP_MAP, QUICK_SELECT_CROPS, searchCrops, getCropName, normalizeCropType } from '../lib/crops';
import { getLocale, t } from '../i18n/i18n';
import type { CropEntry } from '../lib/crops';

interface CropAutocompleteProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}

export default function CropAutocomplete({ value, onChange, placeholder }: CropAutocompleteProps) {
  const locale = getLocale();
  const [inputText, setInputText] = useState(() => getCropName(value) || value);
  const [open, setOpen] = useState(false);
  const [results, setResults] = useState<CropEntry[]>([]);
  const [highlightIdx, setHighlightIdx] = useState(-1);
  const [isComposing, setIsComposing] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Sync input text when value prop changes externally
  useEffect(() => {
    setInputText(getCropName(value) || value);
  }, [value, locale]);

  // Cleanup debounce timer on unmount
  useEffect(() => {
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, []);

  function doSearch(query: string) {
    setResults(query ? searchCrops(query, 10) : CROPS);
    if (highlightIdx !== -1) setHighlightIdx(-1);
  }

  function handleInput(e: Event) {
    const val = (e.target as HTMLInputElement).value;
    setInputText(val);
    setOpen(true);

    if (isComposing) return; // Suppress filtering during IME composition

    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => doSearch(val), 150);
  }

  function handleCompositionStart() {
    setIsComposing(true);
  }

  function handleCompositionEnd(e: Event) {
    setIsComposing(false);
    // Trigger search with the composed text
    const val = (e.target as HTMLInputElement).value;
    setInputText(val);
    doSearch(val);
  }

  function selectCrop(entry: CropEntry) {
    onChange(entry.id);
    setInputText(entry[locale]);
    setOpen(false);
    setHighlightIdx(-1);
  }

  function handleBlur() {
    // Delay to allow click on dropdown items to fire first
    setTimeout(() => {
      if (!containerRef.current?.contains(document.activeElement)) {
        setOpen(false);
        // Normalize free-text on blur
        const normalized = normalizeCropType(inputText);
        if (normalized !== value) {
          onChange(normalized);
        }
        setInputText(getCropName(normalized) || normalized);
      }
    }, 200);
  }

  function handleFocus() {
    setOpen(true);
    doSearch(inputText);
  }

  function handleClear() {
    onChange('');
    setInputText('');
    setOpen(false);
    inputRef.current?.focus();
  }

  function handleKeyDown(e: KeyboardEvent) {
    if (!open) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        setOpen(true);
        doSearch(inputText);
        e.preventDefault();
      }
      return;
    }

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setHighlightIdx((prev) => Math.min(prev + 1, results.length - 1));
        break;
      case 'ArrowUp':
        e.preventDefault();
        setHighlightIdx((prev) => Math.max(prev - 1, -1));
        break;
      case 'Enter':
        e.preventDefault();
        if (highlightIdx >= 0 && highlightIdx < results.length) {
          selectCrop(results[highlightIdx]);
        }
        break;
      case 'Escape':
        setOpen(false);
        setHighlightIdx(-1);
        break;
      case 'Tab':
        // Close without selecting (WAI-ARIA combobox pattern)
        setOpen(false);
        setHighlightIdx(-1);
        break;
    }
  }

  // Scroll highlighted item into view
  useEffect(() => {
    if (highlightIdx >= 0) {
      document.getElementById(`crop-option-${highlightIdx}`)?.scrollIntoView({ block: 'nearest' });
    }
  }, [highlightIdx]);

  // Group results by category when showing full list (no filter)
  const showGrouped = !inputText && results.length > 10;

  // O(1) index lookup for grouped render (avoids O(n²) indexOf)
  const entryIndexMap = showGrouped
    ? new Map(results.map((e, i) => [e.id, i]))
    : null;

  const grouped = showGrouped
    ? results.reduce<Record<string, CropEntry[]>>((acc, c) => {
        (acc[c.category] ??= []).push(c);
        return acc;
      }, {})
    : null;

  const listId = 'crop-autocomplete-list';

  return (
    <div ref={containerRef} style="position:relative">
      {/* Quick-select chips */}
      <div style="display:flex;flex-wrap:wrap;gap:var(--space-1);margin-bottom:var(--space-2)">
        {QUICK_SELECT_CROPS.map((id) => {
          const entry = CROP_MAP.get(id);
          if (!entry) return null;
          const isActive = value === id;
          return (
            <button
              key={id}
              type="button"
              class={isActive ? 'badge status-healthy' : 'badge'}
              style={`font-size:var(--font-size-xs);padding:2px 8px;cursor:pointer;border:1px solid var(--color-gray-300);border-radius:var(--radius-sm)${isActive ? ';font-weight:var(--font-weight-semibold)' : ''}`}
              onClick={() => selectCrop(entry)}
            >
              {entry.emoji} {entry[locale]}
            </button>
          );
        })}
      </div>

      {/* Search input */}
      <div style="position:relative">
        <input
          ref={inputRef}
          type="text"
          class="form-input"
          value={inputText}
          onInput={handleInput}
          onFocus={handleFocus}
          onBlur={handleBlur}
          onKeyDown={handleKeyDown}
          onCompositionStart={handleCompositionStart}
          onCompositionEnd={handleCompositionEnd}
          placeholder={placeholder ?? t('bed.select_crop')}
          autocomplete="off"
          role="combobox"
          aria-expanded={open}
          aria-autocomplete="list"
          aria-controls={listId}
          aria-activedescendant={highlightIdx >= 0 ? `crop-option-${highlightIdx}` : undefined}
        />
        {inputText && (
          <button
            type="button"
            onClick={handleClear}
            style="position:absolute;right:8px;top:50%;transform:translateY(-50%);background:none;border:none;cursor:pointer;color:var(--color-gray-500);font-size:var(--font-size-base);padding:4px"
            aria-label={t('buttons.cancel')}
          >
            &times;
          </button>
        )}
      </div>

      {/* Dropdown */}
      {open && results.length > 0 && (
        <ul
          ref={listRef}
          id={listId}
          role="listbox"
          style="position:absolute;z-index:10;width:100%;max-height:240px;overflow-y:auto;background:var(--color-surface);border:var(--border-default);border-radius:var(--radius-md);margin-top:var(--space-1);padding:var(--space-1) 0;box-shadow:var(--shadow-md);list-style:none"
        >
          {grouped
            ? Object.entries(grouped).map(([category, entries]) => (
                <li key={category}>
                  <div
                    style="padding:var(--space-1) var(--space-3);font-size:var(--font-size-xs);font-weight:var(--font-weight-semibold);color:var(--color-gray-500);text-transform:uppercase;letter-spacing:0.05em"
                    role="presentation"
                  >
                    {t(`bed.category.${category}`)}
                  </div>
                  {entries.map((entry) => {
                    const idx = entryIndexMap!.get(entry.id) ?? -1;
                    return (
                      <div
                        key={entry.id}
                        id={`crop-option-${idx}`}
                        role="option"
                        aria-selected={highlightIdx === idx}
                        style={`padding:var(--space-1) var(--space-3);cursor:pointer;font-size:var(--font-size-sm)${highlightIdx === idx ? ';background:var(--color-primary-light)' : ''}`}
                        onMouseDown={(e) => { e.preventDefault(); selectCrop(entry); }}
                        onMouseEnter={() => setHighlightIdx(idx)}
                      >
                        {entry.emoji} {entry[locale]}
                      </div>
                    );
                  })}
                </li>
              ))
            : results.map((entry, idx) => (
                <li
                  key={entry.id}
                  id={`crop-option-${idx}`}
                  role="option"
                  aria-selected={highlightIdx === idx}
                  style={`padding:var(--space-1) var(--space-3);cursor:pointer;font-size:var(--font-size-sm)${highlightIdx === idx ? ';background:var(--color-primary-light)' : ''}`}
                  onMouseDown={(e) => { e.preventDefault(); selectCrop(entry); }}
                  onMouseEnter={() => setHighlightIdx(idx)}
                >
                  {entry.emoji} {entry[locale]}
                </li>
              ))}
        </ul>
      )}
    </div>
  );
}
