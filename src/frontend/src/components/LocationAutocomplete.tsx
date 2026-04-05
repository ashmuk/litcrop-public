import { useState, useRef, useEffect } from 'preact/hooks';
import { CITIES, CITY_MAP, QUICK_SELECT_CITIES, searchCities, getCityDisplay, normalizeCityInput } from '../lib/cities';
import { getLocale, t } from '../i18n/i18n';
import type { CityEntry } from '../lib/cities';

interface LocationAutocompleteProps {
  value: string;
  onChange: (displayText: string, lat: number | null, lng: number | null) => void;
  placeholder?: string;
}

export default function LocationAutocomplete({ value, onChange, placeholder }: LocationAutocompleteProps) {
  const locale = getLocale();
  const [inputText, setInputText] = useState(() => getCityDisplay(value) || value);
  const [open, setOpen] = useState(false);
  const [results, setResults] = useState<CityEntry[]>([]);
  const [highlightIdx, setHighlightIdx] = useState(-1);
  const [isComposing, setIsComposing] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setInputText(getCityDisplay(value) || value);
  }, [value, locale]);

  useEffect(() => {
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, []);

  function doSearch(query: string) {
    setResults(query ? searchCities(query, 10) : CITIES.slice(0, 20));
    if (highlightIdx !== -1) setHighlightIdx(-1);
  }

  function handleInput(e: Event) {
    const val = (e.target as HTMLInputElement).value;
    setInputText(val);
    setOpen(true);

    if (isComposing) return;

    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => doSearch(val), 150);
  }

  function handleCompositionStart() {
    setIsComposing(true);
  }

  function handleCompositionEnd(e: Event) {
    setIsComposing(false);
    const val = (e.target as HTMLInputElement).value;
    setInputText(val);
    doSearch(val);
  }

  function selectCity(entry: CityEntry) {
    const display = `${entry[locale]}, ${entry.region}`;
    onChange(display, entry.lat, entry.lng);
    setInputText(display);
    setOpen(false);
    setHighlightIdx(-1);
  }

  const blurTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    return () => { if (blurTimerRef.current) clearTimeout(blurTimerRef.current); };
  }, []);

  function handleBlur() {
    blurTimerRef.current = setTimeout(() => {
      if (!containerRef.current?.contains(document.activeElement)) {
        setOpen(false);
        // Normalize free-text on blur
        const normalized = normalizeCityInput(inputText);
        const entry = CITY_MAP.get(normalized);
        if (entry) {
          const display = `${entry[locale]}, ${entry.region}`;
          onChange(display, entry.lat, entry.lng);
          setInputText(display);
        } else if (inputText.trim() && inputText !== value) {
          onChange(inputText.trim(), null, null);
        }
      }
    }, 200);
  }

  function handleFocus() {
    setOpen(true);
    doSearch(inputText);
  }

  function handleClear() {
    onChange('', null, null);
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
          selectCity(results[highlightIdx]);
        }
        break;
      case 'Escape':
      case 'Tab':
        setOpen(false);
        setHighlightIdx(-1);
        break;
    }
  }

  useEffect(() => {
    if (highlightIdx >= 0) {
      document.getElementById(`city-option-${highlightIdx}`)?.scrollIntoView({ block: 'nearest' });
    }
  }, [highlightIdx]);

  // Group results by country when showing full list (no filter)
  const showGrouped = !inputText && results.length > 10;

  const entryIndexMap = showGrouped
    ? new Map(results.map((e, i) => [e.id, i]))
    : null;

  const grouped = showGrouped
    ? results.reduce<Record<string, CityEntry[]>>((acc, c) => {
        const key = c.country === 'JP' ? c.region : c.country;
        (acc[key] ??= []).push(c);
        return acc;
      }, {})
    : null;

  const listId = 'location-autocomplete-list';

  return (
    <div ref={containerRef} style="position:relative">
      {/* Quick-select chips */}
      <div style="display:flex;flex-wrap:wrap;gap:var(--space-1);margin-bottom:var(--space-2)">
        {QUICK_SELECT_CITIES.map((id) => {
          const entry = CITY_MAP.get(id);
          if (!entry) return null;
          const display = `${entry[locale]}, ${entry.region}`;
          const isActive = value === display;
          return (
            <button
              key={id}
              type="button"
              class={isActive ? 'badge status-healthy' : 'badge'}
              style={`font-size:var(--font-size-xs);padding:2px 8px;cursor:pointer;border:1px solid var(--color-gray-300);border-radius:var(--radius-sm)${isActive ? ';font-weight:var(--font-weight-semibold)' : ''}`}
              onClick={() => selectCity(entry)}
            >
              {entry[locale]}
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
          placeholder={placeholder ?? t('setup.location_text_hint')}
          autocomplete="off"
          role="combobox"
          aria-expanded={open}
          aria-autocomplete="list"
          aria-controls={listId}
          aria-activedescendant={highlightIdx >= 0 ? `city-option-${highlightIdx}` : undefined}
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
            ? Object.entries(grouped).map(([group, entries]) => (
                <li key={group}>
                  <div
                    style="padding:var(--space-1) var(--space-3);font-size:var(--font-size-xs);font-weight:var(--font-weight-semibold);color:var(--color-gray-500);text-transform:uppercase;letter-spacing:0.05em"
                    role="presentation"
                  >
                    {group}
                  </div>
                  {entries.map((entry) => {
                    const idx = entryIndexMap!.get(entry.id) ?? -1;
                    return (
                      <div
                        key={entry.id}
                        id={`city-option-${idx}`}
                        role="option"
                        aria-selected={highlightIdx === idx}
                        style={`padding:var(--space-1) var(--space-3);cursor:pointer;font-size:var(--font-size-sm)${highlightIdx === idx ? ';background:var(--color-primary-light)' : ''}`}
                        onMouseDown={(e) => { e.preventDefault(); selectCity(entry); }}
                        onMouseEnter={() => setHighlightIdx(idx)}
                      >
                        {entry[locale]}, {entry.region}
                      </div>
                    );
                  })}
                </li>
              ))
            : results.map((entry, idx) => (
                <li
                  key={entry.id}
                  id={`city-option-${idx}`}
                  role="option"
                  aria-selected={highlightIdx === idx}
                  style={`padding:var(--space-1) var(--space-3);cursor:pointer;font-size:var(--font-size-sm)${highlightIdx === idx ? ';background:var(--color-primary-light)' : ''}`}
                  onMouseDown={(e) => { e.preventDefault(); selectCity(entry); }}
                  onMouseEnter={() => setHighlightIdx(idx)}
                >
                  {entry[locale]}, {entry.region}
                </li>
              ))}
        </ul>
      )}
    </div>
  );
}
