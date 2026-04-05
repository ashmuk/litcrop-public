# Design: #287 — Reserved/Actual Radio Toggle with Smart Date Defaults

**Issue:** [#287](https://github.com/ashmuk/litcrop/issues/287)
**Sprint:** Beta-8 | **Size:** L (~6-8 hours)
**Depends:** #273 (M1), #274 (M2), #275 (M3), #276 (Gantt) — all complete
**Mockup:** `docs/mockups/diary-reserved-actual.html`

---

## Architecture (Step 2)

### Data Model Change

Add `entry_type` field to DiaryEntry:
```typescript
export type DiaryEntryType = 'reserved' | 'actual';

export interface DiaryEntry {
  // ...existing fields...
  entry_type: DiaryEntryType;  // NEW — default 'actual' for backward compat
}
```

**DynamoDB:** Additive — new attribute on DIARY# items. Mapper defaults to `'actual'` for existing records.

### API Changes
- `POST /diary` and `PATCH /diary` accept `entry_type` field
- `CreateDiaryEntrySchema` and `UpdateDiaryEntrySchema` gain `entry_type` validation
- `syncBedDatesFromDiary()` distinguishes reserved vs actual for Gantt data source
- No new endpoints — existing CRUD handles both entry types

---

## UX Design (Step 3)

### Entry Form: Radio Toggle

```
Entry Type:
┌──────────────────┐  ┌──────────────────┐
│ (●) Reserved     │  │ ( ) Actual       │
│     Set milestone│  │     Record work  │
└──────────────────┘  └──────────────────┘
       ↑ auto-selected when date > today
```

**Smart date default:**
- `date > today` → auto-select "Reserved"
- `date <= today` → auto-select "Actual"
- User can override either direction

**Save button:** changes text + color based on selection
- Reserved: "Save Reserved Entry" (default primary color)
- Actual: "Save Activity Log" (green)

### Smart Default Hint
When category = planting AND bed selected AND entry_type = reserved:
```
💡 Tomato: harvest estimated Aug 8 (85 days from planting)
```

### List View: Tabs + Layout Toggle

**Tabs:** All | Reserved | Actual (with count badges)
**Layout toggle:** Tabs icon / Side-by-side icon (next to list/calendar toggle)
- Mobile default: tabs
- Desktop (>=768px) default: side-by-side
- Persisted to localStorage

### Sort Toggle
- Button/icon to toggle between newest-first and oldest-first
- **Smart defaults per tab:**
  - Reserved: oldest first (planning = "what's coming next?")
  - Actual: newest first (review = "what did I just do?")
- User override persisted per tab

### Entry Cards
- Left border color: amber (#f59e0b) for reserved, green (#22c55e) for actual
- Badge: "Reserved" or "Actual" in top-right of card header
- Reserved entries show harvest estimate in meta row

### Side-by-Side Month-Aligned View
```
┌──────┬──────────────────┬──────────────────┐
│ Month│ Reserved (Planned)│ Actual (Logged)  │
├──────┼──────────────────┼──────────────────┤
│ Apr  │ (no plans)       │ 🌱 Planted A1    │
│ 2026 │                  │ 💧 Watered all   │
│      │                  │ 🧪 Fertilized    │
├──────┼──────────────────┼──────────────────┤
│ May  │ 🌱 Plan tomato A1│ (no activity yet)│
│ 2026 │ 🌱 Plan cucum A2 │                  │
├──────┼──────────────────┼──────────────────┤
│ Jun  │ 🌾 Plan harvest  │ (no activity yet)│
│ 2026 │    B1 lettuce    │                  │
└──────┴──────────────────┴──────────────────┘
```

### CropTimeline Gantt: Month Markers
- Vertical tick lines at month boundaries
- Month label header row (Apr | May | Jun | Jul | Aug)
- Multi-month range showing full planned→harvest arc

---

## System Design (Step 5)

### Shared Types

```typescript
// packages/shared/src/types/domain.ts
export type DiaryEntryType = 'reserved' | 'actual';

export interface DiaryEntry {
  // ...existing...
  entry_type: DiaryEntryType;
}
```

### Zod Schema

```typescript
// packages/shared/src/schemas/index.ts
export const DiaryEntryTypeSchema = z.enum(['reserved', 'actual']);

// Add to CreateDiaryEntrySchema:
entry_type: DiaryEntryTypeSchema.optional().default('actual'),

// Add to UpdateDiaryEntrySchema:
entry_type: DiaryEntryTypeSchema.optional(),
```

### DynamoDB Mapper

```typescript
// dynamodb.ts — itemToDiaryEntry
entry_type: (item['entry_type'] as DiaryEntryType) ?? 'actual',
```

### API Response

```typescript
// DiaryEntryResponse already mirrors DiaryEntry — entry_type flows through
```

### Frontend: DiaryEntryForm

New state:
```typescript
const [entryType, setEntryType] = useState<'reserved' | 'actual'>('actual');
```

Date change handler:
```typescript
function handleDateChange(newDate: string) {
  setDate(newDate);
  const isInFuture = newDate > toDateString(new Date());
  setEntryType(isInFuture ? 'reserved' : 'actual');
}
```

### Frontend: DiaryPage

New state:
```typescript
const [activeTab, setActiveTab] = useState<'all' | 'reserved' | 'actual'>('all');
const [layout, setLayout] = useState<'tabs' | 'split'>(() =>
  window.innerWidth >= 768 ? 'split' : 'tabs'
);
const [sortOrder, setSortOrder] = useState<'newest' | 'oldest'>('newest');
```

Persist to localStorage: `litcrop-diary-layout`, `litcrop-diary-sort`.

### Frontend: CropTimeline Month Markers

Expand from single-month to multi-month range:
- Calculate earliest planted_at and latest expected_harvest across all beds
- Generate month boundary positions as % of total range
- Render `.crop-timeline__month-tick` and `.crop-timeline__month-label`

---

## Task Breakdown (Step 6)

### Batch 1: Shared Types + Schema
| Task | File | Est |
|------|------|-----|
| T1.1 | `types/domain.ts` — add `DiaryEntryType`, extend `DiaryEntry` | 5m |
| T1.2 | `schemas/index.ts` — `DiaryEntryTypeSchema`, extend Create/Update schemas | 10m |

### Batch 2: API
| Task | File | Est |
|------|------|-----|
| T2.1 | `dynamodb.ts` — mapper default, createDiaryEntry passes entry_type | 10m |
| T2.2 | `diary.ts` — accept entry_type in POST/PATCH, include in response | 10m |

### Batch 3: Frontend — Form
| Task | File | Est |
|------|------|-----|
| T3.1 | `i18n/en.json` + `ja.json` — radio labels, sort labels, layout labels | 15m |
| T3.2 | `DiaryEntryForm.tsx` — radio toggle, smart date default, save button text | 30m |

### Batch 4: Frontend — List View
| Task | File | Est |
|------|------|-----|
| T4.1 | `DiaryPage.tsx` — tabs (All/Reserved/Actual), tab filtering | 25m |
| T4.2 | `DiaryPage.tsx` — layout toggle (tabs/split), localStorage persist | 20m |
| T4.3 | `DiaryPage.tsx` — sort toggle + smart defaults per tab | 15m |
| T4.4 | `DiaryPage.tsx` — month-aligned split view rendering | 30m |
| T4.5 | `components.css` — entry card badges, tab styling, split grid | 20m |

### Batch 5: Frontend — Gantt Month Markers
| Task | File | Est |
|------|------|-----|
| T5.1 | `CropTimeline.tsx` — multi-month range, month tick rendering | 25m |
| T5.2 | `components.css` — month tick + label styling | 10m |

### Batch 6: Tests
| Task | File | Est |
|------|------|-----|
| T6.1 | `diary.test.ts` — POST/PATCH with entry_type, backward compat | 15m |
| T6.2 | `schemas.test.ts` — DiaryEntryType validation | 5m |
| T6.3 | `diary-utils.test.ts` — buildActualDatesMap respects entry_type | 10m |

**Total: ~5-6 hours**

---

## Plan (Step 7)

### Execution Order
```
Batch 1 (Shared) → Batch 2 (API) → Batch 3 (Form) → Batch 4 (List) → Batch 5 (Gantt) → Batch 6 (Tests)
```

Each batch: implement → verify compile → run tests.
After all: `/simplify` → `/cc-review` → `/cc-remediate`.

### Scope: MVP (single pass)
Ship all changes in one commit on develop.
