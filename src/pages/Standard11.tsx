import { useState, useMemo } from 'react'
import {
  ComposedChart, BarChart, Bar, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer, Cell, ReferenceLine,
} from 'recharts'
import { dataStore } from '@/store/dataStore'
import { computeAchievementIndicators, computeGradeStats, round2 } from '@/utils/statistics'
import { ANALYSIS_SUBJECTS, SUBJECT_LABELS } from '@/utils/subjectMapping'
import type { Language, SubjectCode, Cycle, Nationality } from '@/types'
import { getCycle, getPassMark } from '@/utils/subjectMapping'

interface Props { lang: Language }

type Section = 'school' | 'subject' | 'grade'
type SemFilter = 'annual' | 1 | 2 | 3

// ── Level helpers ────────────────────────────────────────────────────────────
const LEVEL_COLORS: Record<string, string> = {
  excellent:  'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300',
  very_good:  'bg-blue-100   text-blue-800   dark:bg-blue-900/30   dark:text-blue-300',
  good:       'bg-sky-100    text-sky-800    dark:bg-sky-900/30    dark:text-sky-300',
  acceptable: 'bg-amber-100  text-amber-800  dark:bg-amber-900/30  dark:text-amber-300',
  weak:       'bg-red-100    text-red-800    dark:bg-red-900/30    dark:text-red-300',
}
const LEVEL_AR: Record<string, string> = {
  excellent: 'ممتاز', very_good: 'جيد جداً', good: 'جيد', acceptable: 'مقبول', weak: 'ضعيف',
}
const LEVEL_EN: Record<string, string> = {
  excellent: 'Excellent', very_good: 'Very Good', good: 'Good', acceptable: 'Acceptable', weak: 'Weak',
}

function LevelBadge({ level, lang }: { level: string; lang: Language }) {
  const cls = LEVEL_COLORS[level] ?? 'bg-gray-100 text-gray-600'
  const label = lang === 'ar' ? (LEVEL_AR[level] ?? level) : (LEVEL_EN[level] ?? level)
  return <span className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-bold ${cls}`}>{label}</span>
}

function deriveLevel(passRate: number, above75Rate: number): string {
  if (passRate < 75) return 'weak'
  if (above75Rate >= 70) return 'excellent'
  if (above75Rate >= 60) return 'very_good'
  if (above75Rate >= 50) return 'good'
  return 'acceptable'
}

// ── Statistical helpers ──────────────────────────────────────────────────────
function pctile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0
  const idx = (p / 100) * (sorted.length - 1)
  const lo = Math.floor(idx), hi = Math.ceil(idx)
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo)
}

interface Stats {
  n: number; mean: number; median: number; stdDev: number; variance: number
  q1: number; q3: number; iqr: number; skewness: number; kurtosis: number
  min: number; max: number; passRate: number; above75Rate: number; above90Rate: number
}

function calcStats(scores: number[], passMark = 60): Stats {
  const n = scores.length
  if (n === 0) return {
    n: 0, mean: 0, median: 0, stdDev: 0, variance: 0,
    q1: 0, q3: 0, iqr: 0, skewness: 0, kurtosis: 0,
    min: 0, max: 0, passRate: 0, above75Rate: 0, above90Rate: 0,
  }
  const sorted = [...scores].sort((a, b) => a - b)
  const mean = scores.reduce((s, v) => s + v, 0) / n
  const variance = scores.reduce((s, v) => s + (v - mean) ** 2, 0) / n
  const stdDev = Math.sqrt(variance)
  const median = pctile(sorted, 50)
  const q1 = pctile(sorted, 25)
  const q3 = pctile(sorted, 75)
  const iqr = q3 - q1
  let skewness = 0, kurtosis = 0
  if (stdDev > 0) {
    skewness = scores.reduce((s, v) => s + ((v - mean) / stdDev) ** 3, 0) / n
    kurtosis = scores.reduce((s, v) => s + ((v - mean) / stdDev) ** 4, 0) / n - 3
  }
  const passRate = round2((scores.filter(v => v >= passMark).length / n) * 100)
  const above75Rate = round2((scores.filter(v => v >= 75).length / n) * 100)
  const above90Rate = round2((scores.filter(v => v >= 90).length / n) * 100)
  return {
    n, mean: round2(mean), median: round2(median), stdDev: round2(stdDev),
    variance: round2(variance), q1: round2(q1), q3: round2(q3), iqr: round2(iqr),
    skewness: round2(skewness), kurtosis: round2(kurtosis),
    min: sorted[0], max: sorted[n - 1], passRate, above75Rate, above90Rate,
  }
}

const BIN_COLORS = [
  '#dc2626','#ef4444','#f97316','#fb923c','#fbbf24',
  '#facc15','#84cc16','#22c55e','#3b82f6','#8b5cf6',
]

interface HistBin { label: string; count: number; color: string }

function histBins(scores: number[]): HistBin[] {
  const bins: HistBin[] = Array.from({ length: 10 }, (_, i) => ({
    label: i === 9 ? '90-100' : `${i * 10}-${i * 10 + 9}`,
    count: 0,
    color: BIN_COLORS[i],
  }))
  for (const s of scores) {
    const idx = Math.min(Math.floor(s / 10), 9)
    bins[idx].count++
  }
  return bins
}

interface CurvePoint { x: number; y: number }

function normalCurve(mean: number, stdDev: number, n: number, binWidth = 10): CurvePoint[] {
  if (stdDev === 0) return []
  const points: CurvePoint[] = []
  for (let x = 0; x <= 100; x += 2) {
    const y = (1 / (stdDev * Math.sqrt(2 * Math.PI))) * Math.exp(-0.5 * ((x - mean) / stdDev) ** 2) * n * binWidth
    points.push({ x, y })
  }
  return points
}

// ── Stats grid ──────────────────────────────────────────────────────────────
function StatsGrid({ stats, passMark, lang }: { stats: Stats; passMark: number; lang: Language }) {
  const ar = lang === 'ar'
  const skewLabel = stats.skewness < -0.5
    ? (ar ? 'التواء سالب' : 'Left Skewed')
    : stats.skewness > 0.5 ? (ar ? 'التواء موجب' : 'Right Skewed') : (ar ? 'متماثل' : 'Symmetric')
  const kurtLabel = stats.kurtosis < -1
    ? (ar ? 'مفلطح' : 'Platykurtic')
    : stats.kurtosis > 1 ? (ar ? 'حاد القمة' : 'Leptokurtic') : (ar ? 'طبيعي' : 'Mesokurtic')

  const items = [
    { key: 'n',  label: ar ? 'عدد الطلاب (n)' : 'Count (n)',       val: stats.n.toString() },
    { key: 'μ',  label: ar ? 'المتوسط (μ)' : 'Mean (μ)',           val: stats.mean.toFixed(2) },
    { key: 'Md', label: ar ? 'الوسيط (Md)' : 'Median (Md)',        val: stats.median.toFixed(2) },
    { key: 'σ',  label: ar ? 'الانحراف المعياري (σ)' : 'Std Dev (σ)', val: stats.stdDev.toFixed(2) },
    { key: 'σ²', label: ar ? 'التباين (σ²)' : 'Variance (σ²)',    val: stats.variance.toFixed(2) },
    { key: 'Q1', label: ar ? 'الربيعي الأول (Q1)' : 'Q1',          val: stats.q1.toFixed(2) },
    { key: 'Q3', label: ar ? 'الربيعي الثالث (Q3)' : 'Q3',         val: stats.q3.toFixed(2) },
    { key: 'IQR',label: ar ? 'المدى الربيعي (IQR)' : 'IQR',       val: stats.iqr.toFixed(2) },
    { key: 'min',label: ar ? 'الحد الأدنى' : 'Min',                val: stats.min.toFixed(1) },
    { key: 'max',label: ar ? 'الحد الأقصى' : 'Max',                val: stats.max.toFixed(1) },
    { key: 'γ₁', label: ar ? 'الالتواء (γ₁)' : 'Skewness (γ₁)',   val: `${stats.skewness.toFixed(3)} — ${skewLabel}` },
    { key: 'γ₂', label: ar ? 'التفرطح (γ₂)' : 'Kurtosis (γ₂)',    val: `${stats.kurtosis.toFixed(3)} — ${kurtLabel}` },
    { key: 'pass',label: ar ? 'نسبة النجاح' : 'Pass Rate',         val: `${stats.passRate.toFixed(1)}%` },
    { key: '>75', label: ar ? 'نسبة فوق 75%' : 'Above 75%',       val: `${stats.above75Rate.toFixed(1)}%` },
    { key: '>90', label: ar ? 'نسبة فوق 90%' : 'Above 90%',       val: `${stats.above90Rate.toFixed(1)}%` },
  ]

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
      {items.map(({ key, label, val }) => (
        <div key={key} className="bg-gray-50 dark:bg-gray-800 rounded-xl p-3 flex flex-col gap-0.5">
          <span className="text-[10px] text-gray-400 uppercase tracking-wide leading-none">{label}</span>
          <span className="text-sm font-bold text-gray-800 dark:text-gray-100 mt-1">{val}</span>
        </div>
      ))}
    </div>
  )
}

// ── Histogram with normal curve overlay ─────────────────────────────────────
function HistogramChart({ scores, passMark, lang }: { scores: number[]; passMark: number; lang: Language }) {
  const ar = lang === 'ar'
  const bins = histBins(scores)
  const stats = calcStats(scores, passMark)
  const curve = normalCurve(stats.mean, stats.stdDev, stats.n)

  // Merge bins + curve into one dataset for ComposedChart
  const data = bins.map((b, i) => ({
    bin: b.label,
    [ar ? 'عدد الطلاب' : 'Count']: b.count,
    color: b.color,
  }))

  // Curve points mapped to bin labels via index proximity
  const curveData = Array.from({ length: 10 }, (_, i) => {
    const binMid = i * 10 + 5
    const y = stats.stdDev > 0
      ? (1 / (stats.stdDev * Math.sqrt(2 * Math.PI))) * Math.exp(-0.5 * ((binMid - stats.mean) / stats.stdDev) ** 2) * stats.n * 10
      : 0
    return { bin: bins[i].label, [ar ? 'عدد الطلاب' : 'Count']: bins[i].count, curve: round2(y), color: bins[i].color }
  })

  if (scores.length === 0) return (
    <div className="flex items-center justify-center h-40 text-gray-400 text-sm">
      {ar ? 'لا توجد بيانات' : 'No data'}
    </div>
  )

  return (
    <ResponsiveContainer width="100%" height={240}>
      <ComposedChart data={curveData} margin={{ top: 10, right: 20, left: 0, bottom: 40 }}>
        <CartesianGrid strokeDasharray="3 3" opacity={0.25} />
        <XAxis dataKey="bin" tick={{ fontSize: 10 }} angle={-35} textAnchor="end" interval={0} />
        <YAxis tick={{ fontSize: 11 }} />
        <Tooltip
          formatter={(value: number, name: string) =>
            name === (ar ? 'التوزيع الطبيعي' : 'Normal Dist.')
              ? [value.toFixed(1), name]
              : [value, name]
          }
        />
        <Bar dataKey={ar ? 'عدد الطلاب' : 'Count'} radius={[3, 3, 0, 0]} name={ar ? 'عدد الطلاب' : 'Count'}>
          {curveData.map((entry, idx) => (
            <Cell key={idx} fill={entry.color} />
          ))}
        </Bar>
        <Line
          type="monotone"
          dataKey="curve"
          stroke="#6366f1"
          strokeWidth={2.5}
          dot={false}
          name={ar ? 'التوزيع الطبيعي' : 'Normal Dist.'}
        />
      </ComposedChart>
    </ResponsiveContainer>
  )
}

// ── Main component ──────────────────────────────────────────────────────────
export default function Standard11({ lang }: Props) {
  const ar = lang === 'ar'
  const years = dataStore.getYears()
  const [yearId, setYearId] = useState(years[years.length - 1] ?? '')
  const [section, setSection] = useState<Section>('school')
  const [schoolSem, setSchoolSem] = useState<SemFilter>('annual')
  const [selectedSubj, setSelectedSubj] = useState<SubjectCode>('arabic')
  const [selectedGrade, setSelectedGrade] = useState<number>(0) // 0 = not yet set
  const [nationality, setNationality] = useState<Nationality | undefined>(undefined)

  const records = useMemo(() => {
    const all = dataStore.getRecordsByYear(yearId)
    return nationality ? all.filter(r => r.student.nationality === nationality) : all
  }, [yearId, nationality])

  // Auto-select first available grade
  const availableGrades = useMemo(() => {
    const gs = new Set(records.map(r => r.grade))
    return Array.from(gs).sort((a, b) => a - b)
  }, [records])

  const activeGrade = selectedGrade > 0 && availableGrades.includes(selectedGrade)
    ? selectedGrade
    : availableGrades[0] ?? 5

  const semLabel = (s: 1 | 2 | 3) => ar
    ? `الفصل ${s === 1 ? 'الأول' : s === 2 ? 'الثاني' : 'الثالث'}`
    : `Semester ${s}`

  // ── School: per-semester stats ────────────────────────────────────────────
  const schoolSemData = useMemo(() => {
    return ([1, 2, 3] as const).map(sem => {
      const items: { avg: number; passMark: number }[] = []
      for (const r of records) {
        const cycle: Cycle = getCycle(r.grade)
        const passMark = getPassMark(cycle)
        const scores: number[] = []
        for (const subj of ANALYSIS_SUBJECTS) {
          const g = r.grades[subj]
          if (!g) continue
          const score = sem === 1 ? g.s1 : sem === 2 ? g.s2 : g.s3
          if (score !== null) scores.push(score)
        }
        if (scores.length > 0)
          items.push({ avg: scores.reduce((a, b) => a + b, 0) / scores.length, passMark })
      }
      const count = items.length
      if (count === 0) return { sem, count: 0, passRate: 0, above75Rate: 0, level: 'weak', scores: [] as number[] }
      const passRate = round2((items.filter(i => i.avg >= i.passMark).length / count) * 100)
      const above75Rate = round2((items.filter(i => i.avg >= 75).length / count) * 100)
      return { sem, count, passRate, above75Rate, level: deriveLevel(passRate, above75Rate), scores: items.map(i => i.avg) }
    })
  }, [records])

  // ── School: annual stats ──────────────────────────────────────────────────
  const annualSchoolData = useMemo(() => {
    const valid = records.filter(r => r.annualAvg !== null)
    const count = valid.length
    if (count === 0) return { count: 0, passRate: 0, above75Rate: 0, level: 'weak', scores: [] as number[] }
    const passCount = valid.filter(r => r.annualAvg! >= getPassMark(getCycle(r.grade))).length
    const above75Count = valid.filter(r => r.annualAvg! >= 75).length
    const passRate = round2((passCount / count) * 100)
    const above75Rate = round2((above75Count / count) * 100)
    const scores = valid.map(r => r.annualAvg!)
    return { count, passRate, above75Rate, level: deriveLevel(passRate, above75Rate), scores }
  }, [records])

  // Scores for currently selected school semester
  const schoolAnalysisScores = useMemo(() => {
    if (schoolSem === 'annual') return annualSchoolData.scores
    return schoolSemData.find(s => s.sem === schoolSem)?.scores ?? []
  }, [schoolSem, annualSchoolData, schoolSemData])

  const schoolStats = useMemo(() => {
    const pm = records.length > 0 ? getPassMark(getCycle(records[0].grade)) : 60
    return calcStats(schoolAnalysisScores, pm)
  }, [schoolAnalysisScores, records])

  // ── Subject: annual stats (core subjects) ────────────────────────────────
  const subjectAnnualData = useMemo(() => {
    return ANALYSIS_SUBJECTS.map(subj => {
      const relevantRecords = records.filter(r => r.grades[subj] != null)
      if (relevantRecords.length === 0) return { subj, passRate: null, above75Rate: null, level: null, count: 0 }
      const indicators = computeAchievementIndicators(relevantRecords, 'annual')
      const ind = indicators.find(i => i.subjectCode === subj)
      if (!ind) return { subj, passRate: null, above75Rate: null, level: null, count: 0 }
      return { subj, passRate: ind.passRate, above75Rate: ind.above75Rate, level: ind.level, count: ind.totalStudents }
    })
  }, [records])

  // Chart data for top bar chart
  const chartData = useMemo(() => {
    return subjectAnnualData
      .filter(d => d.passRate !== null)
      .map(d => ({
        name: ar ? SUBJECT_LABELS[d.subj as SubjectCode].ar : SUBJECT_LABELS[d.subj as SubjectCode].en,
        [ar ? 'نسبة النجاح' : 'Pass Rate']: d.passRate ?? 0,
        [ar ? 'فوق 75%' : 'Above 75%']: d.above75Rate ?? 0,
      }))
  }, [subjectAnnualData, ar])

  // Scores for selected subject (annual, all semesters)
  const subjScores = useMemo(() => {
    const scores: { annual: number[]; s1: number[]; s2: number[]; s3: number[] } = {
      annual: [], s1: [], s2: [], s3: [],
    }
    for (const r of records) {
      const g = r.grades[selectedSubj]
      if (!g) continue
      if (g.annual !== null) scores.annual.push(g.annual)
      if (g.s1 !== null) scores.s1.push(g.s1)
      if (g.s2 !== null) scores.s2.push(g.s2)
      if (g.s3 !== null) scores.s3.push(g.s3)
    }
    return scores
  }, [records, selectedSubj])

  // Semester comparison data for selected subject
  const subjSemComparison = useMemo(() => {
    return [
      { label: semLabel(1), mean: calcStats(subjScores.s1).mean, passRate: calcStats(subjScores.s1).passRate },
      { label: semLabel(2), mean: calcStats(subjScores.s2).mean, passRate: calcStats(subjScores.s2).passRate },
      { label: semLabel(3), mean: calcStats(subjScores.s3).mean, passRate: calcStats(subjScores.s3).passRate },
    ]
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subjScores, ar])

  // Grade breakdown for selected subject
  const subjGradeBreakdown = useMemo(() => {
    const byGrade: Record<number, number[]> = {}
    for (const r of records) {
      const g = r.grades[selectedSubj]
      if (!g || g.annual === null) continue
      if (!byGrade[r.grade]) byGrade[r.grade] = []
      byGrade[r.grade].push(g.annual)
    }
    return Object.entries(byGrade)
      .sort(([a], [b]) => Number(a) - Number(b))
      .map(([grade, scores]) => ({
        grade: ar ? `الصف ${grade}` : `Grade ${grade}`,
        [ar ? 'متوسط' : 'Mean']: calcStats(scores).mean,
        [ar ? 'نجاح%' : 'Pass%']: calcStats(scores, getPassMark(getCycle(Number(grade)))).passRate,
      }))
  }, [records, selectedSubj, ar])

  // ── Grade: annual stats per grade ─────────────────────────────────────────
  const gradeAnnualData = useMemo(() => computeGradeStats(records, 'annual'), [records])

  // Scores for selected grade
  const gradeScores = useMemo(() => {
    return records
      .filter(r => r.grade === activeGrade && r.annualAvg !== null)
      .map(r => r.annualAvg!)
  }, [records, activeGrade])

  const gradeStats = useMemo(() => calcStats(gradeScores, getPassMark(getCycle(activeGrade))), [gradeScores, activeGrade])

  // ── Achievement Indicator 1.1 ─────────────────────────────────────────────
  const achievementRows = useMemo(() => {
    const indicators = computeAchievementIndicators(records, 'annual')
    return indicators.filter(ind => ANALYSIS_SUBJECTS.includes(ind.subjectCode))
  }, [records])

  const schoolAchievement = useMemo(() => {
    if (achievementRows.length === 0) return null
    const avg = (arr: number[]) => arr.length ? round2(arr.reduce((a, b) => a + b) / arr.length) : 0
    const avgPassRate = avg(achievementRows.map(r => r.passRate))
    const avgAbove75Rate = avg(achievementRows.map(r => r.above75Rate))
    const level = deriveLevel(avgPassRate, avgAbove75Rate)
    return { avgPassRate, avgAbove75Rate, level }
  }, [achievementRows])

  // Subject breakdown for selected grade
  const gradeSubjectBreakdown = useMemo(() => {
    const gradeRecs = records.filter(r => r.grade === activeGrade)
    return ANALYSIS_SUBJECTS.map(subj => {
      const scores = gradeRecs.map(r => r.grades[subj]?.annual).filter((v): v is number => v !== null && v !== undefined)
      if (scores.length === 0) return null
      const pm = getPassMark(getCycle(activeGrade))
      const s = calcStats(scores, pm)
      return {
        name: ar ? SUBJECT_LABELS[subj as SubjectCode].ar : SUBJECT_LABELS[subj as SubjectCode].en,
        [ar ? 'متوسط' : 'Mean']: s.mean,
        [ar ? 'نجاح%' : 'Pass%']: s.passRate,
      }
    }).filter(Boolean) as { name: string; [k: string]: string | number }[]
  }, [records, activeGrade, ar])

  const tabs: { key: Section; ar: string; en: string }[] = [
    { key: 'school',  ar: 'المدرسة', en: 'School' },
    { key: 'subject', ar: 'المواد',  en: 'Subjects' },
    { key: 'grade',   ar: 'الصفوف', en: 'Grades' },
  ]

  if (!yearId) return (
    <div className="p-8 text-center text-gray-500">{ar ? 'لا توجد بيانات' : 'No data available'}</div>
  )

  return (
    <div className="p-6 space-y-6" dir={ar ? 'rtl' : 'ltr'}>
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
            {ar ? 'معيار 1.1 — التحصيل الأكاديمي' : 'Standard 1.1 — Academic Achievement'}
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            {ar ? 'المواد الأساسية التسع — فصول دراسية ودرجة سنوية' : '9 core subjects — semesters & annual grade'}
          </p>
        </div>
        <div className="flex gap-2 flex-wrap items-center">
          <select
            value={yearId}
            onChange={e => setYearId(e.target.value)}
            className="border rounded-lg px-3 py-1.5 text-sm bg-white dark:bg-gray-800 dark:border-gray-600"
          >
            {years.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
          <select
            value={nationality ?? ''}
            onChange={e => setNationality((e.target.value || undefined) as Nationality | undefined)}
            className="border rounded-lg px-3 py-1.5 text-sm bg-white dark:bg-gray-800 dark:border-gray-600"
          >
            <option value="">{ar ? 'كل الجنسيات' : 'All Nationalities'}</option>
            <option value="citizen">{ar ? 'مواطن' : 'Citizen'}</option>
            <option value="expat">{ar ? 'وافد' : 'Expat'}</option>
          </select>
        </div>
      </div>

      {/* ── Achievement Indicator 1.1 ── */}
      {achievementRows.length > 0 && (
        <div className="space-y-4">
          <h2 className="font-semibold text-gray-700 dark:text-gray-300">
            {ar ? 'المؤشر 1.1 — التحصيل الأكاديمي (المواد الأساسية)' : 'Indicator 1.1 — Academic Achievement (Core Subjects)'}
          </h2>

          {/* School overall badge */}
          {schoolAchievement && (
            <div className="card p-4 flex items-center justify-between flex-wrap gap-3"
              style={{ borderRight: '4px solid #1D5E3F' }}>
              <div>
                <p className="text-sm font-bold text-gray-700 dark:text-gray-200">
                  {ar ? '🏫 المدرسة ككل — متوسط المواد الأساسية' : '🏫 School Overall — Core Subjects Average'}
                </p>
                <p className="text-xs text-gray-500 mt-0.5">
                  {ar
                    ? `نسبة النجاح: ${schoolAchievement.avgPassRate}% · فوق 75: ${schoolAchievement.avgAbove75Rate}%`
                    : `Pass rate: ${schoolAchievement.avgPassRate}% · Above 75: ${schoolAchievement.avgAbove75Rate}%`}
                </p>
              </div>
              <LevelBadge level={schoolAchievement.level} lang={lang} />
            </div>
          )}

          {/* Per-subject chart */}
          <div className="card p-4">
            <p className="text-xs font-semibold text-gray-500 mb-3">
              {ar ? 'نسبة النجاح ونسبة الطلاب فوق 75 لكل مادة' : 'Pass rate & % above 75 per subject'}
            </p>
            <ResponsiveContainer width="100%" height={240}>
              <BarChart
                data={achievementRows.map(r => ({
                  name: ar ? SUBJECT_LABELS[r.subjectCode]?.ar ?? r.subjectCode : SUBJECT_LABELS[r.subjectCode]?.en ?? r.subjectCode,
                  [ar ? 'نسبة النجاح' : 'Pass Rate']: r.passRate,
                  [ar ? 'فوق 75' : 'Above 75']: r.above75Rate,
                }))}
                margin={{ top: 5, right: 20, left: 0, bottom: 50 }}
              >
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="name" angle={-30} textAnchor="end" tick={{ fontSize: 10 }} interval={0} />
                <YAxis domain={[0, 100]} tick={{ fontSize: 10 }} tickFormatter={v => `${v}%`} />
                <Tooltip formatter={(v: number) => `${v}%`} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <ReferenceLine y={75} stroke="#d97706" strokeDasharray="4 4" label={{ value: '75%', position: 'right', fontSize: 9 }} />
                <Bar dataKey={ar ? 'نسبة النجاح' : 'Pass Rate'} fill="#3b82f6" radius={[2, 2, 0, 0]} />
                <Bar dataKey={ar ? 'فوق 75' : 'Above 75'} fill="#16a34a" radius={[2, 2, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Per-subject table */}
          <div className="card overflow-x-auto">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr style={{ background: '#1D5E3F15' }}>
                  <th className="border px-3 py-2 text-start font-bold" style={{ color: '#1D5E3F' }}>
                    {ar ? 'المادة' : 'Subject'}
                  </th>
                  <th className="border px-2 py-2 text-center">{ar ? 'عدد الطلاب' : 'Students'}</th>
                  <th className="border px-2 py-2 text-center">{ar ? 'متوسط' : 'Mean'}</th>
                  <th className="border px-2 py-2 text-center">{ar ? 'نسبة النجاح' : 'Pass Rate'}</th>
                  <th className="border px-2 py-2 text-center">{ar ? 'فوق 75' : 'Above 75'}</th>
                  <th className="border px-2 py-2 text-center font-bold">{ar ? 'التصنيف' : 'Level'}</th>
                </tr>
              </thead>
              <tbody>
                {achievementRows.map((r, i) => (
                  <tr key={i} style={{ background: i % 2 === 0 ? 'white' : '#f9fafb' }}>
                    <td className="border px-3 py-2 font-semibold text-gray-800 dark:text-gray-100"
                      style={{ background: i % 2 === 0 ? 'white' : '#f9fafb' }}>
                      {ar ? SUBJECT_LABELS[r.subjectCode]?.ar ?? r.subjectCode : SUBJECT_LABELS[r.subjectCode]?.en ?? r.subjectCode}
                    </td>
                    <td className="border px-2 py-2 text-center">{r.totalStudents}</td>
                    <td className="border px-2 py-2 text-center">{r.mean}</td>
                    <td className="border px-2 py-2 text-center">
                      <span className={r.passRate >= 75 ? 'text-green-600 font-medium' : 'text-red-500 font-medium'}>
                        {r.passRate}%
                      </span>
                    </td>
                    <td className="border px-2 py-2 text-center">
                      <span className="font-medium">{r.above75Rate}%</span>
                      <span className="text-gray-400 ml-1">({r.above75Count})</span>
                    </td>
                    <td className="border px-2 py-2 text-center">
                      <LevelBadge level={r.level} lang={lang} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Legend */}
          <div className="flex flex-wrap gap-4 text-xs text-gray-500">
            {[
              { label: ar ? 'ممتاز (>70% فوق 75)' : 'Excellent (>70% above 75)', color: '#16a34a' },
              { label: ar ? 'جيد جداً (>60%)' : 'Very Good (>60%)', color: '#0284c7' },
              { label: ar ? 'جيد (>50%)' : 'Good (>50%)', color: '#d97706' },
              { label: ar ? 'مقبول (نجاح ≥75%)' : 'Acceptable (pass ≥75%)', color: '#64748b' },
              { label: ar ? 'ضعيف (نجاح <75%)' : 'Weak (pass <75%)', color: '#dc2626' },
            ].map(l => (
              <div key={l.label} className="flex items-center gap-1.5">
                <div className="w-3 h-3 rounded-sm" style={{ background: l.color }} />
                {l.label}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Summary bar chart */}
      <div className="card p-4">
        <h2 className="font-semibold text-sm text-gray-700 dark:text-gray-300 mb-3">
          {ar ? 'النسب السنوية للمواد الأساسية' : 'Annual Rates — Core Subjects'}
        </h2>
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={chartData} margin={{ top: 5, right: 20, left: 0, bottom: 50 }}>
            <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
            <XAxis dataKey="name" tick={{ fontSize: 11 }} angle={-35} textAnchor="end" interval={0} />
            <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} tickFormatter={v => `${v}%`} />
            <Tooltip formatter={(v: number) => `${v.toFixed(1)}%`} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Bar dataKey={ar ? 'نسبة النجاح' : 'Pass Rate'} fill="#f59e0b" radius={[3, 3, 0, 0]} />
            <Bar dataKey={ar ? 'فوق 75%' : 'Above 75%'} fill="#22c55e" radius={[3, 3, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Section tabs */}
      <div className="flex gap-1 border-b dark:border-gray-700">
        {tabs.map(tab => (
          <button
            key={tab.key}
            onClick={() => setSection(tab.key)}
            className={`px-4 py-2 text-sm font-medium transition-colors ${
              section === tab.key
                ? 'border-b-2 border-primary-600 text-primary-700 dark:text-primary-400'
                : 'text-gray-500 hover:text-gray-700 dark:text-gray-400'
            }`}
          >
            {ar ? tab.ar : tab.en}
          </button>
        ))}
      </div>

      {/* ── School ── */}
      {section === 'school' && (
        <div className="space-y-4">
          {/* S1/S2/S3 cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {schoolSemData.map(({ sem, count, passRate, above75Rate, level }) => (
              <div key={sem} className="card p-5 space-y-4">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-base text-gray-800 dark:text-gray-100">{semLabel(sem)}</span>
                  <LevelBadge level={level} lang={lang} />
                </div>
                <div className="space-y-3">
                  <div className="flex flex-col gap-1">
                    <span className="text-xs text-gray-400">{ar ? 'نسبة النجاح' : 'Pass Rate'}</span>
                    <span className="text-3xl font-bold text-amber-500">{passRate.toFixed(1)}%</span>
                    <div className="w-full bg-gray-100 dark:bg-gray-700 rounded-full h-1.5">
                      <div className="bg-amber-400 h-1.5 rounded-full" style={{ width: `${Math.min(passRate, 100)}%` }} />
                    </div>
                  </div>
                  <div className="flex flex-col gap-1">
                    <span className="text-xs text-gray-400">{ar ? 'نسبة فوق 75' : 'Above 75%'}</span>
                    <span className="text-3xl font-bold text-emerald-500">{above75Rate.toFixed(1)}%</span>
                    <div className="w-full bg-gray-100 dark:bg-gray-700 rounded-full h-1.5">
                      <div className="bg-emerald-400 h-1.5 rounded-full" style={{ width: `${Math.min(above75Rate, 100)}%` }} />
                    </div>
                  </div>
                </div>
                <p className="text-xs text-gray-400 text-end">{count} {ar ? 'طالب' : 'students'}</p>
              </div>
            ))}
          </div>

          {/* Annual card */}
          <div className="card p-5">
            <div className="flex items-center justify-between mb-4">
              <span className="font-bold text-base text-gray-800 dark:text-gray-100">
                {ar ? 'السنة كاملة' : 'Full Year'}
              </span>
              <LevelBadge level={annualSchoolData.level} lang={lang} />
            </div>
            <div className="grid grid-cols-2 gap-6">
              <div className="flex flex-col gap-1">
                <span className="text-xs text-gray-400">{ar ? 'نسبة النجاح' : 'Pass Rate'}</span>
                <span className="text-3xl font-bold text-amber-500">{annualSchoolData.passRate.toFixed(1)}%</span>
                <div className="w-full bg-gray-100 dark:bg-gray-700 rounded-full h-1.5">
                  <div className="bg-amber-400 h-1.5 rounded-full" style={{ width: `${Math.min(annualSchoolData.passRate, 100)}%` }} />
                </div>
              </div>
              <div className="flex flex-col gap-1">
                <span className="text-xs text-gray-400">{ar ? 'نسبة فوق 75' : 'Above 75%'}</span>
                <span className="text-3xl font-bold text-emerald-500">{annualSchoolData.above75Rate.toFixed(1)}%</span>
                <div className="w-full bg-gray-100 dark:bg-gray-700 rounded-full h-1.5">
                  <div className="bg-emerald-400 h-1.5 rounded-full" style={{ width: `${Math.min(annualSchoolData.above75Rate, 100)}%` }} />
                </div>
              </div>
            </div>
            <p className="text-xs text-gray-400 text-end mt-3">{annualSchoolData.count} {ar ? 'طالب' : 'students'}</p>
          </div>

          {/* ── Statistical Analysis ── */}
          <div className="card p-5 space-y-5">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <h2 className="font-bold text-gray-800 dark:text-gray-100">
                {ar ? 'التحليل الإحصائي للمدرسة' : 'School Statistical Analysis'}
              </h2>
              {/* Semester toggle */}
              <div className="flex gap-1 flex-wrap">
                {(['annual', 1, 2, 3] as SemFilter[]).map(s => (
                  <button
                    key={s}
                    onClick={() => setSchoolSem(s)}
                    className={`px-3 py-1 text-xs rounded-full font-medium transition-colors ${
                      schoolSem === s
                        ? 'bg-primary-600 text-white'
                        : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                    }`}
                  >
                    {s === 'annual' ? (ar ? 'السنة كاملة' : 'Annual') : semLabel(s as 1 | 2 | 3)}
                  </button>
                ))}
              </div>
            </div>

            {schoolAnalysisScores.length > 0 ? (
              <>
                <StatsGrid
                  stats={schoolStats}
                  passMark={records.length > 0 ? getPassMark(getCycle(records[0].grade)) : 60}
                  lang={lang}
                />
                <div>
                  <p className="text-xs text-gray-400 mb-2 font-medium">
                    {ar ? 'توزيع الدرجات مع منحنى التوزيع الطبيعي' : 'Score Distribution with Normal Curve Overlay'}
                  </p>
                  <HistogramChart
                    scores={schoolAnalysisScores}
                    passMark={records.length > 0 ? getPassMark(getCycle(records[0].grade)) : 60}
                    lang={lang}
                  />
                </div>
              </>
            ) : (
              <p className="text-sm text-gray-400 text-center py-6">
                {ar ? 'لا توجد بيانات لهذا الفصل' : 'No data for this period'}
              </p>
            )}
          </div>
        </div>
      )}

      {/* ── Subject ── */}
      {section === 'subject' && (
        <div className="space-y-5">
          {/* Subject pills */}
          <div className="flex flex-wrap gap-2">
            {ANALYSIS_SUBJECTS.map(subj => {
              const d = subjectAnnualData.find(s => s.subj === subj)
              const hasData = d && d.count > 0
              return (
                <button
                  key={subj}
                  onClick={() => setSelectedSubj(subj as SubjectCode)}
                  className={`px-3 py-1.5 text-sm rounded-full font-medium transition-colors ${
                    selectedSubj === subj
                      ? 'bg-primary-600 text-white'
                      : hasData
                        ? 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-200'
                        : 'bg-gray-50 dark:bg-gray-800 text-gray-300 dark:text-gray-600 cursor-default'
                  }`}
                >
                  {ar ? SUBJECT_LABELS[subj as SubjectCode].ar : SUBJECT_LABELS[subj as SubjectCode].en}
                  {hasData && <span className="ms-1 text-[10px] opacity-70">({d!.count})</span>}
                </button>
              )
            })}
          </div>

          {/* Selected subject panel */}
          {(() => {
            const d = subjectAnnualData.find(s => s.subj === selectedSubj)
            if (!d || d.count === 0) return (
              <div className="card p-8 text-center text-gray-400 text-sm">
                {ar ? 'لا توجد بيانات لهذه المادة' : 'No data for this subject'}
              </div>
            )
            const annualScores = subjScores.annual
            const pm = records.length > 0 ? getPassMark(getCycle(records[0].grade)) : 60
            const stats = calcStats(annualScores, pm)
            const subjLabel = ar ? SUBJECT_LABELS[selectedSubj].ar : SUBJECT_LABELS[selectedSubj].en

            return (
              <div className="space-y-4">
                {/* Header card */}
                <div className="card p-4 flex items-center justify-between flex-wrap gap-3">
                  <div>
                    <h3 className="font-bold text-lg text-gray-800 dark:text-gray-100">{subjLabel}</h3>
                    <p className="text-xs text-gray-400 mt-0.5">{d.count} {ar ? 'طالب' : 'students'}</p>
                  </div>
                  {d.level && <LevelBadge level={d.level} lang={lang} />}
                  <div className="flex gap-4">
                    <div className="text-center">
                      <p className="text-xs text-gray-400">{ar ? 'نسبة النجاح' : 'Pass Rate'}</p>
                      <p className="text-xl font-bold text-amber-500">{d.passRate?.toFixed(1)}%</p>
                    </div>
                    <div className="text-center">
                      <p className="text-xs text-gray-400">{ar ? 'فوق 75%' : 'Above 75%'}</p>
                      <p className="text-xl font-bold text-emerald-500">{d.above75Rate?.toFixed(1)}%</p>
                    </div>
                  </div>
                </div>

                {/* Stats grid */}
                <div className="card p-5 space-y-4">
                  <h4 className="font-semibold text-sm text-gray-700 dark:text-gray-300">
                    {ar ? 'المؤشرات الإحصائية (سنوي)' : 'Statistical Indicators (Annual)'}
                  </h4>
                  <StatsGrid stats={stats} passMark={pm} lang={lang} />
                </div>

                {/* Annual histogram */}
                <div className="card p-5 space-y-3">
                  <h4 className="font-semibold text-sm text-gray-700 dark:text-gray-300">
                    {ar ? 'توزيع الدرجات السنوية مع منحنى التوزيع الطبيعي' : 'Annual Score Distribution with Normal Curve'}
                  </h4>
                  <HistogramChart scores={annualScores} passMark={pm} lang={lang} />
                </div>

                {/* Semester comparison */}
                <div className="card p-5 space-y-3">
                  <h4 className="font-semibold text-sm text-gray-700 dark:text-gray-300">
                    {ar ? 'مقارنة الفصول الدراسية' : 'Semester Comparison'}
                  </h4>
                  <ResponsiveContainer width="100%" height={200}>
                    <BarChart data={subjSemComparison} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" opacity={0.25} />
                      <XAxis dataKey="label" tick={{ fontSize: 12 }} />
                      <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} />
                      <Tooltip formatter={(v: number) => v.toFixed(1)} />
                      <Legend wrapperStyle={{ fontSize: 11 }} />
                      <Bar dataKey={ar ? 'متوسط' : 'Mean'} fill="#6366f1" radius={[3, 3, 0, 0]} />
                      <Bar dataKey={ar ? 'نجاح%' : 'Pass%'} fill="#f59e0b" radius={[3, 3, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>

                {/* Grade breakdown */}
                {subjGradeBreakdown.length > 0 && (
                  <div className="card p-5 space-y-3">
                    <h4 className="font-semibold text-sm text-gray-700 dark:text-gray-300">
                      {ar ? 'توزيع النتائج حسب الصف' : 'Results by Grade'}
                    </h4>
                    <ResponsiveContainer width="100%" height={220}>
                      <BarChart data={subjGradeBreakdown} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                        <CartesianGrid strokeDasharray="3 3" opacity={0.25} />
                        <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                        <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} />
                        <Tooltip formatter={(v: number) => v.toFixed(1)} />
                        <Legend wrapperStyle={{ fontSize: 11 }} />
                        <Bar dataKey={ar ? 'متوسط' : 'Mean'} fill="#22c55e" radius={[3, 3, 0, 0]} />
                        <Bar dataKey={ar ? 'نجاح%' : 'Pass%'} fill="#f59e0b" radius={[3, 3, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </div>
            )
          })()}
        </div>
      )}

      {/* ── Grade ── */}
      {section === 'grade' && (
        <div className="space-y-5">
          {/* Grade pills */}
          <div className="flex flex-wrap gap-2">
            {gradeAnnualData.map(gs => (
              <button
                key={gs.grade}
                onClick={() => setSelectedGrade(gs.grade)}
                className={`px-3 py-1.5 text-sm rounded-full font-medium transition-colors ${
                  activeGrade === gs.grade
                    ? 'bg-primary-600 text-white'
                    : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-200'
                }`}
              >
                {ar ? `الصف ${gs.grade}` : `Grade ${gs.grade}`}
                <span className="ms-1 text-[10px] opacity-70">({gs.count})</span>
              </button>
            ))}
          </div>

          {/* Selected grade panel */}
          {(() => {
            const gs = gradeAnnualData.find(g => g.grade === activeGrade)
            if (!gs) return null
            const pm = getPassMark(getCycle(activeGrade))

            return (
              <div className="space-y-4">
                {/* Header card */}
                <div className="card p-4 flex items-center justify-between flex-wrap gap-3">
                  <div>
                    <h3 className="font-bold text-lg text-gray-800 dark:text-gray-100">
                      {ar ? `الصف ${activeGrade}` : `Grade ${activeGrade}`}
                    </h3>
                    <p className="text-xs text-gray-400 mt-0.5">{gs.count} {ar ? 'طالب' : 'students'}</p>
                  </div>
                  <LevelBadge level={gs.level} lang={lang} />
                  <div className="flex gap-4">
                    <div className="text-center">
                      <p className="text-xs text-gray-400">{ar ? 'نسبة النجاح' : 'Pass Rate'}</p>
                      <p className="text-xl font-bold text-amber-500">{gs.passRate.toFixed(1)}%</p>
                    </div>
                    <div className="text-center">
                      <p className="text-xs text-gray-400">{ar ? 'فوق 75%' : 'Above 75%'}</p>
                      <p className="text-xl font-bold text-emerald-500">{gs.above75Rate.toFixed(1)}%</p>
                    </div>
                  </div>
                </div>

                {/* Stats grid */}
                <div className="card p-5 space-y-4">
                  <h4 className="font-semibold text-sm text-gray-700 dark:text-gray-300">
                    {ar ? 'المؤشرات الإحصائية (سنوي)' : 'Statistical Indicators (Annual)'}
                  </h4>
                  <StatsGrid stats={gradeStats} passMark={pm} lang={lang} />
                </div>

                {/* Distribution histogram */}
                <div className="card p-5 space-y-3">
                  <h4 className="font-semibold text-sm text-gray-700 dark:text-gray-300">
                    {ar ? 'توزيع الدرجات مع منحنى التوزيع الطبيعي' : 'Score Distribution with Normal Curve'}
                  </h4>
                  <HistogramChart scores={gradeScores} passMark={pm} lang={lang} />
                </div>

                {/* Subject breakdown */}
                {gradeSubjectBreakdown.length > 0 && (
                  <div className="card p-5 space-y-3">
                    <h4 className="font-semibold text-sm text-gray-700 dark:text-gray-300">
                      {ar ? 'النتائج حسب المادة' : 'Results by Subject'}
                    </h4>
                    <ResponsiveContainer width="100%" height={240}>
                      <BarChart data={gradeSubjectBreakdown} margin={{ top: 5, right: 20, left: 0, bottom: 50 }}>
                        <CartesianGrid strokeDasharray="3 3" opacity={0.25} />
                        <XAxis dataKey="name" tick={{ fontSize: 11 }} angle={-35} textAnchor="end" interval={0} />
                        <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} />
                        <Tooltip formatter={(v: number) => v.toFixed(1)} />
                        <Legend wrapperStyle={{ fontSize: 11 }} />
                        <Bar dataKey={ar ? 'متوسط' : 'Mean'} fill="#22c55e" radius={[3, 3, 0, 0]} />
                        <Bar dataKey={ar ? 'نجاح%' : 'Pass%'} fill="#f59e0b" radius={[3, 3, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </div>
            )
          })()}
        </div>
      )}
    </div>
  )
}
