import { useState, useMemo } from 'react'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, ReferenceLine,
} from 'recharts'
import { dataStore } from '@/store/dataStore'
import {
  computeSchoolTrendPoints, computeSubjectTrendPoints,
  computeGradeStats, round2,
} from '@/utils/statistics'
import { ANALYSIS_SUBJECTS, SUBJECT_LABELS, isSubjectRelevantForGrade } from '@/utils/subjectMapping'
import type { Language, SubjectCode } from '@/types'

interface Props { lang: Language }

type Part = 'multiyear' | 'withinyear'
type Section = 'school' | 'subject' | 'grade'

const SUBJECT_COLORS: Record<SubjectCode, string> = {
  arabic: '#6366f1', english: '#22c55e', math: '#f59e0b', islamic: '#ec4899',
  social: '#14b8a6', science: '#8b5cf6', physics: '#ef4444', chemistry: '#f97316',
  biology: '#06b6d4', health_science: '#64748b',
}

const GRADE_COLORS = ['#6366f1', '#22c55e', '#f59e0b', '#ec4899', '#14b8a6', '#8b5cf6', '#ef4444', '#f97316']

function StatPill({ label, value, color = 'gray' }: { label: string; value: string | number; color?: string }) {
  const colorMap: Record<string, string> = {
    gray: 'bg-gray-100 dark:bg-gray-800',
    blue: 'bg-blue-50 dark:bg-blue-900/20',
    green: 'bg-green-50 dark:bg-green-900/20',
    amber: 'bg-amber-50 dark:bg-amber-900/20',
  }
  return (
    <div className={`rounded-lg p-3 ${colorMap[color] ?? colorMap.gray}`}>
      <div className="text-xs text-gray-500 dark:text-gray-400">{label}</div>
      <div className="text-lg font-bold mt-0.5">{value}</div>
    </div>
  )
}

export default function Standard12({ lang }: Props) {
  const ar = lang === 'ar'
  const years = dataStore.getYears()
  const [part, setPart] = useState<Part>('multiyear')
  const [section, setSection] = useState<Section>('school')
  const [selectedSubject, setSelectedSubject] = useState<SubjectCode>('math')

  const latestYear = years[years.length - 1] ?? ''

  const allYearRecords = useMemo(() => {
    return years.map(y => ({ yearId: y, records: dataStore.getRecordsByYear(y) }))
  }, [years])

  const latestRecords = useMemo(() => dataStore.getRecordsByYear(latestYear), [latestYear])

  // ---- Multi-year school trend ----
  const schoolTrend = useMemo(() => computeSchoolTrendPoints(allYearRecords), [allYearRecords])

  // ---- Multi-year subject trend ----
  const subjectTrend = useMemo(() => computeSubjectTrendPoints(allYearRecords, selectedSubject), [allYearRecords, selectedSubject])

  // ---- Multi-year grade cohorts ----
  // For each grade in the earliest available year, track students across subsequent years
  const gradeCohortData = useMemo(() => {
    if (allYearRecords.length < 2) return []
    const baseYear = allYearRecords[0]
    const baseGrades = [...new Set(baseYear.records.map(r => r.grade))].sort((a, b) => a - b)
    return baseGrades.map(startGrade => {
      // For each subsequent year, the same students would be in startGrade + yearOffset
      const points = allYearRecords.map(({ yearId, records }, yi) => {
        const targetGrade = startGrade + yi
        const relevantRecords = records.filter(r => r.grade === targetGrade)
        if (relevantRecords.length === 0) return { yearId, grade: targetGrade, mean: null, count: 0 }

        // Find students from base year in this year
        const baseStudentIds = new Set(baseYear.records.filter(r => r.grade === startGrade).map(r => r.student.id))
        const cohortRecords = relevantRecords.filter(r => baseStudentIds.has(r.student.id))
        const avgs: number[] = []
        for (const r of (cohortRecords.length > 0 ? cohortRecords : relevantRecords)) {
          const scores: number[] = []
          for (const subj of ANALYSIS_SUBJECTS) {
            if (!isSubjectRelevantForGrade(subj, targetGrade)) continue
            const g = r.grades[subj]
            if (g?.annual !== null && g?.annual !== undefined) scores.push(g.annual)
          }
          if (scores.length > 0) avgs.push(scores.reduce((a, b) => a + b, 0) / scores.length)
        }
        const mean = avgs.length > 0 ? round2(avgs.reduce((a, b) => a + b, 0) / avgs.length) : null
        return { yearId, grade: targetGrade, mean, count: avgs.length }
      })
      return { startGrade, points }
    })
  }, [allYearRecords])

  // ---- Within-year school (S1→S2→S3) ----
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
      const count = avgs.length
      if (count === 0) return { sem, mean: null, above75Rate: null, passRate: null, count: 0 }
      const mean = round2(avgs.reduce((a, b) => a + b, 0) / count)
      return {
        sem,
        mean,
        above75Rate: round2((avgs.filter(s => s >= 75).length / count) * 100),
        passRate: round2((avgs.filter(s => s >= 50).length / count) * 100),
        count,
      }
    })
  }, [latestRecords])

  // ---- Within-year subject (S1→S2→S3) ----
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
        const mean = round2(scores.reduce((a, b) => a + b, 0) / scores.length)
        const above75Rate = round2((scores.filter(s => s >= 75).length / scores.length) * 100)
        return { mean, above75Rate, count: scores.length }
      })
      return { subj, cells }
    })
  }, [latestRecords])

  // ---- Within-year grade (S1→S2→S3) ----
  const withinGradeData = useMemo(() => {
    return [1, 2, 3].map(sem => ({
      sem,
      stats: computeGradeStats(latestRecords, sem as 1 | 2 | 3),
    }))
  }, [latestRecords])

  const grades = useMemo(() => [...new Set(latestRecords.map(r => r.grade))].sort((a, b) => a - b), [latestRecords])

  if (!latestYear) {
    return <div className="p-8 text-center text-gray-500">{ar ? 'لا توجد بيانات' : 'No data'}</div>
  }

  const semLabel = (s: number) => ar ? `ف${s}` : `S${s}`

  const sections: { key: Section; ar: string; en: string }[] = [
    { key: 'school', ar: 'المدرسة', en: 'School' },
    { key: 'subject', ar: 'المواد', en: 'Subjects' },
    { key: 'grade', ar: 'الصفوف', en: 'Grades' },
  ]

  const trendTooltipFormatter = (value: number, name: string) => [`${value?.toFixed(1)}%`, name]

  return (
    <div className="p-6 space-y-6" dir={ar ? 'rtl' : 'ltr'}>
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
          {ar ? 'معيار 1.2 — تتبع التقدم' : 'Standard 1.2 — Progress Tracking'}
        </h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
          {ar
            ? 'متابعة تقدم الطلاب عبر السنوات والفصول الدراسية'
            : 'Student progress across years and semesters'}
        </p>
      </div>

      {/* Part toggle */}
      <div className="inline-flex rounded-lg border dark:border-gray-700 overflow-hidden">
        {(['multiyear', 'withinyear'] as Part[]).map(p => (
          <button
            key={p}
            onClick={() => { setPart(p); setSection('school') }}
            className={`px-5 py-2 text-sm font-medium transition-colors ${
              part === p
                ? 'bg-primary-600 text-white'
                : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'
            }`}
          >
            {p === 'multiyear'
              ? (ar ? 'الجزء 1 — متعدد السنوات' : 'Part 1 — Multi-Year')
              : (ar ? 'الجزء 2 — داخل العام' : 'Part 2 — Within Year')}
          </button>
        ))}
      </div>

      {/* Section tabs */}
      <div className="flex gap-1 border-b dark:border-gray-700">
        {sections.map(sec => (
          <button
            key={sec.key}
            onClick={() => setSection(sec.key)}
            className={`px-4 py-2 text-sm font-medium transition-colors ${
              section === sec.key
                ? 'border-b-2 border-primary-600 text-primary-700 dark:text-primary-400'
                : 'text-gray-500 hover:text-gray-700 dark:text-gray-400'
            }`}
          >
            {ar ? sec.ar : sec.en}
          </button>
        ))}
      </div>

      {/* ===== PART 1: MULTI-YEAR ===== */}
      {part === 'multiyear' && (
        <>
          {/* School */}
          {section === 'school' && (
            <div className="space-y-6">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {schoolTrend.filter(p => p.mean !== null).slice(-3).map(pt => (
                  <StatPill key={`${pt.yearId}-${pt.semester}`} label={ar ? pt.label : pt.labelEn} value={`${pt.mean?.toFixed(1) ?? '—'}`} color="blue" />
                ))}
              </div>
              <div className="card p-4">
                <h2 className="font-semibold text-sm mb-4">
                  {ar ? `اتجاه معدل المدرسة عبر ${years.length} سنوات (${schoolTrend.filter(p => p.mean !== null).length} فصلاً)` : `School mean trend across ${years.length} years`}
                </h2>
                <ResponsiveContainer width="100%" height={280}>
                  <LineChart data={schoolTrend} margin={{ top: 5, right: 20, left: 0, bottom: 60 }}>
                    <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                    <XAxis dataKey={ar ? 'label' : 'labelEn'} tick={{ fontSize: 10 }} angle={-40} textAnchor="end" interval={0} />
                    <YAxis domain={[40, 100]} tick={{ fontSize: 11 }} />
                    <Tooltip formatter={(v: number) => v?.toFixed(1)} />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <ReferenceLine y={75} stroke="#22c55e" strokeDasharray="4 4" label={{ value: '75', position: 'right', fontSize: 10 }} />
                    <Line type="monotone" dataKey="mean" name={ar ? 'المتوسط' : 'Mean'} stroke="#6366f1" strokeWidth={2} dot connectNulls />
                    <Line type="monotone" dataKey="above75Rate" name={ar ? '% فوق 75' : '% Above 75'} stroke="#22c55e" strokeWidth={2} dot connectNulls />
                    <Line type="monotone" dataKey="passRate" name={ar ? '% نجاح' : '% Pass'} stroke="#f59e0b" strokeWidth={2} dot connectNulls />
                  </LineChart>
                </ResponsiveContainer>
              </div>
              {/* Stats table */}
              <div className="overflow-x-auto card">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 dark:bg-gray-800">
                      <th className="px-3 py-2 text-start">{ar ? 'الفصل' : 'Semester'}</th>
                      <th className="px-3 py-2 text-center">{ar ? 'عدد' : 'N'}</th>
                      <th className="px-3 py-2 text-center">{ar ? 'المتوسط' : 'Mean'}</th>
                      <th className="px-3 py-2 text-center">{ar ? 'الانحراف' : 'Std'}</th>
                      <th className="px-3 py-2 text-center">{ar ? '% 75+' : '% 75+'}</th>
                      <th className="px-3 py-2 text-center">{ar ? '% 90+' : '% 90+'}</th>
                      <th className="px-3 py-2 text-center">{ar ? '% نجاح' : '% Pass'}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {schoolTrend.map((pt, i) => (
                      <tr key={i} className="border-b dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800/50">
                        <td className="px-3 py-2 font-medium">{ar ? pt.label : pt.labelEn}</td>
                        <td className="px-3 py-2 text-center">{pt.count}</td>
                        <td className="px-3 py-2 text-center">{pt.mean?.toFixed(1) ?? '—'}</td>
                        <td className="px-3 py-2 text-center">{pt.stdDev?.toFixed(1) ?? '—'}</td>
                        <td className="px-3 py-2 text-center">{pt.above75Rate?.toFixed(1) ?? '—'}%</td>
                        <td className="px-3 py-2 text-center">{pt.above90Rate?.toFixed(1) ?? '—'}%</td>
                        <td className="px-3 py-2 text-center">{pt.passRate?.toFixed(1) ?? '—'}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Subject */}
          {section === 'subject' && (
            <div className="space-y-4">
              <div className="flex flex-wrap gap-2">
                {ANALYSIS_SUBJECTS.map(subj => (
                  <button
                    key={subj}
                    onClick={() => setSelectedSubject(subj)}
                    className={`px-3 py-1.5 text-xs rounded-full border transition-colors ${
                      selectedSubject === subj
                        ? 'bg-primary-600 text-white border-primary-600'
                        : 'border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-400 hover:border-primary-400'
                    }`}
                  >
                    {ar ? SUBJECT_LABELS[subj].ar : SUBJECT_LABELS[subj].en}
                  </button>
                ))}
              </div>
              <div className="card p-4">
                <h2 className="font-semibold text-sm mb-4">
                  {ar ? SUBJECT_LABELS[selectedSubject].ar : SUBJECT_LABELS[selectedSubject].en}
                  {' — '}
                  {ar ? 'الاتجاه عبر السنوات' : 'Trend Across Years'}
                </h2>
                <ResponsiveContainer width="100%" height={280}>
                  <LineChart data={subjectTrend} margin={{ top: 5, right: 20, left: 0, bottom: 60 }}>
                    <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                    <XAxis dataKey={ar ? 'label' : 'labelEn'} tick={{ fontSize: 10 }} angle={-40} textAnchor="end" interval={0} />
                    <YAxis domain={[40, 100]} tick={{ fontSize: 11 }} />
                    <Tooltip formatter={trendTooltipFormatter} />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <ReferenceLine y={75} stroke="#22c55e" strokeDasharray="4 4" />
                    <Line type="monotone" dataKey="mean" name={ar ? 'المتوسط' : 'Mean'} stroke={SUBJECT_COLORS[selectedSubject]} strokeWidth={2.5} dot connectNulls />
                    <Line type="monotone" dataKey="above75Rate" name={ar ? '% فوق 75' : '% Above 75'} stroke="#22c55e" strokeWidth={1.5} dot strokeDasharray="4 4" connectNulls />
                  </LineChart>
                </ResponsiveContainer>
              </div>
              {/* All subjects mini-summary */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {ANALYSIS_SUBJECTS.map(subj => {
                  const pts = computeSubjectTrendPoints(allYearRecords, subj)
                  const validPts = pts.filter(p => p.mean !== null)
                  if (validPts.length < 2) return null
                  const first = validPts[0]
                  const last = validPts[validPts.length - 1]
                  const diff = (last.mean ?? 0) - (first.mean ?? 0)
                  return (
                    <div key={subj} className="card p-3 flex items-center justify-between">
                      <span className="text-sm font-medium">{ar ? SUBJECT_LABELS[subj].ar : SUBJECT_LABELS[subj].en}</span>
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-gray-500">{first.mean?.toFixed(1)} → {last.mean?.toFixed(1)}</span>
                        <span className={`text-xs font-bold ${diff >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                          {diff >= 0 ? '+' : ''}{diff.toFixed(1)}
                        </span>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Grade cohorts */}
          {section === 'grade' && (
            <div className="space-y-4">
              <p className="text-xs text-gray-500 dark:text-gray-400 bg-amber-50 dark:bg-amber-900/20 px-3 py-2 rounded-lg">
                {ar
                  ? 'يتتبع كل صف نفس المجموعة من الطلاب عبر السنوات (الصف 9 عام 2023-24 → صف 10 عام 2024-25 → صف 11 عام 2025-26)'
                  : 'Each row tracks the same student cohort across years (Grade 9 in 2023-24 → Grade 10 in 2024-25 → Grade 11 in 2025-26)'}
              </p>
              {gradeCohortData.length === 0 && (
                <div className="text-center text-gray-400 py-8">{ar ? 'يلزم بيانات سنتين على الأقل' : 'At least 2 years of data required'}</div>
              )}
              {gradeCohortData.map(({ startGrade, points }, ci) => (
                <div key={startGrade} className="card p-4">
                  <h3 className="font-semibold text-sm mb-3">
                    {ar ? `مجموعة بدأت من الصف ${startGrade}` : `Cohort starting at Grade ${startGrade}`}
                  </h3>
                  <div className="flex gap-6 items-end">
                    {points.map((pt, i) => (
                      <div key={pt.yearId} className="text-center">
                        <div className="text-xs text-gray-500">{ar ? `صف ${pt.grade}` : `Gr ${pt.grade}`}</div>
                        <div className="text-lg font-bold" style={{ color: GRADE_COLORS[ci % GRADE_COLORS.length] }}>
                          {pt.mean?.toFixed(1) ?? '—'}
                        </div>
                        <div className="text-xs text-gray-400">{pt.yearId.slice(2, 4)}-{pt.yearId.slice(7, 9)}</div>
                        {i > 0 && points[i - 1].mean !== null && pt.mean !== null && (
                          <div className={`text-xs font-semibold ${(pt.mean - (points[i - 1].mean ?? 0)) >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                            {((pt.mean - (points[i - 1].mean ?? 0)) >= 0 ? '+' : '')}{(pt.mean - (points[i - 1].mean ?? 0)).toFixed(1)}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* ===== PART 2: WITHIN YEAR ===== */}
      {part === 'withinyear' && (
        <>
          {/* School within-year */}
          {section === 'school' && (
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-4">
                {withinSchoolData.map(d => (
                  <div key={d.sem} className="card p-4 text-center">
                    <div className="text-sm text-gray-500 mb-1">{semLabel(d.sem)}</div>
                    <div className="text-3xl font-bold text-primary-600">{d.mean?.toFixed(1) ?? '—'}</div>
                    <div className="text-xs text-gray-400 mt-1">{d.count} {ar ? 'طالب' : 'students'}</div>
                    <div className="text-xs mt-1 text-green-600">{d.above75Rate?.toFixed(1) ?? '—'}% {ar ? 'فوق 75' : 'above 75'}</div>
                  </div>
                ))}
              </div>
              <div className="card p-4">
                <h2 className="font-semibold text-sm mb-4">{ar ? `التقدم داخل عام ${latestYear}` : `Within-Year Progress ${latestYear}`}</h2>
                <ResponsiveContainer width="100%" height={220}>
                  <LineChart data={withinSchoolData.map(d => ({ sem: semLabel(d.sem), mean: d.mean, above75Rate: d.above75Rate, passRate: d.passRate }))} margin={{ top: 5, right: 20, left: 0, bottom: 20 }}>
                    <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                    <XAxis dataKey="sem" tick={{ fontSize: 12 }} />
                    <YAxis domain={[40, 100]} tick={{ fontSize: 11 }} />
                    <Tooltip formatter={(v: number) => v?.toFixed(1)} />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <ReferenceLine y={75} stroke="#22c55e" strokeDasharray="4 4" />
                    <Line type="monotone" dataKey="mean" name={ar ? 'المتوسط' : 'Mean'} stroke="#6366f1" strokeWidth={2.5} dot={{ r: 5 }} />
                    <Line type="monotone" dataKey="above75Rate" name={ar ? '% فوق 75' : '% Above 75'} stroke="#22c55e" strokeWidth={2} dot={{ r: 4 }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {/* Subject within-year */}
          {section === 'subject' && (
            <div className="space-y-4">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 dark:bg-gray-800">
                      <th className="px-3 py-2 text-start">{ar ? 'المادة' : 'Subject'}</th>
                      {[1, 2, 3].flatMap(sem => [
                        <th key={`${sem}-m`} className="px-2 py-2 text-center" colSpan={2}>{semLabel(sem)}</th>,
                      ])}
                    </tr>
                    <tr className="bg-gray-50 dark:bg-gray-800 text-xs text-gray-400">
                      <th className="px-3 py-1"></th>
                      {[1, 2, 3].flatMap(sem => [
                        <th key={`${sem}-m`} className="px-2 py-1 text-center">{ar ? 'متوسط' : 'Mean'}</th>,
                        <th key={`${sem}-p`} className="px-2 py-1 text-center">{ar ? '%75+' : '%75+'}</th>,
                      ])}
                    </tr>
                  </thead>
                  <tbody>
                    {withinSubjectData.map(({ subj, cells }) => {
                      const diffs = cells.map((c, i) => i === 0 ? null : (c && cells[i - 1] ? (c.mean - cells[i - 1]!.mean) : null))
                      return (
                        <tr key={subj} className="border-b dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800/50">
                          <td className="px-3 py-2 font-medium">
                            {ar ? SUBJECT_LABELS[subj as SubjectCode].ar : SUBJECT_LABELS[subj as SubjectCode].en}
                          </td>
                          {cells.flatMap((cell, i) => [
                            <td key={`${String(i)}-m`} className="px-2 py-2 text-center">
                              <span>{cell?.mean.toFixed(1) ?? '—'}</span>
                              {diffs[i] !== null && (
                                <span className={`ms-1 text-xs ${(diffs[i] ?? 0) >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                                  {(diffs[i] ?? 0) >= 0 ? '▲' : '▼'}{Math.abs(diffs[i] ?? 0).toFixed(1)}
                                </span>
                              )}
                            </td>,
                            <td key={`${String(i)}-p`} className="px-2 py-2 text-center text-gray-500">
                              {cell?.above75Rate.toFixed(0) ?? '—'}%
                            </td>,
                          ])}
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Grade within-year */}
          {section === 'grade' && (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 dark:bg-gray-800">
                    <th className="px-3 py-2 text-start">{ar ? 'الصف' : 'Grade'}</th>
                    {[1, 2, 3].flatMap(sem => [
                      <th key={`${sem}-h`} className="px-2 py-2 text-center" colSpan={2}>{semLabel(sem)}</th>,
                    ])}
                  </tr>
                  <tr className="bg-gray-50 dark:bg-gray-800 text-xs text-gray-400">
                    <th className="px-3 py-1"></th>
                    {[1, 2, 3].flatMap(sem => [
                      <th key={`${sem}-m`} className="px-2 py-1 text-center">{ar ? 'متوسط' : 'Mean'}</th>,
                      <th key={`${sem}-p`} className="px-2 py-1 text-center">{ar ? '%75+' : '%75+'}</th>,
                    ])}
                  </tr>
                </thead>
                <tbody>
                  {grades.map(grade => (
                    <tr key={grade} className="border-b dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800/50">
                      <td className="px-3 py-2 font-medium">{ar ? `الصف ${grade}` : `Grade ${grade}`}</td>
                      {withinGradeData.flatMap(({ sem, stats }) => {
                        const gs = stats.find(s => s.grade === grade)
                        return [
                          <td key={`${sem}-m`} className="px-2 py-2 text-center">{gs ? gs.mean.toFixed(1) : '—'}</td>,
                          <td key={`${sem}-p`} className="px-2 py-2 text-center text-gray-500">{gs ? `${gs.above75Rate.toFixed(0)}%` : '—'}</td>,
                        ]
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  )
}
