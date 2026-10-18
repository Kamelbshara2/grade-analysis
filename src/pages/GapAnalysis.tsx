import { useState, useMemo } from 'react'
import { Printer } from 'lucide-react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  ReferenceLine, Cell, Legend,
} from 'recharts'
import type { Language, SubjectCode, Semester, Nationality } from '@/types'
import { dataStore } from '@/store/dataStore'
import { SUBJECT_LABELS, ANALYSIS_SUBJECTS } from '@/utils/subjectMapping'
import { round2, computeAchievementIndicators } from '@/utils/statistics'
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

const LEVEL_COLOR: Record<string, string> = {
  excellent:  '#16a34a',
  very_good:  '#0284c7',
  good:       '#d97706',
  acceptable: '#64748b',
  weak:       '#dc2626',
}
const LEVEL_BG: Record<string, string> = {
  excellent:  '#f0fdf4',
  very_good:  '#e0f2fe',
  good:       '#fffbeb',
  acceptable: '#f8fafc',
  weak:       '#fef2f2',
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
      {gap > 0 ? `+${gap}` : gap}
    </span>
  )
}

function LevelBadge({ level, labelAr, labelEn, ar }: { level: string; labelAr: string; labelEn: string; ar: boolean }) {
  return (
    <span
      className="px-2 py-0.5 rounded font-bold text-xs"
      style={{ background: LEVEL_BG[level] ?? '#f8fafc', color: LEVEL_COLOR[level] ?? '#64748b' }}
    >
      {ar ? labelAr : labelEn}
    </span>
  )
}

type Tab = 'internal' | 'cross' | 'achievement'

export default function GapAnalysis({ lang }: GapAnalysisProps) {
  const ar = lang === 'ar'
  const years = dataStore.getYears()
  const [yearId, setYearId] = useState(() => years[years.length - 1] ?? '')
  const [grade, setGrade] = useState<number | undefined>(undefined)
  const [section, setSection] = useState<string | undefined>(undefined)
  const [nationality, setNationality] = useState<Nationality | undefined>(undefined)
  const [activeTab, setActiveTab] = useState<Tab>('internal')

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
    let records = dataStore.getRecordsByYear(yearId)

    if (grade !== undefined) {
      fScores = fScores.filter(s => s.grade === grade)
      eScores = eScores.filter(s => s.grade === grade)
      records = records.filter(r => r.grade === grade)
    }
    if (section) {
      fScores = fScores.filter(s => s.section === section)
      eScores = eScores.filter(s => s.section === section)
      records = records.filter(r => r.section === section)
    }
    if (nationality) {
      const natIds = new Set(records.filter(r => r.student.nationality === nationality).map(r => r.student.id))
      fScores = fScores.filter(s => natIds.has(s.studentId))
      eScores = eScores.filter(s => natIds.has(s.studentId))
      records = records.filter(r => r.student.nationality === nationality)
    }

    const codes = [...new Set([
      ...fScores.map(s => s.subjectCode),
      ...eScores.map(s => s.subjectCode),
    ])].filter(c => ANALYSIS_SUBJECTS.includes(c as SubjectCode)) as SubjectCode[]

    const avg = (arr: (number | null)[]) => {
      const v = arr.filter((x): x is number => x !== null)
      return v.length ? round2(v.reduce((a, b) => a + b, 0) / v.length) : null
    }

    const rows = codes.map(code => {
      const fRecs = fScores.filter(s => s.subjectCode === code)
      const eRecs = eScores.filter(s => s.subjectCode === code)

      // All scores are stored as /100 — no weight conversion needed
      const fs1 = avg(fRecs.map(s => s.s1))
      const es1 = avg(eRecs.map(s => s.s1))
      const fs2 = avg(fRecs.map(s => s.s2 ?? null))
      const fs3 = avg(fRecs.map(s => s.s3))
      const es3 = avg(eRecs.map(s => s.s3))

      const fs1Rate = fs1
      const es1Rate = es1
      const internalGap1 = fs1Rate !== null && es1Rate !== null ? round2(es1Rate - fs1Rate) : null

      const s2Rate = fs2

      const fs3Rate = fs3
      const es3Rate = es3
      const internalGap3 = fs3Rate !== null && es3Rate !== null ? round2(es3Rate - fs3Rate) : null

      // Cross-semester: use semester totals from StudentRecord (already /100)
      const subjectRecords = records.filter(r => r.grades[code])
      const s1TotalRate = avg(subjectRecords.map(r => r.grades[code]?.s1 ?? null))
      const s2TotalRate = avg(subjectRecords.map(r => r.grades[code]?.s2 ?? null))
      const s3TotalRate = avg(subjectRecords.map(r => r.grades[code]?.s3 ?? null))
      const crossS2Rate = s2TotalRate ?? s2Rate

      let crossGap: number | null = null
      if (crossS2Rate !== null && s1TotalRate !== null && s3TotalRate !== null) {
        crossGap = round2(crossS2Rate - (s1TotalRate + s3TotalRate) / 2)
      } else if (crossS2Rate !== null && s1TotalRate !== null) {
        crossGap = round2(crossS2Rate - s1TotalRate)
      } else if (crossS2Rate !== null && s3TotalRate !== null) {
        crossGap = round2(crossS2Rate - s3TotalRate)
      }

      return {
        code,
        subject: SUBJECT_LABELS[code]?.ar ?? code,
        subjectEn: SUBJECT_LABELS[code]?.en ?? code,
        fs1Rate, es1Rate, internalGap1,
        s2Rate: crossS2Rate,
        fs3Rate, es3Rate, internalGap3,
        s1TotalRate: s1TotalRate ?? null,
        s3TotalRate: s3TotalRate ?? null,
        crossGap,
      }
    }).filter(r =>
      r.fs1Rate !== null || r.es1Rate !== null || r.s2Rate !== null ||
      r.fs3Rate !== null || r.es3Rate !== null
    )

    // School-wide summary (unfiltered) — all scores already /100
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
  }, [yearId, grade, section, nationality])

  // Achievement indicator (1.1) — from student records
  const achievementRows = useMemo(() => {
    const records = dataStore.getRecordsByYear(yearId)
    let filtered = grade !== undefined
      ? records.filter(r => r.grade === grade && (!section || r.section === section))
      : section ? records.filter(r => r.section === section) : records
    if (nationality) filtered = filtered.filter(r => r.student.nationality === nationality)

    const indicators = computeAchievementIndicators(filtered, 'annual')
    return indicators.filter(ind => ANALYSIS_SUBJECTS.includes(ind.subjectCode))
  }, [yearId, grade, section, nationality])

  // School-overall achievement (average of subject pass rates across analysis subjects)
  const schoolAchievement = useMemo(() => {
    if (achievementRows.length === 0) return null
    const avg = (arr: number[]) => arr.length ? round2(arr.reduce((a, b) => a + b) / arr.length) : 0
    const avgPassRate = avg(achievementRows.map(r => r.passRate))
    const avgAbove75Rate = avg(achievementRows.map(r => r.above75Rate))
    let level: string, levelAr: string, levelEn: string
    if (avgPassRate < 75) { level = 'weak'; levelAr = 'ضعيف'; levelEn = 'Weak' }
    else if (avgAbove75Rate >= 70) { level = 'excellent'; levelAr = 'ممتاز'; levelEn = 'Excellent' }
    else if (avgAbove75Rate >= 60) { level = 'very_good'; levelAr = 'جيد جداً'; levelEn = 'Very Good' }
    else if (avgAbove75Rate >= 50) { level = 'good'; levelAr = 'جيد'; levelEn = 'Good' }
    else { level = 'acceptable'; levelAr = 'مقبول'; levelEn = 'Acceptable' }
    return { avgPassRate, avgAbove75Rate, level, levelAr, levelEn }
  }, [achievementRows])

  const hasInternalData = gapRows.some(r => r.internalGap1 !== null || r.internalGap3 !== null)
  const hasCrossData = gapRows.some(r => r.crossGap !== null)

  if (years.length === 0) {
    return <div className="card text-center py-12 text-gray-500">{ar ? 'لا توجد بيانات' : 'No data'}</div>
  }

  const TABS: { id: Tab; label: string }[] = [
    { id: 'internal', label: ar ? 'أ — فجوة التكويني / الاختبار' : 'A — Formative / Exam Gap' },
    { id: 'cross',    label: ar ? 'ب — الفجوة بين الفصول' : 'B — Cross-Semester Gap' },
    { id: 'achievement', label: ar ? 'ج — المؤشر 1.1 النجاح' : 'C — 1.1 Achievement' },
  ]

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">{ar ? 'تحليل الفجوات التقييمية' : 'Assessment Gap Analysis'}</h1>
          <p className="text-xs text-gray-500 mt-0.5">
            {ar
              ? 'جميع الدرجات من 100'
              : 'All scores out of 100'}
          </p>
        </div>
        <button className="btn-primary flex items-center gap-2 text-sm no-print" onClick={() => window.print()}>
          <Printer size={14} />
          {ar ? 'طباعة' : 'Print'}
        </button>
      </div>

      {/* Filters */}
      <div className="card flex flex-wrap gap-4 items-end no-print">
        <div className="min-w-[140px]">
          <label className="label">{ar ? 'العام الدراسي' : 'Year'}</label>
          <select className="input" value={yearId}
            onChange={e => { setYearId(e.target.value); setGrade(undefined); setSection(undefined) }}>
            {years.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
        <div className="min-w-[110px]">
          <label className="label">{ar ? 'الصف' : 'Grade'}</label>
          <select className="input" value={grade ?? ''}
            onChange={e => { setGrade(e.target.value ? +e.target.value : undefined); setSection(undefined) }}>
            <option value="">{ar ? 'الكل' : 'All'}</option>
            {grades.map(g => <option key={g} value={g}>{ar ? `الصف ${g}` : `Grade ${g}`}</option>)}
          </select>
        </div>
        {sections.length > 0 && (
          <div className="min-w-[110px]">
            <label className="label">{ar ? 'الشعبة' : 'Section'}</label>
            <select className="input" value={section ?? ''} onChange={e => setSection(e.target.value || undefined)}>
              <option value="">{ar ? 'الكل' : 'All'}</option>
              {sections.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
        )}
        <div className="min-w-[130px]">
          <label className="label">{ar ? 'الجنسية' : 'Nationality'}</label>
          <select className="input" value={nationality ?? ''} onChange={e => setNationality((e.target.value || undefined) as Nationality | undefined)}>
            <option value="">{ar ? 'الكل' : 'All'}</option>
            <option value="citizen">{ar ? 'مواطن' : 'Citizen'}</option>
            <option value="expat">{ar ? 'وافد' : 'Expat'}</option>
          </select>
        </div>
      </div>

      {/* School-wide summary cards (out of 100) */}
      {(schoolSummary.avgFormS1 !== null || schoolSummary.avgExamS1 !== null ||
        schoolSummary.avgTeachS2 !== null || schoolSummary.avgFormS3 !== null || schoolSummary.avgExamS3 !== null) && (
        <div>
          <p className="text-xs font-semibold text-gray-500 mb-2">
            {ar ? '📊 معدل المدرسة ككل (من 100)' : '📊 School-Wide Averages (out of 100)'}
          </p>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            {[
              { label: ar ? 'تكويني ف1' : 'Formative S1', value: schoolSummary.avgFormS1, color: C.s1 },
              { label: ar ? 'اختبار ف1' : 'Exam S1',      value: schoolSummary.avgExamS1, color: C.s1 },
              { label: ar ? 'تقييم ف2'  : 'Assess. S2',   value: schoolSummary.avgTeachS2, color: C.s2 },
              { label: ar ? 'تكويني ف3' : 'Formative S3', value: schoolSummary.avgFormS3, color: C.s3 },
              { label: ar ? 'اختبار ف3' : 'Exam S3',      value: schoolSummary.avgExamS3, color: C.s3 },
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
                      style={{ width: `${Math.min(k.value, 100)}%`, background: k.color }} />
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex flex-wrap gap-2 no-print">
        {TABS.map(tab => (
          <button key={tab.id}
            className={clsx(
              'px-4 py-2 rounded-lg text-sm font-medium border transition-colors',
              activeTab === tab.id
                ? 'bg-primary-600 text-white border-primary-600'
                : 'border-gray-300 text-gray-600 dark:border-gray-600 dark:text-gray-400',
            )}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* ── Section A: Internal gap ────────────────────────────────── */}
      {activeTab === 'internal' && (
        gapRows.length === 0 || !hasInternalData ? (
          <div className="card text-center py-12 text-gray-400">
            {ar ? 'لا توجد بيانات تكوينية/اختبارية للفصل الأول والثالث' : 'No S1/S3 formative/exam data'}
          </div>
        ) : (
          <div className="space-y-6">
            <div className="p-3 rounded-xl text-xs text-gray-600 dark:text-gray-400"
              style={{ background: '#eff6ff', borderRight: `4px solid ${C.s1}` }}>
              {ar
                ? 'يقارن درجة التكويني بدرجة الاختبار (كلاهما من 100). فجوة موجبة = أداء أفضل في الاختبار. الفجوة المقبولة ≤5 نقاط.'
                : 'Compares formative vs exam scores (both out of 100). Positive gap = better exam performance. Acceptable gap ≤5 pts.'}
            </div>
            <div className="card">
              <p className="text-xs font-semibold text-gray-500 mb-3">
                {ar ? 'الفجوة الداخلية: اختبار − تكويني (من 100)' : 'Internal Gap: Exam − Formative (out of 100)'}
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
                  <Tooltip formatter={(v: number) => `${v > 0 ? '+' : ''}${v}`} />
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
            <div className="card overflow-x-auto">
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr style={{ background: C.primary + '15' }}>
                    <th className="border px-3 py-2 text-start font-bold" style={{ color: C.primary }}>
                      {ar ? 'المادة' : 'Subject'}
                    </th>
                    <th className="border px-2 py-2 text-center">{ar ? 'تكويني ف1' : 'Form. S1'}</th>
                    <th className="border px-2 py-2 text-center">{ar ? 'اختبار ف1' : 'Exam S1'}</th>
                    <th className="border px-2 py-2 text-center font-bold">{ar ? 'فجوة ف1' : 'Gap S1'}</th>
                    <th className="border px-2 py-2 text-center">{ar ? 'تكويني ف3' : 'Form. S3'}</th>
                    <th className="border px-2 py-2 text-center">{ar ? 'اختبار ف3' : 'Exam S3'}</th>
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
                      <td className="border px-2 py-2 text-center">{r.fs1Rate !== null ? r.fs1Rate : '—'}</td>
                      <td className="border px-2 py-2 text-center">{r.es1Rate !== null ? r.es1Rate : '—'}</td>
                      <td className="border px-2 py-2 text-center"><GapBadge gap={r.internalGap1} /></td>
                      <td className="border px-2 py-2 text-center">{r.fs3Rate !== null ? r.fs3Rate : '—'}</td>
                      <td className="border px-2 py-2 text-center">{r.es3Rate !== null ? r.es3Rate : '—'}</td>
                      <td className="border px-2 py-2 text-center"><GapBadge gap={r.internalGap3} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex flex-wrap gap-4 text-xs text-gray-500">
              {[
                { label: ar ? 'أداء أفضل في الاختبار (>5)' : 'Better exam perf. (>5)', color: C.excellent },
                { label: ar ? 'فجوة مقبولة (±5)' : 'Acceptable gap (±5)', color: C.good },
                { label: ar ? 'أداء أضعف في الاختبار (<−5)' : 'Weaker exam perf. (<−5)', color: C.below },
              ].map(l => (
                <div key={l.label} className="flex items-center gap-1.5">
                  <div className="w-3 h-3 rounded-sm" style={{ background: l.color }} />
                  {l.label}
                </div>
              ))}
            </div>
          </div>
        )
      )}

      {/* ── Section B: Cross-semester ──────────────────────────────── */}
      {activeTab === 'cross' && (
        gapRows.length === 0 || !hasCrossData ? (
          <div className="card text-center py-8 text-gray-400">
            {ar ? 'لا توجد بيانات فصل ثانٍ للمقارنة' : 'No S2 data for cross-semester comparison'}
          </div>
        ) : (
          <div className="space-y-6">
            <div className="p-3 rounded-xl text-xs text-gray-600 dark:text-gray-400"
              style={{ background: '#f5f3ff', borderRight: `4px solid ${C.s3}` }}>
              {ar
                ? 'يقارن درجة الفصل الثاني بمتوسط درجتَي الفصل الأول والثالث (جميعها من 100). فجوة موجبة = الفصل الثاني أعلى.'
                : 'Compares S2 against the average of S1 and S3 semester totals (all out of 100). Positive = S2 higher.'}
            </div>
            <div className="card">
              <p className="text-xs font-semibold text-gray-500 mb-3">
                {ar ? 'الفجوة: ف2 مقابل متوسط ف1/ف3 (من 100)' : 'S2 vs Avg(S1, S3) Gap (out of 100)'}
              </p>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart
                  data={gapRows.map(r => ({ name: ar ? r.subject : r.subjectEn, gap: r.crossGap }))}
                  margin={{ top: 5, right: 20, left: 0, bottom: 45 }}
                >
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="name" angle={-30} textAnchor="end" tick={{ fontSize: 10 }} interval={0} />
                  <YAxis tick={{ fontSize: 10 }} />
                  <Tooltip formatter={(v: number) => `${v > 0 ? '+' : ''}${v}`} />
                  <ReferenceLine y={0} stroke="#374151" />
                  <Bar dataKey="gap" name={ar ? 'الفجوة' : 'Gap'} radius={[3, 3, 0, 0]}>
                    {gapRows.map((r, i) => <Cell key={i} fill={gapColor(r.crossGap)} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="card overflow-x-auto">
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr style={{ background: C.primary + '15' }}>
                    <th className="border px-3 py-2 text-start font-bold" style={{ color: C.primary }}>
                      {ar ? 'المادة' : 'Subject'}
                    </th>
                    <th className="border px-2 py-2 text-center">{ar ? 'مجموع ف1' : 'S1 Total'}</th>
                    <th className="border px-2 py-2 text-center">{ar ? 'تقييم ف2' : 'S2 Assess.'}</th>
                    <th className="border px-2 py-2 text-center">{ar ? 'مجموع ف3' : 'S3 Total'}</th>
                    <th className="border px-2 py-2 text-center font-bold">{ar ? 'الفجوة' : 'Gap'}</th>
                  </tr>
                </thead>
                <tbody>
                  {gapRows.map((r, i) => (
                    <tr key={i} style={{ background: i % 2 === 0 ? 'white' : '#f9fafb' }}>
                      <td className="border px-3 py-2 font-semibold text-gray-800"
                        style={{ background: i % 2 === 0 ? 'white' : '#f9fafb' }}>
                        {ar ? r.subject : r.subjectEn}
                      </td>
                      <td className="border px-2 py-2 text-center">{r.s1TotalRate !== null ? r.s1TotalRate : '—'}</td>
                      <td className="border px-2 py-2 text-center">{r.s2Rate !== null ? r.s2Rate : '—'}</td>
                      <td className="border px-2 py-2 text-center">{r.s3TotalRate !== null ? r.s3TotalRate : '—'}</td>
                      <td className="border px-2 py-2 text-center"><GapBadge gap={r.crossGap} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex flex-wrap gap-4 text-xs text-gray-500">
              {[
                { label: ar ? 'ف2 أعلى (>5)' : 'S2 higher (>5)', color: C.excellent },
                { label: ar ? 'فجوة مقبولة (±5)' : 'Acceptable (±5)', color: C.good },
                { label: ar ? 'ف2 أقل (<−5)' : 'S2 lower (<−5)', color: C.below },
              ].map(l => (
                <div key={l.label} className="flex items-center gap-1.5">
                  <div className="w-3 h-3 rounded-sm" style={{ background: l.color }} />
                  {l.label}
                </div>
              ))}
            </div>
          </div>
        )
      )}

      {/* ── Section C: Achievement Indicator 1.1 ──────────────────── */}
      {activeTab === 'achievement' && (
        achievementRows.length === 0 ? (
          <div className="card text-center py-12 text-gray-400">
            {ar ? 'لا توجد بيانات درجات سنوية' : 'No annual grade data available'}
          </div>
        ) : (
          <div className="space-y-6">
            <div className="p-3 rounded-xl text-xs text-gray-600 dark:text-gray-400"
              style={{ background: '#f0fdf4', borderRight: `4px solid ${C.primary}` }}>
              {ar
                ? 'المؤشر 1.1: نسبة النجاح ≥75% من الطلاب = مقبول. ثم: >50% فوق 75 = جيد، >60% = جيد جداً، >70% = ممتاز. أقل من 75% نجاح = ضعيف.'
                : 'Indicator 1.1: ≥75% pass rate = Acceptable. Then: >50% above 75 = Good, >60% = Very Good, >70% = Excellent. <75% pass = Weak.'}
            </div>

            {/* School overall */}
            {schoolAchievement && (
              <div className="rounded-xl border-2 p-4"
                style={{ borderColor: LEVEL_COLOR[schoolAchievement.level] + '55', background: LEVEL_BG[schoolAchievement.level] }}>
                <div className="flex items-center justify-between flex-wrap gap-3">
                  <div>
                    <p className="text-sm font-bold text-gray-700">
                      {ar ? '🏫 المدرسة ككل (متوسط المواد المعتمدة)' : '🏫 School Overall (approved subjects average)'}
                    </p>
                    <p className="text-xs text-gray-500 mt-0.5">
                      {ar
                        ? `نسبة النجاح: ${schoolAchievement.avgPassRate}% · فوق 75: ${schoolAchievement.avgAbove75Rate}%`
                        : `Pass rate: ${schoolAchievement.avgPassRate}% · Above 75: ${schoolAchievement.avgAbove75Rate}%`}
                    </p>
                  </div>
                  <LevelBadge level={schoolAchievement.level} labelAr={schoolAchievement.levelAr} labelEn={schoolAchievement.levelEn} ar={ar} />
                </div>
              </div>
            )}

            {/* Per-subject chart */}
            <div className="card">
              <p className="text-xs font-semibold text-gray-500 mb-3">
                {ar ? 'نسبة الطلاب فوق 75 لكل مادة (%)' : '% Students above 75 per subject'}
              </p>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart
                  data={achievementRows.map(r => ({
                    name: ar ? SUBJECT_LABELS[r.subjectCode]?.ar ?? r.subjectCode : SUBJECT_LABELS[r.subjectCode]?.en ?? r.subjectCode,
                    above75: r.above75Rate,
                    pass: r.passRate,
                  }))}
                  margin={{ top: 5, right: 20, left: 0, bottom: 45 }}
                >
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="name" angle={-30} textAnchor="end" tick={{ fontSize: 10 }} interval={0} />
                  <YAxis domain={[0, 100]} tick={{ fontSize: 10 }} />
                  <Tooltip formatter={(v: number) => `${v}%`} />
                  <Legend />
                  <ReferenceLine y={75} stroke="#d97706" strokeDasharray="4 4" label={{ value: '75%', position: 'right', fontSize: 9 }} />
                  <ReferenceLine y={50} stroke="#9ca3af" strokeDasharray="3 3" />
                  <Bar dataKey="pass" name={ar ? 'نسبة النجاح' : 'Pass rate'} fill={C.s1} radius={[2, 2, 0, 0]} />
                  <Bar dataKey="above75" name={ar ? 'فوق 75' : 'Above 75'} fill={C.excellent} radius={[2, 2, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* Per-subject table */}
            <div className="card overflow-x-auto">
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr style={{ background: C.primary + '15' }}>
                    <th className="border px-3 py-2 text-start font-bold" style={{ color: C.primary }}>
                      {ar ? 'المادة' : 'Subject'}
                    </th>
                    <th className="border px-2 py-2 text-center">{ar ? 'عدد الطلاب' : 'Students'}</th>
                    <th className="border px-2 py-2 text-center">{ar ? 'متوسط' : 'Mean'}</th>
                    <th className="border px-2 py-2 text-center">{ar ? 'نسبة النجاح' : 'Pass rate'}</th>
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
                        <span className={clsx('font-medium', r.passRate >= 75 ? 'text-green-600' : 'text-red-500')}>
                          {r.passRate}%
                        </span>
                      </td>
                      <td className="border px-2 py-2 text-center">
                        <span className="font-medium">{r.above75Rate}%</span>
                        <span className="text-gray-400 ml-1">({r.above75Count})</span>
                      </td>
                      <td className="border px-2 py-2 text-center">
                        <LevelBadge level={r.level} labelAr={r.levelAr} labelEn={r.levelEn} ar={ar} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Legend */}
            <div className="flex flex-wrap gap-4 text-xs text-gray-500">
              {[
                { label: ar ? 'ممتاز (>70% فوق 75)' : 'Excellent (>70% above 75)', color: LEVEL_COLOR.excellent },
                { label: ar ? 'جيد جداً (>60%)' : 'Very Good (>60%)', color: LEVEL_COLOR.very_good },
                { label: ar ? 'جيد (>50%)' : 'Good (>50%)', color: LEVEL_COLOR.good },
                { label: ar ? 'مقبول (نجاح ≥75%)' : 'Acceptable (pass ≥75%)', color: LEVEL_COLOR.acceptable },
                { label: ar ? 'ضعيف (نجاح <75%)' : 'Weak (pass <75%)', color: LEVEL_COLOR.weak },
              ].map(l => (
                <div key={l.label} className="flex items-center gap-1.5">
                  <div className="w-3 h-3 rounded-sm" style={{ background: l.color }} />
                  {l.label}
                </div>
              ))}
            </div>
          </div>
        )
      )}
    </div>
  )
}
