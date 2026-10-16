import { useState, useMemo } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  Legend, ReferenceLine, Cell,
} from 'recharts'
import { t } from '@/i18n/translations'
import type { Language } from '@/types'
import { dataStore } from '@/store/dataStore'
import { filterRecords, computeSemesterGaps, computeSemesterGapsFromTermScores } from '@/utils/statistics'
import clsx from 'clsx'

interface GapAnalysisProps { lang: Language }

const PRIORITY_COLOR: Record<string, string> = {
  critical: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
  high:     'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400',
  medium:   'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400',
  low:      'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
  ok:       'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
}

const PRIORITY_AR: Record<string, string> = {
  critical: 'حرج', high: 'عالي', medium: 'متوسط', low: 'منخفض', ok: 'جيد',
}
const PRIORITY_EN: Record<string, string> = {
  critical: 'Critical', high: 'High', medium: 'Medium', low: 'Low', ok: 'OK',
}

export default function GapAnalysis({ lang }: GapAnalysisProps) {
  const ar = lang === 'ar'
  const years = dataStore.getYears()
  const [yearId, setYearId] = useState(() => years[years.length - 1] ?? '')
  const [grade, setGrade] = useState<number | undefined>(undefined)
  const [track, setTrack] = useState<string | undefined>(undefined)

  const grades = useMemo(() => dataStore.getUniqueGrades(yearId || undefined), [yearId])

  const gaps = useMemo(() => {
    const records = filterRecords(
      yearId ? dataStore.getRecordsByYear(yearId) : dataStore.getAllRecords(),
      { grade, track: track as any },
    )
    const gaps = computeSemesterGaps(records)
    if (gaps.length > 0) return gaps
    // Fall back to TermScore data (e.g. 2025-2026 with no annual Manhal file)
    if (yearId) {
      const termScores = dataStore.getTermScores(yearId)
      if (termScores.length > 0) return computeSemesterGapsFromTermScores(termScores, { grade })
    }
    return gaps
  }, [yearId, grade, track])

  const chartData = gaps.map(g => ({
    name: ar ? g.subjectNameAr : g.subjectNameEn,
    s1: g.avgS1 ?? 0,
    s2: g.avgS2 ?? 0,
    s3: g.avgS3 ?? 0,
    gap: g.gapS1S3 ?? 0,
  }))

  if (years.length === 0) {
    return <div className="card text-center py-12 text-gray-500">{t('no_data')}</div>
  }

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold">{t('gap_title')}</h1>

      {/* Filters */}
      <div className="card flex flex-wrap gap-4 items-end">
        <div className="min-w-[140px]">
          <label className="label">{t('year')}</label>
          <select className="input" value={yearId} onChange={e => setYearId(e.target.value)}>
            <option value="">{t('all')}</option>
            {years.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
        <div className="min-w-[110px]">
          <label className="label">{t('grade')}</label>
          <select className="input" value={grade ?? ''} onChange={e => setGrade(e.target.value ? +e.target.value : undefined)}>
            <option value="">{t('all')}</option>
            {grades.map(g => <option key={g} value={g}>{g}</option>)}
          </select>
        </div>
        <div className="min-w-[130px]">
          <label className="label">{t('track')}</label>
          <select className="input" value={track ?? ''} onChange={e => setTrack(e.target.value || undefined)}>
            <option value="">{t('all')}</option>
            <option value="general">{t('track_general')}</option>
            <option value="advanced">{t('track_advanced')}</option>
          </select>
        </div>
      </div>

      {gaps.length === 0 ? (
        <div className="card text-center py-12 text-gray-400">
          {ar ? 'لا توجد بيانات فصلية كافية لحساب الفجوات.' : 'Not enough semester data to compute gaps.'}
        </div>
      ) : (
        <>
          {/* Bar chart: s1 / s2 / s3 per subject */}
          <div className="card">
            <h2 className="font-semibold mb-4 text-sm">
              {ar ? 'متوسط الدرجات عبر الفصول الدراسية' : 'Average Scores by Semester'}
            </h2>
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={chartData} margin={{ top: 5, right: 10, left: -10, bottom: 45 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="name" tick={{ fontSize: 9 }} angle={-35} textAnchor="end" interval={0} />
                <YAxis tick={{ fontSize: 10 }} domain={[0, 100]} />
                <Tooltip />
                <Legend wrapperStyle={{ fontSize: 10 }} />
                <Bar dataKey="s1" name={ar ? 'ف1' : 'S1'} fill="#3b82f6" radius={[3, 3, 0, 0]} />
                <Bar dataKey="s2" name={ar ? 'ف2' : 'S2'} fill="#10b981" radius={[3, 3, 0, 0]} />
                <Bar dataKey="s3" name={ar ? 'ف3' : 'S3'} fill="#f59e0b" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Gap chart: s1→s3 difference */}
          <div className="card">
            <h2 className="font-semibold mb-4 text-sm">
              {ar ? 'الفجوة بين الفصل الأول والفصل الثالث (ف1 → ف3)' : 'Gap between Semester 1 and Semester 3 (S1 → S3)'}
            </h2>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={chartData} margin={{ top: 5, right: 10, left: -10, bottom: 45 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="name" tick={{ fontSize: 9 }} angle={-35} textAnchor="end" interval={0} />
                <YAxis tick={{ fontSize: 10 }} />
                <Tooltip formatter={(v: number) => v > 0 ? `+${v}` : `${v}`} />
                <ReferenceLine y={0} stroke="#6b7280" />
                <Bar dataKey="gap" name={ar ? 'الفجوة' : 'Gap'} radius={[3, 3, 0, 0]}>
                  {chartData.map((d, i) => (
                    <Cell key={i} fill={d.gap >= 0 ? '#22c55e' : d.gap >= -8 ? '#f97316' : '#ef4444'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Detail table */}
          <div className="card overflow-x-auto">
            <table className="table-base">
              <thead>
                <tr>
                  <th>{ar ? 'المادة' : 'Subject'}</th>
                  <th>{t('gap_s1_avg')}</th>
                  <th>{t('gap_s2_avg')}</th>
                  <th>{t('gap_s3_avg')}</th>
                  <th>{t('gap_s1_to_s3')}</th>
                  <th>{t('gap_students_dropped')}</th>
                  <th>{t('gap_students_improved')}</th>
                  <th>{ar ? 'الأولوية' : 'Priority'}</th>
                </tr>
              </thead>
              <tbody>
                {gaps.map(g => (
                  <tr key={g.subjectCode}>
                    <td className="font-medium">{ar ? g.subjectNameAr : g.subjectNameEn}</td>
                    <td className="font-mono text-sm">{g.avgS1 !== null ? g.avgS1.toFixed(1) : '—'}</td>
                    <td className="font-mono text-sm">{g.avgS2 !== null ? g.avgS2.toFixed(1) : '—'}</td>
                    <td className="font-mono text-sm">{g.avgS3 !== null ? g.avgS3.toFixed(1) : '—'}</td>
                    <td className={clsx('font-mono text-sm font-bold', g.gapS1S3 !== null && g.gapS1S3 < 0 ? 'text-red-600' : 'text-green-600')}>
                      {g.gapS1S3 !== null ? (g.gapS1S3 > 0 ? `+${g.gapS1S3.toFixed(1)}` : g.gapS1S3.toFixed(1)) : '—'}
                    </td>
                    <td className="text-sm">
                      {g.totalStudents > 0
                        ? `${g.studentsWithDrop} (${((g.studentsWithDrop / g.totalStudents) * 100).toFixed(0)}%)`
                        : '—'}
                    </td>
                    <td className="text-sm">
                      {g.totalStudents > 0
                        ? `${g.studentsWithGain} (${((g.studentsWithGain / g.totalStudents) * 100).toFixed(0)}%)`
                        : '—'}
                    </td>
                    <td>
                      <span className={clsx('badge text-xs px-2 py-0.5 rounded-full font-medium', PRIORITY_COLOR[g.priority])}>
                        {ar ? PRIORITY_AR[g.priority] : PRIORITY_EN[g.priority]}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Legend */}
          <div className="card text-xs text-gray-500 space-y-1">
            <p className="font-medium text-gray-700 dark:text-gray-300 mb-2">{ar ? 'مستويات الأولوية (بناءً على الفجوة ف1→ف3)' : 'Priority levels (based on S1→S3 gap):'}</p>
            <p><span className={clsx('badge text-xs px-2 py-0.5 rounded-full', PRIORITY_COLOR.critical)}>{ar ? 'حرج' : 'Critical'}</span> {ar ? ': تراجع أكثر من 15 نقطة' : ': Drop > 15 points'}</p>
            <p><span className={clsx('badge text-xs px-2 py-0.5 rounded-full', PRIORITY_COLOR.high)}>{ar ? 'عالي' : 'High'}</span> {ar ? ': تراجع 8–15 نقطة' : ': Drop 8–15 points'}</p>
            <p><span className={clsx('badge text-xs px-2 py-0.5 rounded-full', PRIORITY_COLOR.medium)}>{ar ? 'متوسط' : 'Medium'}</span> {ar ? ': تراجع 3–8 نقاط' : ': Drop 3–8 points'}</p>
            <p><span className={clsx('badge text-xs px-2 py-0.5 rounded-full', PRIORITY_COLOR.low)}>{ar ? 'منخفض' : 'Low'}</span> {ar ? ': تراجع أقل من 3 نقاط' : ': Drop < 3 points'}</p>
            <p><span className={clsx('badge text-xs px-2 py-0.5 rounded-full', PRIORITY_COLOR.ok)}>{ar ? 'جيد' : 'OK'}</span> {ar ? ': تحسن أو استقرار' : ': Stable or improved'}</p>
          </div>
        </>
      )}
    </div>
  )
}
