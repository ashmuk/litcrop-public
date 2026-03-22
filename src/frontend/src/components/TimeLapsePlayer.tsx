/**
 * TimeLapsePlayer — F-14 (Vision MVP Deliverable #3)
 *
 * Weekly compilation time-lapse: groups images by ISO week, plays
 * ~294 frames at 30fps default (~10s per week). Uses thumbnail URLs
 * for playback (300x300, ~20KB each).
 *
 * Camera schedule: ~42 pics/day (15-min at golden hours, 30-min otherwise).
 */

import { useState, useEffect, useRef, useCallback } from 'preact/hooks';
import type { ImageListItem } from '@litcrop/shared';
import { getImages } from '../lib/api';
import { t } from '../i18n/i18n';
import Lightbox from './Lightbox';

// ── Types ──────────────────────────────────────────────────────

interface WeekGroup {
  weekStart: Date;
  weekEnd: Date;
  label: string;
  images: ImageListItem[];
  complete: boolean;
}

type Speed = 0.5 | 1 | 2;
type Status = 'idle' | 'loading' | 'ready' | 'playing' | 'paused' | 'buffering' | 'error';

interface TimeLapsePlayerProps {
  plotId: string;
  plotLabel: string;
  cropType: string;
}

// ── Helpers ────────────────────────────────────────────────────

/** Get ISO week Monday for a date */
function getWeekMonday(d: Date): Date {
  const date = new Date(d);
  const day = date.getDay();
  const diff = day === 0 ? -6 : 1 - day; // Monday = 1
  date.setDate(date.getDate() + diff);
  date.setHours(0, 0, 0, 0);
  return date;
}

/** Format date as "Mar 15" */
function formatShort(d: Date): string {
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

/** Format date as "Mon 06:15" */
function formatFrameTime(iso: string): string {
  const d = new Date(iso);
  const day = d.toLocaleDateString(undefined, { weekday: 'short' });
  const time = d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', hour12: false });
  return `${day} ${time}`;
}

/** Group images by ISO week, oldest-first within each group */
function groupByWeek(images: ImageListItem[]): WeekGroup[] {
  const map = new Map<string, ImageListItem[]>();

  for (const img of images) {
    const d = new Date(img.captured_at);
    const monday = getWeekMonday(d);
    const key = monday.toISOString().slice(0, 10);
    const arr = map.get(key) ?? [];
    arr.push(img);
    map.set(key, arr);
  }

  const weeks: WeekGroup[] = [];
  for (const [key, imgs] of map) {
    // Sort oldest-first within week
    imgs.sort((a, b) => new Date(a.captured_at).getTime() - new Date(b.captured_at).getTime());
    const weekStart = new Date(key);
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 6);

    // Check if 7 unique days are present
    const uniqueDays = new Set(imgs.map(i => new Date(i.captured_at).toISOString().slice(0, 10)));

    weeks.push({
      weekStart,
      weekEnd,
      label: `${formatShort(weekStart)} – ${formatShort(weekEnd)}`,
      images: imgs,
      complete: uniqueDays.size >= 7,
    });
  }

  // Sort weeks oldest-first
  weeks.sort((a, b) => a.weekStart.getTime() - b.weekStart.getTime());
  return weeks;
}

/** Calculate time-proportional progress (0-100) */
function getProgressPercent(capturedAt: string, weekStart: Date, weekEnd: Date): number {
  const t = new Date(capturedAt).getTime();
  const s = weekStart.getTime();
  const e = weekEnd.getTime() + 86400000; // End of Sunday
  return Math.min(100, Math.max(0, ((t - s) / (e - s)) * 100));
}

// ── Preloader ──────────────────────────────────────────────────

const PRELOAD_BATCH = 6;

function preloadImages(
  urls: string[],
  onProgress: (loaded: number) => void,
): { cancel: () => void; done: Promise<boolean[]> } {
  let cancelled = false;
  let loaded = 0;
  const results: boolean[] = new Array(urls.length).fill(false);

  const done = new Promise<boolean[]>((resolve) => {
    let pending = urls.length;
    if (pending === 0) { resolve(results); return; }

    let cursor = 0;

    function loadNext() {
      while (cursor < urls.length && cursor - loaded < PRELOAD_BATCH) {
        const idx = cursor++;
        const img = new Image();
        img.onload = () => {
          if (cancelled) return;
          results[idx] = true;
          loaded++;
          onProgress(loaded);
          pending--;
          if (pending === 0) resolve(results);
          else loadNext();
        };
        img.onerror = () => {
          if (cancelled) return;
          loaded++;
          onProgress(loaded);
          pending--;
          if (pending === 0) resolve(results);
          else loadNext();
        };
        img.src = urls[idx];
      }
    }

    loadNext();
  });

  return {
    cancel: () => { cancelled = true; },
    done,
  };
}

// ── Component ──────────────────────────────────────────────────

const BASE_FPS = 30;
const PLAY_THRESHOLD = 50; // Frames needed before play starts
const SPEEDS: Speed[] = [0.5, 1, 2];
const SPEED_LABELS: Record<Speed, string> = { 0.5: '0.5×', 1: '1×', 2: '2×' };

export default function TimeLapsePlayer({ plotId, plotLabel, cropType }: TimeLapsePlayerProps) {
  const [status, setStatus] = useState<Status>('idle');
  const [weeks, setWeeks] = useState<WeekGroup[]>([]);
  const [selectedWeek, setSelectedWeek] = useState(0);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [speed, setSpeed] = useState<Speed>(1);
  const [preloadCount, setPreloadCount] = useState(0);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null);

  const rafRef = useRef<number>(0);
  const lastFrameRef = useRef(0);
  const preloaderRef = useRef<{ cancel: () => void } | null>(null);
  const preloadedRef = useRef<boolean[]>([]);
  const statusRef = useRef<Status>('idle');

  // Keep statusRef in sync
  useEffect(() => { statusRef.current = status; }, [status]);

  // Reduced motion preference
  const reducedMotion = typeof window !== 'undefined'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ── Load all images on mount ────────────────────────────────

  useEffect(() => {
    let cancelled = false;

    async function loadAll() {
      setStatus('loading');
      try {
        const allImages: ImageListItem[] = [];
        let cursor: string | undefined;

        do {
          const page = await getImages(plotId, cursor);
          if (cancelled) return;
          allImages.push(...page.data);
          cursor = page.meta.next_cursor ?? undefined;
        } while (cursor);

        const grouped = groupByWeek(allImages);
        setWeeks(grouped);

        // Auto-select latest complete week, or latest if none complete
        const latestComplete = grouped.findLastIndex(w => w.complete);
        setSelectedWeek(latestComplete >= 0 ? latestComplete : Math.max(0, grouped.length - 1));
        setStatus('ready');
      } catch {
        if (!cancelled) {
          setStatus('error');
          setErrorMsg(t('timelapse.error'));
        }
      }
    }

    loadAll();
    return () => { cancelled = true; };
  }, [plotId]);

  // ── Preload on week selection ───────────────────────────────

  const week = weeks[selectedWeek];
  const frames = week?.images ?? [];
  const totalFrames = frames.length;

  useEffect(() => {
    if (!week || frames.length === 0) return;

    // Cancel previous preload
    preloaderRef.current?.cancel();
    setPreloadCount(0);
    preloadedRef.current = new Array(frames.length).fill(false);

    const urls = frames.map(f => f.thumbnail_url).filter(Boolean);
    const loader = preloadImages(urls, (loaded) => {
      setPreloadCount(loaded);
      preloadedRef.current[loaded - 1] = true;
    });

    preloaderRef.current = loader;
    return () => loader.cancel();
  }, [selectedWeek, weeks]);

  // ── Animation loop ──────────────────────────────────────────

  const animate = useCallback((timestamp: number) => {
    if (statusRef.current !== 'playing') return;

    const fps = speed === 0.5 ? 15 : BASE_FPS;
    const frameStep = speed === 2 ? 2 : 1;
    const interval = 1000 / fps;

    if (timestamp - lastFrameRef.current >= interval) {
      lastFrameRef.current = timestamp;
      setCurrentIndex(prev => {
        let next = prev + frameStep;
        if (next >= totalFrames) next = 0; // Loop
        return next;
      });
    }

    rafRef.current = requestAnimationFrame(animate);
  }, [speed, totalFrames]);

  // Start/stop animation based on status
  useEffect(() => {
    if (status === 'playing') {
      lastFrameRef.current = performance.now();
      rafRef.current = requestAnimationFrame(animate);
    }
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [status, animate]);

  // ── Controls ────────────────────────────────────────────────

  const play = useCallback(() => {
    if (reducedMotion) return; // No autoplay with reduced motion
    setStatus('playing');
  }, [reducedMotion]);

  const pause = useCallback(() => setStatus('paused'), []);

  const togglePlay = useCallback(() => {
    if (status === 'playing') pause();
    else play();
  }, [status, play, pause]);

  const goFirst = useCallback(() => { pause(); setCurrentIndex(0); }, [pause]);
  const goLast = useCallback(() => { pause(); setCurrentIndex(Math.max(0, totalFrames - 1)); }, [pause, totalFrames]);
  const goPrev = useCallback(() => { pause(); setCurrentIndex(i => Math.max(0, i - 1)); }, [pause]);
  const goNext = useCallback(() => { pause(); setCurrentIndex(i => Math.min(totalFrames - 1, i + 1)); }, [pause, totalFrames]);

  const selectWeek = useCallback((idx: number) => {
    preloaderRef.current?.cancel();
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    setSelectedWeek(idx);
    setCurrentIndex(0);
    setStatus('ready');
  }, []);

  const closePlayer = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    preloaderRef.current?.cancel();
    setStatus('ready');
    setCurrentIndex(0);
  }, []);

  // ── Render: no data ─────────────────────────────────────────

  if (status === 'loading' && weeks.length === 0) {
    return (
      <div class="timelapse">
        <div class="timelapse__header">{t('timelapse.title')}</div>
        <div class="timelapse__summary">{t('timelapse.loading')}</div>
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div class="timelapse">
        <div class="timelapse__header">{t('timelapse.title')}</div>
        <div class="timelapse__summary" style="color:var(--color-status-issue)">{errorMsg}</div>
      </div>
    );
  }

  if (weeks.length === 0) return null;

  // Check if any complete weeks exist
  const hasCompleteWeeks = weeks.some(w => w.complete);
  const canPlay = week?.complete && preloadCount >= Math.min(PLAY_THRESHOLD, totalFrames);
  const isActive = status === 'playing' || status === 'paused' || status === 'buffering';

  const currentFrame = frames[currentIndex];
  const progress = currentFrame
    ? getProgressPercent(currentFrame.captured_at, week.weekStart, week.weekEnd)
    : 0;

  // Count unique days in current week
  const uniqueDays = week ? new Set(week.images.map(i => new Date(i.captured_at).toISOString().slice(0, 10))).size : 0;

  // ── Render: idle / ready ────────────────────────────────────

  return (
    <div class="timelapse">
      <div class="timelapse__header">{t('timelapse.title')}</div>

      {/* Week selector */}
      <div class="timelapse__week-selector" role="group" aria-label={t('timelapse.title')}>
        <button
          class="timelapse__week-btn"
          onClick={() => selectWeek(selectedWeek - 1)}
          disabled={selectedWeek <= 0}
          aria-label={t('timelapse.prev_week')}
        >
          ‹
        </button>
        <div class="timelapse__week-label">{week?.label ?? ''}</div>
        <button
          class="timelapse__week-btn"
          onClick={() => selectWeek(selectedWeek + 1)}
          disabled={selectedWeek >= weeks.length - 1}
          aria-label={t('timelapse.next_week')}
        >
          ›
        </button>
      </div>

      {/* Summary */}
      <div class="timelapse__summary">
        {week?.complete
          ? `${totalFrames} ${t('timelapse.images_days')} · 7 days`
          : `${t('timelapse.week_progress')} — ${totalFrames} ${t('timelapse.images_days')} (${uniqueDays}/7 days)`
        }
        {!week?.complete && !hasCompleteWeeks && (
          <div style="margin-top:var(--space-1)">{t('timelapse.no_complete_weeks')}</div>
        )}
      </div>

      {/* Active playback view */}
      {isActive && currentFrame ? (
        <>
          {/* Frame */}
          <div class="timelapse__frame-container">
            <img
              src={currentFrame.thumbnail_url}
              alt={`${cropType} - ${formatFrameTime(currentFrame.captured_at)}`}
              class="timelapse__frame-img"
              onClick={() => {
                if (status === 'paused') setLightboxSrc(currentFrame.thumbnail_url);
              }}
              style={status === 'paused' ? 'cursor:pointer' : undefined}
            />
          </div>

          {/* Time-proportional progress bar */}
          <div class="timelapse__progress-bar">
            <div class="timelapse__progress-fill" style={{ width: `${progress}%` }} />
          </div>
          <div class="timelapse__progress-labels">
            <span>{formatShort(week.weekStart)}</span>
            <span>{formatShort(week.weekEnd)}</span>
          </div>
          <div class="timelapse__frame-time" aria-live="polite">
            {formatFrameTime(currentFrame.captured_at)}
          </div>

          {/* Transport controls */}
          <div class="timelapse__transport">
            <button class="timelapse__transport-btn" onClick={goFirst} aria-label={t('timelapse.first')}>⏮</button>
            <button class="timelapse__transport-btn" onClick={goPrev} aria-label={t('timelapse.prev')}>⏪</button>
            <button
              class="timelapse__transport-btn timelapse__transport-btn--play"
              onClick={togglePlay}
              aria-label={status === 'playing' ? t('timelapse.pause') : t('timelapse.resume')}
            >
              {status === 'playing' ? '⏸' : '▶'}
            </button>
            <button class="timelapse__transport-btn" onClick={goNext} aria-label={t('timelapse.next')}>⏩</button>
            <button class="timelapse__transport-btn" onClick={goLast} aria-label={t('timelapse.last')}>⏭</button>
          </div>

          {/* Speed selector */}
          {!reducedMotion && (
            <div class="timelapse__speed" role="radiogroup" aria-label={t('timelapse.speed')}>
              {SPEEDS.map(s => (
                <button
                  key={s}
                  class={`timelapse__speed-btn${speed === s ? ' timelapse__speed-btn--active' : ''}`}
                  onClick={() => setSpeed(s)}
                  aria-checked={speed === s}
                  role="radio"
                >
                  {SPEED_LABELS[s]}
                </button>
              ))}
            </div>
          )}

          {/* Frame counter */}
          <div class="timelapse__counter">
            {currentIndex + 1} {t('timelapse.frame_of')} {totalFrames}
          </div>

          {/* Close button */}
          <button
            class="timelapse__play-btn"
            onClick={closePlayer}
            style="margin-top:var(--space-3)"
          >
            {t('timelapse.close')}
          </button>
        </>
      ) : (
        /* Play button */
        <>
          {preloadCount > 0 && preloadCount < totalFrames && (
            <div class="timelapse__summary">
              {t('timelapse.loading_progress')} {preloadCount}/{totalFrames}
            </div>
          )}
          <button
            class="timelapse__play-btn"
            onClick={() => {
              setCurrentIndex(0);
              if (reducedMotion) setStatus('paused');
              else play();
            }}
            disabled={!canPlay}
            aria-label={`${t('timelapse.play')} — ${cropType}, ${totalFrames} ${t('timelapse.images_days')}, ${week?.label ?? ''}`}
          >
            ▶ {t('timelapse.play')}
          </button>
        </>
      )}

      {/* Lightbox for paused frame */}
      {lightboxSrc && (
        <Lightbox
          src={lightboxSrc}
          alt={`${cropType} - ${currentFrame ? formatFrameTime(currentFrame.captured_at) : ''}`}
          caption={currentFrame ? formatFrameTime(currentFrame.captured_at) : undefined}
          onClose={() => setLightboxSrc(null)}
        />
      )}
    </div>
  );
}
