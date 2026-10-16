import { useState, useMemo } from 'react'
import { Printer, ChevronDown } from 'lucide-react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend, Cell, LineChart, Line,
  RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
  ReferenceLine,
} from 'recharts'
import { dataStore } from '@/store/dataStore'
import {
  filterRecords, extractScores, computeAchievementIndicators,
  computeSubjectStats, computeMultiYearProgress,
  getProportionLabel, round2,
  type AchievementIndicator,
} from '@/utils/statistics'
import { SUBJECT_LABELS, getCycle, getPassMark } from '@/utils/subjectMapping'
import type { Language, SubjectCode, Cycle } from '@/types'
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

// ── Descriptive text generator ─────────────────────────────────────────────────
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
  if (above > 0) text += `حقّقت ${above} مادة${above === 1 ? '' : ' من المواد'} مستوى "جيد جداً" أو "ممتاز" في المؤشر 1.1. `
  if (below > 0) text += `تحتاج ${below} مادة${below === 1 ? '' : ' من المواد'} إلى تدخّل تحسيني عاجل لرفع نسبة الإنجاز. `
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
  if (improvements.length === 0 && regressions.length === 0) text += 'استقرّت معظم المواد بشكل نسبي دون تغيّر جوهري في المتوسطات العامة.'
  return text
}

function genNarrativeSubject(ind: AchievementIndicator, stats: ReturnType<typeof computeSubjectStats>): string {
  const label = SUBJECT_LABELS[ind.subjectCode]?.ar ?? ind.subjectCode
  const pm = getPassMark(ind.cycle)
  const passRate = round2(stats.passRate)
  const failRate = round2(stats.failRate)
  return `مادة ${label}: متوسط ${round2(stats.mean)}، الوسيط ${round2(stats.median)}، الانحراف المعياري ${round2(stats.stdDev)}. ` +
    `نسبة النجاح (≥${pm}%): ${passRate}%، نسبة الرسوب: ${failRate}%، نسبة ≥75%: ${round2(ind.above75Rate)}%. ` +
    `${getProportionLabel(ind.above75Rate, 'ar')} من الطلاب حققوا إنجازاً عالياً (فوق 75%).`
}

// ── Section wrapper for print ──────────────────────────────────────────────────
function Section({ title, subtitle, num, children }: {
  title: string; subtitle?: string; num?: number; children: React.ReactNode
}) {
  return (
    <div className="print-section mb-8">
      <div className="flex items-center gap-3 mb-5 pb-3 border-b-2 border-primary-200" style={{ borderColor: '#1D5E3F33' }}>
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

// ── KPI card ──────────────────────────────────────────────────────────────────
function Kpi({ label, value, sub, color }: { label: string; value: string | number; sub?: string; color: string }) {
  return (
    <div className="rounded-xl border-2 p-4 flex flex-col gap-1" style={{ borderColor: color + '44', background: color + '0d' }}>
      <p className="text-xs text-gray-500 leading-tight">{label}</p>
      <p className="text-2xl font-extrabold" style={{ color }}>{value}</p>
      {sub && <p className="text-xs text-gray-400">{sub}</p>}
    </div>
  )
}

// ── Mini horizontal bar ───────────────────────────────────────────────────────
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

// ── Main component ─────────────────────────────────────────────────────────────
export default function PrintReport({ lang }: PrintReportProps) {
  const ar = lang === 'ar'
  const years = dataStore.getYears()
  const [yearId, setYearId] = useState(years.slice(-1)[0] || '')
  const [semester, setSemester] = useState<'annual' | '1' | '2' | '3'>('annual')
  const [schoolName, setSchoolName] = useState(ar ? 'مدرسة خالد بن الوليد' : 'Khalid bin Al-Walid School')

  const records = useMemo(() => dataStore.getRecordsByYear(yearId), [yearId])
  const diagScores = useMemo(() => dataStore.getDiagnosticScores(yearId), [yearId])
  const termScoresT1 = useMemo(() => dataStore.getTermScores(yearId, 1), [yearId])
  const termScoresT2 = useMemo(() => dataStore.getTermScores(yearId, 2), [yearId])
  const termScoresT3 = useMemo(() => dataStore.getTermScores(yearId, 3), [yearId])
  const formativeScores = useMemo(() => dataStore.getFormativeScores(yearId), [yearId])
  const examScores = useMemo(() => dataStore.getExamScores(yearId), [yearId])

  const semesterVal = semester === 'annual' ? 'annual' : (Number(semester) as 1 | 2 | 3)

  const indicators = useMemo(
    () => computeAchievementIndicators(records, semesterVal),
    [records, semesterVal]
  )

  const subjectStats = useMemo(() => {
    const map: Record<string, ReturnType<typeof computeSubjectStats>> = {}
    for (const ind of indicators) {
      const cycle = ind.cycle
      const stats = computeSubjectStats(records, ind.subjectCode, semesterVal, cycle)
      map[ind.subjectCode] = stats
    }
    return map
  }, [records, indicators, semesterVal])

  // Multi-year data
  const multiYearData = useMemo(() => {
    if (years.length < 2) return null
    const allCodes = [...new Set(
      years.flatMap(y => dataStore.getRecordsByYear(y).flatMap(r => Object.keys(r.grades) as SubjectCode[]))
    )]
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

  // Term progress
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

  // Formative / exam gap — redesigned UAE NOOR scoring structure
  // S1: formative (out of 10) + exam (out of 25) = 35%
  // S2: teacher assessment only (out of 30) = 30%
  // S3: formative (out of 10) + exam (out of 25) = 35%
  const gapRows = useMemo(() => {
    const codes = [...new Set([
      ...formativeScores.map(s => s.subjectCode),
      ...examScores.map(s => s.subjectCode),
    ])] as SubjectCode[]

    const avg = (arr: (number | null)[]) => {
      const v = arr.filter((x): x is number => x !== null)
      return v.length ? round2(v.reduce((a, b) => a + b, 0) / v.length) : null
    }

    return codes.map(code => {
      const fRecs = formativeScores.filter(s => s.subjectCode === code)
      const eRecs = examScores.filter(s => s.subjectCode === code)

      const fs1 = avg(fRecs.map(s => s.s1))          // formative S1 (out of 10)
      const es1 = avg(eRecs.map(s => s.s1))          // exam S1 (out of 25)
      const fs2 = avg(fRecs.map(s => s.s2 ?? null))  // teacher assessment S2 (out of 30)
      const fs3 = avg(fRecs.map(s => s.s3))          // formative S3 (out of 10)
      const es3 = avg(eRecs.map(s => s.s3))          // exam S3 (out of 25)

      // Rates as percentages
      const fs1Rate = fs1 !== null ? round2(fs1 / 10 * 100) : null
      const es1Rate = es1 !== null ? round2(es1 / 25 * 100) : null
      const internalGap1 = fs1Rate !== null && es1Rate !== null ? round2(es1Rate - fs1Rate) : null

      const s2Rate = fs2 !== null ? round2(fs2 / 30 * 100) : null

      const fs3Rate = fs3 !== null ? round2(fs3 / 10 * 100) : null
      const es3Rate = es3 !== null ? round2(es3 / 25 * 100) : null
      const internalGap3 = fs3Rate !== null && es3Rate !== null ? round2(es3Rate - fs3Rate) : null

      // Cross-semester gap: s2Rate vs average of s1 total rate and s3 total rate
      const s1TotalRate = (fs1 !== null && es1 !== null) ? round2((fs1 + es1) / 35 * 100) : null
      const s3TotalRate = (fs3 !== null && es3 !== null) ? round2((fs3 + es3) / 35 * 100) : null

      let crossGap: number | null = null
      if (s2Rate !== null && s1TotalRate !== null && s3TotalRate !== null) {
        crossGap = round2(s2Rate - (s1TotalRate + s3TotalRate) / 2)
      } else if (s2Rate !== null && s1TotalRate !== null) {
        crossGap = round2(s2Rate - s1TotalRate)
      } else if (s2Rate !== null && s3TotalRate !== null) {
        crossGap = round2(s2Rate - s3TotalRate)
      }

      // Arabic interpretation
      let interp = ''
      if (crossGap !== null) {
        if (crossGap > 10) interp = 'الفصل الثاني أعلى بشكل لافت'
        else if (crossGap > 0) interp = 'أداء مستقر'
        else if (crossGap > -10) interp = 'تراجع طفيف'
        else interp = 'تراجع ملحوظ في الاختبارات'
      } else {
        const internalGap = internalGap1 ?? internalGap3
        if (internalGap !== null) {
          if (internalGap > 10) interp = 'أداء أفضل في الاختبارات'
          else if (internalGap < -10) interp = 'أداء أضعف في الاختبارات'
          else interp = 'متوازن'
        }
      }

      return {
        subject: SUBJECT_LABELS[code]?.ar ?? code,
        fs1, es1, fs1Rate, es1Rate, internalGap1,
        fs2, s2Rate,
        fs3, es3, fs3Rate, es3Rate, internalGap3,
        s1TotalRate, s3TotalRate,
        crossGap, interp,
      }
    }).filter(r =>
      r.fs1 !== null || r.es1 !== null || r.fs2 !== null || r.fs3 !== null || r.es3 !== null
    )
  }, [formativeScores, examScores])

  // Overview stats
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
        if (pr < 75) return { ar: 'ضعيف', en: 'Weak', level: 'weak' }
        if (r75 >= 70) return { ar: 'ممتاز', en: 'Excellent', level: 'excellent' }
        if (r75 >= 60) return { ar: 'جيد جداً', en: 'Very Good', level: 'very_good' }
        if (r75 >= 50) return { ar: 'جيد', en: 'Good', level: 'good' }
        return { ar: 'مقبول', en: 'Acceptable', level: 'acceptable' }
      })(),
    }
  }, [records])

  const today = new Date().toLocaleDateString('ar-EG', { year: 'numeric', month: 'long', day: 'numeric' })
  const semLabel = semester === 'annual' ? 'السنوي' : `الفصل ${semester === '1' ? 'الأول' : semester === '2' ? 'الثاني' : 'الثالث'}`

  if (years.length === 0) {
    return (
      <div className="card text-center py-16 text-gray-500">
        {ar ? 'لا توجد بيانات. قم برفع ملف الدرجات السنوية أولاً.' : 'No data. Upload annual grades first.'}
      </div>
    )
  }

  return (
    <div>
      {/* ── Controls bar (no-print) ── */}
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
        <button
          className="btn-primary flex items-center gap-2 self-end"
          onClick={() => window.print()}
        >
          <Printer size={15} />
          {ar ? 'طباعة التقرير' : 'Print Report'}
        </button>
      </div>

      {/* ════════════════════════════════════════════════════════════
          PRINTABLE CONTENT
      ════════════════════════════════════════════════════════════ */}
      <div id="print-root" className="bg-white print:p-0 rounded-xl shadow-sm border p-6 space-y-0">

        {/* ── COVER PAGE ─────────────────────────────────────────── */}
        <div className="print-page-cover min-h-[90vh] flex flex-col">
          {/* Decorative header bar */}
          <div className="h-3 rounded-t-xl mb-8" style={{ background: `linear-gradient(90deg, ${C.primary}, #2563eb, #7c3aed)` }} />

          <div className="flex-1 flex flex-col items-center justify-center text-center px-8 gap-6">
            {/* Logo circle */}
            <div className="w-24 h-24 rounded-full flex items-center justify-center shadow-lg mb-2"
              style={{ background: `linear-gradient(135deg, ${C.primary}, #2563eb)` }}>
              <span className="text-white text-4xl font-black">ت</span>
            </div>

            <div>
              <p className="text-gray-400 text-sm tracking-widest mb-1">{ar ? 'إمارة أبوظبي — وزارة التعليم' : 'Abu Dhabi — Ministry of Education'}</p>
              <h1 className="text-3xl font-extrabold mb-1" style={{ color: C.primary }}>{schoolName}</h1>
              <p className="text-gray-500 text-sm">{ar ? 'فريق ضمان جودة إنجازات الطلبة' : 'Student Achievement Quality Team'}</p>
            </div>

            <div className="my-4 w-48 h-px bg-gradient-to-r from-transparent via-gray-300 to-transparent" />

            <div>
              <h2 className="text-2xl font-bold text-gray-800 mb-2">
                {ar ? 'تقرير تحليل الإنجاز الدراسي' : 'Academic Achievement Analysis Report'}
              </h2>
              <p className="text-gray-500 text-base">
                {ar ? `العام الدراسي: ${yearId} — ${semLabel}` : `Academic Year: ${yearId} — ${semLabel}`}
              </p>
            </div>

            <div className="mt-6 grid grid-cols-3 gap-6 text-center">
              <div>
                <p className="text-3xl font-black" style={{ color: C.primary }}>{totals.total}</p>
                <p className="text-xs text-gray-400">{ar ? 'إجمالي الطلاب' : 'Total Students'}</p>
              </div>
              <div>
                <p className="text-3xl font-black" style={{ color: levelColor(totals.schoolLevel.level) }}>
                  {totals.schoolLevel.ar}
                </p>
                <p className="text-xs text-gray-400">{ar ? 'مستوى المدرسة' : 'School Level'}</p>
              </div>
              <div>
                <p className="text-3xl font-black" style={{ color: C.excellent }}>{totals.above75Rate}%</p>
                <p className="text-xs text-gray-400">{ar ? 'فوق 75%' : 'Above 75%'}</p>
              </div>
            </div>
          </div>

          <div className="mt-auto pt-6 flex justify-between items-end text-xs text-gray-400 border-t">
            <span>{ar ? `تاريخ الإصدار: ${today}` : `Issued: ${today}`}</span>
            <span>{ar ? 'سري — للاستخدام الداخلي' : 'Confidential — Internal Use'}</span>
          </div>
        </div>

        {/* ── PAGE BREAK ─────────────────────────────────────────── */}
        <div className="print-break" />

        {/* ── SECTION 1: EXECUTIVE SUMMARY ──────────────────────── */}
        <Section num={1} title={ar ? 'الملخص التنفيذي' : 'Executive Summary'}
          subtitle={ar ? 'نظرة عامة على أداء المدرسة' : 'School performance overview'}>

          {/* KPIs */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <Kpi label={ar ? 'إجمالي الطلاب' : 'Total Students'} value={totals.total} color={C.primary} />
            <Kpi label={ar ? 'المتوسط العام' : 'Overall Average'} value={`${totals.avg}%`} color={C.very_good} />
            <Kpi label={ar ? 'نسبة النجاح' : 'Pass Rate'} value={`${totals.passRate}%`}
              sub={ar ? `${Math.round(totals.total * totals.passRate / 100)} طالب` : `${Math.round(totals.total * totals.passRate / 100)} students`}
              color={C.excellent} />
            <Kpi label={ar ? 'نسبة الطلاب فوق 75%' : 'Students ≥75%'} value={`${totals.above75Rate}%`}
              sub={ar ? 'معيار الإنجاز 1.1' : 'Indicator 1.1 criterion'} color={levelColor(totals.schoolLevel.level)} />
          </div>

          {/* School level badge */}
          <div className={clsx('inline-flex items-center gap-3 px-5 py-3 rounded-xl border-2 mb-6', levelBg(totals.schoolLevel.level))}>
            <span className="text-2xl font-black">{totals.schoolLevel.ar}</span>
            <div className="text-sm">
              <p className="font-semibold">{ar ? 'تصنيف المدرسة — المؤشر 1.1' : 'School Level — Indicator 1.1'}</p>
              <p className="opacity-70">{ar ? `بناءً على ${totals.above75Rate}% من الطلاب فوق 75%` : `Based on ${totals.above75Rate}% of students above 75%`}</p>
            </div>
          </div>

          {/* Achievement summary chart */}
          <div className="grid grid-cols-2 gap-6">
            <div>
              <p className="text-xs font-semibold text-gray-500 mb-3">{ar ? 'توزيع الإنجاز حسب المادة' : 'Achievement by Subject'}</p>
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
              <p className="text-xs font-semibold text-gray-500 mb-3">{ar ? 'مقارنة النجاح / الإخفاق / فوق 75%' : 'Pass / Fail / Above-75 Comparison'}</p>
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
                  <Bar dataKey="فوق 75%" stackId="a" fill={C.excellent} radius={[0, 0, 0, 0]} />
                  <Bar dataKey="نجاح" stackId="a" fill={C.good} />
                  <Bar dataKey="رسوب" stackId="a" fill={C.below} radius={[0, 3, 3, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Narrative */}
          <div className="mt-5 p-4 rounded-xl text-sm text-gray-700 leading-7" style={{ background: '#f0fdf4', borderRight: `4px solid ${C.primary}` }}>
            <p className="font-semibold text-xs text-gray-500 mb-1">{ar ? '📝 التحليل الوصفي' : '📝 Descriptive Analysis'}</p>
            <p>{genNarrative11(indicators, semester)}</p>
          </div>
        </Section>

        <div className="print-break" />

        {/* ── SECTION 2: INDICATOR 1.1 DETAIL ──────────────────── */}
        <Section num={2} title={ar ? 'المؤشر 1.1 — التحصيل الدراسي التفصيلي' : 'Indicator 1.1 — Achievement Detail'}
          subtitle={ar ? 'توزيع الطلاب حسب شرائح الإنجاز لكل مادة' : 'Student distribution across achievement bands per subject'}>

          {/* Radar chart */}
          <div className="grid grid-cols-2 gap-6 mb-6">
            <div>
              <p className="text-xs font-semibold text-gray-500 mb-3">{ar ? 'مخطط الشبكة — نسبة فوق 75% لكل مادة' : 'Radar — Above-75% per Subject'}</p>
              <ResponsiveContainer width="100%" height={220}>
                <RadarChart data={indicators.map(i => ({
                  subject: SUBJECT_LABELS[i.subjectCode]?.ar ?? i.subjectCode,
                  value: i.above75Rate,
                }))} outerRadius={80}>
                  <PolarGrid />
                  <PolarAngleAxis dataKey="subject" tick={{ fontSize: 9 }} />
                  <PolarRadiusAxis angle={90} domain={[0, Math.max(20, ...indicators.map(i => i.above75Rate))]} tick={{ fontSize: 8 }} />
                  <Radar dataKey="value" stroke={C.primary} fill={C.primary} fillOpacity={0.4} />
                </RadarChart>
              </ResponsiveContainer>
            </div>

            <div>
              <p className="text-xs font-semibold text-gray-500 mb-3">{ar ? 'توزيع شرائح الإنجاز' : 'Achievement Band Distribution'}</p>
              <ResponsiveContainer width="100%" height={220}>
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

          {/* Stats table */}
          <div className="overflow-x-auto">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr style={{ background: C.primary + '15' }}>
                  <th className="border px-3 py-2 text-start font-bold" style={{ color: C.primary }}>{ar ? 'المادة' : 'Subject'}</th>
                  <th className="border px-2 py-2 text-center">{ar ? 'الطلاب' : 'Students'}</th>
                  <th className="border px-2 py-2 text-center">{ar ? 'المتوسط' : 'Mean'}</th>
                  <th className="border px-2 py-2 text-center">{ar ? 'الوسيط' : 'Median'}</th>
                  <th className="border px-2 py-2 text-center">{ar ? 'الانحراف' : 'SD'}</th>
                  <th className="border px-2 py-2 text-center">{ar ? 'الأدنى' : 'Min'}</th>
                  <th className="border px-2 py-2 text-center">{ar ? 'الأعلى' : 'Max'}</th>
                  <th className="border px-2 py-2 text-center">{ar ? 'نجاح%' : 'Pass%'}</th>
                  <th className="border px-2 py-2 text-center">{ar ? 'رسوب%' : 'Fail%'}</th>
                  <th className="border px-2 py-2 text-center">{ar ? '≥75%' : '≥75%'}</th>
                  <th className="border px-2 py-2 text-center">{ar ? 'المستوى' : 'Level'}</th>
                </tr>
              </thead>
              <tbody>
                {[...indicators].sort((a, b) => b.above75Rate - a.above75Rate).map((ind, i) => {
                  const st = subjectStats[ind.subjectCode]
                  return (
                    <tr key={ind.subjectCode} style={{ background: i % 2 === 0 ? 'white' : '#f9fafb' }}>
                      <td className="border px-3 py-2 font-semibold text-gray-800">
                        {SUBJECT_LABELS[ind.subjectCode]?.ar ?? ind.subjectCode}
                      </td>
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
                        <span className={clsx('px-2 py-0.5 rounded text-xs border font-semibold', levelBg(ind.level))}>
                          {ind.levelAr}
                        </span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {/* Per-subject narratives */}
          <div className="mt-5 space-y-2">
            <p className="text-xs font-semibold text-gray-500">{ar ? '📊 التحليل الرقمي والوصفي لكل مادة' : '📊 Numerical & Descriptive Analysis per Subject'}</p>
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
        </Section>

        {/* ── SECTION 3: MULTI-YEAR TRENDS (if data) ───────────── */}
        {multiYearData && years.length >= 2 && (
          <>
            <div className="print-break" />
            <Section num={3} title={ar ? 'المؤشر 1.2 — الاتجاهات عبر السنوات' : 'Indicator 1.2 — Multi-Year Trends'}
              subtitle={ar ? 'تطور متوسطات المواد عبر السنوات الدراسية' : 'Subject average progression over academic years'}>

              {/* School-wide average trend */}
              <div className="mb-6">
                <p className="text-xs font-semibold text-gray-600 mb-2">{ar ? '📊 المؤشر الكلي للمدرسة — متوسط جميع المواد' : '📊 Overall School Indicator — All Subjects Average'}</p>
                <ResponsiveContainer width="100%" height={180}>
                  <LineChart
                    data={multiYearData.chartRows.map(row => ({
                      year: row.year,
                      avg: round2(
                        multiYearData.allCodes
                          .map(c => row[c] as number)
                          .filter(v => !isNaN(v) && v > 0)
                          .reduce((a, b, _, arr) => a + b / arr.length, 0)
                      ),
                    }))}
                    margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="year" tick={{ fontSize: 11 }} />
                    <YAxis domain={[40, 100]} tick={{ fontSize: 11 }} />
                    <Tooltip formatter={(v: number) => `${v}%`} />
                    <ReferenceLine y={75} stroke={C.below} strokeDasharray="4 2" label={{ value: '75%', position: 'right', fontSize: 10 }} />
                    <Line type="monotone" dataKey="avg" name={ar ? 'متوسط المدرسة' : 'School Avg'} stroke={C.primary} strokeWidth={3} dot={{ r: 5 }} connectNulls />
                  </LineChart>
                </ResponsiveContainer>
              </div>

              {/* Per-subject trend sections */}
              <div className="mt-4">
                <p className="text-xs font-semibold text-gray-600 mb-3">{ar ? '📚 تقدم كل مادة عبر السنوات' : '📚 Per-Subject Progress'}</p>
                <div className="grid grid-cols-2 gap-4">
                  {multiYearData.allCodes.map((code, idx) => {
                    const avgs = multiYearData.subjectAvgs[code] ?? []
                    const validAvgs = avgs.filter(v => !isNaN(v))
                    const totalDiff = validAvgs.length >= 2 ? round2(validAvgs[validAvgs.length - 1] - validAvgs[0]) : null
                    const subjectRows = multiYearData.chartRows.map(row => ({ year: row.year as string, val: isNaN(row[code] as number) ? null : row[code] as number }))
                    return (
                      <div key={code} className="border rounded-lg p-3" style={{ borderColor: C.subjects[idx % C.subjects.length] + '60' }}>
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-xs font-bold" style={{ color: C.subjects[idx % C.subjects.length] }}>
                            {ar ? SUBJECT_LABELS[code]?.ar ?? code : SUBJECT_LABELS[code]?.en ?? code}
                          </span>
                          {totalDiff !== null && (
                            <span className="text-xs font-bold" style={{ color: totalDiff >= 0 ? C.excellent : C.below }}>
                              {totalDiff > 0 ? `▲ +${totalDiff}` : `▼ ${totalDiff}`}
                            </span>
                          )}
                        </div>
                        <ResponsiveContainer width="100%" height={80}>
                          <LineChart data={subjectRows} margin={{ top: 2, right: 8, left: -20, bottom: 2 }}>
                            <XAxis dataKey="year" tick={{ fontSize: 8 }} />
                            <YAxis domain={[40, 100]} tick={{ fontSize: 7 }} />
                            <ReferenceLine y={75} stroke={C.below} strokeDasharray="3 1" />
                            <Line type="monotone" dataKey="val" stroke={C.subjects[idx % C.subjects.length]} strokeWidth={2} dot={{ r: 3 }} connectNulls />
                            <Tooltip formatter={(v: number) => `${v}%`} contentStyle={{ fontSize: 10 }} />
                          </LineChart>
                        </ResponsiveContainer>
                        <div className="flex justify-between mt-1 text-xs text-gray-500">
                          {avgs.map((v, i) => (
                            <span key={i} className={clsx('font-mono', isNaN(v) ? 'text-gray-300' : v >= 75 ? 'text-green-700' : v >= 50 ? 'text-amber-700' : 'text-red-700')}>
                              {isNaN(v) ? '—' : v}
                            </span>
                          ))}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>

              {/* Narrative analysis */}
              <div className="mt-4 p-4 rounded-xl text-sm text-gray-700 leading-7" style={{ background: '#eff6ff', borderRight: `4px solid ${C.very_good}` }}>
                <p className="font-semibold text-xs text-gray-500 mb-1">{ar ? '📝 التحليل الوصفي' : '📝 Descriptive Analysis'}</p>
                <p>{genNarrative12(years, multiYearData.subjectAvgs as Record<SubjectCode, number[]>)}</p>
              </div>
            </Section>
          </>
        )}

        {/* ── SECTION 4: FORMATIVE / EXAM GAP (if data) ─────────── */}
        {gapRows.length > 0 && (
          <>
            <div className="print-break" />
            <Section num={multiYearData && years.length >= 2 ? 4 : 3}
              title={ar ? 'المؤشر 1.3 — تحليل الفجوة التقييمية' : 'Indicator 1.3 — Assessment Gap Analysis'}
              subtitle={ar ? 'مقارنة التكويني والاختبار داخل الفصل، ومقارنة الفصل الثاني بالأول والثالث' : 'Internal formative/exam gap and cross-semester comparison'}>

              {/* Internal gap chart for S1 and S3 */}
              {gapRows.some(r => r.internalGap1 !== null || r.internalGap3 !== null) && (
                <div className="mb-6">
                  <p className="text-xs font-semibold text-gray-500 mb-3">
                    {ar ? 'الفجوة الداخلية: اختبار − تكويني (%) — الفصل الأول والثالث' : 'Internal Gap: Exam − Formative (%) — S1 & S3'}
                  </p>
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart
                      data={gapRows.map(r => ({
                        name: r.subject.slice(0, 10),
                        'ف1': r.internalGap1,
                        'ف3': r.internalGap3,
                      }))}
                      margin={{ top: 5, right: 20, left: 0, bottom: 40 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="name" angle={-30} textAnchor="end" tick={{ fontSize: 10 }} interval={0} />
                      <YAxis tick={{ fontSize: 10 }} />
                      <Tooltip formatter={(v: number) => `${v > 0 ? '+' : ''}${v}%`} />
                      <Legend />
                      <ReferenceLine y={0} stroke="#374151" />
                      <Bar dataKey="ف1" name={ar ? 'فجوة ف1' : 'Gap S1'} fill={C.very_good} radius={[3, 3, 0, 0]}>
                        {gapRows.map((r, i) => (
                          <Cell key={i} fill={
                            r.internalGap1 === null ? '#e5e7eb' :
                            r.internalGap1 > 5 ? C.excellent :
                            r.internalGap1 < -5 ? C.below : '#d97706'
                          } />
                        ))}
                      </Bar>
                      <Bar dataKey="ف3" name={ar ? 'فجوة ف3' : 'Gap S3'} fill="#7c3aed" radius={[3, 3, 0, 0]}>
                        {gapRows.map((r, i) => (
                          <Cell key={i} fill={
                            r.internalGap3 === null ? '#e5e7eb' :
                            r.internalGap3 > 5 ? C.excellent :
                            r.internalGap3 < -5 ? C.below : '#d97706'
                          } />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}

              {/* Section A: Internal gap S1 & S3 */}
              <div className="mb-6">
                <p className="text-sm font-bold mb-2" style={{ color: C.primary }}>
                  {ar ? 'أ — مقارنة التكويني والاختبار (الفصل الأول والثالث)' : 'A — Formative vs Exam (S1 & S3)'}
                </p>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs border-collapse">
                    <thead>
                      <tr style={{ background: C.primary + '15' }}>
                        <th className="border px-3 py-2 text-start font-bold" style={{ color: C.primary }}>{ar ? 'المادة' : 'Subject'}</th>
                        <th className="border px-2 py-2 text-center">{ar ? 'تكويني ف1 (10)' : 'Form.S1 (10)'}</th>
                        <th className="border px-2 py-2 text-center">{ar ? 'اختبار ف1 (25)' : 'Exam S1 (25)'}</th>
                        <th className="border px-2 py-2 text-center font-bold">{ar ? 'الفجوة ف1' : 'Gap S1'}</th>
                        <th className="border px-2 py-2 text-center">{ar ? 'تكويني ف3 (10)' : 'Form.S3 (10)'}</th>
                        <th className="border px-2 py-2 text-center">{ar ? 'اختبار ف3 (25)' : 'Exam S3 (25)'}</th>
                        <th className="border px-2 py-2 text-center font-bold">{ar ? 'الفجوة ف3' : 'Gap S3'}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {gapRows.map((r, i) => {
                        const gapCell = (gap: number | null) => {
                          if (gap === null) return <span className="text-gray-300">—</span>
                          const bg = gap > 5 ? '#f0fdf4' : gap < -5 ? '#fef2f2' : '#fffbeb'
                          const color = gap > 5 ? C.excellent : gap < -5 ? C.below : '#d97706'
                          return (
                            <span className="px-2 py-0.5 rounded font-bold text-xs" style={{ background: bg, color }}>
                              {gap > 0 ? `+${gap}` : gap}%
                            </span>
                          )
                        }
                        return (
                          <tr key={i} style={{ background: i % 2 === 0 ? 'white' : '#f9fafb' }}>
                            <td className="border px-3 py-2 font-semibold text-gray-800">{r.subject}</td>
                            <td className="border px-2 py-2 text-center">{r.fs1 !== null ? `${r.fs1} (${r.fs1Rate}%)` : '—'}</td>
                            <td className="border px-2 py-2 text-center">{r.es1 !== null ? `${r.es1} (${r.es1Rate}%)` : '—'}</td>
                            <td className="border px-2 py-2 text-center">{gapCell(r.internalGap1)}</td>
                            <td className="border px-2 py-2 text-center">{r.fs3 !== null ? `${r.fs3} (${r.fs3Rate}%)` : '—'}</td>
                            <td className="border px-2 py-2 text-center">{r.es3 !== null ? `${r.es3} (${r.es3Rate}%)` : '—'}</td>
                            <td className="border px-2 py-2 text-center">{gapCell(r.internalGap3)}</td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Section B: Cross-semester S2 vs S1/S3 */}
              {gapRows.some(r => r.fs2 !== null || r.crossGap !== null) && (
                <div className="mb-4">
                  <p className="text-sm font-bold mb-2" style={{ color: C.primary }}>
                    {ar ? 'ب — مقارنة التقييم المستمر للفصل الثاني مع الفصلين الأول والثالث' : 'B — S2 Continuous Assessment vs S1 & S3'}
                  </p>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs border-collapse">
                      <thead>
                        <tr style={{ background: C.primary + '15' }}>
                          <th className="border px-3 py-2 text-start font-bold" style={{ color: C.primary }}>{ar ? 'المادة' : 'Subject'}</th>
                          <th className="border px-2 py-2 text-center">{ar ? 'ف1 (35%)' : 'S1 (35%)'}</th>
                          <th className="border px-2 py-2 text-center">{ar ? 'تكويني ف2 (30%)' : 'Form.S2 (30%)'}</th>
                          <th className="border px-2 py-2 text-center">{ar ? 'ف3 (35%)' : 'S3 (35%)'}</th>
                          <th className="border px-2 py-2 text-center font-bold">{ar ? 'الفجوة المتقاطعة' : 'Cross Gap'}</th>
                          <th className="border px-2 py-2 text-start">{ar ? 'التفسير' : 'Interpretation'}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {gapRows.map((r, i) => {
                          const crossCell = (gap: number | null) => {
                            if (gap === null) return <span className="text-gray-300">—</span>
                            const bg = gap > 5 ? '#f0fdf4' : gap < -5 ? '#fef2f2' : '#fffbeb'
                            const color = gap > 5 ? C.excellent : gap < -5 ? C.below : '#d97706'
                            return (
                              <span className="px-2 py-0.5 rounded font-bold text-xs" style={{ background: bg, color }}>
                                {gap > 0 ? `+${gap}` : gap}%
                              </span>
                            )
                          }
                          return (
                            <tr key={i} style={{ background: i % 2 === 0 ? 'white' : '#f9fafb' }}>
                              <td className="border px-3 py-2 font-semibold text-gray-800">{r.subject}</td>
                              <td className="border px-2 py-2 text-center">
                                {r.s1TotalRate !== null ? `${r.s1TotalRate}%` : '—'}
                              </td>
                              <td className="border px-2 py-2 text-center">
                                {r.fs2 !== null ? `${r.fs2} (${r.s2Rate}%)` : '—'}
                              </td>
                              <td className="border px-2 py-2 text-center">
                                {r.s3TotalRate !== null ? `${r.s3TotalRate}%` : '—'}
                              </td>
                              <td className="border px-2 py-2 text-center">{crossCell(r.crossGap)}</td>
                              <td className="border px-2 py-1.5 text-xs text-gray-700">
                                {r.interp || '—'}
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              <div className="p-4 rounded-xl text-sm text-gray-700 leading-7" style={{ background: '#f5f3ff', borderRight: `4px solid #7c3aed` }}>
                <p className="font-semibold text-xs text-gray-500 mb-1">{ar ? '📝 التحليل الوصفي' : '📝 Descriptive Analysis'}</p>
                <p>
                  {ar
                    ? `القسم (أ) يقارن التقويم التكويني (من 10) بالاختبار (من 25) داخل الفصل الأول والثالث بعد تحويلهما إلى نسب مئوية. فجوة إيجابية تعني أداء أفضل في الاختبار. القسم (ب) يقارن التقييم المستمر للفصل الثاني (من 30) بمتوسط مجموع درجات الفصلين الأول والثالث؛ الفجوة المقبولة ≤5 نقاط مئوية.`
                    : `Section A compares formative (out of 10) vs exam (out of 25) within S1 and S3 as percentages. A positive gap means better exam performance. Section B compares the S2 continuous assessment (out of 30) against the average total of S1 and S3; an acceptable gap is ≤5 percentage points.`}
                </p>
              </div>
            </Section>
          </>
        )}

        {/* ── SECTION 5: TERM PROGRESS (if data) ────────────────── */}
        {termRows.length > 0 && (
          <>
            <div className="print-break" />
            <Section num={(multiYearData && years.length >= 2 ? 1 : 0) + (gapRows.length > 0 ? 1 : 0) + 3}
              title={ar ? 'متابعة تطور الأداء الفصلي' : 'Term-by-Term Performance Tracking'}
              subtitle={ar ? 'مسار الأداء من التشخيصي حتى الفصل الثالث' : 'Performance trajectory from diagnostic to Term 3'}>

              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={termRows} margin={{ top: 5, right: 20, left: 0, bottom: 50 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" angle={-30} textAnchor="end" tick={{ fontSize: 10 }} interval={0} />
                  <YAxis domain={[0, 100]} tick={{ fontSize: 10 }} />
                  <Tooltip />
                  <Legend />
                  <ReferenceLine y={75} stroke={C.below} strokeDasharray="4 2" />
                  {termRows.some(r => r.diagnostic !== null) && <Bar dataKey="diagnostic" name={ar ? 'التشخيصي' : 'Diagnostic'} fill="#6b7280" radius={[3, 3, 0, 0]} />}
                  {termRows.some(r => r.t1 !== null) && <Bar dataKey="t1" name={ar ? 'الفصل الأول' : 'Term 1'} fill={C.very_good} radius={[3, 3, 0, 0]} />}
                  {termRows.some(r => r.t2 !== null) && <Bar dataKey="t2" name={ar ? 'الفصل الثاني' : 'Term 2'} fill={C.good} radius={[3, 3, 0, 0]} />}
                  {termRows.some(r => r.t3 !== null) && <Bar dataKey="t3" name={ar ? 'الفصل الثالث' : 'Term 3'} fill={C.excellent} radius={[3, 3, 0, 0]} />}
                </BarChart>
              </ResponsiveContainer>

              <div className="mt-4 overflow-x-auto">
                <table className="w-full text-xs border-collapse">
                  <thead>
                    <tr style={{ background: C.primary + '15' }}>
                      <th className="border px-3 py-2 text-start">{ar ? 'المادة' : 'Subject'}</th>
                      <th className="border px-2 py-2 text-center">{ar ? 'التشخيصي' : 'Diag.'}</th>
                      <th className="border px-2 py-2 text-center">{ar ? 'ف1' : 'T1'}</th>
                      <th className="border px-2 py-2 text-center">{ar ? 'ف2' : 'T2'}</th>
                      <th className="border px-2 py-2 text-center">{ar ? 'ف3' : 'T3'}</th>
                      <th className="border px-2 py-2 text-center">{ar ? 'التغيير' : 'Change'}</th>
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
                              {v !== null ? (
                                <span className={clsx('font-semibold', v >= 75 ? 'text-green-700' : v >= 50 ? 'text-amber-700' : 'text-red-700')}>{v}</span>
                              ) : <span className="text-gray-300">—</span>}
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
          <span>{ar ? 'تحليل الإنجاز الدراسي | سري — للاستخدام الداخلي' : 'Achievement Analysis | Confidential — Internal Use'}</span>
          <span>{today}</span>
        </div>

      </div>
    </div>
  )
}
