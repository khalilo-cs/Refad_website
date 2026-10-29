/* ==========================================================
   مسودات التقييم دون اتصال — مخزن IndexedDB
   ----------------------------------------------------------
   يُستخدم هذا المخزن عندما يفشل الحفظ بسبب الشبكة. عند عودة الاتصال
   تُرفع التغييرات مع النسخة التي بُني عليها التعديل (baseVersion):
   - إن كان الخادم أحدث → تُعلَّم المسودة «تعارض» ولا تُكتب فوق بيانات أحدث.
   - إن كانت الزيارة مقفلة → تُعلَّم «مقفلة».
   - إن لزم سبب التعديل → تُعلَّم «تحتاج سبباً».
   لا يمسّ هذا المخزن اعتماد التقارير؛ الاعتماد يتطلب الاتصال بالخادم.
   ========================================================== */

const DB_NAME = "rifad-offline";
const DB_VERSION = 1;
const STORE = "scores";

export type DraftState = "pending" | "conflict" | "locked" | "needs_reason";

export type LocalScore = {
  key: string;
  visitId: string;
  indicatorId: string;
  status: "EVALUATED" | "NOT_EVALUATED";
  score: number | null;
  notes?: string | null;
  methods?: string[];
  reason?: string | null;
  baseVersion?: number | null;
  state?: DraftState;
  server?: { status: string; score: number; notes: string | null; version: number; ratedBy: string | null; ratedAt: string | null } | null;
  savedAt: number;
  attempts: number;
};

function hasIDB(): boolean {
  return typeof window !== "undefined" && typeof indexedDB !== "undefined";
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: "key" });
        store.createIndex("byVisit", "visitId", { unique: false });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function tx<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openDB().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const transaction = db.transaction(STORE, mode);
        const request = run(transaction.objectStore(STORE));
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
        transaction.oncomplete = () => db.close();
      })
  );
}

export const keyOf = (visitId: string, indicatorId: string) => `${visitId}:${indicatorId}`;

export type DraftInput = Omit<LocalScore, "key" | "savedAt" | "attempts" | "state" | "server">;

/** حفظ تعديل محلياً بعد فشل الحفظ على الخادم */
export async function saveLocalScore(entry: DraftInput): Promise<void> {
  if (!hasIDB()) return;
  const record: LocalScore = { ...entry, key: keyOf(entry.visitId, entry.indicatorId), state: "pending", savedAt: Date.now(), attempts: 0 };
  await tx("readwrite", (s) => s.put(record) as IDBRequest<IDBValidKey>);
}

/** كل المسودات المحلية لزيارة، مفهرسة بـ indicatorId */
export async function getLocalScores(visitId: string): Promise<Record<string, LocalScore>> {
  if (!hasIDB()) return {};
  const all = await listLocalScores();
  const out: Record<string, LocalScore> = {};
  for (const rec of all) if (rec.visitId === visitId) out[rec.indicatorId] = rec;
  return out;
}

export async function listLocalScores(): Promise<LocalScore[]> {
  if (!hasIDB()) return [];
  try {
    const rows = await tx<LocalScore[]>("readonly", (s) => s.getAll() as IDBRequest<LocalScore[]>);
    return (rows ?? []).sort((a, b) => a.savedAt - b.savedAt);
  } catch {
    return [];
  }
}

/** عدد المسودات التي لم تُرفع بعد (بما فيها المتعارضة) */
export async function countPending(visitId?: string): Promise<number> {
  const rows = await listLocalScores();
  return visitId ? rows.filter((r) => r.visitId === visitId).length : rows.length;
}

export async function countConflicts(visitId?: string): Promise<number> {
  const rows = await listLocalScores();
  return rows.filter((r) => (!visitId || r.visitId === visitId) && r.state && r.state !== "pending").length;
}

export async function deleteLocalScore(visitId: string, indicatorId: string): Promise<void> {
  if (!hasIDB()) return;
  await tx("readwrite", (s) => s.delete(keyOf(visitId, indicatorId)) as unknown as IDBRequest<undefined>);
}

async function putRecord(rec: LocalScore): Promise<void> {
  if (!hasIDB()) return;
  await tx("readwrite", (s) => s.put(rec) as IDBRequest<IDBValidKey>);
}

/** مسح كل المسودات (عند تسجيل الخروج على جهاز مشترك) */
export async function clearAllLocal(): Promise<void> {
  if (!hasIDB()) return;
  await tx("readwrite", (s) => s.clear() as unknown as IDBRequest<undefined>);
}

/**
 * رفع المسودات المعلّقة. لا يُعاد رفع المتعارضة أو المقفلة تلقائياً؛
 * تبقى بانتظار قرار المستخدم (الاحتفاظ بنسخة الخادم أو فرض نسخته).
 */
export async function flushPending(): Promise<{ synced: number; remaining: number; conflicts: number }> {
  const rows = (await listLocalScores()).filter((r) => !r.state || r.state === "pending");
  let synced = 0;
  let conflicts = 0;

  for (const rec of rows) {
    try {
      const res = await fetch(`/api/evaluations/visit/${rec.visitId}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          indicatorId: rec.indicatorId, status: rec.status, score: rec.score, notes: rec.notes ?? null,
          methods: rec.methods ?? [], reason: rec.reason ?? undefined, expectedVersion: rec.baseVersion ?? undefined,
        }),
      });
      if (res.ok) {
        await deleteLocalScore(rec.visitId, rec.indicatorId);
        synced += 1;
        continue;
      }
      const body = await res.json().catch(() => ({}));
      if (res.status === 409) { await putRecord({ ...rec, state: "conflict", server: body.server ?? null }); conflicts += 1; }
      else if (res.status === 423) await putRecord({ ...rec, state: "locked" });
      else if (res.status === 422 && body.needReason) await putRecord({ ...rec, state: "needs_reason" });
      else if (res.status === 401) break; // انتهت الجلسة: نُبقي المسودات
      else await putRecord({ ...rec, attempts: rec.attempts + 1 });
    } catch {
      await putRecord({ ...rec, attempts: rec.attempts + 1 });
    }
  }
  const remaining = (await listLocalScores()).length;
  return { synced, remaining, conflicts };
}
