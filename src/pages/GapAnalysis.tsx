import { useState, useMemo } from 'react'
import { Printer } from 'lucide-react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  ReferenceLine, Cell, Legend,
} from 'recharts'
import type { Language, SubjectCode } from '@/types'
import { dataStore } from '@/store/dataStore'
import { SUBJECT_LABELS } from '@/utils/subjectMapping'
import { round2 } from '@/utils/statistics'
import clsx from 'clsx'

interface GapAnalysisProps { lang: Language }

const C = {
  primary: '#1D5E3F',
  excellent: '#16a34a',
  good: '#d97706',
  below: '#dc2626',
  s1: '#3b82f6',
  s2: '#10b981',
  s3: '#7c3aed',
}

function gapColor(gap: number | null) {
  if (gap === null) return '#9ca3af'
  if (gap > 5) return C.excellent
  if (gap < -5) return C.below
  return C.good
}

function GapBadge({ gap }: { gap: number | null }) {
  if (gap === null) return <span className="text-gray-300 text-xs">—</span>
  const color = gap > 5 ? C.excellent : gap < -5 ? C.below : C.good
  const bg = gap > 5 ? '#f0fdf4' : gap < -5 ? '#fef2f2' : '#fffbeb'
  return (
    <span className="px-2 py-0.5 rounded font-bold text-xs" style={{ background: bg, color }}>
      {gap > 0 ? `+${gap}` : gap}%
    </span>
  )
}

export default function GapAnalysis({ lang }: GapAnalysisProps) {
  const ar = lang === 'ar'
  const years = dataStore.getYears()
  const [yearId, setYearId] = useState(() => years[years.length - 1] ?? '')
  const [grade, setGrade] = useState<number | undefined>(undefined)
  const [section, setSection] = useState<string | undefined>(undefined)
  const [activeTab, setActiveTab] = useState<'internal' | 'cross'>('internal')

  const grades = useMemo(() => {
    const fs = dataStore.getFormativeScores(yearId)
    return [...new Set(fs.map(s => s.grade))].sort((a, b) => a - b)
  }, [yearId])

  const sections = useMemo(() => {
    let fs = dataStore.getFormativeScores(yearId)
    if (grade !== undefined) fs = fs.filter(s => s.grade === grade)
    return [...new Set(fs.map(s => s.section))].sort()
  }, [yearId, grade])

  const { gapRows, schoolSummary } = useMemo(() => {
    let fScores = dataStore.getFormativeScores(yearId)
    let eScores = dataStore.getExamScores(yearId)

    if (grade !== undefined) {
      fScores = fScores.filter(s => s.grade === grade)
      eScores = eScores.filter(s => s.grade === grade)
    }
    if (section) {
      fScores = fScores.filter(s => s.section === section)
      eScores = eScores.filter(s => s.section === section)
    }

    const codes = [...new Set([
      ...fScores.map(s => s.subjectCode),
      ...eScores.map(s => s.subjectCode),
    ])] as SubjectCode[]

    const avg = (arr: (number | null)[]) => {
      const v = arr.filter((x): x is number => x !== null)
      return v.length ? round2(v.reduce((a, b) => a + b, 0) / v.length) : null
    }

    const rows = codes.map(code => {
      const fRecs = fScores.filter(s => s.subjectCode === code)
      const eRecs = eScores.filter(s => s.subjectCode === code)

      const fs1 = avg(fRecs.map(s => s.s1))
      const es1 = avg(eRecs.map(s => s.s1))
      const fs2 = avg(fRecs.map(s => s.s2 ?? null))
      const fs3 = avg(fRecs.map(s => s.s3))
      const es3 = avg(eRecs.map(s => s.s3))

      const fs1Rate = fs1 !== null ? round2(fs1 / 10 * 100) : null
      const es1Rate = es1 !== null ? round2(es1 / 25 * 100) : null
      const internalGap1 = fs1Rate !== null && es1Rate !== null ? round2(es1Rate - fs1Rate) : null

      const s2Rate = fs2 !== null ? round2(fs2 / 30 * 100) : null

      const fs3Rate = fs3 !== null ? round2(fs3 / 10 * 100) : null
      const es3Rate = es3 !== null ? round2(es3 / 25 * 100) : null
      const internalGap3 = fs3Rate !== null && es3Rate !== null ? round2(es3Rate - fs3Rate) : null

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

      return {
        code,
        subject: SUBJECT_LABELS[code]?.ar ?? code,
        subjectEn: SUBJECT_LABELS[code]?.en ?? code,
        fs1, es1, fs1Rate, es1Rate, internalGap1,
        fs2, s2Rate,
        fs3, es3, fs3Rate, es3Rate, internalGap3,
        s1TotalRate, s3TotalRate, crossGap,
      }
    }).filter(r =>
      r.fs1 !== null || r.es1 !== null || r.fs2 !== null || r.fs3 !== null || r.es3 !== null
    )

    // School-wide summary (unfiltered)
    const allFS = dataStore.getFormativeScores(yearId)
    const allES = dataStore.getExamScores(yearId)
    const schoolSummary = {
      avgFormS1: avg(allFS.map(s => s.s1)),
      avgExamS1: avg(allES.map(s => s.s1)),
      avgTeachS2: avg(allFS.map(s => s.s2 ?? null)),
      avgFormS3: avg(allFS.map(s => s.s3)),
      avgExamS3: avg(allES.map(s => s.s3)),
    }

    return { gapRows: rows, schoolSummary }
  }, [yearId, grade, section])

  const hasInternalData = gapRows.some(r => r.internalGap1 !== null || r.internalGap3 !== null)
  const hasCrossData = gapRows.some(r => r.crossGap !== null)

  if (years.length === 0) {
    return <div className="card text-center py-12 text-gray-500">{ar ? 'لا توجد بيانات' : 'No data'}</div>
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">{ar ? 'تحليل الفجوات التقييمية' : 'Assessment Gap Analysis'}</h1>
          <p className="text-xs text-gray-500 mt-0.5">
            {ar
              ? 'مقارنة التكويني/الاختبار داخل الفصل، ومقارنة الفصل الثاني بالأول والثالث'
              : 'Formative vs exam within semester, and S2 vs S1/S3 cross-semester comparison'}
          </p>
        </div>
        <button
          className="btn-primary flex items-center gap-2 text-sm no-print"
          onClick={() => window.print()}
        >
          <Printer size={14} />
          {ar ? 'طباعة' : 'Print'}
        </button>
      </div>

      {/* Filters */}
      <div className="card flex flex-wrap gap-4 items-end no-print">
        <div className="min-w-[140px]">
          <label className="label">{ar ? 'العام الدراسي' : 'Year'}</label>
          <select
            className="input"
            value={yearId}
            onChange={e => { setYearId(e.target.value); setGrade(undefined); setSection(undefined) }}
          >
            {years.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
        <div className="min-w-[110px]">
          <label className="label">{ar ? 'الصف' : 'Grade'}</label>
          <select
            className="input"
            value={grade ?? ''}
            onChange={e => { setGrade(e.target.value ? +e.target.value : undefined); setSection(undefined) }}
          >
            <option value="">{ar ? 'الكل' : 'All'}</option>
            {grades.map(g => <option key={g} value={g}>{ar ? `الصف ${g}` : `Grade ${g}`}</option>)}
          </select>
        </div>
        {sections.length > 0 && (
          <div className="min-w-[110px]">
            <label className="label">{ar ? 'الشعبة' : 'Section'}</label>
            <select
              className="input"
              value={section ?? ''}
              onChange={e => setSection(e.target.value || undefined)}
            >
              <option value="">{ar ? 'الكل' : 'All'}</option>
              {sections.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
        )}
      </div>

      {/* School-wide summary cards */}
      {(schoolSummary.avgFormS1 !== null || schoolSummary.avgExamS1 !== null ||
        schoolSummary.avgTeachS2 !== null || schoolSummary.avgFormS3 !== null || schoolSummary.avgExamS3 !== null) && (
        <div>
          <p className="text-xs font-semibold text-gray-500 mb-2">
            {ar ? '📊 معدل المدرسة ككل' : '📊 School-Wide Averages'}
          </p>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            {[
              { label: ar ? 'تكويني ف1 (من 10)' : 'Form. S1 /10', value: schoolSummary.avgFormS1, max: 10, color: C.s1 },
              { label: ar ? 'اختبار ف1 (من 25)' : 'Exam S1 /25', value: schoolSummary.avgExamS1, max: 25, color: C.s1 },
              { label: ar ? 'معلم ف2 (من 30)' : 'Teacher S2 /30', value: schoolSummary.avgTeachS2, max: 30, color: C.s2 },
              { label: ar ? 'تكويني ف3 (من 10)' : 'Form. S3 /10', value: schoolSummary.avgFormS3, max: 10, color: C.s3 },
              { label: ar ? 'اختبار ف3 (من 25)' : 'Exam S3 /25', value: schoolSummary.avgExamS3, max: 25, color: C.s3 },
            ].map(k => (
              <div key={k.label} className="rounded-xl border-2 p-3 flex flex-col gap-1"
                style={{ borderColor: k.color + '44', background: k.color + '0d' }}>
                <p className="text-xs text-gray-500 leading-tight">{k.label}</p>
                <p className="text-xl font-extrabold" style={{ color: k.color }}>
                  {k.value !== null ? k.value : '—'}
                </p>
                {k.value !== null && (
                  <div className="h-1.5 bg-gray-100 rounded-full mt-1">
                    <div className="h-full rounded-full transition-all"
                      style={{ width: `${Math.min((k.value / k.max) * 100, 100)}%`, background: k.color }} />
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {gapRows.length === 0 ? (
        <div className="card text-center py-12 text-gray-400">
          <p className="text-lg mb-2">📂</p>
          <p>
            {ar
              ? 'لا توجد بيانات تكوينية/اختبارية. ارفع ملف التكويني والاختبار أولاً.'
              : 'No formative/exam data. Upload the formative/exam file first.'}
          </p>
        </div>
      ) : (
        <>
          {/* Tabs */}
          <div className="flex gap-2 no-print">
            <button
              className={clsx(
                'px-4 py-2 rounded-lg text-sm font-medium border transition-colors',
                activeTab === 'internal'
                  ? 'bg-primary-600 text-white border-primary-600'
                  : 'border-gray-300 text-gray-600 dark:border-gray-600 dark:text-gray-400',
              )}
              onClick={() => setActiveTab('internal')}
            >
              {ar ? 'أ — فجوة التكويني / الاختبار (ف1 وف3)' : 'A — Formative / Exam Gap (S1 & S3)'}
            </button>
            <button
              className={clsx(
                'px-4 py-2 rounded-lg text-sm font-medium border transition-colors',
                activeTab === 'cross'
                  ? 'bg-primary-600 text-white border-primary-600'
                  : 'border-gray-300 text-gray-600 dark:border-gray-600 dark:text-gray-400',
              )}
              onClick={() => setActiveTab('cross')}
            >
              {ar ? 'ب — الفجوة بين الفصول (ف2 مقابل ف1/ف3)' : 'B — Cross-Semester Gap (S2 vs S1/S3)'}
            </button>
          </div>

          {/* ── Section A: Internal gap ────────────────────────────────── */}
          {activeTab === 'internal' && (
            hasInternalData ? (
              <div className="space-y-6">
                <div className="p-3 rounded-xl text-xs text-gray-600 dark:text-gray-400"
                  style={{ background: '#eff6ff', borderRight: `4px solid ${C.s1}` }}>
                  {ar
                    ? 'يقارن هذا القسم درجة التكويني (من 10) بدرجة الاختبار (من 25) داخل الفصل الأول والثالث بعد تحويلهما إلى نسب مئوية. فجوة موجبة = أداء أفضل في الاختبار، وسالبة = أداء أضعف. الفجوة المقبولة ≤5 نقاط مئوية.'
                    : 'Compares formative score (out of 10) vs exam score (out of 25) within S1 and S3 as percentages. Positive gap = better exam performance. Acceptable gap ≤5 pp.'}
                </div>

                {/* Chart */}
                <div className="card">
                  <p className="text-xs font-semibold text-gray-500 mb-3">
                    {ar ? 'الفجوة الداخلية: اختبار − تكويني (%) — الفصل الأول والثالث' : 'Internal Gap: Exam − Formative (%) — S1 & S3'}
                  </p>
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart
                      data={gapRows.map(r => ({
                        name: ar ? r.subject : r.subjectEn,
                        'ف1': r.internalGap1,
                        'ف3': r.internalGap3,
                      }))}
                      margin={{ top: 5, right: 20, left: 0, bottom: 45 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" vertical={false} />
                      <XAxis dataKey="name" angle={-30} textAnchor="end" tick={{ fontSize: 10 }} interval={0} />
                      <YAxis tick={{ fontSize: 10 }} />
                      <Tooltip formatter={(v: number) => `${v > 0 ? '+' : ''}${v}%`} />
                      <Legend />
                      <ReferenceLine y={0} stroke="#374151" />
                      <Bar dataKey="ف1" name={ar ? 'فجوة ف1' : 'Gap S1'} radius={[3, 3, 0, 0]}>
                        {gapRows.map((r, i) => <Cell key={i} fill={gapColor(r.internalGap1)} />)}
                      </Bar>
                      <Bar dataKey="ف3" name={ar ? 'فجوة ف3' : 'Gap S3'} radius={[3, 3, 0, 0]}>
                        {gapRows.map((r, i) => <Cell key={i} fill={gapColor(r.internalGap3)} />)}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>

                {/* Table */}
                <div className="card overflow-x-auto">
                  <table className="w-full text-xs border-collapse">
                    <thead>
                      <tr style={{ background: C.primary + '15' }}>
                        <th className="border px-3 py-2 text-start font-bold" style={{ color: C.primary }}>
                          {ar ? 'المادة' : 'Subject'}
                        </th>
                        <th className="border px-2 py-2 text-center">{ar ? 'تكويني ف1 (10)' : 'Form.S1 (10)'}</th>
                        <th className="border px-2 py-2 text-center">{ar ? 'اختبار ف1 (25)' : 'Exam S1 (25)'}</th>
                        <th className="border px-2 py-2 text-center font-bold">{ar ? 'فجوة ف1' : 'Gap S1'}</th>
                        <th className="border px-2 py-2 text-center">{ar ? 'تكويني ف3 (10)' : 'Form.S3 (10)'}</th>
                        <th className="border px-2 py-2 text-center">{ar ? 'اختبار ف3 (25)' : 'Exam S3 (25)'}</th>
                        <th className="border px-2 py-2 text-center font-bold">{ar ? 'فجوة ف3' : 'Gap S3'}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {gapRows.map((r, i) => (
                        <tr key={i} style={{ background: i % 2 === 0 ? 'white' : '#f9fafb' }}>
                          <td className="border px-3 py-2 font-semibold text-gray-800 dark:text-gray-100"
                            style={{ background: i % 2 === 0 ? 'white' : '#f9fafb' }}>
                            {ar ? r.subject : r.subjectEn}
                          </td>
                          <td className="border px-2 py-2 text-center">
                            {r.fs1 !== null ? `${r.fs1} (${r.fs1Rate}%)` : '—'}
                          </td>
                          <td className="border px-2 py-2 text-center">
                            {r.es1 !== null ? `${r.es1} (${r.es1Rate}%)` : '—'}
                          </td>
                          <td className="border px-2 py-2 text-center">
                            <GapBadge gap={r.internalGap1} />
                          </td>
                          <td className="border px-2 py-2 text-center">
                            {r.fs3 !== null ? `${r.fs3} (${r.fs3Rate}%)` : '—'}
                          </td>
                          <td className="border px-2 py-2 text-center">
                            {r.es3 !== null ? `${r.es3} (${r.es3Rate}%)` : '—'}
                          </td>
                          <td className="border px-2 py-2 text-center">
                            <GapBadge gap={r.internalGap3} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Legend */}
                <div className="flex flex-wrap gap-4 text-xs text-gray-500">
                  {[
                    { label: ar ? 'أداء أفضل في الاختبار (>5%)' : 'Better exam perf. (>5%)', color: C.excellent },
                    { label: ar ? 'فجوة مقبولة (±5%)' : 'Acceptable gap (±5%)', color: C.good },
                    { label: ar ? 'أداء أضعف في الاختبار (<-5%)' : 'Weaker exam perf. (<-5%)', color: C.below },
                  ].map(l => (
                    <div key={l.label} className="flex items-center gap-1.5">
                      <div className="w-3 h-3 rounded-sm" style={{ background: l.color }} />
                      {l.label}
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="card text-center py-8 text-gray-400">
                {ar ? 'لا توجد بيانات تكوينية/اختبارية للفصل الأول والثالث' : 'No S1/S3 formative/exam data'}
              </div>
            )
          )}

          {/* ── Section B: Cross-semester ──────────────────────────────── */}
          {activeTab === 'cross' && (
            hasCrossData ? (
              <div className="space-y-6">
                <div className="p-3 rounded-xl text-xs text-gray-600 dark:text-gray-400"
                  style={{ background: '#f5f3ff', borderRight: `4px solid ${C.s3}` }}>
                  {ar
                    ? 'يقارن هذا القسم التقييم المستمر للفصل الثاني (من 30) بمتوسط مجموع درجات الفصلين الأول والثالث. فجوة موجبة = الفصل الثاني أعلى. الفجوة المقبولة ≤5 نقاط مئوية.'
                    : 'Compares S2 continuous assessment (out of 30) against the average total of S1 and S3. Positive = S2 higher. Acceptable gap ≤5 pp.'}
                </div>

                {/* Chart */}
                <div className="card">
                  <p className="text-xs font-semibold text-gray-500 mb-3">
                    {ar ? 'الفجوة بين الفصل الثاني ومتوسط الفصلين الأول والثالث (%)' : 'S2 vs Avg(S1, S3) Gap (%)'}
                  </p>
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart
                      data={gapRows.map(r => ({
                        name: ar ? r.subject : r.subjectEn,
                        gap: r.crossGap,
                      }))}
                      margin={{ top: 5, right: 20, left: 0, bottom: 45 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" vertical={false} />
                      <XAxis dataKey="name" angle={-30} textAnchor="end" tick={{ fontSize: 10 }} interval={0} />
                      <YAxis tick={{ fontSize: 10 }} />
                      <Tooltip formatter={(v: number) => `${v > 0 ? '+' : ''}${v}%`} />
                      <ReferenceLine y={0} stroke="#374151" />
                      <Bar dataKey="gap" name={ar ? 'الفجوة المتقاطعة' : 'Cross Gap'} radius={[3, 3, 0, 0]}>
                        {gapRows.map((r, i) => <Cell key={i} fill={gapColor(r.crossGap)} />)}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>

                {/* Table */}
                <div className="card overflow-x-auto">
                  <table className="w-full text-xs border-collapse">
                    <thead>
                      <tr style={{ background: C.primary + '15' }}>
                        <th className="border px-3 py-2 text-start font-bold" style={{ color: C.primary }}>
                          {ar ? 'المادة' : 'Subject'}
                        </th>
                        <th className="border px-2 py-2 text-center">{ar ? 'ف1 إجمالي (35%)' : 'S1 Total (35%)'}</th>
                        <th className="border px-2 py-2 text-center">{ar ? 'تقييم ف2 (30%)' : 'S2 Assess. (30%)'}</th>
                        <th className="border px-2 py-2 text-center">{ar ? 'ف3 إجمالي (35%)' : 'S3 Total (35%)'}</th>
                        <th className="border px-2 py-2 text-center font-bold">{ar ? 'الفجوة المتقاطعة' : 'Cross Gap'}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {gapRows.map((r, i) => (
                        <tr key={i} style={{ background: i % 2 === 0 ? 'white' : '#f9fafb' }}>
                          <td className="border px-3 py-2 font-semibold text-gray-800"
                            style={{ background: i % 2 === 0 ? 'white' : '#f9fafb' }}>
                            {ar ? r.subject : r.subjectEn}
                          </td>
                          <td className="border px-2 py-2 text-center">
                            {r.s1TotalRate !== null ? `${r.s1TotalRate}%` : '—'}
                          </td>
                          <td className="border px-2 py-2 text-center">
                            {r.fs2 !== null ? `${r.fs2} (${r.s2Rate}%)` : '—'}
                          </td>
                          <td className="border px-2 py-2 text-center">
                            {r.s3TotalRate !== null ? `${r.s3TotalRate}%` : '—'}
                          </td>
                          <td className="border px-2 py-2 text-center">
                            <GapBadge gap={r.crossGap} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Legend */}
                <div className="flex flex-wrap gap-4 text-xs text-gray-500">
                  {[
                    { label: ar ? 'الفصل الثاني أعلى (>5%)' : 'S2 higher (>5%)', color: C.excellent },
                    { label: ar ? 'فجوة مقبولة (±5%)' : 'Acceptable gap (±5%)', color: C.good },
                    { label: ar ? 'الفصل الثاني أقل (<-5%)' : 'S2 lower (<-5%)', color: C.below },
                  ].map(l => (
                    <div key={l.label} className="flex items-center gap-1.5">
                      <div className="w-3 h-3 rounded-sm" style={{ background: l.color }} />
                      {l.label}
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="card text-center py-8 text-gray-400">
                {ar ? 'لا توجد بيانات فصل ثانٍ للمقارنة' : 'No S2 data for cross-semester comparison'}
              </div>
            )
          )}
        </>
      )}
    </div>
  )
}
