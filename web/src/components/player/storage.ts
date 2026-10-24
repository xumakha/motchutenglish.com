// Local drafts and the offline outbox, in localStorage. Storage can be unavailable (private mode,
// quota); every access is guarded and the player keeps working without it.
//
// Fix 3: the PHP player kept only the last unsent action, with the revision frozen at the time it
// was made, and dropped actions made while another request was running. The outbox is an ordered
// queue now; it is replayed on reconnect and on page load, each action with the current revision.

export interface QueuedAction {
  action: string;
  body: Record<string, unknown>;
}

const read = <T>(key: string, fallback: T): T => {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
};

const write = (key: string, value: unknown): boolean => {
  try {
    if (value === undefined) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
};

export function playerStorage(account: string, attemptId: string) {
  const draftKey = `mce-draft:${account}:${attemptId}`;
  const outboxKey = `${draftKey}:outbox`;
  return {
    drafts: () => read<Record<string, unknown>>(draftKey, {}),
    saveDraft(exerciseId: string, response: unknown) {
      return write(draftKey, {
        ...read<Record<string, unknown>>(draftKey, {}),
        [exerciseId]: response,
      });
    },
    dropDraft(exerciseId: string) {
      const drafts = read<Record<string, unknown>>(draftKey, {});
      delete drafts[exerciseId];
      write(draftKey, drafts);
    },
    clearDrafts: () => write(draftKey, undefined),
    outbox: () => {
      const queue = read<unknown>(outboxKey, []);
      // An old PHP-era single entry is a plain object; treat it as a one-item queue.
      return (Array.isArray(queue) ? queue : queue ? [queue] : []) as QueuedAction[];
    },
    enqueue: (item: QueuedAction) =>
      write(outboxKey, [...read<QueuedAction[]>(outboxKey, []), item]),
    dequeue: () => write(outboxKey, read<QueuedAction[]>(outboxKey, []).slice(1)),
    clearOutbox: () => write(outboxKey, undefined),
  };
}
