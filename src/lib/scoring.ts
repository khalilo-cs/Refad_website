/**
 * محرك حساب درجات التقييم — دوال نقية بلا أي وصول لقاعدة البيانات.
 *
 * القواعد المطبَّقة:
 *  1) المؤشر غير المقيَّم ("لم يُقيَّم بعد") حالة إجرائية منفصلة، ولا يُحسب
 *     صفراً ولا يُعدّ فشلاً. يُستبعد من مقام المتوسط كلياً.
 *  2) نسبة تحقق المعيار الفرعي = (متوسط درجات المؤشرات المقيَّمة ÷ الدرجة العظمى) × 100
 *  3) مساهمة المعيار الفرعي = (نسبة التحقق × الوزن) ÷ 100
 *  4) الدرجة الكلية = مجموع مساهمات المعايير الفرعية
 *  5) نسبة الإكمال = المؤشرات المقيَّمة ÷ كل المؤشرات المطلوبة × 100
 *  6) إن لم تكتمل البيانات فالتقرير مسودة/غير مكتمل، ولا تُنسب إليه درجة نهائية.
 */

export type EvaluationStatus = "NOT_EVALUATED" | "EVALUATED";

export type IndicatorInput = {
  indicatorId: string;
  code: string;
  title: string;
  subCriterionId: string;
  status: EvaluationStatus;
  /** الدرجة الفعلية. تُهمَل إن كانت الحالة NOT_EVALUATED. */
  score: number | null;
};

export type SubCriterionInput = {
  subCriterionId: string;
  code: string;
  title: string;
  /** الوزن بالنسبة المئوية (مثال: 40 يعني 40%). */
  weight: number;
  indicators: IndicatorInput[];
};

export type CriterionInput = {
  criterionId: string;
  code: string;
  title: string;
  /** وزن المعيار بالنسبة المئوية. */
  weight: number;
  subCriteria: SubCriterionInput[];
};

export type SubCriterionResult = {
  subCriterionId: string;
  code: string;
  title: string;
  weight: number;
  totalIndicators: number;
  evaluatedIndicators: number;
  notEvaluatedIndicators: number;
  averageScore: number | null;
  achievementPercent: number | null;
  contribution: number | null;
  completionPercent: number;
  isComplete: boolean;
};

export type CriterionResult = {
  criterionId: string;
  code: string;
  title: string;
  weight: number;
  achievementPercent: number | null;
  contribution: number | null;
  completionPercent: number;
  isComplete: boolean;
  totalIndicators: number;
  evaluatedIndicators: number;
  subCriteria: SubCriterionResult[];
};

export type ReportState = "DRAFT_INCOMPLETE" | "COMPLETE";

export type EvaluationResult = {
  maxScore: number;
  totalScore: number | null;
  totalAchievementPercent: number | null;
  completionPercent: number;
  totalIndicators: number;
  evaluatedIndicators: number;
  notEvaluatedIndicators: number;
  reportState: ReportState;
  isComplete: boolean;
  criteria: CriterionResult[];
  /** تنبيهات صريحة تُعرض للمستخدم، لا تُخفى. */
  warnings: string[];
};

/** تقريب آمن إلى منزلتين عشريتين. */
export function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/** الخانة العشرية الواحدة كما تُعرض في الواجهات. */
export function round1(value: number): number {
  return Math.round((value + Number.EPSILON) * 10) / 10;
}

function isEvaluated(indicator: IndicatorInput): boolean {
  return indicator.status === "EVALUATED";
}

/**
 * يحسب نتائج معيار فرعي واحد.
 * @param subCriterion بيانات المعيار الفرعي ومؤشراته
 * @param maxScore الدرجة العظمى للمقياس (3 افتراضاً)
 */
export function computeSubCriterion(
  subCriterion: SubCriterionInput,
  maxScore: number
): SubCriterionResult {
  const indicators = subCriterion.indicators;
  const totalIndicators = indicators.length;
  const evaluated = indicators.filter(isEvaluated);
  const evaluatedIndicators = evaluated.length;
  const notEvaluatedIndicators = totalIndicators - evaluatedIndicators;

  const completionPercent =
    totalIndicators === 0 ? 0 : round2((evaluatedIndicators / totalIndicators) * 100);

  // لا توجد مؤشرات مقيَّمة: المتوسط غير معروف (null) وليس صفراً.
  if (evaluatedIndicators === 0 || maxScore <= 0) {
    return {
      subCriterionId: subCriterion.subCriterionId,
      code: subCriterion.code,
      title: subCriterion.title,
      weight: subCriterion.weight,
      totalIndicators,
      evaluatedIndicators,
      notEvaluatedIndicators,
      averageScore: null,
      achievementPercent: null,
      contribution: null,
      completionPercent,
      isComplete: totalIndicators > 0 && evaluatedIndicators === totalIndicators,
    };
  }

  const sum = evaluated.reduce((acc, ind) => acc + (ind.score ?? 0), 0);
  const averageScore = sum / evaluatedIndicators;
  const achievementPercent = round2((averageScore / maxScore) * 100);
  const contribution = round2((achievementPercent * subCriterion.weight) / 100);

  return {
    subCriterionId: subCriterion.subCriterionId,
    code: subCriterion.code,
    title: subCriterion.title,
    weight: subCriterion.weight,
    totalIndicators,
    evaluatedIndicators,
    notEvaluatedIndicators,
    averageScore: round2(averageScore),
    achievementPercent,
    contribution,
    completionPercent,
    isComplete: notEvaluatedIndicators === 0,
  };
}

/** يحسب نتائج معيار رئيسي من معاييرِه الفرعية. */
export function computeCriterion(
  criterion: CriterionInput,
  maxScore: number
): CriterionResult {
  const subs = criterion.subCriteria.map((sc) => computeSubCriterion(sc, maxScore));

  const totalIndicators = subs.reduce((a, s) => a + s.totalIndicators, 0);
  const evaluatedIndicators = subs.reduce((a, s) => a + s.evaluatedIndicators, 0);

  const completionPercent =
    totalIndicators === 0 ? 0 : round2((evaluatedIndicators / totalIndicators) * 100);

  // نسبة تحقق المعيار = المتوسط المرجّح لنسب تحقق معاييره الفرعية،
  // محسوباً على المعايير الفرعية المقيَّمة فقط.
  const scored = subs.filter((s) => s.achievementPercent !== null);
  const weightOfScored = scored.reduce((a, s) => a + s.weight, 0);

  let achievementPercent: number | null = null;
  let contribution: number | null = null;

  if (scored.length > 0 && weightOfScored > 0) {
    const weighted =
      scored.reduce((acc, s) => acc + (s.achievementPercent as number) * s.weight, 0) /
      weightOfScored;
    achievementPercent = round2(weighted);
    contribution = round2((achievementPercent * criterion.weight) / 100);
  }

  return {
    criterionId: criterion.criterionId,
    code: criterion.code,
    title: criterion.title,
    weight: criterion.weight,
    achievementPercent,
    contribution,
    completionPercent,
    isComplete: totalIndicators > 0 && evaluatedIndicators === totalIndicators,
    totalIndicators,
    evaluatedIndicators,
    subCriteria: subs,
  };
}

/**
 * يحسب النتيجة الكلية للتقييم.
 * الدرجة الكلية تُجمع من مساهمات المعايير الفرعية (المقيَّمة فقط).
 */
export function computeEvaluation(
  criteria: CriterionInput[],
  maxScore: number
): EvaluationResult {
  const criterionResults = criteria.map((c) => computeCriterion(c, maxScore));

  const totalIndicators = criterionResults.reduce((a, c) => a + c.totalIndicators, 0);
  const evaluatedIndicators = criterionResults.reduce((a, c) => a + c.evaluatedIndicators, 0);
  const notEvaluatedIndicators = totalIndicators - evaluatedIndicators;

  const completionPercent =
    totalIndicators === 0 ? 0 : round2((evaluatedIndicators / totalIndicators) * 100);

  // مجموع مساهمات كل المعايير الفرعية المقيَّمة.
  const allSubs = criterionResults.flatMap((c) => c.subCriteria);
  const contributions = allSubs
    .map((s) => s.contribution)
    .filter((v): v is number => v !== null);

  const totalScore = contributions.length > 0 ? round2(contributions.reduce((a, b) => a + b, 0)) : null;

  const warnings: string[] = [];

  const missingSubs = allSubs.filter((s) => s.achievementPercent === null);
  if (missingSubs.length > 0) {
    warnings.push(
      `${missingSubs.length} معيار فرعي بلا أي مؤشر مقيَّم، ولم يُحتسب في الدرجة الكلية.`
    );
  }

  const partialSubs = allSubs.filter(
    (s) => s.achievementPercent !== null && s.notEvaluatedIndicators > 0
  );
  if (partialSubs.length > 0) {
    warnings.push(
      `${partialSubs.length} معيار فرعي مقيَّم جزئياً؛ نُسبت درجته إلى المؤشرات المقيَّمة فقط.`
    );
  }

  const isComplete = totalIndicators > 0 && notEvaluatedIndicators === 0;

  if (!isComplete) {
    warnings.push(
      `لم يكتمل التقييم: ${notEvaluatedIndicators} من ${totalIndicators} مؤشراً لم يُقيَّم بعد. التقرير مسودة غير مكتملة.`
    );
  }

  if (totalIndicators === 0) {
    warnings.push("لا توجد مؤشرات مرتبطة بهذا التقييم.");
  }

  return {
    maxScore,
    totalScore,
    totalAchievementPercent: totalScore,
    completionPercent,
    totalIndicators,
    evaluatedIndicators,
    notEvaluatedIndicators,
    reportState: isComplete ? "COMPLETE" : "DRAFT_INCOMPLETE",
    isComplete,
    criteria: criterionResults,
    warnings,
  };
}

/**
 * الصيغة المطلوبة نصاً — تُعرض في الواجهة ليعرف المستخدم كيف حُسبت الدرجة.
 */
export const FORMULA_TEXT = [
  "نسبة تحقق المعيار الفرعي = (متوسط درجات المؤشرات المقيَّمة ÷ الدرجة العظمى) × 100",
  "مساهمة المعيار الفرعي = (نسبة التحقق × وزن المعيار الفرعي) ÷ 100",
  "الدرجة الكلية = مجموع مساهمات المعايير الفرعية",
  "المؤشر غير المقيَّم حالة إجرائية منفصلة، لا تُحسب صفراً ولا تُعدّ فشلاً",
];


/**
 * يتحقق من سلامة الأوزان: مجموع أوزان المعايير = 100،
 * ومجموع أوزان المعايير الفرعية داخل كل معيار = وزن ذلك المعيار.
 * يعيد قائمة أخطاء فارغة إن كانت البيانات سليمة.
 */
export function validateWeights(criteria: CriterionInput[]): string[] {
  const errors: string[] = [];

  const totalWeight = round2(criteria.reduce((a, c) => a + c.weight, 0));
  if (criteria.length > 0 && totalWeight !== 100) {
    errors.push(`مجموع أوزان المعايير ${totalWeight} ويجب أن يساوي 100.`);
  }

  for (const criterion of criteria) {
    const subTotal = round2(criterion.subCriteria.reduce((a, s) => a + s.weight, 0));
    if (criterion.subCriteria.length > 0 && subTotal !== round2(criterion.weight)) {
      errors.push(
        `مجموع أوزان المعايير الفرعية للمعيار ${criterion.code} هو ${subTotal} ويجب أن يساوي وزنه ${criterion.weight}.`
      );
    }
  }

  return errors;
}


/**
 * الشكل الخام كما يرد من بيانات الاستمارة أو قاعدة البيانات:
 * بعض المعايير لها معايير فرعية، وبعضها مؤشرات مباشرة بلا معايير فرعية.
 */
export type RawCriterionInput = {
  criterionId: string;
  code: string;
  title: string;
  weight: number;
  subCriteria: SubCriterionInput[] | null;
  flatIndicators: IndicatorInput[] | null;
};

/**
 * يوحّد المعيار إلى الشكل القياسي.
 * المعيار الذي لا معايير فرعية له (مثل المعيارين 3 و6 في الاستمارة) يُعامل
 * كمعيار فرعي واحد يحمل وزن المعيار كاملاً، حتى تعمل الصيغة نفسها على الجميع.
 */
export function normalizeCriterion(raw: RawCriterionInput): CriterionInput {
  if (raw.subCriteria && raw.subCriteria.length > 0) {
    return {
      criterionId: raw.criterionId,
      code: raw.code,
      title: raw.title,
      weight: raw.weight,
      subCriteria: raw.subCriteria,
    };
  }

  return {
    criterionId: raw.criterionId,
    code: raw.code,
    title: raw.title,
    weight: raw.weight,
    subCriteria: [
      {
        subCriterionId: `${raw.criterionId}-flat`,
        code: raw.code,
        title: raw.title,
        weight: raw.weight,
        indicators: raw.flatIndicators ?? [],
      },
    ],
  };
}

/** يوحّد قائمة معايير دفعة واحدة. */
export function normalizeCriteria(raws: RawCriterionInput[]): CriterionInput[] {
  return raws.map(normalizeCriterion);
}

/** يصف حالة التقرير بالعربية للعرض. */
export function describeReportState(state: ReportState): string {
  return state === "COMPLETE" ? "تقييم مكتمل" : "مسودة غير مكتملة";
}
