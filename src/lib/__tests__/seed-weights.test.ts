import { describe, it, expect } from "vitest";
import {
  validateWeights,
  computeEvaluation,
  normalizeCriteria,
  type CriterionInput,
  type RawCriterionInput,
} from "../scoring";
import { SEED_CRITERIA, RATING_SCALE } from "../../../prisma/seed/data";

/** يحوّل بيانات البذر إلى شكل محرك الحساب، مع توحيد المعايير بلا معايير فرعية. */
function toCriterionInputs(): CriterionInput[] {
  const raws: RawCriterionInput[] = SEED_CRITERIA.map((c: any) => ({
    criterionId: c.code,
    code: c.code,
    title: c.title,
    weight: c.weight,
    subCriteria: c.subCriteria
      ? c.subCriteria.map((s: any) => ({
          subCriterionId: s.code,
          code: s.code,
          title: s.title,
          weight: s.weight,
          indicators: s.indicators.map((i: any) => ({
            indicatorId: i.code,
            code: i.code,
            title: i.title,
            subCriterionId: s.code,
            status: "NOT_EVALUATED" as const,
            score: null,
          })),
        }))
      : null,
    flatIndicators: c.flatIndicators
      ? c.flatIndicators.map((i: any) => ({
          indicatorId: i.code,
          code: i.code,
          title: i.title,
          subCriterionId: `${c.code}-flat`,
          status: "NOT_EVALUATED" as const,
          score: null,
        }))
      : null,
  }));

  return normalizeCriteria(raws);
}

describe("سلامة أوزان بيانات البذر", () => {
  it("مجموع أوزان المعايير السبعة يساوي 100", () => {
    const total = SEED_CRITERIA.reduce((a: number, c: any) => a + c.weight, 0);
    expect(total).toBe(100);
  });

  it("أوزان المعايير مطابقة للمواصفة المطلوبة", () => {
    const weights = SEED_CRITERIA.map((c: any) => c.weight);
    // 15 + 20 + 15 + 20 + 15 + 5 + 10 = 100
    expect(weights).toEqual([15, 20, 15, 20, 15, 5, 10]);
  });

  it("مجموع أوزان المعايير الفرعية داخل كل معيار يساوي وزنه", () => {
    const inputs = toCriterionInputs();
    expect(validateWeights(inputs)).toEqual([]);
  });

  it("عدد المؤشرات الكلي يساوي 109", () => {
    const inputs = toCriterionInputs();
    const total = inputs.reduce(
      (a, c) => a + c.subCriteria.reduce((b, s) => b + s.indicators.length, 0),
      0
    );
    expect(total).toBe(109);
  });

  it("كل مؤشر يستند إلى معيار فرعي صحيح وله رمز", () => {
    const inputs = toCriterionInputs();
    for (const c of inputs) {
      for (const s of c.subCriteria) {
        for (const i of s.indicators) {
          expect(i.code).toBeTruthy();
          expect(i.subCriterionId).toBe(s.subCriterionId);
        }
      }
    }
  });

  it("مقياس التقدير يبدأ من صفر وينتهي بثلاث درجات", () => {
    const scores = RATING_SCALE.map((r: any) => r.score).sort((a: number, b: number) => a - b);
    expect(scores).toEqual([0, 1, 2, 3]);
  });

  it("تقييم كامل بدرجة عظمى يعطي 100 من 100", () => {
    const inputs = toCriterionInputs();
    // كل المؤشرات مقيَّمة بالدرجة العظمى
    for (const c of inputs) {
      for (const s of c.subCriteria) {
        for (const i of s.indicators) {
          (i as any).status = "EVALUATED";
          (i as any).score = 3;
        }
      }
    }

    const result = computeEvaluation(inputs, 3);
    expect(result.totalScore).toBe(100);
    expect(result.completionPercent).toBe(100);
    expect(result.isComplete).toBe(true);
    expect(result.reportState).toBe("COMPLETE");
    expect(result.warnings).toEqual([]);
  });

  it("تقييم كامل بدرجة صفر يعطي صفراً مكتملاً لا مسودة", () => {
    const inputs = toCriterionInputs();
    for (const c of inputs) {
      for (const s of c.subCriteria) {
        for (const i of s.indicators) {
          (i as any).status = "EVALUATED";
          (i as any).score = 0;
        }
      }
    }

    const result = computeEvaluation(inputs, 3);
    expect(result.totalScore).toBe(0);
    expect(result.isComplete).toBe(true);
    expect(result.reportState).toBe("COMPLETE");
  });

  it("تقييم كامل بدرجة متوسطة يعطي 66.67 تقريباً", () => {
    const inputs = toCriterionInputs();
    for (const c of inputs) {
      for (const s of c.subCriteria) {
        for (const i of s.indicators) {
          (i as any).status = "EVALUATED";
          (i as any).score = 2;
        }
      }
    }

    const result = computeEvaluation(inputs, 3);
    // 2/3 × 100 = 66.67 لكل معيار فرعي، والمساهمة تُجمع إلى 66.67
    expect(result.totalScore).toBeCloseTo(66.67, 1);
    expect(result.isComplete).toBe(true);
  });

  it("تقييم بلا بيانات يعطي مسودة غير مكتملة بلا درجة", () => {
    const result = computeEvaluation(toCriterionInputs(), 3);
    expect(result.totalScore).toBeNull();
    expect(result.reportState).toBe("DRAFT_INCOMPLETE");
    expect(result.completionPercent).toBe(0);
  });
});
