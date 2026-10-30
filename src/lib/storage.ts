/**
 * تخزين ملفات الأدلة والمواد بشكل خاص (لا يُتاح أي ملف برابط عام).
 *
 *   - افتراضياً: مجلد خاص على القرص (UPLOAD_DIR أو data/uploads) خارج public.
 *   - عند ضبط BLOB_READ_WRITE_TOKEN: Vercel Blob بوصول خاص (access: "private")،
 *     ولا يُقرأ الملف إلا عبر الخادم بعد فحص الصلاحية.
 */
import path from "path";
import { mkdir, readFile, writeFile, unlink } from "fs/promises";
import { safeStoragePath, uploadsRoot } from "./security";

/** رمز Vercel Blob: الاسم الافتراضي، أو أي متغير بسابقة مخصّصة يحمل رمز Blob. */
export function blobToken(): string | undefined {
  const direct = process.env.BLOB_READ_WRITE_TOKEN?.trim();
  if (direct) return direct;
  for (const [k, v] of Object.entries(process.env)) {
    if (/_READ_WRITE_TOKEN$/.test(k) && v?.trim().startsWith("vercel_blob_rw_")) return v.trim();
  }
  return undefined;
}

export function usesBlobStorage(): boolean {
  return Boolean(blobToken());
}

export const STORAGE_NOT_CONFIGURED_MESSAGE =
  "تخزين الملفات غير مهيّأ على هذه الاستضافة: اربط متجر Vercel Blob بالمشروع (Storage) ثم أعد النشر.";

export class StorageNotConfiguredError extends Error {
  constructor() {
    super(STORAGE_NOT_CONFIGURED_MESSAGE);
    this.name = "StorageNotConfiguredError";
  }
}

/** على الاستضافات بلا قرص دائم لا يصح الحفظ محلياً: الملف يضيع بعد إعادة التشغيل. */
function assertLocalStorageAllowed(): void {
  if (process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME || process.env.NETLIFY) throw new StorageNotConfiguredError();
}

const BLOB_PREFIX = "evidence/";

export async function putObject(key: string, data: Buffer, contentType: string): Promise<void> {
  if (usesBlobStorage()) {
    const { put } = await import("@vercel/blob");
    await put(BLOB_PREFIX + key, data, {
      token: blobToken(),
      access: "private",
      contentType,
      addRandomSuffix: false,
      allowOverwrite: false,
    });
    return;
  }
  assertLocalStorageAllowed();
  const full = safeStoragePath(key);
  if (!full) throw new Error("مسار تخزين غير صالح");
  await mkdir(path.dirname(full), { recursive: true });
  await writeFile(full, data, { mode: 0o640 });
}

/** يعيد محتوى الملف، أو null إن لم يوجد. */
export async function getObject(key: string): Promise<Buffer | null> {
  if (usesBlobStorage()) {
    const { get } = await import("@vercel/blob");
    const res = await get(BLOB_PREFIX + key, { access: "private", token: blobToken() });
    if (!res || res.statusCode !== 200 || !res.stream) return null;
    return Buffer.from(await new Response(res.stream).arrayBuffer());
  }
  const full = safeStoragePath(key);
  if (!full) return null;
  try {
    return await readFile(full);
  } catch {
    return null;
  }
}

export async function deleteObject(key: string): Promise<void> {
  if (usesBlobStorage()) {
    const { del } = await import("@vercel/blob");
    await del(BLOB_PREFIX + key, { token: blobToken() }).catch(() => undefined);
    return;
  }
  const full = safeStoragePath(key);
  if (full) await unlink(full).catch(() => undefined);
}

export { uploadsRoot };
