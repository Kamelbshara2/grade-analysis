import { useState, useMemo } from 'react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import { dataStore } from '@/store/dataStore'
import { computeAchievementIndicators, computeGradeStats, round2 } from '@/utils/statistics'
import { ANALYSIS_SUBJECTS, SUBJECT_LABELS, isSubjectRelevantForGrade } from '@/utils/subjectMapping'
import type { Language, SubjectCode, Semester } from '@/types'

interface Props { lang: Language }

type Section = 'school' | 'subject' | 'grade'
type SemKey = 1 | 2 | 3 | 'annual'

const LEVEL_COLORS: Record<string, string> = {
  excellent: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300',
  very_good: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
  good: 'bg-sky-100 text-sky-800 dark:bg-sky-900/30 dark:text-sky-300',
  acceptable: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300',
  weak: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300',
}

const LEVEL_AR: Record<string, string> = { excellent: 'ممتاز', very_good: 'جيد جداً', good: 'جيد', acceptable: 'مقبول', weak: 'ضعيف' }
const LEVEL_EN: Record<string, string> = { excellent: 'Excellent', very_good: 'Very Good', good: 'Good', acceptable: 'Acceptable', weak: 'Weak' }

function LevelBadge({ level, lang }: { level: string; lang: Language }) {
  const cls = LEVEL_COLORS[level] ?? 'bg-gray-100 text-gray-600'
  const label = lang === 'ar' ? LEVEL_AR[level] : LEVEL_EN[level]
  return <span className={`inline-block px-2 py-0.5 rounded text-xs font-semibold ${cls}`}>{label}</span>
}

function statRow(label: string, value: string | number) {
  return (
    <div className="flex justify-between py-1 border-b border-gray-100 dark:border-gray-700 text-sm">
      <span className="text-gray-500 dark:text-gray-400">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  )
}

export default function Standard11({ lang }: Props) {
  const ar = lang === 'ar'
  const years = dataStore.getYears()
  const [yearId, setYearId] = useState(years[years.length - 1] ?? '')
  const [section, setSection] = useState<Section>('school')

  const records = useMemo(() => dataStore.getRecordsByYear(yearId), [yearId])

  const semKeys: SemKey[] = [1, 2, 3, 'annual']
  const semLabel = (s: SemKey) => {
    if (s === 'annual') return ar ? 'السنوي' : 'Annual'
    return ar ? `الفصل ${s === 1 ? 'الأول' : s === 2 ? 'الثاني' : 'الثالث'}` : `S${s}`
  }

  // ---- School section ----
  const schoolData = useMemo(() => {
    return semKeys.map(sem => {
      const avgs: number[] = []
      for (const r of records) {
        const scores: number[] = []
        for (const subj of ANALYSIS_SUBJECTS) {
          if (!isSubjectRelevantForGrade(subj, r.grade)) continue
          const g = r.grades[subj]
          if (!g) continue
          const score = sem === 1 ? g.s1 : sem === 2 ? g.s2 : sem === 3 ? g.s3 : g.annual
          if (score !== null) scores.push(score)
        }
        if (scores.length > 0) avgs.push(scores.reduce((a, b) => a + b, 0) / scores.length)
      }
      const count = avgs.length
      if (count === 0) return { sem, count: 0, mean: null, above75Rate: null, above90Rate: null, passRate: null, level: 'weak' as const }
      const mean = round2(avgs.reduce((a, b) => a + b, 0) / count)
      const above75Rate = round2((avgs.filter(s => s >= 75).length / count) * 100)
      const above90Rate = round2((avgs.filter(s => s >= 90).length / count) * 100)
      const passRate = round2((avgs.filter(s => s >= 50).length / count) * 100)
      let level: string
      if (passRate < 75) level = 'weak'
      else if (above75Rate >= 70) level = 'excellent'
      else if (above75Rate >= 60) level = 'very_good'
      else if (above75Rate >= 50) level = 'good'
      else level = 'acceptable'
      return { sem, count, mean, above75Rate, above90Rate, passRate, level }
    })
  }, [records])

  // ---- Subject section ----
  const subjectData = useMemo(() => {
    return ANALYSIS_SUBJECTS.map(subj => {
      const cells = semKeys.map(sem => {
        const indics = computeAchievementIndicators(
          records.filter(r => isSubjectRelevantForGrade(subj, r.grade)),
          sem === 'annual' ? 'annual' : sem as Semester
        ).find(i => i.subjectCode === subj)
        return indics ?? null
      })
      return { subj, cells }
    })
  }, [records])

  // ---- Grade section ----
  const gradeData = useMemo(() => {
    return semKeys.map(sem => {
      const stats = computeGradeStats(records, sem === 'annual' ? 'annual' : sem as Semester)
      return { sem, stats }
    })
  }, [records])

  const grades = useMemo(() => {
    const gs = [...new Set(records.map(r => r.grade))].sort((a, b) => a - b)
    return gs
  }, [records])

  const chartData = useMemo(() => {
    return ANALYSIS_SUBJECTS.map(subj => {
      const annual = computeAchievementIndicators(
        records.filter(r => isSubjectRelevantForGrade(subj, r.grade)),
        'annual'
      ).find(i => i.subjectCode === subj)
      return {
        name: ar ? SUBJECT_LABELS[subj].ar : SUBJECT_LABELS[subj].en,
        mean: annual?.mean ?? 0,
        above75Rate: annual?.above75Rate ?? 0,
        passRate: annual?.passRate ?? 0,
      }
    })
  }, [records, ar])

  if (!yearId) return <div className="p-8 text-center text-gray-500">{ar ? 'لا توجد بيانات' : 'No data available'}</div>

  const tabs: { key: Section; ar: string; en: string }[] = [
    { key: 'school', ar: 'المدرسة', en: 'School' },
    { key: 'subject', ar: 'المواد', en: 'Subjects' },
    { key: 'grade', ar: 'الصفوف', en: 'Grades' },
  ]

  return (
    <div className="p-6 space-y-6" dir={ar ? 'rtl' : 'ltr'}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
            {ar ? 'معيار 1.1 — التحصيل الأكاديمي' : 'Standard 1.1 — Academic Achievement'}
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            {ar ? 'المواد الأساسية التسع — فصول دراسية ودرجة سنوية' : 'Core 9 subjects — semesters and annual grade'}
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

      {/* Summary chart */}
      <div className="card p-4">
        <h2 className="font-semibold text-sm text-gray-700 dark:text-gray-300 mb-3">
          {ar ? 'الدرجة السنوية للمواد الأساسية' : 'Annual Scores — Core Subjects'}
        </h2>
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={chartData} margin={{ top: 5, right: 20, left: 0, bottom: 40 }}>
            <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
            <XAxis dataKey="name" tick={{ fontSize: 11 }} angle={-35} textAnchor="end" interval={0} />
            <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} />
            <Tooltip formatter={(v: number) => v.toFixed(1)} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Bar dataKey="mean" name={ar ? 'المتوسط' : 'Mean'} fill="#6366f1" radius={[3, 3, 0, 0]} />
            <Bar dataKey="above75Rate" name={ar ? '% فوق 75' : '% Above 75'} fill="#22c55e" radius={[3, 3, 0, 0]} />
            <Bar dataKey="passRate" name={ar ? '% نجاح' : '% Pass'} fill="#f59e0b" radius={[3, 3, 0, 0]} />
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
                : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'
            }`}
          >
            {ar ? tab.ar : tab.en}
          </button>
        ))}
      </div>

      {/* School section */}
      {section === 'school' && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {schoolData.map(({ sem, count, mean, above75Rate, above90Rate, passRate, level }) => (
              <div key={String(sem)} className="card p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-sm">{semLabel(sem)}</span>
                  <LevelBadge level={level} lang={lang} />
                </div>
                <div className="text-3xl font-bold text-primary-600 dark:text-primary-400">
                  {mean !== null ? mean.toFixed(1) : '—'}
                </div>
                <div className="space-y-1">
                  {statRow(ar ? 'عدد الطلاب' : 'Students', count)}
                  {statRow(ar ? '% فوق 75' : '% Above 75', above75Rate !== null ? `${above75Rate.toFixed(1)}%` : '—')}
                  {statRow(ar ? '% فوق 90' : '% Above 90', above90Rate !== null ? `${above90Rate.toFixed(1)}%` : '—')}
                  {statRow(ar ? '% نجاح' : '% Pass', passRate !== null ? `${passRate.toFixed(1)}%` : '—')}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Subject section */}
      {section === 'subject' && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 dark:bg-gray-800">
                <th className="px-3 py-2 text-start font-semibold">{ar ? 'المادة' : 'Subject'}</th>
                {semKeys.map(sem => (
                  <th key={String(sem)} className="px-3 py-2 text-center font-semibold" colSpan={2}>
                    {semLabel(sem)}
                  </th>
                ))}
              </tr>
              <tr className="bg-gray-50 dark:bg-gray-800 text-xs text-gray-500">
                <th className="px-3 py-1"></th>
                {semKeys.map(sem => (
                  <th key={`${sem}-a`} className="px-2 py-1 text-center">{ar ? 'متوسط' : 'Mean'}</th>
                )).concat(
                  semKeys.map(sem => (
                    <th key={`${sem}-b`} className="px-2 py-1 text-center">{ar ? 'مستوى' : 'Level'}</th>
                  ))
                )}
              </tr>
            </thead>
            <tbody>
              {subjectData.map(({ subj, cells }) => (
                <tr key={subj} className="border-b dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800/50">
                  <td className="px-3 py-2 font-medium">
                    {ar ? SUBJECT_LABELS[subj as SubjectCode].ar : SUBJECT_LABELS[subj as SubjectCode].en}
                  </td>
                  {cells.map((cell, i) => (
                    <td key={`${String(semKeys[i])}-mean`} className="px-2 py-2 text-center">
                      {cell ? cell.mean.toFixed(1) : '—'}
                    </td>
                  ))}
                  {cells.map((cell, i) => (
                    <td key={`${String(semKeys[i])}-lvl`} className="px-2 py-2 text-center">
                      {cell ? <LevelBadge level={cell.level} lang={lang} /> : '—'}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Grade section */}
      {section === 'grade' && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 dark:bg-gray-800">
                <th className="px-3 py-2 text-start font-semibold">{ar ? 'الصف' : 'Grade'}</th>
                {semKeys.map(sem => (
                  <th key={String(sem)} className="px-3 py-2 text-center font-semibold" colSpan={3}>
                    {semLabel(sem)}
                  </th>
                ))}
              </tr>
              <tr className="bg-gray-50 dark:bg-gray-800 text-xs text-gray-500">
                <th className="px-3 py-1"></th>
                {semKeys.flatMap(sem => [
                  <th key={`${sem}-m`} className="px-2 py-1 text-center">{ar ? 'متوسط' : 'Mean'}</th>,
                  <th key={`${sem}-p`} className="px-2 py-1 text-center">{ar ? '%75+' : '%75+'}</th>,
                  <th key={`${sem}-l`} className="px-2 py-1 text-center">{ar ? 'مستوى' : 'Level'}</th>,
                ])}
              </tr>
            </thead>
            <tbody>
              {grades.map(grade => (
                <tr key={grade} className="border-b dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800/50">
                  <td className="px-3 py-2 font-medium">{ar ? `الصف ${grade}` : `Grade ${grade}`}</td>
                  {gradeData.flatMap(({ sem, stats }) => {
                    const gs = stats.find(s => s.grade === grade)
                    return [
                      <td key={`${String(sem)}-m`} className="px-2 py-2 text-center">{gs ? gs.mean.toFixed(1) : '—'}</td>,
                      <td key={`${String(sem)}-p`} className="px-2 py-2 text-center">{gs ? `${gs.above75Rate.toFixed(0)}%` : '—'}</td>,
                      <td key={`${String(sem)}-l`} className="px-2 py-2 text-center">{gs ? <LevelBadge level={gs.level} lang={lang} /> : '—'}</td>,
                    ]
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
