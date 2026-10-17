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
import type { Language, SubjectCode } from '@/types'
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

  const records = useMemo(() => dataStore.getRecordsByYear(yearId), [yearId])
  const diagScores = useMemo(() => dataStore.getDiagnosticScores(yearId), [yearId])
  const termScoresT1 = useMemo(() => dataStore.getTermScores(yearId, 1), [yearId])
  const termScoresT2 = useMemo(() => dataStore.getTermScores(yearId, 2), [yearId])
  const termScoresT3 = useMemo(() => dataStore.getTermScores(yearId, 3), [yearId])
  const formativeScores = useMemo(() => dataStore.getFormativeScores(yearId), [yearId])
  const examScores = useMemo(() => dataStore.getExamScores(yearId), [yearId])

  const semesterVal = semester === 'annual' ? 'annual' : (Number(semester) as 1 | 2 | 3)

  // ── Standard 1.1 data ──
  const indicators = useMemo(() => computeAchievementIndicators(records, semesterVal), [records, semesterVal])

  const subjectStats = useMemo(() => {
    const map: Record<string, ReturnType<typeof computeSubjectStats>> = {}
    for (const ind of indicators) {
      map[ind.subjectCode] = computeSubjectStats(records, ind.subjectCode, semesterVal, ind.cycle)
    }
    return map
  }, [records, indicators, semesterVal])

  const grades = useMemo(() => [...new Set(records.map(r => r.grade))].sort((a, b) => a - b), [records])

  const gradeIndicators = useMemo(() => {
    return grades.map(grade => {
      const gradeRecs = records.filter(r => r.grade === grade)
      const inds = computeAchievementIndicators(gradeRecs, semesterVal)
      const scores = gradeRecs.map(r => r.annualAvg).filter(v => v !== null) as number[]
      const mean = scores.length ? round2(scores.reduce((a, b) => a + b, 0) / scores.length) : 0
      const above75 = scores.filter(s => s >= 75).length
      const above75Rate = scores.length ? round2((above75 / scores.length) * 100) : 0
      return { grade, inds, mean, above75Rate, count: gradeRecs.length }
    })
  }, [grades, records, semesterVal])

  // ── Standard 1.2 data ──
  const allYearRecords = useMemo(() => years.map(y => ({ yearId: y, records: dataStore.getRecordsByYear(y) })), [years])
  const latestRecords = useMemo(() => dataStore.getRecordsByYear(yearId), [yearId])

  const schoolTrend = useMemo(() => computeSchoolTrendPoints(allYearRecords), [allYearRecords])

  const withinSchoolData = useMemo(() => {
    return [1, 2, 3].map(sem => {
      const avgs: number[] = []
      for (const r of latestRecords) {
        const scores: number[] = []
        for (const subj of ANALYSIS_SUBJECTS) {
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
  }, [latestRecords])

  const withinSubjectData = useMemo(() => {
    return ANALYSIS_SUBJECTS.map(subj => {
      const cells = [1, 2, 3].map(sem => {
        const scores: number[] = []
        for (const r of latestRecords) {
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
  }, [latestRecords])

  const withinGradeData = useMemo(() => [1, 2, 3].map(sem => ({ sem, stats: computeGradeStats(latestRecords, sem as 1 | 2 | 3) })), [latestRecords])

  const progressRates = useMemo(() => computeProgressRates(allYearRecords), [allYearRecords])

  const multiYearSubjectAvgs = useMemo(() => {
    const allCodes = [...new Set(years.flatMap(y => dataStore.getRecordsByYear(y).flatMap(r => Object.keys(r.grades) as SubjectCode[])))]
    const subjectAvgs: Record<string, number[]> = {}
    const chartRows = years.map(y => {
      const recs = dataStore.getRecordsByYear(y)
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
  }, [years])

  // ── Standard 1.3 data ──
  const allFormativeGapsS1 = useMemo(() => computeFormativeExamGaps(formativeScores, examScores, 1, undefined, records), [formativeScores, examScores, records])
  const allFormativeGapsS3 = useMemo(() => computeFormativeExamGaps(formativeScores, examScores, 3, undefined, records), [formativeScores, examScores, records])

  const gradeFormativeGapsS1 = useMemo(() => grades.map(grade => ({ grade, gaps: computeFormativeExamGaps(formativeScores, examScores, 1, grade, records) })), [formativeScores, examScores, grades, records])
  const gradeFormativeGapsS3 = useMemo(() => grades.map(grade => ({ grade, gaps: computeFormativeExamGaps(formativeScores, examScores, 3, grade, records) })), [formativeScores, examScores, grades, records])

  const semGaps = useMemo(() => computeSemesterGaps(records), [records])

  const schoolSemSummary = useMemo(() => {
    const valid = semGaps.filter(g => g.gapS1S3 !== null)
    if (valid.length === 0) return null
    const avgS1 = valid.reduce((a, b) => a + (b.avgS1 ?? 0), 0) / valid.length
    const avgS2 = valid.reduce((a, b) => a + (b.avgS2 ?? 0), 0) / valid.length
    const avgS3 = valid.reduce((a, b) => a + (b.avgS3 ?? 0), 0) / valid.length
    const avgAnnual = valid.filter(g => g.avgAnnual !== null).reduce((a, b) => a + (b.avgAnnual ?? 0), 0) / valid.length
    const gapS1S2 = avgAnnual !== 0 ? round2((avgS2 - avgS1) / avgAnnual * 100) : 0
    const gapS2S3 = avgAnnual !== 0 ? round2((avgS3 - avgS2) / avgAnnual * 100) : 0
    const gapS1S3 = avgAnnual !== 0 ? round2((avgS3 - avgS1) / avgAnnual * 100) : 0
    return { avgS1, avgS2, avgS3, gapS1S2, gapS2S3, gapS1S3 }
  }, [semGaps])

  // ── Term progress data ──
  const termRows = useMemo(() => {
    const allCodes = [...new Set([
      ...diagScores.map(s => s.subjectCode),
      ...termScoresT1.map(s => s.subjectCode),
      ...termScoresT2.map(s => s.subjectCode),
      ...termScoresT3.map(s => s.subjectCode),
    ])] as SubjectCode[]
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
  }, [diagScores, termScoresT1, termScoresT2, termScoresT3])

  // ── Overview stats ──
  const totals = useMemo(() => {
    const n = records.length
    const passCount = records.filter(r => r.status === 'pass').length
    const failCount = records.filter(r => r.status === 'fail').length
    const scores = records.map(r => r.annualAvg).filter(v => v !== null) as number[]
    const above75 = scores.filter(s => s >= 75).length
    const avg = scores.length ? round2(scores.reduce((a, b) => a + b, 0) / scores.length) : 0
    return {
      total: n,
      passRate: n ? round2((passCount / n) * 100) : 0,
      failRate: n ? round2((failCount / n) * 100) : 0,
      above75Rate: scores.length ? round2((above75 / scores.length) * 100) : 0,
      avg,
      schoolLevel: (() => {
        const r75 = scores.length ? (above75 / scores.length) * 100 : 0
        const pr = n ? (passCount / n) * 100 : 0
        if (pr < 75) return { ar: 'ضعيف', level: 'weak' }
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
          <label className="label">{ar ? 'اسم المدرسة' : 'School Name'}</label>
          <input className="input w-56" value={schoolName} onChange={e => setSchoolName(e.target.value)} />
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
                      <td className="border px-2 py-2 text-center font-bold" style={{ color: gi.above75Rate >= 60 ? C.excellent : gi.above75Rate >= 40 ? C.good : C.below }}>
                        {gi.above75Rate}%
                      </td>
                      <td className="border px-2 py-2 text-center">
                        {gi.inds.length > 0 && (() => {
                          const avgR = round2(gi.inds.reduce((s, x) => s + x.above75Rate, 0) / gi.inds.length)
                          const lvl = avgR >= 70 ? 'excellent' : avgR >= 60 ? 'very_good' : avgR >= 50 ? 'good' : avgR >= 40 ? 'acceptable' : 'weak'
                          const lbls: Record<string, string> = { excellent: 'ممتاز', very_good: 'جيد جداً', good: 'جيد', acceptable: 'مقبول', weak: 'ضعيف' }
                          return <span className={clsx('px-2 py-0.5 rounded text-xs border font-semibold', levelBg(lvl))}>{lbls[lvl]}</span>
                        })()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {gradeIndicators.map(gi => (
              <div key={gi.grade} className="mb-4">
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
              </div>
            ))}
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
                      {multiYearSubjectAvgs.allCodes.map((code, i) => {
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
          </SubSection>

          <div className="print-break" />

          {/* Part 3: Progress rates */}
          <SubSection title="الجزء 3 — نسب التقدم والتراجع">
            {progressRates.length > 0 && progressRates[0].transitions.length > 0 ? (
              <>
                <SubLabel>أ) نسب التقدم والتراجع بين السنوات — مستوى المدرسة</SubLabel>
                {progressRates[0].transitions.map(t => {
                  let totImp = 0, totReg = 0, totSta = 0
                  for (const sp of progressRates) {
                    const tr = sp.transitions.find(x => x.yearFrom === t.yearFrom && x.yearTo === t.yearTo)
                    if (tr) { totImp += tr.improved; totReg += tr.regressed; totSta += tr.stable }
                  }
                  const tot = totImp + totReg + totSta
                  return (
                    <div key={t.yearFrom} className="mb-4 p-4 border rounded-xl">
                      <div className="text-sm font-semibold mb-3">{t.yearFrom} → {t.yearTo}</div>
                      <div className="grid grid-cols-3 gap-3">
                        <div className="bg-green-50 rounded-lg p-3 text-center">
                          <div className="text-xs text-gray-500 mb-1">تقدموا</div>
                          <div className="text-2xl font-bold text-green-600">{tot > 0 ? ((totImp / tot) * 100).toFixed(1) : '0'}%</div>
                          <div className="text-xs text-gray-400">{totImp} طالب</div>
                        </div>
                        <div className="bg-gray-50 rounded-lg p-3 text-center">
                          <div className="text-xs text-gray-500 mb-1">مستقرون</div>
                          <div className="text-2xl font-bold text-gray-500">{tot > 0 ? ((totSta / tot) * 100).toFixed(1) : '0'}%</div>
                          <div className="text-xs text-gray-400">{totSta} طالب</div>
                        </div>
                        <div className="bg-red-50 rounded-lg p-3 text-center">
                          <div className="text-xs text-gray-500 mb-1">تراجعوا</div>
                          <div className="text-2xl font-bold text-red-500">{tot > 0 ? ((totReg / tot) * 100).toFixed(1) : '0'}%</div>
                          <div className="text-xs text-gray-400">{totReg} طالب</div>
                        </div>
                      </div>
                    </div>
                  )
                })}

                <SubLabel>ب) نسب التقدم والتراجع بين السنوات — حسب المادة</SubLabel>
                {progressRates[0].transitions.map(t => (
                  <div key={t.yearFrom} className="mb-4">
                    <TableTitle>جدول نسب التقدم — {t.yearFrom} إلى {t.yearTo} — حسب المادة</TableTitle>
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs border-collapse">
                        <thead>
                          <tr style={{ background: '#f3f4f6' }}>
                            <th className="border px-3 py-2 text-start">المادة</th>
                            <th className="border px-2 py-2 text-center">المقارَنون</th>
                            <th className="border px-2 py-2 text-center text-green-600">تقدموا</th>
                            <th className="border px-2 py-2 text-center text-gray-400">مستقرون</th>
                            <th className="border px-2 py-2 text-center text-red-500">تراجعوا</th>
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
                                  <span className="text-green-600 font-semibold">{tr.improved}</span>
                                  <span className="text-xs text-gray-400 ms-1">({tr.improvedPct.toFixed(1)}%)</span>
                                </td>
                                <td className="border px-2 py-2 text-center text-gray-400">{tr.stable}</td>
                                <td className="border px-2 py-2 text-center">
                                  <span className="text-red-500 font-semibold">{tr.regressed}</span>
                                  <span className="text-xs text-gray-400 ms-1">({tr.regressedPct.toFixed(1)}%)</span>
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
                ))}
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
                  <ChartTitle>مخطط الفجوة: التكويني مقابل الاختبار — الفصل الأول</ChartTitle>
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart
                      data={allFormativeGapsS1.map(g => ({ name: subjectName(g.subjectCode), gap: g.gap ?? 0 }))}
                      margin={{ top: 5, right: 20, left: 0, bottom: 40 }}>
                      <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                      <XAxis dataKey="name" tick={{ fontSize: 10 }} angle={-35} textAnchor="end" interval={0} />
                      <YAxis tick={{ fontSize: 11 }} />
                      <Tooltip formatter={(v: number) => `${v >= 0 ? '+' : ''}${v.toFixed(1)}%`} />
                      <ReferenceLine y={0} stroke="#6b7280" />
                      <Bar dataKey="gap" name="الفجوة %" radius={[3, 3, 0, 0]}>
                        {allFormativeGapsS1.map((g, i) => <Cell key={i} fill={(g.gap ?? 0) < 0 ? '#ef4444' : '#22c55e'} />)}
                      </Bar>
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
                        data={semGaps.filter(g => ANALYSIS_SUBJECTS.includes(g.subjectCode)).map(g => ({
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
                      {semGaps.filter(g => ANALYSIS_SUBJECTS.includes(g.subjectCode)).map((g, i) => {
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

                <SubLabel>ج) الفجوة بين الفصول — مستوى الصف</SubLabel>
                {grades.map(grade => {
                  const gradeRecs = records.filter(r => r.grade === grade)
                  const gradeGaps = computeSemesterGaps(gradeRecs).filter(g => ANALYSIS_SUBJECTS.includes(g.subjectCode))
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
