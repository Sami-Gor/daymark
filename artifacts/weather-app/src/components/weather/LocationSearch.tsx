import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { Search, X } from 'lucide-react';
import { searchPlaces, type Place } from '@/lib/weather';
import { useLocale } from '@/hooks/use-locale';

type SearchStatus = 'idle' | 'loading' | 'ready' | 'empty' | 'error';

const LISTBOX_ID = 'location-search-listbox';
const DEBOUNCE_MS = 250;

/*
 * Searchable location control.
 *
 * - debounced (250 ms) so it never searches on every keystroke
 * - minimum 2 characters; empty/1-char queries never hit the network
 * - every new query aborts the previous request and ignores stale responses
 * - keyboard accessible combobox/listbox with Arrow Up/Down, Enter and Escape
 * - results show name plus region/country to disambiguate duplicates
 */
export function LocationSearch({ onSelect }: { onSelect: (place: Place) => void }) {
  const { t } = useLocale();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Place[]>([]);
  const [status, setStatus] = useState<SearchStatus>('idle');
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const requestRef = useRef(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length < 2) {
      setResults([]);
      setStatus('idle');
      setOpen(false);
      setActiveIndex(-1);
      return;
    }
    const controller = new AbortController();
    const id = requestRef.current + 1;
    requestRef.current = id;
    setStatus('loading');
    setOpen(true);
    setActiveIndex(-1);
    const timer = window.setTimeout(() => {
      void searchPlaces(trimmed, { signal: controller.signal })
        .then((places) => {
          if (requestRef.current !== id) return;
          setResults(places);
          setStatus(places.length ? 'ready' : 'empty');
        })
        .catch(() => {
          if (requestRef.current !== id || controller.signal.aborted) return;
          setResults([]);
          setStatus('error');
        });
    }, DEBOUNCE_MS);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [query]);

  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, []);

  const choose = useCallback((place: Place) => {
    requestRef.current += 1; // invalidate any in-flight search
    onSelect(place);
    setQuery('');
    setResults([]);
    setStatus('idle');
    setOpen(false);
    setActiveIndex(-1);
    inputRef.current?.blur();
  }, [onSelect]);

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Escape') {
      setOpen(false);
      setActiveIndex(-1);
      return;
    }
    if (!results.length) return;
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setOpen(true);
      setActiveIndex((index) => (index + 1) % results.length);
      return;
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      setOpen(true);
      setActiveIndex((index) => (index <= 0 ? results.length - 1 : index - 1));
      return;
    }
    if (event.key === 'Enter' && activeIndex >= 0 && activeIndex < results.length) {
      event.preventDefault();
      choose(results[activeIndex]);
    }
  };

  return (
    <div className="location-search" ref={rootRef} data-testid="location-search">
      <div className="location-search-field">
        <Search size={14} strokeWidth={1.9} aria-hidden="true" />
        <input
          ref={inputRef}
          type="text"
          role="combobox"
          aria-label={t('search.label')}
          aria-expanded={open}
          aria-controls={LISTBOX_ID}
          aria-autocomplete="list"
          aria-activedescendant={activeIndex >= 0 ? `${LISTBOX_ID}-option-${activeIndex}` : undefined}
          autoComplete="off"
          placeholder={t('search.label')}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onFocus={() => { if (results.length) setOpen(true); }}
          onKeyDown={onKeyDown}
          data-testid="input-location-search"
        />
        {query && (
          <button
            type="button"
            className="location-search-clear"
            aria-label={t('search.clear')}
            onClick={() => { setQuery(''); inputRef.current?.focus(); }}
            data-testid="button-clear-location-search"
          >
            <X size={13} strokeWidth={2} />
          </button>
        )}
      </div>
      {open && (
        <ul className="location-results" role="listbox" id={LISTBOX_ID} aria-label={t('search.results')} data-testid="location-results">
          {status === 'loading' && <li className="location-status" data-testid="location-status">{t('search.searching')}</li>}
          {status === 'empty' && <li className="location-status" data-testid="location-status">{t('search.noResults')}</li>}
          {status === 'error' && <li className="location-status" data-testid="location-status">{t('search.error')}</li>}
          {status === 'ready' && results.map((place, index) => (
            <li
              key={`${place.name}-${place.latitude}-${place.longitude}-${index}`}
              id={`${LISTBOX_ID}-option-${index}`}
              role="option"
              aria-selected={index === activeIndex}
              className="location-option"
              data-testid={`location-option-${index}`}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => choose(place)}
              onMouseEnter={() => setActiveIndex(index)}
            >
              <strong>{place.name}</strong>
              <span>{[place.admin1, place.country].filter(Boolean).join(', ')}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
