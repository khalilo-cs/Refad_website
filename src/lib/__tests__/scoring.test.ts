import { describe, it, expect } from "vitest";
import {
  computeSubCriterion,
  computeCriterion,
  computeEvaluation,
  round2,
  type IndicatorInput,
  type CriterionInput,
} from "../scoring";

/** منشئ مؤشر مختصر للاختبارات. */
function ind(
  subCriterionId: string,
  status: "EVALUATED" | "NOT_EVALUATED",
  score: number | null = null,
  code = "I"
): IndicatorInput {
  return {
    indicatorId: `${subCriterionId}-${code}`,
    code,
    title: "مؤشر اختبار",
    subCriterionId,
    status,
    score,
  };
}

describe("round2", () => {
  it("يقرّب إلى منزلتين عشريتين", () => {
    expect(round2(66.666666)).toBe(66.67);
    expect(round2(33.333333)).toBe(33.33);
    expect(round2(50)).toBe(50);
  });
});

describe("computeSubCriterion — نسبة التحقق والمساهمة", () => {
  it("يحسب النسبة والمساهمة وفق الصيغة المطلوبة", () => {
    // 3 مؤشرات بدرجات 3,3,0 → المتوسط 2 → 2/3 × 100 = 66.67%
    // الوزن 40 → المساهمة = 66.67 × 40 / 100 = 26.67
    const result = computeSubCriterion(
      {
        subCriterionId: "SC1",
        code: "1-1",
        title: "معيار فرعي",
        weight: 40,
        indicators: [ind("SC1", "EVALUATED", 3), ind("SC1", "EVALUATED", 3), ind("SC1", "EVALUATED", 0)],
      },
      3
    );

    expect(result.averageScore).toBe(2);
    expect(result.achievementPercent).toBe(66.67);
    expect(result.contribution).toBe(26.67);
    expect(result.completionPercent).toBe(100);
    expect(result.isComplete).toBe(true);
  });

  it("يبقي المؤشر غير المقيَّم خارج المقام ويعدّه إجرائياً لا فشلاً", () => {
    // مؤشران مقيَّمان (3,2) ومؤشر ثالث لم يُقيَّم.
    // المتوسط على المقيَّم فقط = 2.5 → 83.33% وليس 2.5/3=55.5%
    const result = computeSubCriterion(
      {
        subCriterionId: "SC2",
        code: "1-2",
        title: "معيار فرعي",
        weight: 60,
        indicators: [
          ind("SC2", "EVALUATED", 3),
          ind("SC2", "EVALUATED", 2),
          ind("SC2", "NOT_EVALUATED", null),
        ],
      },
      3
    );

    expect(result.evaluatedIndicators).toBe(2);
    expect(result.notEvaluatedIndicators).toBe(1);
    expect(result.averageScore).toBe(2.5);
    expect(result.achievementPercent).toBe(83.33);
    expect(result.completionPercent).toBe(66.67);
    expect(result.isComplete).toBe(false);
  });

  it("يعيد null لا صفراً حين لا يوجد أي مؤشر مقيَّم", () => {
    const result = computeSubCriterion(
      {
        subCriterionId: "SC3",
        code: "1-3",
        title: "معيار فرعي",
        weight: 10,
        indicators: [ind("SC3", "NOT_EVALUATED"), ind("SC3", "NOT_EVALUATED")],
      },
      3
    );

    expect(result.achievementPercent).toBeNull();
    expect(result.contribution).toBeNull();
    expect(result.averageScore).toBeNull();
    expect(result.completionPercent).toBe(0);
  });

  it("يمنع القسمة على صفر عند درجة عظمى صفرية", () => {
    const result = computeSubCriterion(
      {
        subCriterionId: "SC4",
        code: "1-4",
        title: "معيار",
        weight: 10,
        indicators: [ind("SC4", "EVALUATED", 3)],
      },
      0
    );
    expect(result.achievementPercent).toBeNull();
  });

  it("يعطي 100% عند تحقق كل المؤشرات بالدرجة العظمى", () => {
    const result = computeSubCriterion(
      {
        subCriterionId: "SC5",
        code: "1-5",
        title: "معيار",
        weight: 25,
        indicators: [ind("SC5", "EVALUATED", 3), ind("SC5", "EVALUATED", 3)],
      },
      3
    );
    expect(result.achievementPercent).toBe(100);
    expect(result.contribution).toBe(25);
  });

  it("يعطي صفراً حقيقياً عند تقييم مؤشرات بدرجة صفر", () => {
    // الفرق الجوهري: صفر درجة ≠ لم يُقيَّم
    const result = computeSubCriterion(
      {
        subCriterionId: "SC6",
        code: "1-6",
        title: "معيار",
        weight: 10,
        indicators: [ind("SC6", "EVALUATED", 0), ind("SC6", "EVALUATED", 0)],
      },
      3
    );
    expect(result.achievementPercent).toBe(0);
    expect(result.contribution).toBe(0);
    expect(result.isComplete).toBe(true);
  });
});

describe("computeCriterion", () => {
  it("يحسب المتوسط المرجّح لمعاييرِه الفرعية", () => {
    const criterion: CriterionInput = {
      criterionId: "C1",
      code: "1",
      title: "المعيار الأول",
      weight: 15,
      subCriteria: [
        {
          subCriterionId: "SC1",
          code: "1-1",
          title: "أ",
          weight: 40,
          indicators: [ind("SC1", "EVALUATED", 3)],
        },
        {
          subCriterionId: "SC2",
          code: "1-2",
          title: "ب",
          weight: 60,
          indicators: [ind("SC2", "EVALUATED", 0)],
        },
      ],
    };

    const result = computeCriterion(criterion, 3);
    // 100% بوزن 40 و 0% بوزن 60 → 40%
    expect(result.achievementPercent).toBe(40);
    // المساهمة = 40 × 15 / 100 = 6
    expect(result.contribution).toBe(6);
    expect(result.completionPercent).toBe(100);
  });

  it("يستبعد المعايير الفرعية غير المقيَّمة من ترجيح المعيار", () => {
    const criterion: CriterionInput = {
      criterionId: "C2",
      code: "2",
      title: "المعيار الثاني",
      weight: 20,
      subCriteria: [
        {
          subCriterionId: "SC1",
          code: "2-1",
          title: "أ",
          weight: 10,
          indicators: [ind("SC1", "EVALUATED", 3)],
        },
        {
          subCriterionId: "SC2",
          code: "2-2",
          title: "ب",
          weight: 10,
          indicators: [ind("SC2", "NOT_EVALUATED")],
        },
      ],
    };

    const result = computeCriterion(criterion, 3);
    // المقيَّم فقط وزنه 50 → المتوسط 100% لا 50%
    expect(result.achievementPercent).toBe(100);
    expect(result.completionPercent).toBe(50);
    expect(result.isComplete).toBe(false);
  });
});

describe("computeEvaluation — الدرجة الكلية", () => {
  const buildCriteria = (): CriterionInput[] => [
    {
      criterionId: "C1",
      code: "1",
      title: "الإدارة المدرسية",
      weight: 15,
      subCriteria: [
        {
          subCriterionId: "SC1",
          code: "1-1",
          title: "التخطيط",
          weight: 15,
          indicators: [ind("SC1", "EVALUATED", 3)],
        },
      ],
    },
    {
      criterionId: "C2",
      code: "2",
      title: "المعلمون",
      weight: 20,
      subCriteria: [
        {
          subCriterionId: "SC2",
          code: "2-1",
          title: "التأهيل",
          weight: 20,
          indicators: [ind("SC2", "EVALUATED", 0)],
        },
      ],
    },
  ];

  it("يجمع مساهمات المعايير الفرعية", () => {
    const result = computeEvaluation(buildCriteria(), 3);
    // C1: 100% × 15 / 100 = 15 | C2: 0% × 20 / 100 = 0 → 15
    expect(result.totalScore).toBe(15);
    expect(result.completionPercent).toBe(100);
    expect(result.isComplete).toBe(true);
    expect(result.reportState).toBe("COMPLETE");
  });

  it("يُعلن التقرير مسودة غير مكتملة عند نقص البيانات", () => {
    const criteria = buildCriteria();
    criteria[0].subCriteria[0].indicators.push(ind("SC1", "NOT_EVALUATED"));

    const result = computeEvaluation(criteria, 3);
    expect(result.isComplete).toBe(false);
    expect(result.reportState).toBe("DRAFT_INCOMPLETE");
    expect(result.notEvaluatedIndicators).toBe(1);
    expect(result.completionPercent).toBe(66.67);
    expect(result.warnings.length).toBeGreaterThan(0);
    expect(result.warnings.join(" ")).toContain("مسودة");
  });

  it("لا يخفي النقص بدلاً من الإبلاغ عنه", () => {
    const criteria = buildCriteria();
    criteria.push({
      criterionId: "C3",
      code: "3",
      title: "بيئة المدرسة",
      weight: 15,
      subCriteria: [
        {
          subCriterionId: "SC3",
          code: "3-1",
          title: "المرافق",
          weight: 15,
          indicators: [ind("SC3", "NOT_EVALUATED")],
        },
      ],
    });

    const result = computeEvaluation(criteria, 3);
    expect(result.totalScore).toBe(15); // الدرجة من المقيَّم فقط
    expect(result.warnings.join(" ")).toContain("بلا أي مؤشر مقيَّم");
  });

  it("يعيد null حين لا يوجد أي مؤشر مقيَّم إطلاقاً", () => {
    const result = computeEvaluation(
      [
        {
          criterionId: "C1",
          code: "1",
          title: "معيار",
          weight: 100,
          subCriteria: [
            {
              subCriterionId: "SC1",
              code: "1-1",
              title: "فرعي",
              weight: 100,
              indicators: [ind("SC1", "NOT_EVALUATED")],
            },
          ],
        },
      ],
      3
    );
    expect(result.totalScore).toBeNull();
    expect(result.reportState).toBe("DRAFT_INCOMPLETE");
  });

  it("يتعامل مع قائمة معايير فارغة بلا انهيار", () => {
    const result = computeEvaluation([], 3);
    expect(result.totalIndicators).toBe(0);
    expect(result.totalScore).toBeNull();
    expect(result.reportState).toBe("DRAFT_INCOMPLETE");
  });
});
