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

  it("يقبل GIF وBMP وTIFF", () => {
    const gif = Buffer.concat([Buffer.from("GIF89a"), Buffer.alloc(10)]);
    expect(sniffFile(gif, "a.gif")?.mime).toBe("image/gif");
    expect(sniffFile(buf(0x42, 0x4d), "a.bmp")?.mime).toBe("image/bmp");
    expect(sniffFile(buf(0x49, 0x49, 0x2a, 0x00), "a.tif")?.mime).toBe("image/tiff");
  });

  it("يقبل MP3 وMP4 وWAV", () => {
    expect(sniffFile(Buffer.concat([Buffer.from("ID3"), Buffer.alloc(16)]), "a.mp3")?.mime).toBe("audio/mpeg");
    const mp4 = Buffer.concat([Buffer.alloc(4), Buffer.from("ftypiso"), Buffer.from("m"), Buffer.alloc(8)]);
    expect(sniffFile(mp4, "a.mp4")?.mime).toBe("video/mp4");
    const wav = Buffer.concat([Buffer.from("RIFF"), Buffer.alloc(4), Buffer.from("WAVE"), Buffer.alloc(8)]);
    expect(sniffFile(wav, "a.wav")?.mime).toBe("audio/wav");
  });

  it("يقبل TXT وJSON وXML وMarkdown", () => {
    expect(sniffFile(Buffer.from("Hello world test file contents"), "a.txt")?.mime).toBe("text/plain");
    expect(sniffFile(Buffer.from('{"key": "value", "n": 1}'), "a.json")?.mime).toBe("application/json");
    expect(sniffFile(Buffer.from('<?xml version="1.0"?>'), "a.xml")?.mime).toBe("application/xml");
    expect(sniffFile(Buffer.from("# Heading\n\nParagraph"), "a.md")?.mime).toBe("text/markdown");
  });

  it("يقبل ZIP وRAR و7z والأرشيفات", () => {
    const zip = Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), Buffer.alloc(20)]);
    expect(sniffFile(zip, "a.zip")?.mime).toBe("application/zip");
    expect(sniffFile(Buffer.concat([Buffer.from("Rar!"), Buffer.alloc(16)]), "a.rar")?.mime).toBe("application/x-rar-compressed");
  });

  it("يقبل PPTX وODT", () => {
    const zip = Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), Buffer.alloc(20)]);
    expect(sniffFile(zip, "s.pptx")?.mime).toContain("presentation");
    expect(sniffFile(zip, "d.odt")?.mime).toContain("opendocument");
  });

  it("يرفض تنفيذياً مُسمّى .pdf", () => {
    expect(sniffFile(Buffer.from("MZ\x90\x00 executable payload here"), "evil.pdf")).toBeNull();
  });

  it("يرفض الامتدادات الخطرة حتى لو بدا المحتوى سليماً", () => {
    for (const ext of ["exe", "js", "html", "svg", "php", "sh", "bat"]) {
      expect(sniffFile(buf(0x25, 0x50, 0x44, 0x46), `x.${ext}`)).toBeNull();
    }
  });

  it("يقبل ZIP و docx/xlsx/pptx", () => {
    const zip = Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), Buffer.alloc(20)]);
    expect(sniffFile(zip, "x.zip")?.mime).toBe("application/zip");
    expect(sniffFile(zip, "r.docx")?.ext).toBe("docx");
    expect(sniffFile(zip, "r.xlsx")?.ext).toBe("xlsx");
    expect(sniffFile(zip, "r.pptx")?.ext).toBe("pptx");
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
