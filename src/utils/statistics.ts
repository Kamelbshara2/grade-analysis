import type {
  StudentRecord, SubjectCode, SubjectStats, ProgressResult,
  Cycle, Semester, AnalysisFilter, Nationality, SubjectGrade
} from '@/types'
import { getPassMark, getCycle, SUBJECT_LABELS } from './subjectMapping'

// ===== FILTER =====
export function filterRecords(
  records: StudentRecord[],
  filter: AnalysisFilter
): StudentRecord[] {
  return records.filter(r => {
    if (filter.grade && r.grade !== filter.grade) return false
    if (filter.section && r.section !== filter.section) return false
    if (filter.track && r.track !== filter.track) return false
    if (filter.nationality && filter.nationality !== 'unknown' && r.student.nationality !== filter.nationality) return false
    return true
  })
}

// ===== EXTRACT SCORES =====
export function extractScores(
  records: StudentRecord[],
  subject: SubjectCode,
  semester: Semester | 'annual'
): number[] {
  const scores: number[] = []
  for (const r of records) {
    const g = r.grades[subject]
    if (!g) continue
    let score: number | null = null
    if (semester === 1) score = g.s1
    else if (semester === 2) score = g.s2
    else if (semester === 3) score = g.s3
    else score = g.annual
    if (score !== null) scores.push(score)
  }
  return scores
}

// ===== BASIC STATS =====
export function computeStats(scores: number[], cycle: Cycle): Omit<SubjectStats, 'subjectCode'> {
  const n = scores.length
  if (n === 0) {
    return {
      count: 0, passCount: 0, failCount: 0, above90Count: 0,
      passRate: 0, failRate: 0, above90Rate: 0,
      mean: 0, median: 0, stdDev: 0, variance: 0,
      q1: 0, q3: 0, iqr: 0, min: 0, max: 0,
      band_low: 0, band_low_mid: 0, band_mid: 0, band_high: 0, band_top: 0,
    }
  }

  const passMark = getPassMark(cycle)
  const sorted = [...scores].sort((a, b) => a - b)

  const mean = scores.reduce((s, x) => s + x, 0) / n
  const variance = scores.reduce((s, x) => s + (x - mean) ** 2, 0) / n
  const stdDev = Math.sqrt(variance)

  const median = percentile(sorted, 50)
  const q1 = percentile(sorted, 25)
  const q3 = percentile(sorted, 75)

  const passCount = scores.filter(s => s >= passMark).length
  const failCount = n - passCount
  const above90Count = scores.filter(s => s >= 90).length

  const lowMidMin = passMark // 50 or 60

  return {
    count: n,
    passCount,
    failCount,
    above90Count,
    passRate: (passCount / n) * 100,
    failRate: (failCount / n) * 100,
    above90Rate: (above90Count / n) * 100,
    mean,
    median,
    stdDev,
    variance,
    q1,
    q3,
    iqr: q3 - q1,
    min: sorted[0],
    max: sorted[n - 1],
    band_low: (scores.filter(s => s < passMark).length / n) * 100,
    band_low_mid: (scores.filter(s => s >= lowMidMin && s < 70).length / n) * 100,
    band_mid: (scores.filter(s => s >= 70 && s < 80).length / n) * 100,
    band_high: (scores.filter(s => s >= 80 && s < 90).length / n) * 100,
    band_top: (scores.filter(s => s >= 90).length / n) * 100,
  }
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0
  const idx = (p / 100) * (sorted.length - 1)
  const lo = Math.floor(idx)
  const hi = Math.ceil(idx)
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo)
}

export function computeSubjectStats(
  records: StudentRecord[],
  subject: SubjectCode,
  semester: Semester | 'annual',
  cycle: Cycle
): SubjectStats {
  const scores = extractScores(records, subject, semester)
  return { subjectCode: subject, ...computeStats(scores, cycle) }
}

// ===== PROGRESS CALCULATION =====
export function computeProgress(
  currentRecords: StudentRecord[],
  previousRecords: StudentRecord[],
  diagnosticScores: Array<{ studentId: string; subjectCode: SubjectCode; score: number }>,
  subject: SubjectCode,
  semester: Semester | 'annual',
  baselineMode: 'previous' | 'diagnostic'
): ProgressResult[] {
  const prevMap = new Map<string, StudentRecord>()
  for (const r of previousRecords) prevMap.set(r.student.id, r)

  const diagMap = new Map<string, number>()
  for (const d of diagnosticScores) {
    if (d.subjectCode === subject) diagMap.set(d.studentId, d.score)
  }

  return currentRecords.map(r => {
    const g = r.grades[subject]
    let currentScore: number | null = null
    if (g) {
      if (semester === 1) currentScore = g.s1
      else if (semester === 2) currentScore = g.s2
      else if (semester === 3) currentScore = g.s3
      else currentScore = g.annual
    }

    // Get baseline
    let baselineScore: number | null = null
    let baselineType: ProgressResult['baselineType'] = 'none'

    const prevRecord = prevMap.get(r.student.id)
    const diagScore = diagMap.get(r.student.id)

    if (baselineMode === 'previous' && prevRecord) {
      const pg = prevRecord.grades[subject]
      if (pg) {
        baselineScore = pg.annual
        baselineType = 'previous'
      }
    }

    if (baselineScore === null && diagScore !== undefined) {
      baselineScore = diagScore
      baselineType = 'diagnostic'
    }

    if (baselineScore === null || currentScore === null) {
      return {
        studentId: r.student.id,
        studentName: r.student.name,
        baselineScore,
        baselineType: 'none',
        currentScore,
        diff: null,
        category: 'no_baseline' as const,
      }
    }

    const diff = currentScore - baselineScore
    const category = classifyProgress(baselineScore, currentScore, diff)

    return {
      studentId: r.student.id,
      studentName: r.student.name,
      baselineScore,
      baselineType,
      currentScore,
      diff,
      category,
    }
  })
}

function classifyProgress(
  _baseline: number,
  _current: number,
  diff: number
): ProgressResult['category'] {
  if (diff > 4) return 'significant_progress'
  if (diff >= 0) return 'stable'
  return 'regression'
}

// ===== PROGRESS COMPARISON BETWEEN SEMESTERS =====
// Compare S3 vs weighted(S1+S2)
export function computeWeightedS1S2(
  records: StudentRecord[],
  subject: SubjectCode
): Map<string, number> {
  const result = new Map<string, number>()
  for (const r of records) {
    const g = r.grades[subject]
    if (!g || g.s1 === null || g.s2 === null) continue
    // Weighted average: s1 has weight 35, s2 has weight 30
    const weighted = (g.s1 * 35 + g.s2 * 30) / 65
    result.set(r.student.id, weighted)
  }
  return result
}

// ===== SEMESTER PROGRESS =====
export interface SemesterProgress {
  studentId: string;
  studentName: string;
  s1: number | null;
  s2: number | null;
  s3: number | null;
  annual: number | null;
  baselineScore: number | null;
  baselineType: string;
  // Progress categories
  baseToS1: ProgressResult['category'] | null;
  s1ToS2: ProgressResult['category'] | null;
  s12ToS3: ProgressResult['category'] | null;
}

export function computeSemesterProgress(
  records: StudentRecord[],
  previousRecords: StudentRecord[],
  diagnosticScores: Array<{ studentId: string; subjectCode: SubjectCode; score: number }>,
  subject: SubjectCode,
  baselineMode: 'previous' | 'diagnostic'
): SemesterProgress[] {
  const prevMap = new Map<string, StudentRecord>()
  for (const r of previousRecords) prevMap.set(r.student.id, r)

  const diagMap = new Map<string, number>()
  for (const d of diagnosticScores) {
    if (d.subjectCode === subject) diagMap.set(d.studentId, d.score)
  }

  return records.map(r => {
    const g = r.grades[subject]
    const s1 = g?.s1 ?? null
    const s2 = g?.s2 ?? null
    const s3 = g?.s3 ?? null
    const annual = g?.annual ?? null

    let baselineScore: number | null = null
    let baselineType = 'none'
    const prevRecord = prevMap.get(r.student.id)
    const diagScore = diagMap.get(r.student.id) ?? null

    if (baselineMode === 'previous' && prevRecord?.grades[subject]?.annual !== undefined) {
      baselineScore = prevRecord.grades[subject]!.annual
      if (baselineScore !== null) baselineType = 'previous'
    }
    if (baselineScore === null && diagScore !== null) {
      baselineScore = diagScore
      baselineType = 'diagnostic'
    }

    const baseToS1 = baselineScore !== null && s1 !== null
      ? classifyProgress(baselineScore, s1, s1 - baselineScore)
      : null

    const s1ToS2 = s1 !== null && s2 !== null
      ? classifyProgress(s1, s2, s2 - s1)
      : null

    let s12ToS3: ProgressResult['category'] | null = null
    if (s1 !== null && s2 !== null && s3 !== null) {
      const w = (s1 * 35 + s2 * 30) / 65
      s12ToS3 = classifyProgress(w, s3, s3 - w)
    }

    return {
      studentId: r.student.id,
      studentName: r.student.name,
      s1, s2, s3, annual,
      baselineScore,
      baselineType,
      baseToS1,
      s1ToS2,
      s12ToS3,
    }
  })
}

// ===== MULTI-YEAR TRAJECTORY =====
export interface MultiYearRow {
  studentId: string
  studentName: string
  currentGrade: number | null   // grade in the latest year
  currentSection: string | null // section in the latest year
  scores: (number | null)[]     // one entry per year, in year order
  diffs: (number | null)[]      // diff[i] = scores[i+1] - scores[i]
  categories: (ProgressResult['category'] | null)[]
  overallDiff: number | null    // last year - first year with data
  overallCategory: ProgressResult['category'] | null
}

export function computeMultiYearProgress(
  allYearRecords: { yearId: string; records: StudentRecord[] }[],
  subject: SubjectCode,
  semester: Semester | 'annual',
  // When provided, only track students present in this set (filtered by current-year grade)
  anchorStudentIds?: Set<string>
): MultiYearRow[] {
  // Build map: studentId -> { name, grade/section from latest year, scores by year index }
  const studentMap = new Map<string, { name: string; currentGrade: number | null; currentSection: string | null; scores: (number | null)[] }>()

  for (let yi = 0; yi < allYearRecords.length; yi++) {
    for (const r of allYearRecords[yi].records) {
      if (anchorStudentIds && !anchorStudentIds.has(r.student.id)) continue
      const isLatestYear = yi === allYearRecords.length - 1
      if (!studentMap.has(r.student.id)) {
        studentMap.set(r.student.id, {
          name: r.student.name,
          currentGrade: isLatestYear ? r.grade : null,
          currentSection: isLatestYear ? r.section : null,
          scores: new Array(allYearRecords.length).fill(null),
        })
      } else if (isLatestYear) {
        const entry = studentMap.get(r.student.id)!
        entry.currentGrade = r.grade
        entry.currentSection = r.section
      }
      const entry = studentMap.get(r.student.id)!
      const g = r.grades[subject]
      if (!g) continue
      let score: number | null = null
      if (semester === 1) score = g.s1
      else if (semester === 2) score = g.s2
      else if (semester === 3) score = g.s3
      else score = g.annual
      entry.scores[yi] = score
    }
  }

  const rows: MultiYearRow[] = []
  for (const [studentId, { name, currentGrade, currentSection, scores }] of studentMap) {
    const diffs: (number | null)[] = []
    const categories: (ProgressResult['category'] | null)[] = []

    for (let i = 0; i < scores.length - 1; i++) {
      const a = scores[i]
      const b = scores[i + 1]
      if (a !== null && b !== null) {
        const d = b - a
        diffs.push(d)
        categories.push(classifyProgress(a, b, d))
      } else {
        diffs.push(null)
        categories.push(null)
      }
    }

    // Overall: first non-null vs last non-null
    const firstIdx = scores.findIndex(s => s !== null)
    let lastIdx = -1
    for (let i = scores.length - 1; i >= 0; i--) { if (scores[i] !== null) { lastIdx = i; break } }

    let overallDiff: number | null = null
    let overallCategory: ProgressResult['category'] | null = null
    if (firstIdx !== -1 && lastIdx !== -1 && firstIdx !== lastIdx) {
      overallDiff = scores[lastIdx]! - scores[firstIdx]!
      overallCategory = classifyProgress(scores[firstIdx]!, scores[lastIdx]!, overallDiff)
    }

    rows.push({ studentId, studentName: name, currentGrade, currentSection, scores, diffs, categories, overallDiff, overallCategory })
  }

  return rows.sort((a, b) => a.studentName.localeCompare(b.studentName))
}

// ===== GAP ANALYSIS =====
export interface GapResult {
  outcomeId: string;
  outcomeCode: string;
  descriptionAr: string;
  descriptionEn: string;
  masteryRate: number;   // % of students who mastered (>=70% of max)
  priority: 'critical' | 'high' | 'medium' | 'low';
}

export function computeGapAnalysis(
  outcomeScores: Array<{
    studentId: string;
    outcomeId: string;
    outcomeCode: string;
    descriptionAr: string;
    descriptionEn: string;
    score: number;
    maxScore: number;
  }>
): GapResult[] {
  const outcomeMap = new Map<string, {
    code: string; descAr: string; descEn: string;
    scores: number[]; masteryCount: number;
  }>()

  for (const os of outcomeScores) {
    if (!outcomeMap.has(os.outcomeId)) {
      outcomeMap.set(os.outcomeId, {
        code: os.outcomeCode,
        descAr: os.descriptionAr,
        descEn: os.descriptionEn,
        scores: [],
        masteryCount: 0,
      })
    }
    const entry = outcomeMap.get(os.outcomeId)!
    const pct = (os.score / os.maxScore) * 100
    entry.scores.push(pct)
    if (pct >= 70) entry.masteryCount++
  }

  const results: GapResult[] = []
  for (const [id, data] of outcomeMap) {
    const masteryRate = data.scores.length > 0
      ? (data.masteryCount / data.scores.length) * 100
      : 0

    const priority: GapResult['priority'] =
      masteryRate < 40 ? 'critical' :
      masteryRate < 60 ? 'high' :
      masteryRate < 75 ? 'medium' : 'low'

    results.push({
      outcomeId: id,
      outcomeCode: data.code,
      descriptionAr: data.descAr,
      descriptionEn: data.descEn,
      masteryRate,
      priority,
    })
  }

  // Sort by mastery rate ascending (worst first), then add intelligent variation
  results.sort((a, b) => a.masteryRate - b.masteryRate)

  // Intelligent prioritization: within same priority level, vary order slightly
  // to avoid always showing the same gaps. Use a stable but varied ordering.
  return intelligentGapOrder(results)
}

function intelligentGapOrder(gaps: GapResult[]): GapResult[] {
  // Group by priority
  const groups: Record<string, GapResult[]> = {
    critical: [], high: [], medium: [], low: []
  }
  for (const g of gaps) groups[g.priority].push(g)

  // Within each group, sort by mastery rate (worst first) but apply
  // a deterministic jitter based on outcome code hash to vary presentation
  const jitteredSort = (arr: GapResult[]) => {
    return arr.sort((a, b) => {
      const diff = a.masteryRate - b.masteryRate
      if (Math.abs(diff) > 5) return diff
      // Near-equal mastery: use code hash for stable variation
      return hashCode(a.outcomeCode) - hashCode(b.outcomeCode)
    })
  }

  return [
    ...jitteredSort(groups.critical),
    ...jitteredSort(groups.high),
    ...jitteredSort(groups.medium),
    ...jitteredSort(groups.low),
  ]
}

function hashCode(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i++) {
    h = (Math.imul(31, h) + s.charCodeAt(i)) | 0
  }
  return h
}

// ===== ROUND =====
export function round2(n: number): number {
  return Math.round(n * 100) / 100
}

// ===== LETTER GRADE =====
export function getLetterGrade(score: number, cycle: Cycle): string {
  if (score >= 90) return 'A'
  if (score >= 80) return 'B'
  if (score >= 70) return 'C'
  if (score >= 60) return 'D'
  if (cycle === 3) return score >= 50 ? 'E' : 'F'
  return score >= 50 ? 'E' : 'F'
}

export function getGradeLabel(score: number, cycle: Cycle, lang: 'ar' | 'en'): string {
  if (score >= 90) return lang === 'ar' ? 'متميز' : 'Outstanding'
  if (score >= 80) return lang === 'ar' ? 'جيد جداً' : 'Very Good'
  if (score >= 70) return lang === 'ar' ? 'جيد' : 'Good'
  if (score >= 60) return lang === 'ar' ? 'مقبول' : 'Acceptable'
  if (score >= 50) return lang === 'ar' ? (cycle === 3 ? 'راسب' : 'حد أدنى') : (cycle === 3 ? 'Fail' : 'Minimum')
  return lang === 'ar' ? 'راسب' : 'Fail'
}

// ===== PROPORTION LABEL =====
// Returns descriptive label for a percentage (e.g. 85 → 'معظم')
export function getProportionLabel(pct: number, lang: 'ar' | 'en'): string {
  if (pct >= 100) return lang === 'ar' ? 'جميعهم' : 'All'
  if (pct >= 90) return lang === 'ar' ? 'الجميع تقريباً' : 'Almost all'
  if (pct > 75) return lang === 'ar' ? 'معظم' : 'Most'
  if (pct > 50) return lang === 'ar' ? 'الأغلبية' : 'Majority'
  if (pct >= 15) return lang === 'ar' ? 'الأقلية' : 'Minority'
  return lang === 'ar' ? 'قلة' : 'Few'
}

// ===== ACADEMIC ACHIEVEMENT INDICATOR (المؤشر 1.1) =====
// Threshold: % of students scoring ≥75 determines achievement level
// ≥70% → 'excellent', ≥60% → 'very_good', ≥50% → 'good', else → 'below'
export interface AchievementIndicator {
  subjectCode: SubjectCode
  totalStudents: number
  cycle: Cycle
  mean: number
  letterGrade: string
  // Band counts & rates (0-100)
  above50Count: number; above50Rate: number
  above60Count: number; above60Rate: number
  above70Count: number; above70Rate: number
  above75Count: number; above75Rate: number
  // المؤشر 1.1 — based on above75Rate
  level: 'excellent' | 'very_good' | 'good' | 'below'
  levelAr: string
  levelEn: string
  proportionAr: string
  proportionEn: string
  // legacy alias kept for Reports.tsx
  passCount: number
  passRate: number
}

export function computeAchievementIndicators(
  records: StudentRecord[],
  semester: Semester | 'annual',
): AchievementIndicator[] {
  const subjectCodes = [...new Set(
    records.flatMap(r => Object.keys(r.grades) as SubjectCode[])
  )]

  return subjectCodes.map(subjectCode => {
    const cycle: Cycle = records.find(r => r.grades[subjectCode])?.cycle ?? 3
    const scores = extractScores(records, subjectCode, semester)
    const totalStudents = scores.length
    if (totalStudents === 0) return null

    const passMark = getPassMark(cycle)
    const above50Count = scores.filter(s => s >= 50).length
    const above60Count = scores.filter(s => s >= 60).length
    const above70Count = scores.filter(s => s >= 70).length
    const above75Count = scores.filter(s => s >= 75).length
    const above50Rate = round2((above50Count / totalStudents) * 100)
    const above60Rate = round2((above60Count / totalStudents) * 100)
    const above70Rate = round2((above70Count / totalStudents) * 100)
    const above75Rate = round2((above75Count / totalStudents) * 100)
    const passCount = scores.filter(s => s >= passMark).length
    const passRate = round2((passCount / totalStudents) * 100)
    const mean = round2(scores.reduce((a, b) => a + b, 0) / totalStudents)

    let level: AchievementIndicator['level']
    let levelAr: string
    let levelEn: string
    if (above75Rate >= 70) { level = 'excellent'; levelAr = 'ممتاز'; levelEn = 'Excellent' }
    else if (above75Rate >= 60) { level = 'very_good'; levelAr = 'جيد جداً'; levelEn = 'Very Good' }
    else if (above75Rate >= 50) { level = 'good'; levelAr = 'جيد'; levelEn = 'Good' }
    else { level = 'below'; levelAr = 'دون المقبول'; levelEn = 'Below Standard' }

    return {
      subjectCode,
      totalStudents,
      cycle,
      mean,
      letterGrade: getLetterGrade(mean, cycle),
      above50Count, above50Rate,
      above60Count, above60Rate,
      above70Count, above70Rate,
      above75Count, above75Rate,
      level,
      levelAr,
      levelEn,
      proportionAr: getProportionLabel(above75Rate, 'ar'),
      proportionEn: getProportionLabel(above75Rate, 'en'),
      passCount,
      passRate,
    } as AchievementIndicator
  }).filter(Boolean) as AchievementIndicator[]
}

// ===== SEMESTER GAP ANALYSIS =====
export interface SemesterGap {
  subjectCode: SubjectCode
  subjectNameAr: string
  subjectNameEn: string
  avgS1: number | null
  avgS2: number | null
  avgS3: number | null
  avgAnnual: number | null
  gapS1S3: number | null   // s3 - s1 (positive = improvement)
  gapS1S2: number | null
  gapS2S3: number | null
  studentsWithDrop: number  // count of students where s3 < s1
  studentsWithGain: number
  totalStudents: number
  priority: 'critical' | 'high' | 'medium' | 'low' | 'ok'
}

export function computeSemesterGaps(
  records: StudentRecord[]
): SemesterGap[] {
  const subjectCodes = [...new Set(
    records.flatMap(r => Object.keys(r.grades) as SubjectCode[])
  )]

  return subjectCodes.map(subjectCode => {
    const subjectGrades = records
      .map(r => r.grades[subjectCode])
      .filter(Boolean) as SubjectGrade[]

    const s1s = subjectGrades.map(g => g.s1).filter(v => v !== null) as number[]
    const s2s = subjectGrades.map(g => g.s2).filter(v => v !== null) as number[]
    const s3s = subjectGrades.map(g => g.s3).filter(v => v !== null) as number[]
    const annuals = subjectGrades.map(g => g.annual).filter(v => v !== null) as number[]

    const avg = (arr: number[]) => arr.length > 0 ? round2(arr.reduce((a, b) => a + b, 0) / arr.length) : null

    const avgS1 = avg(s1s)
    const avgS2 = avg(s2s)
    const avgS3 = avg(s3s)
    const avgAnnual = avg(annuals)

    const gapS1S3 = (avgS1 !== null && avgS3 !== null) ? round2(avgS3 - avgS1) : null
    const gapS1S2 = (avgS1 !== null && avgS2 !== null) ? round2(avgS2 - avgS1) : null
    const gapS2S3 = (avgS2 !== null && avgS3 !== null) ? round2(avgS3 - avgS2) : null

    // Per-student drop/gain analysis (s3 vs s1)
    const pairedStudents = records.filter(r => {
      const g = r.grades[subjectCode]
      return g && g.s1 !== null && g.s3 !== null
    })
    const studentsWithDrop = pairedStudents.filter(r => {
      const g = r.grades[subjectCode]!
      return g.s3! < g.s1!
    }).length
    const studentsWithGain = pairedStudents.filter(r => {
      const g = r.grades[subjectCode]!
      return g.s3! > g.s1!
    }).length

    // Priority based on average gap (s1 to s3)
    let priority: SemesterGap['priority'] = 'ok'
    if (gapS1S3 !== null) {
      if (gapS1S3 < -15) priority = 'critical'
      else if (gapS1S3 < -8) priority = 'high'
      else if (gapS1S3 < -3) priority = 'medium'
      else if (gapS1S3 < 0) priority = 'low'
      else priority = 'ok'
    }

    const labels = SUBJECT_LABELS[subjectCode] ?? { ar: subjectCode, en: subjectCode }

    return {
      subjectCode,
      subjectNameAr: labels.ar,
      subjectNameEn: labels.en,
      avgS1,
      avgS2,
      avgS3,
      avgAnnual,
      gapS1S3,
      gapS1S2,
      gapS2S3,
      studentsWithDrop,
      studentsWithGain,
      totalStudents: pairedStudents.length,
      priority,
    }
  }).sort((a, b) => (a.gapS1S3 ?? 0) - (b.gapS1S3 ?? 0))
}
