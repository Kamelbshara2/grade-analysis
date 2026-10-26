import { useState, useMemo } from 'react'
import { Printer } from 'lucide-react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend, Cell, LineChart, Line,
  RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
  ReferenceLine,
} from 'recharts'
import { dataStore } from '@/store/dataStore'
import {
  filterRecords, extractScores, computeAchievementIndicators,
  computeSubjectStats, round2,
  computeSchoolTrendPoints, computeSubjectTrendPoints,
  computeGradeStats, computeProgressRates,
  computeFormativeExamGaps, computeSemesterGaps,
  getProportionLabel,
  type AchievementIndicator,
} from '@/utils/statistics'
import {
  SUBJECT_LABELS, ANALYSIS_SUBJECTS, getCycle, getPassMark,
  isSubjectRelevantForGrade,
} from '@/utils/subjectMapping'
import type { Language, SubjectCode, Nationality } from '@/types'
import clsx from 'clsx'

interface PrintReportProps { lang: Language }

// ── Colour palette ─────────────────────────────────────────────────────────────
const C = {
  excellent: '#16a34a',
  very_good: '#2563eb',
  good: '#d97706',
  below: '#dc2626',
  primary: '#1D5E3F',
  band: ['#ef4444', '#f97316', '#eab308', '#22c55e', '#16a34a'],
  subjects: ['#1D5E3F','#2563eb','#7c3aed','#db2777','#0891b2','#16a34a','#dc2626','#d97706','#0f766e','#65a30d'],
}

function levelColor(level: string) {
  if (level === 'excellent') return C.excellent
  if (level === 'very_good') return C.very_good
  if (level === 'good') return C.good
  if (level === 'acceptable') return '#f59e0b'
  return '#ef4444'
}
function levelBg(level: string) {
  if (level === 'excellent') return 'bg-green-100 text-green-800 border-green-300'
  if (level === 'very_good') return 'bg-blue-100 text-blue-800 border-blue-300'
  if (level === 'good') return 'bg-amber-100 text-amber-800 border-amber-300'
  if (level === 'acceptable') return 'bg-orange-100 text-orange-800 border-orange-300'
  return 'bg-red-100 text-red-800 border-red-300'
}

function genNarrative11(indicators: AchievementIndicator[], semester: string): string {
  if (indicators.length === 0) return ''
  const sorted = [...indicators].sort((a, b) => b.above75Rate - a.above75Rate)
  const best = sorted[0]
  const worst = sorted[sorted.length - 1]
  const schoolAvg75 = round2(indicators.reduce((s, i) => s + i.above75Rate, 0) / indicators.length)
  const schoolPassRate = round2(indicators.reduce((s, i) => s + i.passRate, 0) / indicators.length)
  const schoolLevel = schoolPassRate < 75 ? 'ضعيف' : schoolAvg75 >= 70 ? 'ممتاز' : schoolAvg75 >= 60 ? 'جيد جداً' : schoolAvg75 >= 50 ? 'جيد' : 'مقبول'
  const bestLabel = SUBJECT_LABELS[best.subjectCode]?.ar ?? best.subjectCode
  const worstLabel = SUBJECT_LABELS[worst.subjectCode]?.ar ?? worst.subjectCode
  const above = indicators.filter(i => i.level === 'excellent' || i.level === 'very_good').length
  const below = indicators.filter(i => i.level === 'acceptable' || i.level === 'weak').length
  const semLabel = semester === 'annual' ? 'الدرجة السنوية' : `الفصل ${semester === '1' ? 'الأول' : semester === '2' ? 'الثاني' : 'الثالث'}`
  let text = `بناءً على تحليل بيانات ${semLabel}، بلغت نسبة الطلاب الحاصلين على 75% فأعلى على مستوى المدرسة ${schoolAvg75}%، مما يصنّف المدرسة في مستوى "${schoolLevel}". `
  text += `تصدّرت مادة ${bestLabel} قائمة المواد بنسبة ${best.above75Rate}% من الطلاب فوق 75%، `
  text += `في حين سجّلت مادة ${worstLabel} أدنى نسبة بـ ${worst.above75Rate}%. `
  if (above > 0) text += `حقّقت ${above} مادة مستوى "جيد جداً" أو "ممتاز" في المؤشر 1.1. `
  if (below > 0) text += `تحتاج ${below} مادة إلى تدخّل تحسيني عاجل لرفع نسبة الإنجاز. `
  return text
}

function genNarrative12(years: string[], subjectAvgs: Record<SubjectCode, number[]>): string {
  if (years.length < 2) return ''
  const improvements: string[] = []
  const regressions: string[] = []
  for (const [code, avgs] of Object.entries(subjectAvgs) as [SubjectCode, number[]][]) {
    const valid = avgs.filter(v => v !== null && !isNaN(v))
    if (valid.length < 2) continue
    const diff = valid[valid.length - 1] - valid[0]
    const label = SUBJECT_LABELS[code]?.ar ?? code
    if (diff >= 3) improvements.push(`${label} (+${diff.toFixed(1)})`)
    else if (diff <= -3) regressions.push(`${label} (${diff.toFixed(1)})`)
  }
  let text = `عبر ${years.length} سنوات دراسية (${years[0]} إلى ${years[years.length - 1]}): `
  if (improvements.length > 0) text += `سجّلت المواد التالية تحسّناً ملحوظاً: ${improvements.join('، ')}. `
  if (regressions.length > 0) text += `في المقابل شهدت المواد التالية تراجعاً: ${regressions.join('، ')}. `
  if (improvements.length === 0 && regressions.length === 0) text += 'استقرّت معظم المواد بشكل نسبي دون تغيّر جوهري.'
  return text
}

function genNarrativeSubject(ind: AchievementIndicator, stats: ReturnType<typeof computeSubjectStats>): string {
  const label = SUBJECT_LABELS[ind.subjectCode]?.ar ?? ind.subjectCode
  const pm = getPassMark(ind.cycle)
  return `مادة ${label}: متوسط ${round2(stats.mean)}، الوسيط ${round2(stats.median)}، الانحراف المعياري ${round2(stats.stdDev)}. ` +
    `نسبة النجاح (≥${pm}%): ${round2(stats.passRate)}%، نسبة الرسوب: ${round2(stats.failRate)}%، نسبة ≥75%: ${round2(ind.above75Rate)}%. ` +
    `${getProportionLabel(ind.above75Rate, 'ar')} من الطلاب حققوا إنجازاً عالياً (فوق 75%).`
}

function genGradeSubjectNarrative(ind: AchievementIndicator, stats: ReturnType<typeof computeSubjectStats> | undefined, grade: number): string {
  const label = SUBJECT_LABELS[ind.subjectCode]?.ar ?? ind.subjectCode
  const pm = getPassMark(ind.cycle)
  const mean = stats ? round2(stats.mean) : 0
  const passDesc = ind.passRate >= 90 ? 'ممتازة جداً' : ind.passRate >= 75 ? 'جيدة' : ind.passRate >= 60 ? 'متوسطة' : 'ضعيفة'
  const achieve = ind.above75Rate >= 70 ? 'مستوى متميز' : ind.above75Rate >= 50 ? 'مستوى متوسط' : 'يستوجب تدخلاً تحسينياً'
  return `مادة ${label} — الصف ${grade}: نسبة النجاح (≥${pm}%) ${ind.passRate}%، وهي ${passDesc}. نسبة الطلاب فوق 75% هي ${ind.above75Rate}% (${achieve}). متوسط الدرجات ${mean}. التصنيف: ${ind.levelAr}.`
}

function genWithinYearNarrative(data: {sem: number; mean: number | null; above75Rate: number | null; passRate: number | null; count: number}[]): string {
  const s1 = data.find(d => d.sem === 1), s2 = data.find(d => d.sem === 2), s3 = data.find(d => d.sem === 3)
  if (!s1 && !s2 && !s3) return ''
  const lines: string[] = []
  if (s1?.mean != null) lines.push(`• الفصل الأول (ف1): متوسط الدرجات ${s1.mean.toFixed(1)}/100، نسبة فوق 75%: ${s1.above75Rate?.toFixed(1) ?? '—'}%، نسبة النجاح: ${s1.passRate?.toFixed(1) ?? '—'}%، عدد الطلاب: ${s1.count}.`)
  if (s2?.mean != null) lines.push(`• الفصل الثاني (ف2): متوسط الدرجات ${s2.mean.toFixed(1)}/100، نسبة فوق 75%: ${s2.above75Rate?.toFixed(1) ?? '—'}%، نسبة النجاح: ${s2.passRate?.toFixed(1) ?? '—'}%، عدد الطلاب: ${s2.count}.`)
  if (s3?.mean != null) lines.push(`• الفصل الثالث (ف3): متوسط الدرجات ${s3.mean.toFixed(1)}/100، نسبة فوق 75%: ${s3.above75Rate?.toFixed(1) ?? '—'}%، نسبة النجاح: ${s3.passRate?.toFixed(1) ?? '—'}%، عدد الطلاب: ${s3.count}.`)
  if (s1?.mean != null && s2?.mean != null && s3?.mean != null) {
    const d12 = round2(s2.mean - s1.mean), d23 = round2(s3.mean - s2.mean), d13 = round2(s3.mean - s1.mean)
    lines.push(`• التغيرات: ف1→ف2: ${d12 >= 0 ? '+' : ''}${d12}، ف2→ف3: ${d23 >= 0 ? '+' : ''}${d23}، ف1→ف3: ${d13 >= 0 ? '+' : ''}${d13}.`)
    lines.push(`• الاتجاه الإجمالي عبر العام: ${d13 >= 2 ? 'تحسّن ملحوظ' : d13 <= -2 ? 'تراجع ملحوظ' : 'استقرار نسبي'}.`)
  }
  return lines.join('\n')
}

type WithinSubjectRow = {subj: string; cells: ({mean: number; above75Rate: number} | null)[]}
function genWithinSubjectDetailedNarrative(data: WithinSubjectRow[]): string {
  if (data.length === 0) return ''
  const lines: string[] = []
  for (const row of data) {
    const label = (SUBJECT_LABELS as Record<string, {ar: string; en: string}>)[row.subj]?.ar ?? row.subj
    const [c1, c2, c3] = row.cells
    if (!c1 && !c2 && !c3) continue
    const parts = []
    if (c1) parts.push(`ف1: ${c1.mean.toFixed(1)} (فوق75%: ${c1.above75Rate.toFixed(0)}%)`)
    if (c2) {
      const d = c1 ? round2(c2.mean - c1.mean) : null
      parts.push(`ف2: ${c2.mean.toFixed(1)}${d != null ? (d >= 0 ? ' ▲+' : ' ▼') + Math.abs(d) : ''} (فوق75%: ${c2.above75Rate.toFixed(0)}%)`)
    }
    if (c3) {
      const d = c2 ? round2(c3.mean - c2.mean) : null
      parts.push(`ف3: ${c3.mean.toFixed(1)}${d != null ? (d >= 0 ? ' ▲+' : ' ▼') + Math.abs(d) : ''} (فوق75%: ${c3.above75Rate.toFixed(0)}%)`)
    }
    let summary = ''
    if (c1 && c3) {
      const total = round2(c3.mean - c1.mean)
      summary = ` — ${total >= 2 ? 'تحسّن' : total <= -2 ? 'تراجع' : 'استقرار'} (${total >= 0 ? '+' : ''}${total})`
    }
    lines.push(`• ${label}: ${parts.join('، ')}${summary}.`)
  }
  return lines.join('\n')
}

type WithinGradeEntry = {sem: number; stats: {grade: number; mean: number; above75Rate: number}[]}
function genWithinGradeDetailedNarrative(data: WithinGradeEntry[], grades: number[]): string {
  if (data.length === 0 || grades.length === 0) return ''
  const sem1 = data.find(d => d.sem === 1), sem2 = data.find(d => d.sem === 2), sem3 = data.find(d => d.sem === 3)
  const lines: string[] = []
  for (const grade of grades) {
    const g1 = sem1?.stats.find(s => s.grade === grade)
    const g2 = sem2?.stats.find(s => s.grade === grade)
    const g3 = sem3?.stats.find(s => s.grade === grade)
    if (!g1 && !g2 && !g3) continue
    const parts = []
    if (g1) parts.push(`ف1: ${g1.mean.toFixed(1)} (فوق75%: ${g1.above75Rate.toFixed(0)}%)`)
    if (g2) {
      const d = g1 ? round2(g2.mean - g1.mean) : null
      parts.push(`ف2: ${g2.mean.toFixed(1)}${d != null ? (d >= 0 ? ' ▲+' : ' ▼') + Math.abs(d) : ''} (فوق75%: ${g2.above75Rate.toFixed(0)}%)`)
    }
    if (g3) {
      const d = g2 ? round2(g3.mean - g2.mean) : null
      parts.push(`ف3: ${g3.mean.toFixed(1)}${d != null ? (d >= 0 ? ' ▲+' : ' ▼') + Math.abs(d) : ''} (فوق75%: ${g3.above75Rate.toFixed(0)}%)`)
    }
    let summary = ''
    if (g1 && g3) {
      const total = round2(g3.mean - g1.mean)
      summary = ` — ${total >= 2 ? 'تحسّن' : total <= -2 ? 'تراجع' : 'استقرار'} (${total >= 0 ? '+' : ''}${total})`
    }
    lines.push(`• الصف ${grade}: ${parts.join('، ')}${summary}.`)
  }
  return lines.join('\n')
}

type FGapItem = {subjectCode: string; avgFormative: number | null; avgExam: number | null; gap: number | null; studentsExamHigher?: number; studentsExamLower?: number}
function genFormativeGapNarrative(gaps: FGapItem[], semLabel: string): string {
  if (gaps.length === 0) return ''
  const lines: string[] = [`تحليل تفصيلي للفجوة بين التقويم التكويني والاختبار (${semLabel}):`]
  for (const g of gaps) {
    if (g.avgFormative == null || g.avgExam == null) continue
    const label = (SUBJECT_LABELS as Record<string, {ar: string; en: string}>)[g.subjectCode]?.ar ?? g.subjectCode
    const gap = g.gap ?? 0
    const gapDesc = gap > 10 ? 'فجوة كبيرة لصالح الاختبار'
      : gap > 5 ? 'فجوة معتدلة لصالح الاختبار'
      : gap < -10 ? 'فجوة كبيرة لصالح التكويني — يُوصى بمراجعة صعوبة الاختبار'
      : gap < -5 ? 'فجوة معتدلة لصالح التكويني'
      : 'انسجام جيد بين التكويني والاختبار'
    let line = `• ${label}: تكويني ${g.avgFormative.toFixed(1)}/100، اختبار ${g.avgExam.toFixed(1)}/100، الفجوة ${gap >= 0 ? '+' : ''}${gap.toFixed(1)}% — ${gapDesc}.`
    if (g.studentsExamHigher != null || g.studentsExamLower != null) {
      line += ` (طلاب اختبارهم أعلى: ${g.studentsExamHigher ?? 0}، أقل: ${g.studentsExamLower ?? 0})`
    }
    lines.push(line)
  }
  const neg = gaps.filter(g => g.gap != null && g.gap < -5).length
  const pos = gaps.filter(g => g.gap != null && g.gap > 5).length
  const aligned = gaps.filter(g => g.gap != null && Math.abs(g.gap) <= 5).length
  const summary = []
  if (pos > 0) summary.push(`${pos} مادة اختبارها أعلى من تكوينيها`)
  if (aligned > 0) summary.push(`${aligned} مادة في انسجام جيد`)
  if (neg > 0) summary.push(`${neg} مادة اختبارها أقل من تكوينيها`)
  lines.push(`\nملخص (${semLabel}): ${summary.join('، ')}.`)
  return lines.join('\n')
}

type SemGapRow = {subjectCode: string; avgS1: number | null; avgS2: number | null; avgS3: number | null; gapS1S2: number | null; gapS2S3: number | null; gapS1S3: number | null; priority: string}
type SchoolSemSummaryType = {avgS1: number; avgS2: number; avgS3: number; gapS1S2: number; gapS2S3: number; gapS1S3: number}
function genSemGapDetailedNarrative(school: SchoolSemSummaryType, subjects: SemGapRow[]): string {
  const pLabels: Record<string, string> = { critical: 'حرج', high: 'عالي', medium: 'متوسط', low: 'منخفض', ok: 'جيد' }
  const lines: string[] = ['أ) على مستوى المدرسة:']
  lines.push(`• الفصل الأول (ف1): متوسط ${school.avgS1.toFixed(1)}/100`)
  lines.push(`• الفصل الثاني (ف2): متوسط ${school.avgS2.toFixed(1)}/100 — فجوة ف1→ف2: ${school.gapS1S2 >= 0 ? '+' : ''}${school.gapS1S2.toFixed(1)}%`)
  lines.push(`• الفصل الثالث (ف3): متوسط ${school.avgS3.toFixed(1)}/100 — فجوة ف2→ف3: ${school.gapS2S3 >= 0 ? '+' : ''}${school.gapS2S3.toFixed(1)}%`)
  lines.push(`• الفجوة الإجمالية ف1→ف3: ${school.gapS1S3 >= 0 ? '+' : ''}${school.gapS1S3.toFixed(1)}% — ${school.gapS1S3 >= 3 ? 'تحسّن ملحوظ' : school.gapS1S3 <= -3 ? 'تراجع ملحوظ' : 'استقرار نسبي'} عبر العام.`)
  if (subjects.length > 0) {
    lines.push(`\nب) على مستوى المواد:`)
    for (const g of subjects) {
      const label = (SUBJECT_LABELS as Record<string, {ar: string; en: string}>)[g.subjectCode]?.ar ?? g.subjectCode
      const parts = []
      if (g.avgS1 != null) parts.push(`ف1: ${g.avgS1.toFixed(1)}`)
      if (g.avgS2 != null) parts.push(`ف2: ${g.avgS2.toFixed(1)} (${g.gapS1S2 != null ? (g.gapS1S2 >= 0 ? '+' : '') + g.gapS1S2.toFixed(1) + '%' : '—'})`)
      if (g.avgS3 != null) parts.push(`ف3: ${g.avgS3.toFixed(1)} (${g.gapS2S3 != null ? (g.gapS2S3 >= 0 ? '+' : '') + g.gapS2S3.toFixed(1) + '%' : '—'})`)
      const p = pLabels[g.priority] ?? g.priority
      lines.push(`• ${label}: ${parts.join('، ')} — أولوية: ${p}.`)
    }
  }
  return lines.join('\n')
}

function ChartTitle({ children }: { children: React.ReactNode }) {
  return (
    <p className="flex items-center gap-1.5 text-sm font-bold mb-2 pb-1 border-b border-gray-200" style={{ color: '#1D5E3F' }}>
      <span>📊</span>{children}
    </p>
  )
}
function TableTitle({ children }: { children: React.ReactNode }) {
  return (
    <p className="flex items-center gap-1.5 text-sm font-bold mb-2 pb-1 border-b border-gray-200" style={{ color: '#1D5E3F' }}>
      <span>📋</span>{children}
    </p>
  )
}
function SubLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 mt-5 mb-3">
      <div className="w-1 h-5 rounded-full shrink-0" style={{ background: '#1D5E3F99' }} />
      <p className="text-sm font-bold" style={{ color: '#1D5E3F' }}>{children}</p>
    </div>
  )
}

// ── Section wrapper ─────────────────────────────────────────────────────────
function Section({ title, subtitle, num, children }: {
  title: string; subtitle?: string; num?: number; children: React.ReactNode
}) {
  return (
    <div className="print-section mb-8">
      <div className="flex items-center gap-3 mb-5 pb-3 border-b-2" style={{ borderColor: '#1D5E3F33' }}>
        {num !== undefined && (
          <div className="w-9 h-9 rounded-full flex items-center justify-center text-white text-sm font-bold shrink-0"
            style={{ background: C.primary }}>
            {num}
          </div>
        )}
        <div>
          <h2 className="text-lg font-bold" style={{ color: C.primary }}>{title}</h2>
          {subtitle && <p className="text-xs text-gray-400 mt-0.5">{subtitle}</p>}
        </div>
      </div>
      {children}
    </div>
  )
}

function SubSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-6">
      <h3 className="text-sm font-bold text-gray-700 border-b border-gray-200 pb-1 mb-3" style={{ color: C.primary + 'cc' }}>{title}</h3>
      {children}
    </div>
  )
}

function Kpi({ label, value, sub, color }: { label: string; value: string | number; sub?: string; color: string }) {
  return (
    <div className="rounded-xl border-2 p-4 flex flex-col gap-1" style={{ borderColor: color + '44', background: color + '0d' }}>
      <p className="text-xs text-gray-500 leading-tight">{label}</p>
      <p className="text-2xl font-extrabold" style={{ color }}>{value}</p>
      {sub && <p className="text-xs text-gray-400">{sub}</p>}
    </div>
  )
}

function MiniBar({ pct, color }: { pct: number; color: string }) {
  return (
    <div className="flex items-center gap-2 w-full">
      <div className="flex-1 bg-gray-100 rounded-full h-2 overflow-hidden">
        <div className="h-full rounded-full transition-all" style={{ width: `${Math.min(pct, 100)}%`, background: color }} />
      </div>
      <span className="text-xs font-semibold w-10 text-end" style={{ color }}>{pct}%</span>
    </div>
  )
}

function GapBar({ value, max = 50 }: { value: number | null; max?: number }) {
  if (value === null) return <span className="text-gray-400">—</span>
  const pct = Math.min(Math.abs(value) / max * 100, 100)
  const neg = value < 0
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${neg ? 'bg-red-400' : 'bg-green-400'}`} style={{ width: `${pct}%` }} />
      </div>
      <span className={`text-xs font-semibold w-16 text-end ${neg ? 'text-red-600' : 'text-green-700'}`}>
        {value >= 0 ? '+' : ''}{value.toFixed(1)}%
      </span>
    </div>
  )
}

// ── Main component ─────────────────────────────────────────────────────────────
export default function PrintReport({ lang }: PrintReportProps) {
  const ar = lang === 'ar'
  const years = dataStore.getYears()
  const [yearId, setYearId] = useState(years.slice(-1)[0] || '')
  const [semester, setSemester] = useState<'annual' | '1' | '2' | '3'>('annual')
  const [schoolName, setSchoolName] = useState('مدرسة خالد بن الوليد')
  const [nationality, setNationality] = useState<Nationality | undefined>(undefined)
  const [selectedSubjects, setSelectedSubjects] = useState<string[]>([...ANALYSIS_SUBJECTS])
  const activeSubjects = useMemo(() => ANALYSIS_SUBJECTS.filter(s => selectedSubjects.includes(s)), [selectedSubjects])

  const records = useMemo(() => {
    const raw = dataStore.getRecordsByYear(yearId)
    return nationality ? filterRecords(raw, { nationality }) : raw
  }, [yearId, nationality])
  const diagScores = useMemo(() => dataStore.getDiagnosticScores(yearId), [yearId])
  const termScoresT1 = useMemo(() => dataStore.getTermScores(yearId, 1), [yearId])
  const termScoresT2 = useMemo(() => dataStore.getTermScores(yearId, 2), [yearId])
  const termScoresT3 = useMemo(() => dataStore.getTermScores(yearId, 3), [yearId])
  const formativeScores = useMemo(() => dataStore.getFormativeScores(yearId), [yearId])
  const examScores = useMemo(() => dataStore.getExamScores(yearId), [yearId])

  const semesterVal = semester === 'annual' ? 'annual' : (Number(semester) as 1 | 2 | 3)

  // ── Standard 1.1 data ──
  const indicators = useMemo(() => computeAchievementIndicators(records, semesterVal).filter(ind => activeSubjects.includes(ind.subjectCode)), [records, semesterVal, activeSubjects])

  const subjectStats = useMemo(() => {
    const map: Record<string, ReturnType<typeof computeSubjectStats>> = {}
    for (const ind of indicators) {
      map[ind.subjectCode] = computeSubjectStats(records, ind.subjectCode, semesterVal, ind.cycle)
    }
    return map
  }, [records, indicators, semesterVal])

  const grades = useMemo(() => [...new Set(records.map(r => r.grade))].sort((a, b) => a - b), [records])

  const gradeSectionByGrade = useMemo(() => {
    return grades.map(grade => {
      const gradeRecs = records.filter(r => r.grade === grade)
      const sections = [...new Set(gradeRecs.map(r => r.section))].sort((a, b) => +a - +b)
      const pm = getPassMark(getCycle(grade))
      const sectionsData = sections.map(sec => {
        const secRecs = gradeRecs.filter(r => r.section === sec)
        const subjectData = activeSubjects.map(subj => {
          const scores = secRecs
            .map(r => r.grades[subj]?.annual)
            .filter((v): v is number => v !== null && v !== undefined)
          if (scores.length === 0) return null
          const n = scores.length
          return {
            name: SUBJECT_LABELS[subj as SubjectCode]?.ar ?? subj,
            'نسبة النجاح': round2((scores.filter(s => s >= pm).length / n) * 100),
            'فوق 75%': round2((scores.filter(s => s >= 75).length / n) * 100),
          }
        }).filter(Boolean) as { name: string; 'نسبة النجاح': number; 'فوق 75%': number }[]
        return { section: sec, count: secRecs.length, subjectData }
      })
      return { grade, sections: sectionsData }
    })
  }, [grades, records, activeSubjects])

  const gradeIndicators = useMemo(() => {
    return grades.map(grade => {
      const gradeRecs = records.filter(r => r.grade === grade)
      const inds = computeAchievementIndicators(gradeRecs, semesterVal)
      const scores = gradeRecs.map(r => r.annualAvg).filter(v => v !== null) as number[]
      const mean = scores.length ? round2(scores.reduce((a, b) => a + b, 0) / scores.length) : 0
      const above75 = scores.filter(s => s >= 75).length
      const above75Rate = scores.length ? round2((above75 / scores.length) * 100) : 0
      const passMark = getPassMark(getCycle(grade))
      const passCount = scores.filter(s => s >= passMark).length
      const passRate = scores.length ? round2((passCount / scores.length) * 100) : 0
      const gradeLevel = passRate < 75
        ? { ar: 'ضعيف', level: 'weak' }
        : above75Rate >= 70 ? { ar: 'ممتاز', level: 'excellent' }
        : above75Rate >= 60 ? { ar: 'جيد جداً', level: 'very_good' }
        : above75Rate >= 50 ? { ar: 'جيد', level: 'good' }
        : { ar: 'مقبول', level: 'acceptable' }
      return { grade, inds: inds.filter(ind => activeSubjects.includes(ind.subjectCode)), mean, above75Rate, passRate, gradeLevel, count: gradeRecs.length }
    })
  }, [grades, records, semesterVal, activeSubjects])

  // ── Standard 1.2 data ──
  const allYearRecords = useMemo(() => years.map(y => {
    const recs = dataStore.getRecordsByYear(y)
    return { yearId: y, records: nationality ? filterRecords(recs, { nationality }) : recs }
  }), [years, nationality])

  const schoolTrend = useMemo(() => computeSchoolTrendPoints(allYearRecords, activeSubjects as SubjectCode[]), [allYearRecords, activeSubjects])

  const withinSchoolData = useMemo(() => {
    return [1, 2, 3].map(sem => {
      const avgs: number[] = []
      for (const r of records) {
        const scores: number[] = []
        for (const subj of activeSubjects) {
          if (!isSubjectRelevantForGrade(subj, r.grade)) continue
          const g = r.grades[subj]
          if (!g) continue
          const score = sem === 1 ? g.s1 : sem === 2 ? g.s2 : g.s3
          if (score !== null) scores.push(score)
        }
        if (scores.length > 0) avgs.push(scores.reduce((a, b) => a + b, 0) / scores.length)
      }
      if (avgs.length === 0) return { sem, mean: null, above75Rate: null, passRate: null, count: 0 }
      const mean = round2(avgs.reduce((a, b) => a + b, 0) / avgs.length)
      return {
        sem,
        mean,
        above75Rate: round2((avgs.filter(s => s >= 75).length / avgs.length) * 100),
        passRate: round2((avgs.filter(s => s >= 50).length / avgs.length) * 100),
        count: avgs.length,
      }
    })
  }, [records, activeSubjects])

  const withinSubjectData = useMemo(() => {
    return activeSubjects.map(subj => {
      const cells = [1, 2, 3].map(sem => {
        const scores: number[] = []
        for (const r of records) {
          if (!isSubjectRelevantForGrade(subj, r.grade)) continue
          const g = r.grades[subj]
          if (!g) continue
          const score = sem === 1 ? g.s1 : sem === 2 ? g.s2 : g.s3
          if (score !== null) scores.push(score)
        }
        if (scores.length === 0) return null
        return { mean: round2(scores.reduce((a, b) => a + b, 0) / scores.length), above75Rate: round2((scores.filter(s => s >= 75).length / scores.length) * 100) }
      })
      return { subj, cells }
    })
  }, [records, activeSubjects])

  const withinGradeData = useMemo(() => [1, 2, 3].map(sem => ({ sem, stats: computeGradeStats(records, sem as 1 | 2 | 3, activeSubjects as SubjectCode[]) })), [records, activeSubjects])

  const progressRates = useMemo(() => computeProgressRates(allYearRecords, activeSubjects as SubjectCode[]), [allYearRecords, activeSubjects])

  const schoolLevelProgress = useMemo(() => {
    const results = []
    for (let i = 0; i < years.length - 1; i++) {
      const yearFrom = years[i]
      const yearTo = years[i + 1]
      const recsFrom = allYearRecords.find(y => y.yearId === yearFrom)?.records ?? []
      const recsTo = allYearRecords.find(y => y.yearId === yearTo)?.records ?? []
      const mapFrom = new Map(recsFrom.filter(r => r.annualAvg !== null).map(r => [r.student.id, r.annualAvg as number]))
      const mapTo = new Map(recsTo.filter(r => r.annualAvg !== null).map(r => [r.student.id, r.annualAvg as number]))
      let improved = 0, regressed = 0, stable = 0
      for (const [id, avgFrom] of mapFrom) {
        const avgTo = mapTo.get(id)
        if (avgTo === undefined) continue
        const diff = avgTo - avgFrom
        if (diff > 2) improved++
        else if (diff < -2) regressed++
        else stable++
      }
      const total = improved + regressed + stable
      const totalFrom = recsFrom.filter(r => r.annualAvg !== null).length
      results.push({ yearFrom, yearTo, improved, regressed, stable, total, totalFrom })
    }
    return results
  }, [allYearRecords, years])

  const multiYearSubjectAvgs = useMemo(() => {
    const allCodes = activeSubjects.filter(code => allYearRecords.some(({ records: recs }) => recs.some(r => r.grades[code])))
    const subjectAvgs: Record<string, number[]> = {}
    const chartRows = allYearRecords.map(({ yearId: y, records: recs }) => {
      const row: Record<string, number | string> = { year: y }
      for (const code of allCodes) {
        const scores = extractScores(recs, code, 'annual')
        const avg = scores.length ? round2(scores.reduce((a, b) => a + b, 0) / scores.length) : NaN
        row[code] = avg
        if (!subjectAvgs[code]) subjectAvgs[code] = []
        subjectAvgs[code].push(avg)
      }
      return row
    })
    return { chartRows, allCodes, subjectAvgs }
  }, [allYearRecords, activeSubjects])

  // ── Standard 1.3 data ──
  const allFormativeGapsS1 = useMemo(() => computeFormativeExamGaps(formativeScores, examScores, 1, undefined, records).filter(g => activeSubjects.includes(g.subjectCode)), [formativeScores, examScores, records, activeSubjects])
  const allFormativeGapsS3 = useMemo(() => computeFormativeExamGaps(formativeScores, examScores, 3, undefined, records).filter(g => activeSubjects.includes(g.subjectCode)), [formativeScores, examScores, records, activeSubjects])

  const gradeFormativeGapsS1 = useMemo(() => grades.map(grade => ({ grade, gaps: computeFormativeExamGaps(formativeScores, examScores, 1, grade, records).filter(g => activeSubjects.includes(g.subjectCode)) })), [formativeScores, examScores, grades, records, activeSubjects])
  const gradeFormativeGapsS3 = useMemo(() => grades.map(grade => ({ grade, gaps: computeFormativeExamGaps(formativeScores, examScores, 3, grade, records).filter(g => activeSubjects.includes(g.subjectCode)) })), [formativeScores, examScores, grades, records, activeSubjects])

  const semGaps = useMemo(() => computeSemesterGaps(records), [records])

  const schoolSemSummary = useMemo(() => {
    const valid = semGaps.filter(g => activeSubjects.includes(g.subjectCode) && g.gapS1S3 !== null)
    if (valid.length === 0) return null
    const avgS1 = valid.reduce((a, b) => a + (b.avgS1 ?? 0), 0) / valid.length
    const avgS2 = valid.reduce((a, b) => a + (b.avgS2 ?? 0), 0) / valid.length
    const avgS3 = valid.reduce((a, b) => a + (b.avgS3 ?? 0), 0) / valid.length
    const avgAnnual = valid.filter(g => g.avgAnnual !== null).reduce((a, b) => a + (b.avgAnnual ?? 0), 0) / valid.length
    const gapS1S2 = avgAnnual !== 0 ? round2((avgS2 - avgS1) / avgAnnual * 100) : 0
    const gapS2S3 = avgAnnual !== 0 ? round2((avgS3 - avgS2) / avgAnnual * 100) : 0
    const gapS1S3 = avgAnnual !== 0 ? round2((avgS3 - avgS1) / avgAnnual * 100) : 0
    return { avgS1, avgS2, avgS3, gapS1S2, gapS2S3, gapS1S3 }
  }, [semGaps, activeSubjects])

  // ── Term progress data ──
  const termRows = useMemo(() => {
    const allCodes = ([...new Set([
      ...diagScores.map(s => s.subjectCode),
      ...termScoresT1.map(s => s.subjectCode),
      ...termScoresT2.map(s => s.subjectCode),
      ...termScoresT3.map(s => s.subjectCode),
    ])] as SubjectCode[]).filter(code => activeSubjects.includes(code))
    if (allCodes.length === 0) return []
    const avg = (items: { subjectCode: SubjectCode; score: number | null }[], code: SubjectCode) => {
      const vals = items.filter(s => s.subjectCode === code && s.score !== null).map(s => s.score as number)
      return vals.length ? round2(vals.reduce((a, b) => a + b, 0) / vals.length) : null
    }
    const avgDiag = (code: SubjectCode) => {
      const vals = diagScores.filter(s => s.subjectCode === code).map(s => s.score)
      return vals.length ? round2(vals.reduce((a, b) => a + b, 0) / vals.length) : null
    }
    return allCodes.map(code => ({
      name: SUBJECT_LABELS[code]?.ar ?? code,
      diagnostic: avgDiag(code),
      t1: avg(termScoresT1, code),
      t2: avg(termScoresT2, code),
      t3: avg(termScoresT3, code),
    })).filter(r => r.diagnostic !== null || r.t1 !== null)
  }, [diagScores, termScoresT1, termScoresT2, termScoresT3, activeSubjects])

  // ── Overview stats ──
  const totals = useMemo(() => {
    const n = records.length
    const scores = records.map(r => r.annualAvg).filter(v => v !== null) as number[]
    const passCount = records.filter(r => r.annualAvg !== null && r.annualAvg >= getPassMark(getCycle(r.grade))).length
    const failCount = scores.length - passCount
    const above75 = scores.filter(s => s >= 75).length
    const avg = scores.length ? round2(scores.reduce((a, b) => a + b, 0) / scores.length) : 0
    const passRate = scores.length ? round2((passCount / scores.length) * 100) : 0
    const r75 = scores.length ? (above75 / scores.length) * 100 : 0
    return {
      total: n,
      passRate,
      failRate: scores.length ? round2((failCount / scores.length) * 100) : 0,
      above75Rate: scores.length ? round2((above75 / scores.length) * 100) : 0,
      avg,
      schoolLevel: (() => {
        if (passRate < 75) return { ar: 'ضعيف', level: 'weak' }
        if (r75 >= 70) return { ar: 'ممتاز', level: 'excellent' }
        if (r75 >= 60) return { ar: 'جيد جداً', level: 'very_good' }
        if (r75 >= 50) return { ar: 'جيد', level: 'good' }
        return { ar: 'مقبول', level: 'acceptable' }
      })(),
    }
  }, [records])

  const today = new Date().toLocaleDateString('ar-EG', { year: 'numeric', month: 'long', day: 'numeric' })
  const semLabel = semester === 'annual' ? 'السنوي' : `الفصل ${semester === '1' ? 'الأول' : semester === '2' ? 'الثاني' : 'الثالث'}`
  const semLabelEn = semester === 'annual' ? 'Annual' : `Term ${semester}`

  if (years.length === 0) {
    return (
      <div className="card text-center py-16 text-gray-500">
        {ar ? 'لا توجد بيانات. قم برفع ملف الدرجات السنوية أولاً.' : 'No data. Upload annual grades first.'}
      </div>
    )
  }

  const subjectName = (code: SubjectCode) => ar ? SUBJECT_LABELS[code]?.ar ?? code : SUBJECT_LABELS[code]?.en ?? code
  const semLbl = (s: number) => ar ? `ف${s}` : `S${s}`

  return (
    <div>
      {/* ── Controls (no-print) ── */}
      <div className="no-print mb-6 flex flex-wrap gap-3 items-end">
        <div>
          <label className="label">{ar ? 'العام الدراسي' : 'Year'}</label>
          <select className="input" value={yearId} onChange={e => setYearId(e.target.value)}>
            {years.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
        <div>
          <label className="label">{ar ? 'الفصل' : 'Semester'}</label>
          <select className="input" value={semester} onChange={e => setSemester(e.target.value as any)}>
            <option value="annual">{ar ? 'السنوي' : 'Annual'}</option>
            <option value="1">{ar ? 'الفصل الأول' : 'Term 1'}</option>
            <option value="2">{ar ? 'الفصل الثاني' : 'Term 2'}</option>
            <option value="3">{ar ? 'الفصل الثالث' : 'Term 3'}</option>
          </select>
        </div>
        <div>
          <label className="label">{ar ? 'الجنسية' : 'Nationality'}</label>
          <select className="input" value={nationality ?? ''} onChange={e => setNationality((e.target.value as Nationality) || undefined)}>
            <option value="">{ar ? 'الكل' : 'All'}</option>
            <option value="citizen">{ar ? 'مواطن' : 'Citizen'}</option>
            <option value="expat">{ar ? 'وافد' : 'Expat'}</option>
          </select>
        </div>
        <div>
          <label className="label">{ar ? 'اسم المدرسة' : 'School Name'}</label>
          <input className="input w-56" value={schoolName} onChange={e => setSchoolName(e.target.value)} />
        </div>
        <div>
          <label className="label">{ar ? 'المواد الدراسية' : 'Subjects'}</label>
          <div className="flex flex-wrap gap-1 max-w-lg border rounded-lg p-2 bg-white">
            <button
              className={`text-xs px-2 py-0.5 rounded border transition-colors ${selectedSubjects.length === ANALYSIS_SUBJECTS.length ? 'bg-green-700 text-white border-green-700' : 'bg-white text-gray-600 border-gray-300 hover:border-green-600'}`}
              onClick={() => setSelectedSubjects([...ANALYSIS_SUBJECTS])}>
              {ar ? 'الكل' : 'All'}
            </button>
            {ANALYSIS_SUBJECTS.map(subj => (
              <button key={subj}
                className={`text-xs px-2 py-0.5 rounded border transition-colors ${selectedSubjects.includes(subj) ? 'bg-green-700 text-white border-green-700' : 'bg-white text-gray-500 border-gray-300 hover:border-green-600'}`}
                onClick={() => setSelectedSubjects(prev => prev.includes(subj) ? prev.filter(s => s !== subj) : [...prev, subj])}>
                {(SUBJECT_LABELS as Record<string, {ar: string; en: string}>)[subj]?.ar ?? subj}
              </button>
            ))}
          </div>
        </div>
        <button className="btn-primary flex items-center gap-2 self-end" onClick={() => window.print()}>
          <Printer size={15} />
          {ar ? 'طباعة التقرير' : 'Print Report'}
        </button>
      </div>

      {/* ════════════════════════════════════════════════════════════
          PRINTABLE CONTENT
      ════════════════════════════════════════════════════════════ */}
      <div id="print-root" className="bg-white print:p-0 rounded-xl shadow-sm border p-6 space-y-0" dir="rtl">

        {/* ── COVER PAGE ─────────────────────────────────────────── */}
        <div className="print-page-cover min-h-[90vh] flex flex-col">
          <div className="h-3 rounded-t-xl mb-8" style={{ background: `linear-gradient(90deg, ${C.primary}, #2563eb, #7c3aed)` }} />
          <div className="flex-1 flex flex-col items-center justify-center text-center px-8 gap-6">
            <div className="w-24 h-24 rounded-full flex items-center justify-center shadow-lg mb-2"
              style={{ background: `linear-gradient(135deg, ${C.primary}, #2563eb)` }}>
              <span className="text-white text-4xl font-black">ت</span>
            </div>
            <div>
              <p className="text-gray-400 text-sm tracking-widest mb-1">إمارة أبوظبي — وزارة التعليم</p>
              <h1 className="text-3xl font-extrabold mb-1" style={{ color: C.primary }}>{schoolName}</h1>
              <p className="text-gray-500 text-sm">فريق ضمان جودة إنجازات الطلبة</p>
            </div>
            <div className="my-4 w-48 h-px bg-gradient-to-r from-transparent via-gray-300 to-transparent" />
            <div>
              <h2 className="text-2xl font-bold text-gray-800 mb-2">تقرير تحليل الإنجاز الدراسي الشامل</h2>
              <p className="text-gray-500 text-base">العام الدراسي: {yearId} — {semLabel}</p>
              <p className="text-gray-400 text-sm mt-1">المعيار 1.1 | المعيار 1.2 | المعيار 1.3</p>
            </div>
            <div className="mt-6 grid grid-cols-3 gap-6 text-center">
              <div>
                <p className="text-3xl font-black" style={{ color: C.primary }}>{totals.total}</p>
                <p className="text-xs text-gray-400">إجمالي الطلاب</p>
              </div>
              <div>
                <p className="text-3xl font-black" style={{ color: levelColor(totals.schoolLevel.level) }}>{totals.schoolLevel.ar}</p>
                <p className="text-xs text-gray-400">مستوى المدرسة</p>
              </div>
              <div>
                <p className="text-3xl font-black" style={{ color: C.excellent }}>{totals.above75Rate}%</p>
                <p className="text-xs text-gray-400">فوق 75%</p>
              </div>
            </div>
          </div>
          <div className="mt-auto pt-6 flex justify-between items-end text-xs text-gray-400 border-t">
            <span>تاريخ الإصدار: {today}</span>
            <span>سري — للاستخدام الداخلي</span>
          </div>
        </div>

        <div className="print-break" />

        {/* ═══════════════════════════════════════════════════
            SECTION 1 — EXECUTIVE SUMMARY
        ═══════════════════════════════════════════════════ */}
        <Section num={1} title="الملخص التنفيذي" subtitle="نظرة عامة على أداء المدرسة">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <Kpi label="إجمالي الطلاب" value={totals.total} color={C.primary} />
            <Kpi label="المتوسط العام" value={`${totals.avg}%`} color={C.very_good} />
            <Kpi label="نسبة النجاح" value={`${totals.passRate}%`}
              sub={`${Math.round(totals.total * totals.passRate / 100)} طالب`} color={C.excellent} />
            <Kpi label="الطلاب ≥75%" value={`${totals.above75Rate}%`}
              sub="معيار الإنجاز 1.1" color={levelColor(totals.schoolLevel.level)} />
          </div>
          <div className={clsx('inline-flex items-center gap-3 px-5 py-3 rounded-xl border-2 mb-6', levelBg(totals.schoolLevel.level))}>
            <span className="text-2xl font-black">{totals.schoolLevel.ar}</span>
            <div className="text-sm">
              <p className="font-semibold">تصنيف المدرسة — المؤشر 1.1</p>
              <p className="opacity-70">بناءً على {totals.above75Rate}% من الطلاب فوق 75%</p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-6">
            <div>
              <ChartTitle>توزيع الإنجاز حسب المادة — نسبة الطلاب ≥75%</ChartTitle>
              <div className="space-y-2">
                {[...indicators].sort((a, b) => b.above75Rate - a.above75Rate).map(ind => (
                  <div key={ind.subjectCode}>
                    <div className="flex justify-between text-xs mb-1">
                      <span className="text-gray-600">{SUBJECT_LABELS[ind.subjectCode]?.ar ?? ind.subjectCode}</span>
                      <span className={clsx('font-bold px-1.5 py-0.5 rounded text-xs border', levelBg(ind.level))}>{ind.levelAr}</span>
                    </div>
                    <MiniBar pct={ind.above75Rate} color={levelColor(ind.level)} />
                  </div>
                ))}
              </div>
            </div>
            <div>
              <ChartTitle>مقارنة النجاح / الرسوب / فوق 75% — حسب المادة</ChartTitle>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={[...indicators].sort((a, b) => b.above75Rate - a.above75Rate).map(i => ({
                  name: (SUBJECT_LABELS[i.subjectCode]?.ar ?? i.subjectCode).slice(0, 8),
                  'فوق 75%': i.above75Rate,
                  'نجاح': round2(i.passRate - i.above75Rate),
                  'رسوب': round2(100 - i.passRate),
                }))} layout="vertical" margin={{ right: 40, left: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                  <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 10 }} />
                  <YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} width={56} />
                  <Tooltip formatter={(v: number) => `${v}%`} />
                  <Bar dataKey="فوق 75%" stackId="a" fill={C.excellent} />
                  <Bar dataKey="نجاح" stackId="a" fill={C.good} />
                  <Bar dataKey="رسوب" stackId="a" fill={C.below} radius={[0, 3, 3, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
          <div className="mt-5 p-4 rounded-xl text-sm text-gray-700 leading-7" style={{ background: '#f0fdf4', borderRight: `4px solid ${C.primary}` }}>
            <p className="font-semibold text-xs text-gray-500 mb-1">📝 التحليل الوصفي</p>
            <p>{genNarrative11(indicators, semester)}</p>
          </div>
        </Section>

        <div className="print-break" />

        {/* ═══════════════════════════════════════════════════
            SECTION 2 — STANDARD 1.1 DETAIL
        ═══════════════════════════════════════════════════ */}
        <Section num={2} title="المعيار 1.1 — التحصيل الدراسي التفصيلي" subtitle="توزيع الطلاب حسب شرائح الإنجاز لكل مادة">

          {/* School level — stats table */}
          <SubSection title="أ) مستوى المدرسة — الإحصاءات التفصيلية">
            <div className="grid grid-cols-2 gap-6 mb-4">
              <div>
                <ChartTitle>مخطط الشبكة — نسبة الطلاب ≥75% لكل مادة</ChartTitle>
                <ResponsiveContainer width="100%" height={200}>
                  <RadarChart data={indicators.map(i => ({ subject: SUBJECT_LABELS[i.subjectCode]?.ar ?? i.subjectCode, value: i.above75Rate }))} outerRadius={75}>
                    <PolarGrid />
                    <PolarAngleAxis dataKey="subject" tick={{ fontSize: 9 }} />
                    <PolarRadiusAxis angle={90} domain={[0, Math.max(20, ...indicators.map(i => i.above75Rate))]} tick={{ fontSize: 8 }} />
                    <Radar dataKey="value" stroke={C.primary} fill={C.primary} fillOpacity={0.4} />
                  </RadarChart>
                </ResponsiveContainer>
              </div>
              <div>
                <ChartTitle>توزيع شرائح الإنجاز حسب المادة (شرائح الدرجات)</ChartTitle>
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={indicators.map(i => ({
                    name: (SUBJECT_LABELS[i.subjectCode]?.ar ?? i.subjectCode).slice(0, 8),
                    'دون الحد': round2(100 - i.passRate),
                    'حد — 70': round2(i.above50Rate - i.above70Rate),
                    '70 — 80': round2(subjectStats[i.subjectCode]?.band_mid ?? 0),
                    '80 — 90': round2(subjectStats[i.subjectCode]?.band_high ?? 0),
                    '90+': round2(subjectStats[i.subjectCode]?.band_top ?? 0),
                  }))} margin={{ right: 10, left: 0, bottom: 40 }}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="name" angle={-30} textAnchor="end" tick={{ fontSize: 9 }} interval={0} />
                    <YAxis tick={{ fontSize: 9 }} domain={[0, 100]} />
                    <Tooltip formatter={(v: number) => `${v}%`} />
                    <Bar dataKey="دون الحد" stackId="a" fill={C.band[0]} />
                    <Bar dataKey="حد — 70" stackId="a" fill={C.band[2]} />
                    <Bar dataKey="70 — 80" stackId="a" fill={C.band[3]} />
                    <Bar dataKey="80 — 90" stackId="a" fill={C.band[4]} />
                    <Bar dataKey="90+" stackId="a" fill="#064e3b" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
            <TableTitle>جدول الإحصاءات التفصيلية — مستوى المدرسة (المعيار 1.1)</TableTitle>
            <div className="overflow-x-auto">
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr style={{ background: C.primary + '15' }}>
                    <th className="border px-3 py-2 text-start font-bold" style={{ color: C.primary }}>المادة</th>
                    <th className="border px-2 py-2 text-center">الطلاب</th>
                    <th className="border px-2 py-2 text-center">المتوسط</th>
                    <th className="border px-2 py-2 text-center">الوسيط</th>
                    <th className="border px-2 py-2 text-center">الانحراف</th>
                    <th className="border px-2 py-2 text-center">الأدنى</th>
                    <th className="border px-2 py-2 text-center">الأعلى</th>
                    <th className="border px-2 py-2 text-center">نجاح%</th>
                    <th className="border px-2 py-2 text-center">رسوب%</th>
                    <th className="border px-2 py-2 text-center">≥75%</th>
                    <th className="border px-2 py-2 text-center">المستوى</th>
                  </tr>
                </thead>
                <tbody>
                  {[...indicators].sort((a, b) => b.above75Rate - a.above75Rate).map((ind, i) => {
                    const st = subjectStats[ind.subjectCode]
                    return (
                      <tr key={ind.subjectCode} style={{ background: i % 2 === 0 ? 'white' : '#f9fafb' }}>
                        <td className="border px-3 py-2 font-semibold">{SUBJECT_LABELS[ind.subjectCode]?.ar ?? ind.subjectCode}</td>
                        <td className="border px-2 py-2 text-center">{ind.totalStudents}</td>
                        <td className="border px-2 py-2 text-center font-semibold">{round2(st?.mean ?? 0)}</td>
                        <td className="border px-2 py-2 text-center">{round2(st?.median ?? 0)}</td>
                        <td className="border px-2 py-2 text-center">{round2(st?.stdDev ?? 0)}</td>
                        <td className="border px-2 py-2 text-center">{round2(st?.min ?? 0)}</td>
                        <td className="border px-2 py-2 text-center">{round2(st?.max ?? 0)}</td>
                        <td className="border px-2 py-2 text-center font-semibold" style={{ color: C.excellent }}>{round2(ind.passRate)}%</td>
                        <td className="border px-2 py-2 text-center font-semibold" style={{ color: C.below }}>{round2(100 - ind.passRate)}%</td>
                        <td className="border px-2 py-2 text-center font-bold" style={{ color: levelColor(ind.level) }}>{ind.above75Rate}%</td>
                        <td className="border px-2 py-2 text-center">
                          <span className={clsx('px-2 py-0.5 rounded text-xs border font-semibold', levelBg(ind.level))}>{ind.levelAr}</span>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            <div className="mt-4 space-y-2">
              <TableTitle>التحليل الرقمي والوصفي لكل مادة</TableTitle>
              {[...indicators].sort((a, b) => b.above75Rate - a.above75Rate).map(ind => (
                <div key={ind.subjectCode} className="p-3 rounded-lg text-xs text-gray-700 leading-6"
                  style={{ background: levelColor(ind.level) + '0d', borderRight: `3px solid ${levelColor(ind.level)}` }}>
                  <span className={clsx('inline-block px-2 py-0.5 rounded border text-xs font-bold me-2', levelBg(ind.level))}>
                    {SUBJECT_LABELS[ind.subjectCode]?.ar ?? ind.subjectCode}
                  </span>
                  {genNarrativeSubject(ind, subjectStats[ind.subjectCode])}
                </div>
              ))}
            </div>
          </SubSection>

          {/* By grade */}
          <SubSection title="ب) مستوى الصفوف — مقارنة الإنجاز">
            <TableTitle>جدول مقارنة الإنجاز حسب الصف — مستوى المدرسة</TableTitle>
            <div className="overflow-x-auto mb-4">
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr style={{ background: C.primary + '15' }}>
                    <th className="border px-3 py-2 text-start font-bold" style={{ color: C.primary }}>الصف</th>
                    <th className="border px-2 py-2 text-center">الطلاب</th>
                    <th className="border px-2 py-2 text-center">المتوسط</th>
                    <th className="border px-2 py-2 text-center">نسبة النجاح</th>
                    <th className="border px-2 py-2 text-center">فوق 75%</th>
                    <th className="border px-2 py-2 text-center">المستوى</th>
                  </tr>
                </thead>
                <tbody>
                  {gradeIndicators.map((gi, i) => (
                    <tr key={gi.grade} style={{ background: i % 2 === 0 ? 'white' : '#f9fafb' }}>
                      <td className="border px-3 py-2 font-semibold">الصف {gi.grade}</td>
                      <td className="border px-2 py-2 text-center">{gi.count}</td>
                      <td className="border px-2 py-2 text-center font-semibold">{gi.mean}%</td>
                      <td className="border px-2 py-2 text-center font-semibold" style={{ color: gi.passRate >= 75 ? C.excellent : C.below }}>
                        {gi.passRate}%
                      </td>
                      <td className="border px-2 py-2 text-center font-bold" style={{ color: levelColor(gi.gradeLevel.level) }}>
                        {gi.above75Rate}%
                      </td>
                      <td className="border px-2 py-2 text-center">
                        <span className={clsx('px-2 py-0.5 rounded text-xs border font-semibold', levelBg(gi.gradeLevel.level))}>{gi.gradeLevel.ar}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {gradeIndicators.map(gi => {
              const secData = gradeSectionByGrade.find(g => g.grade === gi.grade)?.sections ?? []
              return (
              <div key={gi.grade} className="mb-6">
                <p className="text-xs font-semibold mb-2" style={{ color: C.primary }}>الصف {gi.grade} — تفاصيل المواد</p>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs border-collapse">
                    <thead>
                      <tr style={{ background: '#f3f4f6' }}>
                        <th className="border px-2 py-1.5 text-start">المادة</th>
                        <th className="border px-2 py-1.5 text-center">الطلاب</th>
                        <th className="border px-2 py-1.5 text-center">المتوسط</th>
                        <th className="border px-2 py-1.5 text-center">نجاح%</th>
                        <th className="border px-2 py-1.5 text-center">≥75%</th>
                        <th className="border px-2 py-1.5 text-center">المستوى</th>
                      </tr>
                    </thead>
                    <tbody>
                      {gi.inds.sort((a, b) => b.above75Rate - a.above75Rate).map((ind, idx) => (
                        <tr key={ind.subjectCode} style={{ background: idx % 2 === 0 ? 'white' : '#f9fafb' }}>
                          <td className="border px-2 py-1.5 font-medium">{SUBJECT_LABELS[ind.subjectCode]?.ar ?? ind.subjectCode}</td>
                          <td className="border px-2 py-1.5 text-center">{ind.totalStudents}</td>
                          <td className="border px-2 py-1.5 text-center">{round2(subjectStats[ind.subjectCode]?.mean ?? 0)}</td>
                          <td className="border px-2 py-1.5 text-center" style={{ color: C.excellent }}>{round2(ind.passRate)}%</td>
                          <td className="border px-2 py-1.5 text-center font-bold" style={{ color: levelColor(ind.level) }}>{ind.above75Rate}%</td>
                          <td className="border px-2 py-1.5 text-center">
                            <span className={clsx('px-1.5 py-0.5 rounded text-xs border font-semibold', levelBg(ind.level))}>{ind.levelAr}</span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Per-subject descriptive narrative */}
                <div className="mt-3 space-y-1.5">
                  {gi.inds.sort((a, b) => b.above75Rate - a.above75Rate).map(ind => (
                    <p key={ind.subjectCode} className="text-xs text-gray-700 leading-6 px-3 py-1.5 rounded"
                      style={{ background: levelColor(ind.level) + '12', borderRight: `3px solid ${levelColor(ind.level)}` }}>
                      {genGradeSubjectNarrative(ind, subjectStats[ind.subjectCode], gi.grade)}
                    </p>
                  ))}
                </div>

                {/* Section charts: pass rate & above 75% per subject per section */}
                {secData.length > 0 && (
                  <div className="mt-3">
                    <p className="text-xs font-semibold mb-2" style={{ color: C.primary }}>
                      الصف {gi.grade} — نسبة النجاح وفوق 75% لكل مادة حسب الشعبة
                    </p>
                    <div className="grid grid-cols-3 gap-3">
                      {secData.map(({ section, count, subjectData }) => (
                        <div key={section} className="border rounded-lg p-2">
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-xs font-bold" style={{ color: C.primary }}>الشعبة {section}</span>
                            <span className="text-[10px] text-gray-400">{count} طالب</span>
                          </div>
                          {subjectData.length > 0 ? (
                            <ResponsiveContainer width="100%" height={170}>
                              <BarChart data={subjectData} margin={{ top: 4, right: 4, left: -24, bottom: 36 }}>
                                <CartesianGrid strokeDasharray="3 3" opacity={0.2} vertical={false} />
                                <XAxis dataKey="name" tick={{ fontSize: 8 }} angle={-35} textAnchor="end" interval={0} />
                                <YAxis domain={[0, 100]} tick={{ fontSize: 8 }} tickFormatter={v => `${v}%`} />
                                <Tooltip formatter={(v: number) => `${v}%`} />
                                <Legend wrapperStyle={{ fontSize: 8 }} />
                                <ReferenceLine y={75} stroke="#d97706" strokeDasharray="3 3" />
                                <Bar dataKey="نسبة النجاح" fill="#3b82f6" radius={[2, 2, 0, 0]} />
                                <Bar dataKey="فوق 75%" fill="#16a34a" radius={[2, 2, 0, 0]} />
                              </BarChart>
                            </ResponsiveContainer>
                          ) : (
                            <p className="text-[10px] text-gray-400 text-center py-6">لا توجد بيانات</p>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )
})}
          </SubSection>
        </Section>

        <div className="print-break" />

        {/* ═══════════════════════════════════════════════════
            SECTION 3 — STANDARD 1.2: PROGRESS TRACKING
        ═══════════════════════════════════════════════════ */}
        <Section num={3} title="المعيار 1.2 — تتبع التقدم" subtitle="متابعة تقدم الطلاب عبر السنوات والفصول الدراسية">

          {/* Part 1: Multi-year */}
          <SubSection title="الجزء 1 — المقارنة متعددة السنوات">
            {years.length >= 2 ? (
              <>
                <div className="mb-4">
                  <ChartTitle>مخطط الاتجاه — متوسط المدرسة عبر السنوات الدراسية</ChartTitle>
                  <ResponsiveContainer width="100%" height={200}>
                    <LineChart data={schoolTrend} margin={{ top: 5, right: 20, left: 0, bottom: 60 }}>
                      <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                      <XAxis dataKey="label" tick={{ fontSize: 10 }} angle={-40} textAnchor="end" interval={0} />
                      <YAxis domain={[40, 100]} tick={{ fontSize: 11 }} />
                      <Tooltip formatter={(v: number) => v?.toFixed(1)} />
                      <Legend wrapperStyle={{ fontSize: 11 }} />
                      <ReferenceLine y={75} stroke="#22c55e" strokeDasharray="4 4" label={{ value: '75', position: 'right', fontSize: 10 }} />
                      <Line type="monotone" dataKey="mean" name="المتوسط" stroke="#6366f1" strokeWidth={2} dot connectNulls />
                      <Line type="monotone" dataKey="above75Rate" name="% فوق 75" stroke="#22c55e" strokeWidth={2} dot connectNulls />
                      <Line type="monotone" dataKey="passRate" name="% نجاح" stroke="#f59e0b" strokeWidth={2} dot connectNulls />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
                <TableTitle>جدول الإحصاءات السنوية — مستوى المدرسة (متعدد السنوات)</TableTitle>
                <div className="overflow-x-auto mb-4">
                  <table className="w-full text-xs border-collapse">
                    <thead>
                      <tr style={{ background: C.primary + '15' }}>
                        <th className="border px-3 py-2 text-start font-bold" style={{ color: C.primary }}>الفصل</th>
                        <th className="border px-2 py-2 text-center">عدد</th>
                        <th className="border px-2 py-2 text-center">المتوسط</th>
                        <th className="border px-2 py-2 text-center">الانحراف</th>
                        <th className="border px-2 py-2 text-center">% 75+</th>
                        <th className="border px-2 py-2 text-center">% 90+</th>
                        <th className="border px-2 py-2 text-center">% نجاح</th>
                      </tr>
                    </thead>
                    <tbody>
                      {schoolTrend.map((pt, i) => (
                        <tr key={i} style={{ background: i % 2 === 0 ? 'white' : '#f9fafb' }}>
                          <td className="border px-3 py-2 font-medium">{pt.label}</td>
                          <td className="border px-2 py-2 text-center">{pt.count}</td>
                          <td className="border px-2 py-2 text-center">{pt.mean?.toFixed(1) ?? '—'}</td>
                          <td className="border px-2 py-2 text-center">{pt.stdDev?.toFixed(1) ?? '—'}</td>
                          <td className="border px-2 py-2 text-center">{pt.above75Rate?.toFixed(1) ?? '—'}%</td>
                          <td className="border px-2 py-2 text-center">{pt.above90Rate?.toFixed(1) ?? '—'}%</td>
                          <td className="border px-2 py-2 text-center">{pt.passRate?.toFixed(1) ?? '—'}%</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <TableTitle>جدول تطور متوسط كل مادة عبر السنوات الدراسية</TableTitle>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs border-collapse">
                    <thead>
                      <tr style={{ background: C.primary + '15' }}>
                        <th className="border px-3 py-2 text-start font-bold" style={{ color: C.primary }}>المادة</th>
                        {years.map(y => <th key={y} className="border px-2 py-2 text-center">{y.slice(0, 9)}</th>)}
                        <th className="border px-2 py-2 text-center">التغيير</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[...multiYearSubjectAvgs.allCodes].sort((a, b) => {
                        const lastA = (multiYearSubjectAvgs.subjectAvgs[a] ?? []).filter(v => !isNaN(v)).slice(-1)[0] ?? 0
                        const lastB = (multiYearSubjectAvgs.subjectAvgs[b] ?? []).filter(v => !isNaN(v)).slice(-1)[0] ?? 0
                        return lastB - lastA
                      }).map((code, i) => {
                        const avgs = multiYearSubjectAvgs.subjectAvgs[code] ?? []
                        const valid = avgs.filter(v => !isNaN(v))
                        const diff = valid.length >= 2 ? round2(valid[valid.length - 1] - valid[0]) : null
                        return (
                          <tr key={code} style={{ background: i % 2 === 0 ? 'white' : '#f9fafb' }}>
                            <td className="border px-3 py-2 font-medium">{SUBJECT_LABELS[code]?.ar ?? code}</td>
                            {avgs.map((v, j) => (
                              <td key={j} className="border px-2 py-2 text-center font-semibold"
                                style={{ color: isNaN(v) ? '#9ca3af' : v >= 75 ? C.excellent : v >= 50 ? C.good : C.below }}>
                                {isNaN(v) ? '—' : `${v}%`}
                              </td>
                            ))}
                            <td className="border px-2 py-2 text-center font-bold"
                              style={{ color: diff === null ? '#9ca3af' : diff >= 0 ? C.excellent : C.below }}>
                              {diff === null ? '—' : diff >= 0 ? `▲ +${diff}%` : `▼ ${diff}%`}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
                <div className="mt-4 p-4 rounded-xl text-sm text-gray-700 leading-7" style={{ background: '#eff6ff', borderRight: `4px solid ${C.very_good}` }}>
                  <p className="font-semibold text-xs text-gray-500 mb-1">📝 التحليل الوصفي</p>
                  <p>{genNarrative12(years, multiYearSubjectAvgs.subjectAvgs as Record<SubjectCode, number[]>)}</p>
                </div>
              </>
            ) : (
              <p className="text-xs text-gray-400 p-4 bg-amber-50 rounded-lg">يلزم بيانات سنتين على الأقل لعرض هذا الجزء</p>
            )}
          </SubSection>

          <div className="print-break" />

          {/* Part 2: Within-year */}
          <SubSection title="الجزء 2 — التقدم داخل العام الدراسي (ف1 → ف2 → ف3)">
            {/* School within-year */}
            <SubLabel>أ) مستوى المدرسة — التقدم داخل العام (ف1 → ف2 → ف3)</SubLabel>
            <div className="grid grid-cols-3 gap-4 mb-4">
              {withinSchoolData.map(d => (
                <div key={d.sem} className="card p-4 text-center border rounded-xl">
                  <div className="text-sm text-gray-500 mb-1">{semLbl(d.sem)}</div>
                  <div className="text-3xl font-bold" style={{ color: C.primary }}>{d.mean?.toFixed(1) ?? '—'}</div>
                  <div className="text-xs text-gray-400 mt-1">{d.count} طالب</div>
                  <div className="text-xs mt-1 text-green-600">{d.above75Rate?.toFixed(1) ?? '—'}% فوق 75</div>
                </div>
              ))}
            </div>
            <div className="mb-4">
              <ChartTitle>مخطط تطور متوسط المدرسة داخل العام (ف1 → ف2 → ف3)</ChartTitle>
              <ResponsiveContainer width="100%" height={200}>
                <LineChart data={withinSchoolData.map(d => ({ sem: semLbl(d.sem), mean: d.mean, above75Rate: d.above75Rate }))} margin={{ top: 5, right: 20, left: 0, bottom: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                  <XAxis dataKey="sem" tick={{ fontSize: 12 }} />
                  <YAxis domain={[40, 100]} tick={{ fontSize: 11 }} />
                  <Tooltip formatter={(v: number) => v?.toFixed(1)} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <ReferenceLine y={75} stroke="#22c55e" strokeDasharray="4 4" />
                  <Line type="monotone" dataKey="mean" name="المتوسط" stroke="#6366f1" strokeWidth={2.5} dot={{ r: 5 }} />
                  <Line type="monotone" dataKey="above75Rate" name="% فوق 75" stroke="#22c55e" strokeWidth={2} dot={{ r: 4 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>

            {/* Subject within-year */}
            <SubLabel>ب) مستوى المواد — التقدم داخل العام حسب المادة</SubLabel>
            <TableTitle>جدول التقدم داخل العام — متوسط ونسبة ≥75% لكل مادة</TableTitle>
            <div className="overflow-x-auto mb-4">
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr style={{ background: C.primary + '15' }}>
                    <th className="border px-3 py-2 text-start font-bold" style={{ color: C.primary }}>المادة</th>
                    {[1, 2, 3].flatMap(sem => [
                      <th key={`${sem}-m`} className="border px-2 py-2 text-center" colSpan={2}>{semLbl(sem)}</th>,
                    ])}
                  </tr>
                  <tr style={{ background: '#f3f4f6' }} className="text-gray-500">
                    <th className="border px-3 py-1"></th>
                    {[1, 2, 3].flatMap(sem => [
                      <th key={`${sem}-m`} className="border px-2 py-1 text-center">متوسط</th>,
                      <th key={`${sem}-p`} className="border px-2 py-1 text-center">%75+</th>,
                    ])}
                  </tr>
                </thead>
                <tbody>
                  {withinSubjectData.map(({ subj, cells }, i) => {
                    const diffs = cells.map((c, idx) => idx === 0 ? null : (c && cells[idx - 1] ? (c.mean - cells[idx - 1]!.mean) : null))
                    return (
                      <tr key={subj} style={{ background: i % 2 === 0 ? 'white' : '#f9fafb' }}>
                        <td className="border px-3 py-2 font-medium">{SUBJECT_LABELS[subj as SubjectCode]?.ar}</td>
                        {cells.flatMap((cell, idx) => [
                          <td key={`${String(idx)}-m`} className="border px-2 py-2 text-center">
                            <span>{cell?.mean.toFixed(1) ?? '—'}</span>
                            {diffs[idx] !== null && (
                              <span className={`ms-1 text-xs ${(diffs[idx] ?? 0) >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                                {(diffs[idx] ?? 0) >= 0 ? '▲' : '▼'}{Math.abs(diffs[idx] ?? 0).toFixed(1)}
                              </span>
                            )}
                          </td>,
                          <td key={`${String(idx)}-p`} className="border px-2 py-2 text-center text-gray-500">{cell?.above75Rate.toFixed(0) ?? '—'}%</td>,
                        ])}
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            {/* Subject within-year detailed narrative */}
            {withinSubjectData.length > 0 && (
              <div className="mt-4 p-4 rounded-xl text-sm text-gray-700 leading-7" style={{ background: '#f0fdf4', borderRight: '4px solid #16a34a', whiteSpace: 'pre-line' }}>
                <p className="font-semibold text-xs text-gray-500 mb-2">📝 التحليل الوصفي — التقدم داخل العام على مستوى المواد</p>
                <p>{genWithinSubjectDetailedNarrative(withinSubjectData)}</p>
              </div>
            )}

            {/* Grade within-year */}
            <SubLabel>ج) مستوى الصفوف — التقدم داخل العام حسب الصف</SubLabel>
            <TableTitle>جدول التقدم داخل العام — متوسط ونسبة ≥75% لكل صف</TableTitle>
            <div className="overflow-x-auto">
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr style={{ background: C.primary + '15' }}>
                    <th className="border px-3 py-2 text-start font-bold" style={{ color: C.primary }}>الصف</th>
                    {[1, 2, 3].flatMap(sem => [
                      <th key={`${sem}-h`} className="border px-2 py-2 text-center" colSpan={2}>{semLbl(sem)}</th>,
                    ])}
                  </tr>
                  <tr style={{ background: '#f3f4f6' }} className="text-gray-500">
                    <th className="border px-3 py-1"></th>
                    {[1, 2, 3].flatMap(sem => [
                      <th key={`${sem}-m`} className="border px-2 py-1 text-center">متوسط</th>,
                      <th key={`${sem}-p`} className="border px-2 py-1 text-center">%75+</th>,
                    ])}
                  </tr>
                </thead>
                <tbody>
                  {grades.map((grade, i) => (
                    <tr key={grade} style={{ background: i % 2 === 0 ? 'white' : '#f9fafb' }}>
                      <td className="border px-3 py-2 font-medium">الصف {grade}</td>
                      {withinGradeData.flatMap(({ sem, stats }) => {
                        const gs = stats.find(s => s.grade === grade)
                        return [
                          <td key={`${sem}-m`} className="border px-2 py-2 text-center">{gs ? gs.mean.toFixed(1) : '—'}</td>,
                          <td key={`${sem}-p`} className="border px-2 py-2 text-center text-gray-500">{gs ? `${gs.above75Rate.toFixed(0)}%` : '—'}</td>,
                        ]
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Grade within-year detailed narrative */}
            {withinGradeData.length > 0 && (
              <div className="mt-4 p-4 rounded-xl text-sm text-gray-700 leading-7" style={{ background: '#fefce8', borderRight: '4px solid #ca8a04', whiteSpace: 'pre-line' }}>
                <p className="font-semibold text-xs text-gray-500 mb-2">📝 التحليل الوصفي — التقدم داخل العام على مستوى الصفوف</p>
                <p>{genWithinGradeDetailedNarrative(withinGradeData, grades)}</p>
              </div>
            )}

            {/* School within-year narrative */}
            {withinSchoolData.length > 0 && (
              <div className="mt-4 p-4 rounded-xl text-sm text-gray-700 leading-7" style={{ background: '#f0fdf4', borderRight: '4px solid #22c55e', whiteSpace: 'pre-line' }}>
                <p className="font-semibold text-xs text-gray-500 mb-2">📝 التحليل الوصفي — التقدم داخل العام على مستوى المدرسة</p>
                <p>{genWithinYearNarrative(withinSchoolData)}</p>
              </div>
            )}
          </SubSection>

          <div className="print-break" />

          {/* Part 3: Progress rates */}
          <SubSection title="الجزء 3 — نسب التقدم والتراجع">
            {schoolLevelProgress.length > 0 || (progressRates.length > 0 && progressRates[0].transitions.length > 0) ? (
              <>
                <SubLabel>أ) نسب التقدم والتراجع بين السنوات — مستوى المدرسة (طلاب فريدون)</SubLabel>
                {schoolLevelProgress.map(slp => (
                  <div key={slp.yearFrom} className="mb-4 p-4 border rounded-xl">
                    <div className="text-sm font-semibold mb-3">{slp.yearFrom} → {slp.yearTo}</div>
                    <div className="grid grid-cols-3 gap-3">
                      <div className="bg-green-50 rounded-lg p-3 text-center">
                        <div className="text-xs text-gray-500 mb-1">تقدموا</div>
                        <div className="text-2xl font-bold text-green-600">{slp.total > 0 ? ((slp.improved / slp.total) * 100).toFixed(1) : '0'}%</div>
                        <div className="text-xs text-gray-400">{slp.improved} من {slp.total} طالب</div>
                      </div>
                      <div className="bg-gray-50 rounded-lg p-3 text-center">
                        <div className="text-xs text-gray-500 mb-1">مستقرون</div>
                        <div className="text-2xl font-bold text-gray-500">{slp.total > 0 ? ((slp.stable / slp.total) * 100).toFixed(1) : '0'}%</div>
                        <div className="text-xs text-gray-400">{slp.stable} من {slp.total} طالب</div>
                      </div>
                      <div className="bg-red-50 rounded-lg p-3 text-center">
                        <div className="text-xs text-gray-500 mb-1">تراجعوا</div>
                        <div className="text-2xl font-bold text-red-500">{slp.total > 0 ? ((slp.regressed / slp.total) * 100).toFixed(1) : '0'}%</div>
                        <div className="text-xs text-gray-400">{slp.regressed} من {slp.total} طالب</div>
                      </div>
                    </div>
                  </div>
                ))}

                <SubLabel>ب) نسب التقدم والتراجع بين السنوات — حسب المادة (% من إجمالي طلاب المدرسة)</SubLabel>
                {(progressRates[0]?.transitions ?? []).map(t => {
                  const slp = schoolLevelProgress.find(s => s.yearFrom === t.yearFrom && s.yearTo === t.yearTo)
                  const schoolTotal = slp?.totalFrom ?? 1
                  return (
                    <div key={t.yearFrom} className="mb-4">
                      <TableTitle>جدول نسب التقدم — {t.yearFrom} إلى {t.yearTo} — حسب المادة</TableTitle>
                      <div className="overflow-x-auto">
                        <table className="w-full text-xs border-collapse">
                          <thead>
                            <tr style={{ background: '#f3f4f6' }}>
                              <th className="border px-3 py-2 text-start">المادة</th>
                              <th className="border px-2 py-2 text-center">المقارَنون</th>
                              <th className="border px-2 py-2 text-center text-green-600">تقدموا % من الكل</th>
                              <th className="border px-2 py-2 text-center text-gray-400">مستقرون</th>
                              <th className="border px-2 py-2 text-center text-red-500">تراجعوا % من الكل</th>
                              <th className="border px-2 py-2 text-center">معدل التغير</th>
                            </tr>
                          </thead>
                          <tbody>
                            {progressRates.map((sp, i) => {
                              const tr = sp.transitions.find(x => x.yearFrom === t.yearFrom && x.yearTo === t.yearTo)
                              if (!tr || tr.total === 0) return null
                              return (
                                <tr key={sp.subject} style={{ background: i % 2 === 0 ? 'white' : '#f9fafb' }}>
                                  <td className="border px-3 py-2 font-medium">{sp.subjectNameAr}</td>
                                  <td className="border px-2 py-2 text-center text-gray-500">{tr.total}</td>
                                  <td className="border px-2 py-2 text-center">
                                    <span className="text-green-600 font-semibold">{((tr.improved / schoolTotal) * 100).toFixed(1)}%</span>
                                    <span className="text-xs text-gray-400 ms-1">({tr.improved})</span>
                                  </td>
                                  <td className="border px-2 py-2 text-center text-gray-400">{tr.stable}</td>
                                  <td className="border px-2 py-2 text-center">
                                    <span className="text-red-500 font-semibold">{((tr.regressed / schoolTotal) * 100).toFixed(1)}%</span>
                                    <span className="text-xs text-gray-400 ms-1">({tr.regressed})</span>
                                  </td>
                                  <td className={`border px-2 py-2 text-center font-semibold ${(tr.meanDiff ?? 0) >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                                    {tr.meanDiff !== null ? `${tr.meanDiff >= 0 ? '+' : ''}${tr.meanDiff.toFixed(2)}` : '—'}
                                  </td>
                                </tr>
                              )
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )
                })}
              </>
            ) : (
              <p className="text-xs text-gray-400 p-4 bg-amber-50 rounded-lg">يلزم بيانات سنتين على الأقل لحساب نسب التقدم</p>
            )}

            {progressRates[0]?.withinYear && (
              <>
                <SubLabel>ج) نسب التقدم داخل العام — حسب المادة (ف1→ف2→ف3)</SubLabel>
                <TableTitle>جدول التقدم داخل العام حسب المادة (تقدم / ثبات / تراجع)</TableTitle>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs border-collapse">
                    <thead>
                      <tr style={{ background: C.primary + '15' }}>
                        <th className="border px-3 py-2 text-start font-bold" style={{ color: C.primary }}>المادة</th>
                        <th className="border px-2 py-2 text-center" colSpan={2}>ف1 → ف2</th>
                        <th className="border px-2 py-2 text-center" colSpan={2}>ف2 → ف3</th>
                        <th className="border px-2 py-2 text-center" colSpan={2}>ف1 → ف3</th>
                        <th className="border px-2 py-2 text-center">متوسط الفرق</th>
                      </tr>
                      <tr style={{ background: '#f3f4f6' }} className="text-gray-500">
                        <th className="border px-3 py-1"></th>
                        <th className="border px-2 py-1 text-green-600">تقدم</th>
                        <th className="border px-2 py-1 text-red-500">تراجع</th>
                        <th className="border px-2 py-1 text-green-600">تقدم</th>
                        <th className="border px-2 py-1 text-red-500">تراجع</th>
                        <th className="border px-2 py-1 text-green-600">تقدم</th>
                        <th className="border px-2 py-1 text-red-500">تراجع</th>
                        <th className="border px-2 py-1">(ف1→ف3)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {progressRates.map((sp, i) => {
                        const wy = sp.withinYear
                        if (!wy || wy.s1ToS3.total === 0) return null
                        return (
                          <tr key={sp.subject} style={{ background: i % 2 === 0 ? 'white' : '#f9fafb' }}>
                            <td className="border px-3 py-2 font-medium">{sp.subjectNameAr}</td>
                            <td className="border px-2 py-2 text-center text-green-600 font-semibold">
                              {wy.s1ToS2.improved}{wy.s1ToS2.total > 0 && <span className="text-xs text-gray-400 ms-1">({((wy.s1ToS2.improved / wy.s1ToS2.total) * 100).toFixed(0)}%)</span>}
                            </td>
                            <td className="border px-2 py-2 text-center text-red-500 font-semibold">
                              {wy.s1ToS2.regressed}{wy.s1ToS2.total > 0 && <span className="text-xs text-gray-400 ms-1">({((wy.s1ToS2.regressed / wy.s1ToS2.total) * 100).toFixed(0)}%)</span>}
                            </td>
                            <td className="border px-2 py-2 text-center text-green-600 font-semibold">
                              {wy.s2ToS3.improved}{wy.s2ToS3.total > 0 && <span className="text-xs text-gray-400 ms-1">({((wy.s2ToS3.improved / wy.s2ToS3.total) * 100).toFixed(0)}%)</span>}
                            </td>
                            <td className="border px-2 py-2 text-center text-red-500 font-semibold">
                              {wy.s2ToS3.regressed}{wy.s2ToS3.total > 0 && <span className="text-xs text-gray-400 ms-1">({((wy.s2ToS3.regressed / wy.s2ToS3.total) * 100).toFixed(0)}%)</span>}
                            </td>
                            <td className="border px-2 py-2 text-center text-green-600 font-semibold">
                              {wy.s1ToS3.improved}{wy.s1ToS3.total > 0 && <span className="text-xs text-gray-400 ms-1">({((wy.s1ToS3.improved / wy.s1ToS3.total) * 100).toFixed(0)}%)</span>}
                            </td>
                            <td className="border px-2 py-2 text-center text-red-500 font-semibold">
                              {wy.s1ToS3.regressed}{wy.s1ToS3.total > 0 && <span className="text-xs text-gray-400 ms-1">({((wy.s1ToS3.regressed / wy.s1ToS3.total) * 100).toFixed(0)}%)</span>}
                            </td>
                            <td className={`border px-2 py-2 text-center font-semibold ${(wy.meanS1S3Diff ?? 0) >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                              {wy.meanS1S3Diff !== null ? `${wy.meanS1S3Diff >= 0 ? '+' : ''}${wy.meanS1S3Diff.toFixed(2)}` : '—'}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </SubSection>
        </Section>

        <div className="print-break" />

        {/* ═══════════════════════════════════════════════════
            SECTION 4 — STANDARD 1.3: GAP ANALYSIS
        ═══════════════════════════════════════════════════ */}
        <Section num={4} title="المعيار 1.3 — تحليل الفجوات" subtitle={`عام ${yearId} — الفجوة بين التقويم التكويني والاختبار والفجوة بين الفصول`}>

          {/* Part 1: Formative vs Exam — S1 */}
          <SubSection title="الجزء 1 — التقويم التكويني مقابل الاختبار (الفصل الأول)">
            {allFormativeGapsS1.length > 0 ? (
              <>
                <div className="mb-4">
                  <ChartTitle>مقارنة متوسط التكويني مقابل الاختبار /100 — الفصل الأول</ChartTitle>
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart
                      data={allFormativeGapsS1.map(g => ({
                        name: subjectName(g.subjectCode),
                        'التكويني /100': g.avgFormative ?? 0,
                        'الاختبار /100': g.avgExam ?? 0,
                      }))}
                      margin={{ top: 5, right: 20, left: 0, bottom: 40 }}>
                      <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                      <XAxis dataKey="name" tick={{ fontSize: 10 }} angle={-35} textAnchor="end" interval={0} />
                      <YAxis tick={{ fontSize: 11 }} domain={[0, 100]} />
                      <Tooltip formatter={(v: number) => `${v.toFixed(1)}`} />
                      <Legend wrapperStyle={{ fontSize: 11 }} />
                      <Bar dataKey="التكويني /100" fill="#6366f1" radius={[3, 3, 0, 0]} />
                      <Bar dataKey="الاختبار /100" fill="#22c55e" radius={[3, 3, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                <TableTitle>جدول الفجوة — التكويني مقابل الاختبار — مستوى المادة (الفصل الأول)</TableTitle>
                <div className="overflow-x-auto mb-4">
                  <table className="w-full text-xs border-collapse">
                    <thead>
                      <tr style={{ background: C.primary + '15' }}>
                        <th className="border px-3 py-2 text-start font-bold" style={{ color: C.primary }}>المادة</th>
                        <th className="border px-3 py-2 text-center">متوسط التكويني /100</th>
                        <th className="border px-3 py-2 text-center">متوسط الاختبار /100</th>
                        <th className="border px-3 py-2 text-center">الفجوة %</th>
                        <th className="border px-3 py-2 text-center">اختبار أعلى</th>
                        <th className="border px-3 py-2 text-center">اختبار أقل</th>
                      </tr>
                    </thead>
                    <tbody>
                      {allFormativeGapsS1.map((g, i) => (
                        <tr key={g.subjectCode} style={{ background: i % 2 === 0 ? 'white' : '#f9fafb' }}>
                          <td className="border px-3 py-2 font-medium">{subjectName(g.subjectCode)}</td>
                          <td className="border px-3 py-2 text-center">{g.avgFormative?.toFixed(1) ?? '—'}</td>
                          <td className="border px-3 py-2 text-center">{g.avgExam?.toFixed(1) ?? '—'}</td>
                          <td className="border px-3 py-2"><GapBar value={g.gap} /></td>
                          <td className="border px-3 py-2 text-center text-green-600 font-semibold">{g.studentsExamHigher}</td>
                          <td className="border px-3 py-2 text-center text-red-600 font-semibold">{g.studentsExamLower}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <SubLabel>تفاصيل حسب الصف — التكويني مقابل الاختبار (الفصل الأول)</SubLabel>
                {gradeFormativeGapsS1.map(({ grade, gaps }) => (
                  gaps.length > 0 && (
                    <div key={grade} className="mb-3 p-3 border rounded-lg">
                      <p className="text-xs font-semibold mb-2" style={{ color: C.primary }}>الصف {grade}</p>
                      <div className="overflow-x-auto">
                        <table className="w-full text-xs border-collapse">
                          <thead>
                            <tr style={{ background: '#f3f4f6' }}>
                              <th className="border px-2 py-1.5 text-start">المادة</th>
                              <th className="border px-2 py-1.5 text-center">تكويني /100</th>
                              <th className="border px-2 py-1.5 text-center">اختبار /100</th>
                              <th className="border px-2 py-1.5 text-center">فجوة %</th>
                            </tr>
                          </thead>
                          <tbody>
                            {gaps.map((g, i) => (
                              <tr key={g.subjectCode} style={{ background: i % 2 === 0 ? 'white' : '#f9fafb' }}>
                                <td className="border px-2 py-1.5">{subjectName(g.subjectCode)}</td>
                                <td className="border px-2 py-1.5 text-center">{g.avgFormative?.toFixed(1) ?? '—'}</td>
                                <td className="border px-2 py-1.5 text-center">{g.avgExam?.toFixed(1) ?? '—'}</td>
                                <td className="border px-2 py-1.5"><GapBar value={g.gap} /></td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )
                ))}
              {/* Formative gap S1 narrative */}
              <div className="mt-4 p-4 rounded-xl text-sm text-gray-700 leading-7" style={{ background: '#eff6ff', borderRight: '4px solid #6366f1', whiteSpace: 'pre-line' }}>
                <p className="font-semibold text-xs text-gray-500 mb-2">📝 التحليل الوصفي — التقويم التكويني مقابل الاختبار (ف1)</p>
                <p>{genFormativeGapNarrative(allFormativeGapsS1, 'الفصل الأول')}</p>
              </div>
              </>
            ) : (
              <p className="text-xs text-gray-400 p-4 bg-amber-50 rounded-lg">لا توجد بيانات تكويني / اختبار لهذا العام</p>
            )}
          </SubSection>

          {/* Part 1: Formative vs Exam — S3 */}
          {allFormativeGapsS3.length > 0 && (
            <SubSection title="الجزء 1 — التقويم التكويني مقابل الاختبار (الفصل الثالث)">
              <TableTitle>جدول الفجوة — التكويني مقابل الاختبار — مستوى المادة (الفصل الثالث)</TableTitle>
              <div className="overflow-x-auto mb-4">
                <table className="w-full text-xs border-collapse">
                  <thead>
                    <tr style={{ background: C.primary + '15' }}>
                      <th className="border px-3 py-2 text-start font-bold" style={{ color: C.primary }}>المادة</th>
                      <th className="border px-3 py-2 text-center">متوسط التكويني /100</th>
                      <th className="border px-3 py-2 text-center">متوسط الاختبار /100</th>
                      <th className="border px-3 py-2 text-center">الفجوة %</th>
                      <th className="border px-3 py-2 text-center">اختبار أعلى</th>
                      <th className="border px-3 py-2 text-center">اختبار أقل</th>
                    </tr>
                  </thead>
                  <tbody>
                    {allFormativeGapsS3.map((g, i) => (
                      <tr key={g.subjectCode} style={{ background: i % 2 === 0 ? 'white' : '#f9fafb' }}>
                        <td className="border px-3 py-2 font-medium">{subjectName(g.subjectCode)}</td>
                        <td className="border px-3 py-2 text-center">{g.avgFormative?.toFixed(1) ?? '—'}</td>
                        <td className="border px-3 py-2 text-center">{g.avgExam?.toFixed(1) ?? '—'}</td>
                        <td className="border px-3 py-2"><GapBar value={g.gap} /></td>
                        <td className="border px-3 py-2 text-center text-green-600 font-semibold">{g.studentsExamHigher}</td>
                        <td className="border px-3 py-2 text-center text-red-600 font-semibold">{g.studentsExamLower}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <SubLabel>تفاصيل حسب الصف — التكويني مقابل الاختبار (الفصل الثالث)</SubLabel>
              {gradeFormativeGapsS3.map(({ grade, gaps }) => (
                gaps.length > 0 && (
                  <div key={grade} className="mb-3 p-3 border rounded-lg">
                    <p className="text-xs font-semibold mb-2" style={{ color: C.primary }}>الصف {grade}</p>
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs border-collapse">
                        <thead>
                          <tr style={{ background: '#f3f4f6' }}>
                            <th className="border px-2 py-1.5 text-start">المادة</th>
                            <th className="border px-2 py-1.5 text-center">تكويني /100</th>
                            <th className="border px-2 py-1.5 text-center">اختبار /100</th>
                            <th className="border px-2 py-1.5 text-center">فجوة %</th>
                          </tr>
                        </thead>
                        <tbody>
                          {gaps.map((g, i) => (
                            <tr key={g.subjectCode} style={{ background: i % 2 === 0 ? 'white' : '#f9fafb' }}>
                              <td className="border px-2 py-1.5">{subjectName(g.subjectCode)}</td>
                              <td className="border px-2 py-1.5 text-center">{g.avgFormative?.toFixed(1) ?? '—'}</td>
                              <td className="border px-2 py-1.5 text-center">{g.avgExam?.toFixed(1) ?? '—'}</td>
                              <td className="border px-2 py-1.5"><GapBar value={g.gap} /></td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )
              ))}
              {/* Formative gap S3 narrative */}
              <div className="mt-4 p-4 rounded-xl text-sm text-gray-700 leading-7" style={{ background: '#eff6ff', borderRight: '4px solid #6366f1', whiteSpace: 'pre-line' }}>
                <p className="font-semibold text-xs text-gray-500 mb-2">📝 التحليل الوصفي — التقويم التكويني مقابل الاختبار (ف3)</p>
                <p>{genFormativeGapNarrative(allFormativeGapsS3, 'الفصل الثالث')}</p>
              </div>
            </SubSection>
          )}

          <div className="print-break" />

          {/* Part 2: Semester gaps */}
          <SubSection title="الجزء 2 — الفجوة بين الفصول الدراسية">
            {schoolSemSummary ? (
              <>
                <SubLabel>أ) ملخص الفجوة بين الفصول — مستوى المدرسة</SubLabel>
                <div className="grid grid-cols-3 gap-4 mb-4">
                  {[
                    { label: 'متوسط ف1 /100', value: schoolSemSummary.avgS1, color: 'text-blue-600' },
                    { label: 'متوسط ف2 /100', value: schoolSemSummary.avgS2, color: 'text-indigo-600' },
                    { label: 'متوسط ف3 /100', value: schoolSemSummary.avgS3, color: 'text-purple-600' },
                  ].map(({ label, value, color }) => (
                    <div key={label} className="card p-4 text-center border rounded-xl">
                      <div className="text-xs text-gray-500">{label}</div>
                      <div className={`text-2xl font-bold mt-1 ${color}`}>{value.toFixed(1)}</div>
                    </div>
                  ))}
                </div>
                <div className="grid grid-cols-3 gap-4 mb-4">
                  {[
                    { label: 'فجوة % ف1→ف2', value: schoolSemSummary.gapS1S2 },
                    { label: 'فجوة % ف2→ف3', value: schoolSemSummary.gapS2S3 },
                    { label: 'فجوة % ف1→ف3', value: schoolSemSummary.gapS1S3 },
                  ].map(({ label, value }) => (
                    <div key={label} className="card p-4 text-center border rounded-xl">
                      <div className="text-xs text-gray-500">{label}</div>
                      <div className={`text-2xl font-bold mt-1 ${value < 0 ? 'text-red-600' : 'text-green-600'}`}>
                        {value >= 0 ? '+' : ''}{value.toFixed(1)}%
                      </div>
                    </div>
                  ))}
                </div>

                {semGaps.length > 0 && (
                  <div className="mb-4">
                    <ChartTitle>مخطط متوسطات الفصول الدراسية حسب المادة (ف1 / ف2 / ف3)</ChartTitle>
                    <ResponsiveContainer width="100%" height={220}>
                      <BarChart
                        data={semGaps.filter(g => activeSubjects.includes(g.subjectCode)).map(g => ({
                          name: subjectName(g.subjectCode),
                          s1: g.avgS1 ?? 0, s2: g.avgS2 ?? 0, s3: g.avgS3 ?? 0,
                        }))}
                        margin={{ top: 5, right: 20, left: 0, bottom: 40 }}>
                        <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                        <XAxis dataKey="name" tick={{ fontSize: 10 }} angle={-35} textAnchor="end" interval={0} />
                        <YAxis domain={[40, 100]} tick={{ fontSize: 11 }} />
                        <Tooltip formatter={(v: number) => v.toFixed(1)} />
                        <Legend wrapperStyle={{ fontSize: 11 }} />
                        <Bar dataKey="s1" name="ف1" fill="#6366f1" radius={[2, 2, 0, 0]} />
                        <Bar dataKey="s2" name="ف2" fill="#8b5cf6" radius={[2, 2, 0, 0]} />
                        <Bar dataKey="s3" name="ف3" fill="#a855f7" radius={[2, 2, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}

                <SubLabel>ب) الفجوة بين الفصول — مستوى المادة</SubLabel>
                <TableTitle>جدول الفجوة بين الفصول — متوسط كل فصل والفجوة والأولوية (مستوى المادة)</TableTitle>
                <div className="overflow-x-auto mb-4">
                  <table className="w-full text-xs border-collapse">
                    <thead>
                      <tr style={{ background: C.primary + '15' }}>
                        <th className="border px-3 py-2 text-start font-bold" style={{ color: C.primary }}>المادة</th>
                        <th className="border px-3 py-2 text-center">ف1 /100</th>
                        <th className="border px-3 py-2 text-center">ف2 /100</th>
                        <th className="border px-3 py-2 text-center">ف3 /100</th>
                        <th className="border px-3 py-2 text-center">فجوة% ف1→ف2</th>
                        <th className="border px-3 py-2 text-center">فجوة% ف2→ف3</th>
                        <th className="border px-3 py-2 text-center">فجوة% ف1→ف3</th>
                        <th className="border px-3 py-2 text-center">أولوية</th>
                      </tr>
                    </thead>
                    <tbody>
                      {semGaps.filter(g => activeSubjects.includes(g.subjectCode)).map((g, i) => {
                        const pColors: Record<string, string> = { critical: 'text-red-700 bg-red-100', high: 'text-orange-700 bg-orange-100', medium: 'text-amber-700 bg-amber-100', low: 'text-yellow-700 bg-yellow-100', ok: 'text-green-700 bg-green-100' }
                        const pLabels: Record<string, string> = { critical: 'حرج', high: 'عالي', medium: 'متوسط', low: 'منخفض', ok: 'جيد' }
                        return (
                          <tr key={g.subjectCode} style={{ background: i % 2 === 0 ? 'white' : '#f9fafb' }}>
                            <td className="border px-3 py-2 font-medium">{subjectName(g.subjectCode)}</td>
                            <td className="border px-3 py-2 text-center">{g.avgS1?.toFixed(1) ?? '—'}</td>
                            <td className="border px-3 py-2 text-center">{g.avgS2?.toFixed(1) ?? '—'}</td>
                            <td className="border px-3 py-2 text-center">{g.avgS3?.toFixed(1) ?? '—'}</td>
                            <td className="border px-3 py-2"><GapBar value={g.gapS1S2} /></td>
                            <td className="border px-3 py-2"><GapBar value={g.gapS2S3} /></td>
                            <td className="border px-3 py-2"><GapBar value={g.gapS1S3} /></td>
                            <td className="border px-3 py-2 text-center">
                              <span className={`text-xs px-2 py-0.5 rounded font-medium ${pColors[g.priority] ?? ''}`}>{pLabels[g.priority] ?? g.priority}</span>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Semester gap detailed narrative */}
                <div className="mt-4 p-4 rounded-xl text-sm text-gray-700 leading-7" style={{ background: '#f5f3ff', borderRight: '4px solid #7c3aed', whiteSpace: 'pre-line' }}>
                  <p className="font-semibold text-xs text-gray-500 mb-2">📝 التحليل الوصفي — الفجوة بين الفصول الدراسية</p>
                  <p>{genSemGapDetailedNarrative(schoolSemSummary, semGaps.filter(g => activeSubjects.includes(g.subjectCode)))}</p>
                </div>

                <SubLabel>ج) الفجوة بين الفصول — مستوى الصف</SubLabel>
                {grades.map(grade => {
                  const gradeRecs = records.filter(r => r.grade === grade)
                  const gradeGaps = computeSemesterGaps(gradeRecs).filter(g => activeSubjects.includes(g.subjectCode))
                  if (gradeGaps.length === 0) return null
                  return (
                    <div key={grade} className="mb-3 p-3 border rounded-lg">
                      <p className="text-xs font-semibold mb-2" style={{ color: C.primary }}>الصف {grade}</p>
                      <div className="overflow-x-auto">
                        <table className="w-full text-xs border-collapse">
                          <thead>
                            <tr style={{ background: '#f3f4f6' }}>
                              <th className="border px-2 py-1.5 text-start">المادة</th>
                              <th className="border px-2 py-1.5 text-center">ف1 /100</th>
                              <th className="border px-2 py-1.5 text-center">ف2 /100</th>
                              <th className="border px-2 py-1.5 text-center">ف3 /100</th>
                              <th className="border px-2 py-1.5 text-center min-w-[120px]">فجوة% ف1→ف3</th>
                            </tr>
                          </thead>
                          <tbody>
                            {gradeGaps.map((g, idx) => (
                              <tr key={g.subjectCode} style={{ background: idx % 2 === 0 ? 'white' : '#f9fafb' }}>
                                <td className="border px-2 py-1.5 font-medium">{subjectName(g.subjectCode)}</td>
                                <td className="border px-2 py-1.5 text-center">{g.avgS1?.toFixed(1) ?? '—'}</td>
                                <td className="border px-2 py-1.5 text-center">{g.avgS2?.toFixed(1) ?? '—'}</td>
                                <td className="border px-2 py-1.5 text-center">{g.avgS3?.toFixed(1) ?? '—'}</td>
                                <td className="border px-2 py-1.5"><GapBar value={g.gapS1S3} /></td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )
                })}
              </>
            ) : (
              <p className="text-xs text-gray-400 p-4 bg-amber-50 rounded-lg">لا توجد بيانات فصلية</p>
            )}
          </SubSection>
        </Section>

        {/* ═══════════════════════════════════════════════════
            SECTION 5 — TERM PROGRESS (if data)
        ═══════════════════════════════════════════════════ */}
        {termRows.length > 0 && (
          <>
            <div className="print-break" />
            <Section num={5} title="متابعة تطور الأداء الفصلي" subtitle="مسار الأداء من التشخيصي حتى الفصل الثالث">
              <ChartTitle>مخطط تطور الأداء الفصلي — من التشخيصي حتى الفصل الثالث</ChartTitle>
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={termRows} margin={{ top: 5, right: 20, left: 0, bottom: 50 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" angle={-30} textAnchor="end" tick={{ fontSize: 10 }} interval={0} />
                  <YAxis domain={[0, 100]} tick={{ fontSize: 10 }} />
                  <Tooltip />
                  <Legend />
                  <ReferenceLine y={75} stroke={C.below} strokeDasharray="4 2" />
                  {termRows.some(r => r.diagnostic !== null) && <Bar dataKey="diagnostic" name="التشخيصي" fill="#6b7280" radius={[3, 3, 0, 0]} />}
                  {termRows.some(r => r.t1 !== null) && <Bar dataKey="t1" name="الفصل الأول" fill={C.very_good} radius={[3, 3, 0, 0]} />}
                  {termRows.some(r => r.t2 !== null) && <Bar dataKey="t2" name="الفصل الثاني" fill={C.good} radius={[3, 3, 0, 0]} />}
                  {termRows.some(r => r.t3 !== null) && <Bar dataKey="t3" name="الفصل الثالث" fill={C.excellent} radius={[3, 3, 0, 0]} />}
                </BarChart>
              </ResponsiveContainer>
              <div className="mt-4 overflow-x-auto">
                <TableTitle>جدول مسار الأداء من التشخيصي حتى الفصل الثالث — حسب المادة</TableTitle>
                <table className="w-full text-xs border-collapse">
                  <thead>
                    <tr style={{ background: C.primary + '15' }}>
                      <th className="border px-3 py-2 text-start font-bold" style={{ color: C.primary }}>المادة</th>
                      <th className="border px-2 py-2 text-center">التشخيصي</th>
                      <th className="border px-2 py-2 text-center">ف1</th>
                      <th className="border px-2 py-2 text-center">ف2</th>
                      <th className="border px-2 py-2 text-center">ف3</th>
                      <th className="border px-2 py-2 text-center">التغيير</th>
                    </tr>
                  </thead>
                  <tbody>
                    {termRows.map((r, i) => {
                      const vals = [r.diagnostic, r.t1, r.t2, r.t3].filter(v => v !== null) as number[]
                      const diff = vals.length >= 2 ? round2(vals[vals.length - 1] - vals[0]) : null
                      return (
                        <tr key={i} style={{ background: i % 2 === 0 ? 'white' : '#f9fafb' }}>
                          <td className="border px-3 py-2 font-semibold">{r.name}</td>
                          {[r.diagnostic, r.t1, r.t2, r.t3].map((v, ci) => (
                            <td key={ci} className="border px-2 py-2 text-center">
                              {v !== null
                                ? <span className={clsx('font-semibold', v >= 75 ? 'text-green-700' : v >= 50 ? 'text-amber-700' : 'text-red-700')}>{v}</span>
                                : <span className="text-gray-300">—</span>}
                            </td>
                          ))}
                          <td className="border px-2 py-2 text-center font-bold">
                            {diff !== null ? <span style={{ color: diff >= 0 ? C.excellent : C.below }}>{diff >= 0 ? `▲ +${diff}` : `▼ ${diff}`}</span> : '—'}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </Section>
          </>
        )}

        {/* ── FOOTER ─────────────────────────────────────────────── */}
        <div className="mt-8 pt-4 border-t text-xs text-gray-400 flex justify-between">
          <span>{schoolName} — {yearId}</span>
          <span>تحليل الإنجاز الدراسي | سري — للاستخدام الداخلي</span>
          <span>{today}</span>
        </div>

      </div>
    </div>
  )
}
