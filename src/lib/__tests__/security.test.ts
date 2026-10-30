import { describe, expect, it, beforeEach } from "vitest";
import {
  isSameOrigin, rateLimit, resetRateLimits, safeStoragePath, sanitizeFilename, signResourceToken, sniffFile, verifyResourceToken,
} from "../security";

const buf = (...bytes: number[]) => Buffer.from([...bytes, ...new Array(16).fill(0x20)]);

describe("فحص الملفات المرفوعة بمحتواها لا باسمها", () => {
  it("يقبل PDF وصورة PNG وJPEG وWebP بتوقيعاتها", () => {
    expect(sniffFile(buf(0x25, 0x50, 0x44, 0x46), "a.pdf")?.mime).toBe("application/pdf");
    expect(sniffFile(buf(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a), "a.png")?.mime).toBe("image/png");
    expect(sniffFile(buf(0xff, 0xd8, 0xff, 0xe0), "a.jpg")?.mime).toBe("image/jpeg");
    const webp = Buffer.concat([Buffer.from("RIFF"), Buffer.from([0, 0, 0, 0]), Buffer.from("WEBP"), Buffer.alloc(8)]);
    expect(sniffFile(webp, "a.webp")?.mime).toBe("image/webp");
  });

  it("يرفض تنفيذياً مُسمّى .pdf", () => {
    expect(sniffFile(Buffer.from("MZ\x90\x00 executable payload here"), "evil.pdf")).toBeNull();
  });

  it("يرفض الامتدادات الخطرة حتى لو بدا المحتوى سليماً", () => {
    for (const ext of ["exe", "js", "html", "svg", "php", "sh", "bat"]) {
      expect(sniffFile(buf(0x25, 0x50, 0x44, 0x46), `x.${ext}`)).toBeNull();
    }
  });

  it("يرفض ملف ZIP باسم لا يطابق Office، ويقبل docx/xlsx", () => {
    const zip = Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), Buffer.alloc(20)]);
    expect(sniffFile(zip, "x.zip")).toBeNull();
    expect(sniffFile(zip, "r.docx")?.ext).toBe("docx");
    expect(sniffFile(zip, "r.xlsx")?.ext).toBe("xlsx");
  });

  it("يقبل CSV نصياً ويرفض ثنائياً", () => {
    expect(sniffFile(Buffer.from("a,b,c\n1,2,3\n"), "d.csv")?.mime).toBe("text/csv");
    expect(sniffFile(Buffer.from([0x61, 0x2c, 0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06]), "d.csv")).toBeNull();
  });

  it("يرفض الملفات الأصغر من توقيع", () => {
    expect(sniffFile(Buffer.from("%PD"), "a.pdf")).toBeNull();
  });
});

describe("مسارات التخزين الخاصة", () => {
  it("يمنع اجتياز المسارات", () => {
    expect(safeStoragePath("../../etc/passwd")).toBeNull();
    expect(safeStoragePath("a/b.pdf")).toBeNull();
    expect(safeStoragePath("..")).toBeNull();
    expect(safeStoragePath("ok-file_1.pdf")).not.toBeNull();
  });
  it("ينظّف اسم الملف", () => {
    expect(sanitizeFilename("../../a<b>.pdf")).not.toMatch(/[<>/\\]/);
    expect(sanitizeFilename("")).toBe("file");
  });
});

describe("الروابط الموقّعة المؤقتة", () => {
  it("تصلح لمورد واحد ومستخدم واحد وتنتهي", () => {
    const t = signResourceToken("evidence:1", "u1", 60);
    expect(verifyResourceToken(t, "evidence:1")).toEqual({ ok: true, userId: "u1" });
    expect(verifyResourceToken(t, "evidence:2").ok).toBe(false);
    const expired = signResourceToken("evidence:1", "u1", -5);
    expect(verifyResourceToken(expired, "evidence:1").ok).toBe(false);
  });
  it("تكشف العبث بالتوقيع أو بالحمولة", () => {
    const t = signResourceToken("evidence:1", "u1", 60);
    expect(verifyResourceToken(t + "x", "evidence:1").ok).toBe(false);
    const [payload, sig] = t.split(".");
    const forged = Buffer.from(JSON.stringify({ r: "evidence:1", u: "admin", e: 9999999999 })).toString("base64url");
    expect(verifyResourceToken(`${forged}.${sig}`, "evidence:1").ok).toBe(false);
    expect(payload.length).toBeGreaterThan(10);
  });
});

describe("تحديد المعدل وحماية CSRF", () => {
  beforeEach(() => resetRateLimits());
  it("يحجب بعد تجاوز الحد", () => {
    for (let i = 0; i < 3; i++) expect(rateLimit("k", 3, 60_000).ok).toBe(true);
    expect(rateLimit("k", 3, 60_000).ok).toBe(false);
    expect(rateLimit("other", 3, 60_000).ok).toBe(true);
  });
  it("يرفض الطلبات المغيِّرة من مصدر مختلف", () => {
    const mk = (origin: string | null, method = "POST") => new Request("https://rifad.example/api/x", { method, headers: origin ? { origin, host: "rifad.example" } : { host: "rifad.example" } });
    expect(isSameOrigin(mk("https://rifad.example"))).toBe(true);
    expect(isSameOrigin(mk("https://evil.example"))).toBe(false);
    expect(isSameOrigin(mk("https://evil.example", "GET"))).toBe(true);
  });
});

describe("أسرار JWT تُقرأ وقت الاستخدام لا وقت التحميل", () => {
  it("تحميل وحدة المصادقة بلا JWT_SECRET لا يرمي (حتى لا يفشل البناء)، والتوقيع يرفض بوضوح", async () => {
    const saved = process.env.JWT_SECRET;
    const { vi } = await import("vitest");
    vi.resetModules();
    delete process.env.JWT_SECRET;
    try {
      const auth = await import("@/lib/auth");
      expect(() => auth.signAccessToken({ userId: "u", email: "a@b.c", name: "n", role: "r", roleKey: "SUPER_ADMIN", schoolId: null, directorateId: null, tokenVersion: 1 } as any)).toThrow(/JWT_SECRET/);
    } finally {
      process.env.JWT_SECRET = saved;
      vi.resetModules();
    }
  });
});
