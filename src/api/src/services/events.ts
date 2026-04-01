/**
 * Typed in-process event emitter — shared foundation for Wave 2 notifications
 * and Wave 3 activity log. Route handlers emit events; subscribers react
 * asynchronously (fire-and-forget). Errors in listeners never propagate to callers.
 */

// ── Envelope ────────────────────────────────────────────────────

export interface AppEvent<T extends string, P> {
  type: T;
  timestamp: string;       // ISO 8601
  actor_id: string;        // userId who triggered the event
  actor_email: string;     // email of the actor (for display in notifications)
  payload: P;
}

// ── Payload types ───────────────────────────────────────────────

export interface UserSignupPayload {
  user_id: string;
  display_name: string;
  email: string;
}

export interface FarmCreatedPayload {
  farm_id: string;
  farm_name: string;
}

export interface FarmDeletedPayload {
  farm_id: string;
  farm_name: string;
}

export interface JoinRequestSubmittedPayload {
  farm_id: string;
  farm_name: string;
  requester_name: string;
}

export interface JoinRequestResolvedPayload {
  farm_id: string;
  farm_name: string;
  target_user_id: string;
  target_user_name: string;
}

export interface AccountDeletedPayload {
  user_id: string;
  display_name: string;
  email: string;
}

// ── Wave 3 payload types (activity logging only) ────────────────

export interface FarmUpdatedPayload {
  farm_id: string;
  farm_name: string;
  changed_fields?: string[];
}

export interface BedUpdatedPayload {
  bed_id: string;
  bed_name: string;
  farm_id: string;
  farm_name: string;
  changed_fields?: string[];
}

export interface ImageUploadedPayload {
  image_id: string;
  bed_id: string;
  bed_name: string;
  farm_id: string;
  farm_name: string;
}

export interface TagCreatedPayload {
  image_id: string;
  tag_value: string;
  farm_id: string;
  farm_name: string;
}

export interface MemberJoinedPayload {
  farm_id: string;
  farm_name: string;
  role: string;
}

export interface MemberRemovedPayload {
  farm_id: string;
  farm_name: string;
  removed_user_id: string;
  removed_user_name: string;
}

export interface UserProfileUpdatedPayload {
  changed_fields?: string[];
}

// ── Event type map ──────────────────────────────────────────────

export interface AppEventMap {
  'user.signup':             AppEvent<'user.signup', UserSignupPayload>;
  'farm.created':            AppEvent<'farm.created', FarmCreatedPayload>;
  'farm.deleted':            AppEvent<'farm.deleted', FarmDeletedPayload>;
  'join_request.submitted':  AppEvent<'join_request.submitted', JoinRequestSubmittedPayload>;
  'join_request.approved':   AppEvent<'join_request.approved', JoinRequestResolvedPayload>;
  'join_request.rejected':   AppEvent<'join_request.rejected', JoinRequestResolvedPayload>;
  'account.deleted':         AppEvent<'account.deleted', AccountDeletedPayload>;

  // Events below are emitted for activity logging (Wave 3) — no email notifications.
  'farm.updated':            AppEvent<'farm.updated', FarmUpdatedPayload>;
  'bed.updated':             AppEvent<'bed.updated', BedUpdatedPayload>;
  'image.uploaded':          AppEvent<'image.uploaded', ImageUploadedPayload>;
  'tag.created':             AppEvent<'tag.created', TagCreatedPayload>;
  'member.joined':           AppEvent<'member.joined', MemberJoinedPayload>;
  'member.removed':          AppEvent<'member.removed', MemberRemovedPayload>;
  'user.profile_updated':    AppEvent<'user.profile_updated', UserProfileUpdatedPayload>;
}

export type AppEventType = keyof AppEventMap;

// ── EventEmitter ────────────────────────────────────────────────

type Listener<T extends AppEventType> = (event: AppEventMap[T]) => void | Promise<void>;

class TypedEventEmitter {
  private listeners = new Map<string, Set<Function>>();

  on<T extends AppEventType>(type: T, listener: Listener<T>): void {
    if (!this.listeners.has(type)) {
      this.listeners.set(type, new Set());
    }
    this.listeners.get(type)!.add(listener);
  }

  off<T extends AppEventType>(type: T, listener: Listener<T>): void {
    this.listeners.get(type)?.delete(listener);
  }

  /**
   * Emit an event. Listeners are invoked asynchronously (fire-and-forget).
   * Errors in listeners are caught and logged, never propagated to the caller.
   */
  emit<T extends AppEventType>(type: T, event: AppEventMap[T]): void {
    const set = this.listeners.get(type);
    if (!set || set.size === 0) return;
    for (const listener of set) {
      // Fire-and-forget: do not await, do not throw
      Promise.resolve()
        .then(() => listener(event))
        .catch((err) => {
          console.error(`[events] listener error for ${type}:`, err);
        });
    }
  }
}

/** Singleton event bus — shared across the Lambda process. */
export const appEvents = new TypedEventEmitter();
