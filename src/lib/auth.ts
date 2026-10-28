/**
 * طبقة المصادقة والجلسات لمنصة رِفاد.
 * - رموز JWT موقعة ( الوصول قصير الأمد، التجديد طويل الأمد في كوكيز HttpOnly).
 * - كلمة المرور تُجزأ بـ bcrypt بتكلفة عالية.
 * - إصدار الرمز (token version) يُ増 عند تغيير كلمة المرور أو قفل الحساب لإبطال جميع الجلسات السابقة.
 * - لا تُخزن كلمات مرور نصية صريحة أبدًا، ولا تُرسل أي أسرار إلى المتصفح.
 */

import bcrypt from "bcryptjs";
import jwt, { JwtPayload } from "jsonwebtoken";
import { cookies } from "next/headers";
import { getDb, uuid, nowISO } from "./db/sqlite";
import { query, queryOne, exec, toJson } from "./db/sqlite";

// لا قيمة افتراضية للأسرار: يجب ضبطها في متغيرات البيئة (.env).
// هذا يمنع تشغيل المنصة بسرّ ضعيف معروف.
const PLACEHOLDER_PATTERNS = [
  "change_me",
  "changeme",
  "your-secret",
  "ضع-هنا",
  "secret",
  "password",
  "example",
  "test",
  "demo",
  "rifad",
];

export function readSecret(name: string): string {
  const value = process.env[name];
  const msg =
    `متغير البيئة ${name} غير مضبوط أو غير آمن. ` +
    `انسخ .env.example إلى .env ثم ولّد سلسلة عشوائية بالأمر: openssl rand -hex 32`;

  if (!value) throw new Error(msg);

  const trimmed = value.trim();
  if (trimmed.length < 32) throw new Error(msg);

  // ارفض القيم النائبة المكرّرة التي قد تبقى من ملف المثال.
  const lowered = trimmed.toLowerCase();
  if (PLACEHOLDER_PATTERNS.some((p) => lowered.includes(p))) throw new Error(msg);

  // ارفض القيم منخفضة التنوّع (حرف واحد مكرر أو تسلسل بسيط).
  const distinct = new Set(trimmed).size;
  if (distinct < 8) throw new Error(msg);

  return trimmed;
}

const ACCESS_SECRET = readSecret("JWT_SECRET");
const REFRESH_SECRET = process.env.JWT_REFRESH_SECRET?.trim()
  ? readSecret("JWT_REFRESH_SECRET")
  : ACCESS_SECRET;
const ACCESS_TTL_MINUTES = Number(process.env.JWT_ACCESS_TTL_MINUTES ?? 60);
const REFRESH_TTL_DAYS = Number(process.env.JWT_REFRESH_TTL_DAYS ?? 7);

export type TokenUser = {
  userId: string;
  email: string;
  name: string;
  role: string;
  roleKey: string;
  schoolId: string | null;
  directorateId: string | null;
  tokenVersion: number;
};

type AccessTokenPayload = TokenUser & { type: "access" };
type RefreshTokenPayload = {
  userId: string;
  tokenVersion: number;
  type: "refresh";
};

export type UserSession = TokenUser & {
  isActive: boolean;
  isLocked: boolean;
  permissions: Record<string, unknown>;
};

/** سياسة كلمات المرور: 8 أحرف على الأقل، رقم واحد وحرف واحد. */
export function validatePassword(password: string): { ok: boolean; message?: string } {
  if (password.length < 8) {
    return { ok: false, message: "يجب أن تتكون كلمة المرور من 8 أحرف على الأقل" };
  }
  if (!/[0-9]/.test(password)) {
    return {
      ok: false,
      message: "يجب أن تحتوي كلمة المرور على رقم واحد على الأقل",
    };
  }
  if (!/[A-Za-z]/.test(password)) {
    return {
      ok: false,
      message: "يجب أن تحتوي كلمة المرور على حرف واحد على الأقل",
    };
  }
  return { ok: true };
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12);
}

export async function verifyPassword(
  password: string,
  hash: string
): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export function signAccessToken(user: TokenUser): string {
  return jwt.sign(
    { ...user, type: "access" },
    ACCESS_SECRET,
    { expiresIn: `${ACCESS_TTL_MINUTES}m`, issuer: "rifad", audience: "rifad-app" }
  );
}

export function signRefreshToken(userId: string, tokenVersion: number): string {
  return jwt.sign(
    { userId, tokenVersion, type: "refresh" },
    REFRESH_SECRET,
    { expiresIn: `${REFRESH_TTL_DAYS}d`, issuer: "rifad", audience: "rifad-app" }
  );
}

async function cookieStore(): Promise<ReturnType<typeof cookies> | null> {
  try {
    return await cookies();
  } catch {
    return null;
  }
}

export async function setAuthCookies(accessToken: string, refreshToken: string): Promise<void> {
  const store = await cookieStore();
  if (!store) return;
  const isProd = process.env.NODE_ENV === "production";
  const common = { httpOnly: true, sameSite: "lax" as const, path: "/", secure: isProd } as const;
  await store.set("access_token", accessToken, { ...common, maxAge: 60 * ACCESS_TTL_MINUTES });
  await store.set("refresh_token", refreshToken, { ...common, maxAge: 60 * 60 * 24 * REFRESH_TTL_DAYS });
}

export async function clearAuthCookies(): Promise<void> {
  const store = await cookieStore();
  if (!store) return;
  await store.set("access_token", "", { path: "/", maxAge: 0 });
  await store.set("refresh_token", "", { path: "/", maxAge: 0 });
}

export function verifyAccessToken(token: string): AccessTokenPayload | null {
  try {
    const payload = jwt.verify(token, ACCESS_SECRET, {
      issuer: "rifad",
      audience: "rifad-app",
    }) as AccessTokenPayload & JwtPayload;
    return payload.type === "access" ? (payload as AccessTokenPayload) : null;
  } catch {
    return null;
  }
}

export function verifyRefreshToken(token: string): RefreshTokenPayload | null {
  try {
    const payload = jwt.verify(token, REFRESH_SECRET, {
      issuer: "rifad",
      audience: "rifad-app",
    }) as RefreshTokenPayload & JwtPayload;
    return payload.type === "refresh" ? (payload as RefreshTokenPayload) : null;
  } catch {
    return null;
  }
}

async function findUserByEmail(email: string): Promise<UserSession | null> {
  const row = queryOne<{
    id: string;
    name: string;
    email: string;
    password_hash: string;
    role_id: string;
    school_id: string | null;
    directorate_id: string | null;
    is_active: number;
    is_locked: number;
    token_version: number;
    role_key: string;
    role_name: string;
    permissions: unknown;
  }>(
    `SELECT u.id, u.name, u.email, u.password_hash, u.role_id, u.school_id, u.directorate_id,
            u.is_active, u.is_locked, u.token_version,
            r.key AS role_key, r.permissions, r.name AS role_name
     FROM users u JOIN roles r ON u.role_id = r.id
     WHERE u.email = ?`,
    [email]
  );
  if (!row) return null;
  return {
    userId: row.id,
    email: row.email,
    name: row.name,
    role: row.role_name,
    roleKey: row.role_key,
    schoolId: row.school_id,
    directorateId: row.directorate_id,
    tokenVersion: row.token_version,
    isActive: row.is_active === 1,
    isLocked: row.is_locked === 1,
    permissions: typeof row.permissions === "string" ? JSON.parse(row.permissions || "{}") : (row.permissions ?? {}),
  };
}

export async function authenticateUser(
  email: string,
  password: string
): Promise<{ ok: true; user: UserSession } | { ok: false; reason: "credentials" | "locked" | "inactive" }> {
  const user = await findUserByEmail(email);
  if (!user) return { ok: false, reason: "credentials" };
  if (user.isLocked) return { ok: false, reason: "locked" };
  if (!user.isActive) return { ok: false, reason: "inactive" };

  const row = queryOne<{ password_hash: string }>(
    "SELECT password_hash FROM users WHERE id = ?",
    [user.userId]
  );
  if (!row || !(await verifyPassword(password, row.password_hash))) {
    const db = getDb();
    db.prepare(
      "UPDATE users SET failed_login = failed_login + 1, is_locked = CASE WHEN failed_login + 1 >= 5 THEN 1 ELSE is_locked END WHERE id = ?"
    ).run(user.userId);
    return { ok: false, reason: "credentials" };
  }

  getDb().prepare("UPDATE users SET failed_login = 0, last_login_at = ? WHERE id = ?").run(nowISO(), user.userId);
  return { ok: true, user };
}

/**
 * يجدد رمز الوصول باستخدام رمز التجديد (تدوير الرمز).
 * يعيد رمزين جديدين أو null إذا كان الجلسة غير صالحة.
 */
export async function refreshSession(refreshToken: string): Promise<{
  accessToken: string;
  refreshToken: string;
  user: UserSession;
} | null> {
  const payload = verifyRefreshToken(refreshToken);
  if (!payload) return null;

  const user = queryOne<{
    id: string;
    name: string;
    email: string;
    password_hash: string;
    role_id: string;
    school_id: string | null;
    directorate_id: string | null;
    is_active: number;
    is_locked: number;
    token_version: number;
    role_key: string;
    role_name: string;
    permissions: unknown;
  } & UserSession>(
    `SELECT u.id, u.name, u.email, u.password_hash, u.role_id, u.school_id, u.directorate_id,
            u.is_active, u.is_locked, u.token_version,
            r.key AS role_key, r.name AS role_name, r.permissions
     FROM users u JOIN roles r ON u.role_id = r.id
     WHERE u.id = ?`,
    [payload.userId]
  );
  if (!user || user.isLocked || !user.isActive || user.tokenVersion !== payload.tokenVersion) {
    return null;
  }

  const session: UserSession = {
    userId: user.id,
    email: user.email,
    name: user.name,
    role: user.role_name,
    roleKey: user.role_key,
    schoolId: user.school_id,
    directorateId: user.directorate_id,
    tokenVersion: user.token_version,
    isActive: user.is_active === 1,
    isLocked: user.is_locked === 1,
    permissions:
      typeof user.permissions === "string"
        ? JSON.parse(user.permissions || "{}")
        : (user.permissions ?? {}),
  };

  const accessToken = signAccessToken(session);
  const newRefresh = signRefreshToken(user.id, user.token_version);
  await setAuthCookies(accessToken, newRefresh);
  return { accessToken, refreshToken: newRefresh, user: session };
}

/**
 * يحصل على جلسة المستخدم الحالي من طلب Next.js (الوصول ثم التجديد).
 */
export async function getServerSession(): Promise<UserSession | null> {
  const cookieStore = await cookies();
  const accessToken = cookieStore.get("access_token")?.value;
  if (accessToken) {
    const payload = verifyAccessToken(accessToken);
    if (payload) {
      return sessionFromPayload(payload);
    }
    // رمز الوصول منتهي الصلاحية —حاول التجديد برمز التجديد
    const refreshToken = cookieStore.get("refresh_token")?.value;
    if (refreshToken) {
      const renewed = await refreshSession(refreshToken);
      if (renewed) return renewed.user;
    }
    return null;
  }
  return null;
}

function sessionFromPayload(payload: AccessTokenPayload): UserSession | null {
  const user = queryOne<{
    id: string;
    is_active: number;
    is_locked: number;
    token_version: number;
    permissions: unknown;
  }>(
    "SELECT u.id, u.is_active, u.is_locked, u.token_version, r.permissions FROM users u JOIN roles r ON u.role_id = r.id WHERE u.id = ?",
    [payload.userId]
  );
  if (!user || user.is_locked === 1 || !user.is_active || user.token_version !== payload.tokenVersion) {
    return null;
  }
  return {
    userId: payload.userId,
    email: payload.email,
    name: payload.name,
    role: payload.role,
    roleKey: payload.roleKey,
    schoolId: payload.schoolId,
    directorateId: payload.directorateId,
    tokenVersion: payload.tokenVersion,
    isActive: user.is_active === 1,
    isLocked: user.is_locked === 1,
    permissions: typeof user.permissions === "string" ? JSON.parse(user.permissions as string) : (user.permissions ?? {}),
  };
}

/**
 * تسجيل تدقيق إجراء ما.
 */
export function auditLog({
  userId,
  action,
  entityType,
  entityId,
  oldValues,
  newValues,
  ipAddress,
  userAgent,
}: {
  userId?: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  oldValues?: unknown;
  newValues?: unknown;
  ipAddress?: string | null;
  userAgent?: string | null;
}): void {
  try {
    const db = getDb();
    db.prepare(
      `INSERT INTO audit_logs (id, user_id, action, entity_type, entity_id, old_values, new_values, ip_address, user_agent, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      uuid(),
      userId ?? null,
      action,
      entityType,
      entityId ?? null,
      oldValues ? toJson(oldValues) : null,
      newValues ? toJson(newValues) : null,
      ipAddress ?? null,
      userAgent ?? null,
      nowISO()
    );
  } catch {
    // لا يُعطل التدفق الرئيسي بسبب خطأ في التدقيق
  }
}

/**
 * التحقق من أن المستخدم يستطيع الإجراء ضمن نطاق معين (المدرسة / المديرية).
 */
export function authorize(user: UserSession | null, options: {
  roles?: string[];
  /**
   * صلاحية إضافية تُفحص بديلاً عن قائمة الأدوار: يكفي أن يملكها الدور
   * (أو أن يملك «كل الصلاحيات») للسماح بالعملية. هذا ما يجعل الأدوار
   * التي ينشئها المدير من داخل الموقع فعّالة بلا تعديل في الكود.
   */
  permission?: string;
  requireSchool?: boolean;
  requireDirectorate?: boolean;
  schoolId?: string | null;
  directorateId?: string | null;
}): { allowed: boolean; reason?: string } {
  if (!user || !user.isActive || user.isLocked) {
    return { allowed: false, reason: "غير مصرح لك بالدخول" };
  }

  const hasAll = user.permissions?.all === true;
  const hasNamed =
    !!options.permission && user.permissions?.[options.permission] === true;

  if (options.roles && !options.roles.includes(user.roleKey)) {
    if (!hasAll && !hasNamed) {
      return { allowed: false, reason: "هذه العملية تتطلب دورًا أعلى" };
    }
  } else if (!options.roles && options.permission && !hasAll && !hasNamed) {
    return {
      allowed: false,
      reason: "لا تملك الصلاحية المطلوبة لهذه العملية",
    };
  }
  if (options.requireSchool && user.schoolId && options.schoolId && user.schoolId !== options.schoolId) {
    return { allowed: false, reason: "لا يمكنك الوصول إلى بيانات هذه المدرسة" };
  }
  if (
    options.requireDirectorate &&
    user.directorateId &&
    options.directorateId &&
    user.directorateId !== options.directorateId
  ) {
    return { allowed: false, reason: "لا يمكنك الوصول إلى بيانات هذه المديرية" };
  }
  if (options.requireSchool && !user.schoolId && user.roleKey !== "SUPER_ADMIN") {
    return { allowed: false, reason: "أنت غير مرتبط بمدرسة" };
  }
  return { allowed: true };
}
