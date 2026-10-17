import { useState, useMemo } from 'react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import { dataStore } from '@/store/dataStore'
import { computeAchievementIndicators, computeGradeStats, round2 } from '@/utils/statistics'
import { ANALYSIS_SUBJECTS, SUBJECT_LABELS } from '@/utils/subjectMapping'
import type { Language, SubjectCode, Cycle } from '@/types'
import { getCycle, getPassMark } from '@/utils/subjectMapping'

interface Props { lang: Language }

type Section = 'school' | 'subject' | 'grade'

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

/** Derive level from pass rate + above75 rate */
function deriveLevel(passRate: number, above75Rate: number): string {
  if (passRate < 75) return 'weak'
  if (above75Rate >= 70) return 'excellent'
  if (above75Rate >= 60) return 'very_good'
  if (above75Rate >= 50) return 'good'
  return 'acceptable'
}

export default function Standard11({ lang }: Props) {
  const ar = lang === 'ar'
  const years = dataStore.getYears()
  const [yearId, setYearId] = useState(years[years.length - 1] ?? '')
  const [section, setSection] = useState<Section>('school')

  const records = useMemo(() => dataStore.getRecordsByYear(yearId), [yearId])

  const semLabel = (s: 1 | 2 | 3) => ar
    ? `الفصل ${s === 1 ? 'الأول' : s === 2 ? 'الثاني' : 'الثالث'}`
    : `Semester ${s}`

  // ── School: per-semester stats (pass rate + above75 rate + level) ─────────
  const schoolSemData = useMemo(() => {
    return ([1, 2, 3] as const).map(sem => {
      // Collect each student's average across subjects for this semester
      const studentAvgs: number[] = []
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
        if (scores.length > 0) {
          studentAvgs.push(scores.reduce((a, b) => a + b, 0) / scores.length)
        }
      }
      const count = studentAvgs.length
      if (count === 0) return { sem, count: 0, passRate: 0, above75Rate: 0, level: 'weak' }
      // Use cycle-aware pass mark (student average determines pass)
      const cycle: Cycle = records.length > 0 ? getCycle(records[0].grade) : 3
      const passMark = getPassMark(cycle)
      const passRate = round2((studentAvgs.filter(s => s >= passMark).length / count) * 100)
      const above75Rate = round2((studentAvgs.filter(s => s >= 75).length / count) * 100)
      return { sem, count, passRate, above75Rate, level: deriveLevel(passRate, above75Rate) }
    })
  }, [records])

  // ── School: annual stats from annualAvg ──────────────────────────────────
  const annualSchoolData = useMemo(() => {
    const valid = records.filter(r => r.annualAvg !== null)
    const count = valid.length
    if (count === 0) return { count: 0, passRate: 0, above75Rate: 0, level: 'weak' }
    const passCount = valid.filter(r => r.annualAvg! >= getPassMark(getCycle(r.grade))).length
    const above75Count = valid.filter(r => r.annualAvg! >= 75).length
    const passRate = round2((passCount / count) * 100)
    const above75Rate = round2((above75Count / count) * 100)
    return { count, passRate, above75Rate, level: deriveLevel(passRate, above75Rate) }
  }, [records])

  // ── Subject: annual stats for all 9 subjects (regardless of grade filter) ──
  const subjectAnnualData = useMemo(() => {
    // For each subject, compute indicators from all records that have any data for it
    return ANALYSIS_SUBJECTS.map(subj => {
      // Get records that have this subject (some grades won't have bio/chem/physics)
      const relevantRecords = records.filter(r => r.grades[subj] != null)
      if (relevantRecords.length === 0) return { subj, passRate: null, above75Rate: null, level: null, count: 0 }
      const indicators = computeAchievementIndicators(relevantRecords, 'annual')
      const ind = indicators.find(i => i.subjectCode === subj)
      if (!ind) return { subj, passRate: null, above75Rate: null, level: null, count: 0 }
      return { subj, passRate: ind.passRate, above75Rate: ind.above75Rate, level: ind.level, count: ind.totalStudents }
    })
  }, [records])

  // ── Grade: annual stats per grade ─────────────────────────────────────────
  const gradeAnnualData = useMemo(() => {
    const gs = computeGradeStats(records, 'annual')
    return gs
  }, [records])

  // Chart data: subjects, annual pass rate + above75
  const chartData = useMemo(() => {
    return subjectAnnualData
      .filter(d => d.passRate !== null)
      .map(d => ({
        name: ar ? SUBJECT_LABELS[d.subj as SubjectCode].ar : SUBJECT_LABELS[d.subj as SubjectCode].en,
        [ar ? 'نسبة النجاح' : 'Pass Rate']: d.passRate ?? 0,
        [ar ? 'فوق 75%' : 'Above 75%']: d.above75Rate ?? 0,
      }))
  }, [subjectAnnualData, ar])

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
        <select
          value={yearId}
          onChange={e => setYearId(e.target.value)}
          className="border rounded-lg px-3 py-1.5 text-sm bg-white dark:bg-gray-800 dark:border-gray-600"
        >
          {years.map(y => <option key={y} value={y}>{y}</option>)}
        </select>
      </div>

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
          {/* S1 / S2 / S3 cards */}
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

          {/* Annual card — full-width below semester cards */}
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
        </div>
      )}

      {/* ── Subject ── annual only: pass rate + above75 + level ── */}
      {section === 'subject' && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 dark:bg-gray-800 text-gray-600 dark:text-gray-300">
                <th className="px-4 py-3 text-start font-semibold">{ar ? 'المادة' : 'Subject'}</th>
                <th className="px-4 py-3 text-center font-semibold">{ar ? 'عدد الطلاب' : 'Students'}</th>
                <th className="px-4 py-3 text-center font-semibold">{ar ? 'نسبة النجاح' : 'Pass Rate'}</th>
                <th className="px-4 py-3 text-center font-semibold">{ar ? 'نسبة فوق 75' : 'Above 75%'}</th>
                <th className="px-4 py-3 text-center font-semibold">{ar ? 'المستوى' : 'Level'}</th>
              </tr>
            </thead>
            <tbody>
              {subjectAnnualData.map(({ subj, count, passRate, above75Rate, level }) => (
                <tr key={subj} className="border-b dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800/50">
                  <td className="px-4 py-3 font-medium">
                    {ar ? SUBJECT_LABELS[subj as SubjectCode].ar : SUBJECT_LABELS[subj as SubjectCode].en}
                  </td>
                  <td className="px-4 py-3 text-center text-gray-500">{count > 0 ? count : '—'}</td>
                  <td className="px-4 py-3 text-center">
                    {passRate !== null
                      ? <span className="font-bold text-amber-600">{passRate.toFixed(1)}%</span>
                      : <span className="text-gray-300">—</span>}
                  </td>
                  <td className="px-4 py-3 text-center">
                    {above75Rate !== null
                      ? <span className="font-bold text-emerald-600">{above75Rate.toFixed(1)}%</span>
                      : <span className="text-gray-300">—</span>}
                  </td>
                  <td className="px-4 py-3 text-center">
                    {level ? <LevelBadge level={level} lang={lang} /> : <span className="text-gray-300">—</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Grade ── annual only: pass rate + above75 + level ── */}
      {section === 'grade' && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 dark:bg-gray-800 text-gray-600 dark:text-gray-300">
                <th className="px-4 py-3 text-start font-semibold">{ar ? 'الصف' : 'Grade'}</th>
                <th className="px-4 py-3 text-center font-semibold">{ar ? 'عدد الطلاب' : 'Students'}</th>
                <th className="px-4 py-3 text-center font-semibold">{ar ? 'نسبة النجاح' : 'Pass Rate'}</th>
                <th className="px-4 py-3 text-center font-semibold">{ar ? 'نسبة فوق 75' : 'Above 75%'}</th>
                <th className="px-4 py-3 text-center font-semibold">{ar ? 'المستوى' : 'Level'}</th>
              </tr>
            </thead>
            <tbody>
              {gradeAnnualData.map(gs => (
                <tr key={gs.grade} className="border-b dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800/50">
                  <td className="px-4 py-3 font-bold">{ar ? `الصف ${gs.grade}` : `Grade ${gs.grade}`}</td>
                  <td className="px-4 py-3 text-center text-gray-500">{gs.count}</td>
                  <td className="px-4 py-3 text-center">
                    <span className="font-bold text-amber-600">{gs.passRate.toFixed(1)}%</span>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className="font-bold text-emerald-600">{gs.above75Rate.toFixed(1)}%</span>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <LevelBadge level={gs.level} lang={lang} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
