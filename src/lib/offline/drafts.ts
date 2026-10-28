/* ==========================================================
   مسودات التقييم دون اتصال — مخزن IndexedDB
   ----------------------------------------------------------
   لا يُستخدم هذا المخزن إلا عندما يفشل الحفظ على الخادم
   (شبكة مقطوعة أو خادم غير متاح). عند عودة الاتصال تُرفع
   التغييرات المحفوظة محلياً ثم تُحذف بعد نجاح الرفع.
   لا يمسّ هذا المخزن حالات التقارير ولا الاعتماد.
   ========================================================== */

const DB_NAME = "rifad-offline";
const DB_VERSION = 1;
const STORE = "scores";

export type LocalScore = {
  key: string;
  visitId: string;
  indicatorId: string;
  status: "EVALUATED" | "NOT_EVALUATED";
  score: number | null;
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

function tx<T>(
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest<T>
): Promise<T> {
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

const keyOf = (visitId: string, indicatorId: string) => `${visitId}:${indicatorId}`;

/** حفظ درجة محلياً بعد فشل الحفظ على الخادم */
export async function saveLocalScore(
  entry: Omit<LocalScore, "key" | "savedAt" | "attempts">
): Promise<void> {
  if (!hasIDB()) return;
  const record: LocalScore = {
    ...entry,
    key: keyOf(entry.visitId, entry.indicatorId),
    savedAt: Date.now(),
    attempts: 0,
  };
  await tx("readwrite", (s) => s.put(record) as IDBRequest<IDBValidKey>);
}

/** كل الدرجات المحفوظة محلياً لزيارة معيّنة، مفهرسة بـ indicatorId */
export async function getLocalScores(
  visitId: string
): Promise<Record<string, { status: "EVALUATED" | "NOT_EVALUATED"; score: number | null }>> {
  if (!hasIDB()) return {};
  const all = await listLocalScores();
  const out: Record<string, { status: "EVALUATED" | "NOT_EVALUATED"; score: number | null }> = {};
  for (const rec of all) {
    if (rec.visitId === visitId) out[rec.indicatorId] = { status: rec.status, score: rec.score };
  }
  return out;
}

/** كل السجلات المعلّقة */
export async function listLocalScores(): Promise<LocalScore[]> {
  if (!hasIDB()) return [];
  try {
    const rows = await tx<LocalScore[]>("readonly", (s) => s.getAll() as IDBRequest<LocalScore[]>);
    return (rows ?? []).sort((a, b) => a.savedAt - b.savedAt);
  } catch {
    return [];
  }
}

/** عدد الدرجات التي لم تُرفع بعد */
export async function countPending(visitId?: string): Promise<number> {
  const rows = await listLocalScores();
  return visitId ? rows.filter((r) => r.visitId === visitId).length : rows.length;
}

/** حذف سجل بعد نجاح رفعه */
export async function deleteLocalScore(visitId: string, indicatorId: string): Promise<void> {
  if (!hasIDB()) return;
  await tx("readwrite", (s) => s.delete(keyOf(visitId, indicatorId)) as unknown as IDBRequest<undefined>);
}

/** زيادة عدّاد المحاولات الفاشلة */
export async function bumpAttempts(rec: LocalScore): Promise<void> {
  if (!hasIDB()) return;
  await tx("readwrite", (s) =>
    s.put({ ...rec, attempts: rec.attempts + 1 }) as IDBRequest<IDBValidKey>
  );
}

/**
 * رفع كل المسودات المعلّقة إلى الخادم.
 * يُرجع عدد ما نجح رفعه وعدد ما بقي.
 */
export async function flushPending(): Promise<{ synced: number; remaining: number }> {
  const rows = await listLocalScores();
  let synced = 0;

  for (const rec of rows) {
    try {
      const res = await fetch(`/api/evaluations/visit/${rec.visitId}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          indicatorId: rec.indicatorId,
          status: rec.status,
          score: rec.score,
        }),
      });
      if (res.ok) {
        await deleteLocalScore(rec.visitId, rec.indicatorId);
        synced += 1;
      } else {
        await bumpAttempts(rec);
      }
    } catch {
      await bumpAttempts(rec);
    }
  }

  return { synced, remaining: rows.length - synced };
}
