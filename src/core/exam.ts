/**
 * Het rijexamen.
 *
 * In de carrièremodus rijdt niemand zomaar een lijn: eerst het rijexamen op een
 * zelfgekozen route, en daarna per lijn een examen om er een lijnvergunning voor
 * te krijgen. Een examen is één rit, en die wordt langs dezelfde meters gelegd
 * die de app tijdens een gewone dienst ook al bijhoudt -- de plugin meet niets
 * extra's voor dit doel.
 *
 * De eisen zijn bewust wat we eerlijk kunnen meten. "Elke halte aangedaan" staat
 * er niet bij: de IBIS meldt alleen welke halte de volgende is, dus wie er een
 * overslaat is achteraf niet met zekerheid aan te wijzen.
 */

/** Waar een examen op afgerekend wordt. */
export type ExamRule = 'finish' | 'punctual' | 'smooth' | 'speed'

export interface ExamCriterion {
  rule: ExamRule
  passed: boolean
  /** Wat er gemeten is; de eenheid hangt van de eis af. */
  value: number
  /** Waar de grens lag. */
  limit: number
}

export interface ExamJudgement {
  criteria: ExamCriterion[]
  passed: boolean
  /** Cijfer van 0 tot 100; alle eisen wegen even zwaar. */
  score: number
}

/** De grenzen van het examen. Ruim genoeg om te halen, streng genoeg om iets te zeggen. */
export const EXAM_LIMITS = {
  /** Hoeveel minuten je aan het eind mag afwijken van de dienstregeling. */
  delayMinutes: 3,
  /** Hard remmen en hard optrekken bij elkaar opgeteld. */
  harsh: 2,
  /** Topsnelheid in km/u. Geen enkele stadslijn heeft dit nodig. */
  topSpeed: 80
} as const

/** Wat er van de examenrit gemeten is. */
export interface ExamMeasurement {
  /** Of de rit tot het eindpunt gereden is. */
  finished: boolean
  delayMinutes?: number
  harshBrakes?: number
  harshAccels?: number
  topSpeed?: number
}

/**
 * Beoordeelt de examenrit.
 *
 * Wat niet gemeten kon worden telt als gehaald: draaide de plugin niet, dan is
 * het niet aan de kandidaat om dat te bewijzen. Alleen de rit afmaken is
 * onvoorwaardelijk -- zonder eindpunt is er geen examen.
 */
export function judgeExam(measured: ExamMeasurement): ExamJudgement {
  const harsh = (measured.harshBrakes ?? 0) + (measured.harshAccels ?? 0)
  const delay = Math.abs(measured.delayMinutes ?? 0)
  const top = measured.topSpeed ?? 0

  const criteria: ExamCriterion[] = [
    { rule: 'finish', passed: measured.finished, value: measured.finished ? 1 : 0, limit: 1 },
    { rule: 'punctual', passed: delay <= EXAM_LIMITS.delayMinutes, value: delay, limit: EXAM_LIMITS.delayMinutes },
    { rule: 'smooth', passed: harsh <= EXAM_LIMITS.harsh, value: harsh, limit: EXAM_LIMITS.harsh },
    { rule: 'speed', passed: top <= EXAM_LIMITS.topSpeed, value: top, limit: EXAM_LIMITS.topSpeed }
  ]

  const met = criteria.filter((item) => item.passed).length
  return {
    criteria,
    // De rit afmaken is een harde eis; de rest bepaalt het cijfer.
    passed: measured.finished && met === criteria.length,
    score: Math.round((met / criteria.length) * 100)
  }
}
