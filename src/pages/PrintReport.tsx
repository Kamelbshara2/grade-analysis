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

  // Formative / exam gap
  const gapRows = useMemo(() => {
    const codes = [...new Set([
      ...formativeScores.map(s => s.subjectCode),
      ...examScores.map(s => s.subjectCode),
    ])] as SubjectCode[]
    return codes.map(code => {
      const fAvg = (arr: (number | null)[]) => {
        const v = arr.filter(x => x !== null) as number[]
        return v.length ? round2(v.reduce((a, b) => a + b, 0) / v.length) : null
      }
      const fs3 = fAvg(formativeScores.filter(s => s.subjectCode === code).map(s => s.s3))
      const es3 = fAvg(examScores.filter(s => s.subjectCode === code).map(s => s.s3))
      const gap = fs3 !== null && es3 !== null ? round2(fs3 - es3) : null
      return { name: SUBJECT_LABELS[code]?.ar ?? code, formative: fs3, exam: es3, gap }
    }).filter(r => r.formative !== null || r.exam !== null)
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
                  subject: (SUBJECT_LABELS[i.subjectCode]?.ar ?? i.subjectCode).slice(0, 6),
                  value: i.above75Rate,
                }))}>
                  <PolarGrid />
                  <PolarAngleAxis dataKey="subject" tick={{ fontSize: 10 }} />
                  <PolarRadiusAxis angle={90} domain={[0, 100]} tick={{ fontSize: 9 }} />
                  <Radar dataKey="value" stroke={C.primary} fill={C.primary} fillOpacity={0.25} />
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

              <ResponsiveContainer width="100%" height={280}>
                <LineChart data={multiYearData.chartRows} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="year" tick={{ fontSize: 11 }} />
                  <YAxis domain={[40, 100]} tick={{ fontSize: 11 }} />
                  <Tooltip formatter={(v: number) => `${v}%`} />
                  <Legend />
                  <ReferenceLine y={75} stroke={C.below} strokeDasharray="4 2" label={{ value: '75%', position: 'right', fontSize: 10 }} />
                  {multiYearData.allCodes.map((code, i) => (
                    <Line key={code} type="monotone" dataKey={code}
                      name={SUBJECT_LABELS[code]?.ar ?? code}
                      stroke={C.subjects[i % C.subjects.length]}
                      strokeWidth={2} dot={{ r: 4 }} connectNulls />
                  ))}
                </LineChart>
              </ResponsiveContainer>

              {/* Year-over-year table */}
              <div className="mt-4 overflow-x-auto">
                <table className="w-full text-xs border-collapse">
                  <thead>
                    <tr style={{ background: C.primary + '15' }}>
                      <th className="border px-3 py-2 text-start" style={{ color: C.primary }}>{ar ? 'المادة' : 'Subject'}</th>
                      {years.map(y => <th key={y} className="border px-3 py-2 text-center">{y}</th>)}
                      <th className="border px-3 py-2 text-center">{ar ? 'التغيير الكلي' : 'Total Change'}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {multiYearData.allCodes.map((code, idx) => {
                      const avgs = multiYearData.subjectAvgs[code] ?? []
                      const validAvgs = avgs.filter(v => !isNaN(v))
                      const totalDiff = validAvgs.length >= 2 ? round2(validAvgs[validAvgs.length - 1] - validAvgs[0]) : null
                      return (
                        <tr key={code} style={{ background: idx % 2 === 0 ? 'white' : '#f9fafb' }}>
                          <td className="border px-3 py-2 font-semibold">{SUBJECT_LABELS[code]?.ar ?? code}</td>
                          {avgs.map((v, i) => (
                            <td key={i} className="border px-3 py-2 text-center">
                              {isNaN(v) ? '—' : (
                                <span className={clsx('font-semibold', v >= 75 ? 'text-green-700' : v >= 50 ? 'text-amber-700' : 'text-red-700')}>
                                  {v}
                                </span>
                              )}
                            </td>
                          ))}
                          <td className="border px-3 py-2 text-center font-bold">
                            {totalDiff !== null ? (
                              <span style={{ color: totalDiff >= 0 ? C.excellent : C.below }}>
                                {totalDiff > 0 ? `▲ +${totalDiff}` : `▼ ${totalDiff}`}
                              </span>
                            ) : '—'}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>

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
              title={ar ? 'المؤشر 1.3 — الفجوة بين التكويني والاختبار الختامي' : 'Indicator 1.3 — Formative / Exam Gap'}
              subtitle={ar ? 'مقارنة متوسط التقويم التكويني مع درجة الاختبار' : 'Formative average vs. final exam average per subject'}>

              <div className="grid grid-cols-2 gap-6 mb-4">
                <div>
                  <p className="text-xs font-semibold text-gray-500 mb-3">{ar ? 'مخطط المقارنة' : 'Comparison Chart'}</p>
                  <ResponsiveContainer width="100%" height={240}>
                    <BarChart data={gapRows} margin={{ top: 5, right: 10, left: 0, bottom: 40 }}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="name" angle={-30} textAnchor="end" tick={{ fontSize: 10 }} interval={0} />
                      <YAxis domain={[0, 100]} tick={{ fontSize: 10 }} />
                      <Tooltip />
                      <Legend />
                      <Bar dataKey="formative" name={ar ? 'التكويني' : 'Formative'} fill="#2563eb" radius={[3, 3, 0, 0]} />
                      <Bar dataKey="exam" name={ar ? 'الاختبار' : 'Exam'} fill="#7c3aed" radius={[3, 3, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                <div>
                  <p className="text-xs font-semibold text-gray-500 mb-3">{ar ? 'حجم الفجوة (تكويني − اختبار)' : 'Gap Size (Formative − Exam)'}</p>
                  <ResponsiveContainer width="100%" height={240}>
                    <BarChart data={gapRows.filter(r => r.gap !== null)} margin={{ top: 5, right: 10, left: 0, bottom: 40 }}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="name" angle={-30} textAnchor="end" tick={{ fontSize: 10 }} interval={0} />
                      <YAxis tick={{ fontSize: 10 }} />
                      <Tooltip formatter={(v: number) => `${v} نقطة`} />
                      <ReferenceLine y={0} stroke="#374151" />
                      <Bar dataKey="gap" name={ar ? 'الفجوة' : 'Gap'} radius={[3, 3, 0, 0]}>
                        {gapRows.filter(r => r.gap !== null).map((r, i) => (
                          <Cell key={i} fill={(r.gap ?? 0) > 0 ? C.very_good : C.below} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div className="overflow-x-auto mb-4">
                <table className="w-full text-xs border-collapse">
                  <thead>
                    <tr style={{ background: C.primary + '15' }}>
                      <th className="border px-3 py-2 text-start">{ar ? 'المادة' : 'Subject'}</th>
                      <th className="border px-2 py-2 text-center">{ar ? 'التكويني (ف3)' : 'Formative (S3)'}</th>
                      <th className="border px-2 py-2 text-center">{ar ? 'الاختبار (ف3)' : 'Exam (S3)'}</th>
                      <th className="border px-2 py-2 text-center">{ar ? 'الفجوة' : 'Gap'}</th>
                      <th className="border px-2 py-2 text-center">{ar ? 'التفسير' : 'Interpretation'}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {gapRows.map((r, i) => {
                      const absGap = Math.abs(r.gap ?? 0)
                      const interp = r.gap === null ? '—'
                        : absGap <= 5 ? (ar ? '✅ فجوة صغيرة' : '✅ Small gap')
                        : absGap <= 15 ? (ar ? '⚠️ فجوة متوسطة' : '⚠️ Moderate gap')
                        : (ar ? '🔴 فجوة كبيرة' : '🔴 Large gap')
                      return (
                        <tr key={i} style={{ background: i % 2 === 0 ? 'white' : '#f9fafb' }}>
                          <td className="border px-3 py-2 font-semibold">{r.name}</td>
                          <td className="border px-2 py-2 text-center">{r.formative ?? '—'}</td>
                          <td className="border px-2 py-2 text-center">{r.exam ?? '—'}</td>
                          <td className="border px-2 py-2 text-center font-bold"
                            style={{ color: r.gap === null ? undefined : r.gap >= 0 ? C.very_good : C.below }}>
                            {r.gap !== null ? (r.gap >= 0 ? `+${r.gap}` : `${r.gap}`) : '—'}
                          </td>
                          <td className="border px-2 py-2 text-center text-gray-600">{interp}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>

              <div className="p-4 rounded-xl text-sm text-gray-700 leading-7" style={{ background: '#f5f3ff', borderRight: `4px solid #7c3aed` }}>
                <p className="font-semibold text-xs text-gray-500 mb-1">{ar ? '📝 التحليل الوصفي' : '📝 Descriptive Analysis'}</p>
                <p>
                  {ar
                    ? `يُقارن هذا التحليل بين متوسط درجات التقويم التكويني ودرجات الاختبار الختامي للفصل الثالث. الفجوة الإيجابية (+) تعني أن أداء الطلاب في التكويني أفضل من الاختبار، بينما الفجوة السلبية (−) تعني العكس. الفجوة المقبولة ≤5 نقاط؛ وفجوة >15 تستوجب مراجعة أساليب التقييم.`
                    : `This analysis compares formative assessment averages with final exam scores for Term 3. A positive gap (+) means students perform better on ongoing assessment than on the final exam, while a negative gap (−) means the opposite. An acceptable gap is ≤5 points; a gap >15 requires review of assessment practices.`}
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
