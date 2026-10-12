import { useState, useMemo } from 'react'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  Legend, ResponsiveContainer,
} from 'recharts'
import { t } from '@/i18n/translations'
import type { Language, SubjectCode } from '@/types'
import { dataStore } from '@/store/dataStore'
import { filterRecords, computeSubjectStats, round2 } from '@/utils/statistics'
import { getCycle, SUBJECT_LABELS } from '@/utils/subjectMapping'

interface ComparisonProps {
  lang: Language
}

const COLORS = ['#3b82f6', '#22c55e', '#f97316', '#a855f7', '#ef4444']

const METRICS = [
  { key: 'passRate', label: 'analysis_pass_rate' as const },
  { key: 'above90Rate', label: 'analysis_above90' as const },
  { key: 'mean', label: 'analysis_mean' as const },
  { key: 'failRate', label: 'analysis_fail_rate' as const },
]

export default function Comparison({ lang }: ComparisonProps) {
  const years = dataStore.getYears()
  const [selectedYears, setSelectedYears] = useState<string[]>(years.slice(-3))
  const [subject, setSubject] = useState<SubjectCode>('arabic')
  const [metric, setMetric] = useState<string>('passRate')
  const [grade, setGrade] = useState<number | undefined>()

  function toggleYear(y: string) {
    setSelectedYears(prev =>
      prev.includes(y) ? prev.filter(x => x !== y) : [...prev, y]
    )
  }

  const chartData = useMemo(() => {
    return selectedYears.sort().map(yearId => {
      const records = grade
        ? filterRecords(dataStore.getRecordsByYear(yearId), { grade })
        : dataStore.getRecordsByYear(yearId)
      const cycle = records.length > 0 ? getCycle(records[0].grade) : (grade ? getCycle(grade) : 3 as const)
      const stats = computeSubjectStats(records, subject, 'annual', cycle)
      return {
        year: yearId,
        passRate: round2(stats.passRate),
        failRate: round2(stats.failRate),
        mean: round2(stats.mean),
        above90Rate: round2(stats.above90Rate),
        count: stats.count,
      }
    })
  }, [selectedYears, subject, grade])

  const subjects = Object.entries(SUBJECT_LABELS) as [SubjectCode, { ar: string; en: string }][]

  if (years.length === 0) {
    return <div className="card text-center py-12 text-gray-500">{t('no_data')}</div>
  }

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold">{t('comparison_title')}</h1>

      <div className="card flex flex-wrap gap-4 items-end">
        {/* Subject */}
        <div className="min-w-[160px]">
          <label className="label">{t('subject')}</label>
          <select className="input" value={subject} onChange={e => setSubject(e.target.value as SubjectCode)}>
            {subjects.map(([code, labels]) => (
              <option key={code} value={code}>{lang === 'ar' ? labels.ar : labels.en}</option>
            ))}
          </select>
        </div>

        {/* Grade */}
        <div className="min-w-[120px]">
          <label className="label">{t('grade')}</label>
          <select className="input" value={grade ?? ''} onChange={e => setGrade(e.target.value ? +e.target.value : undefined)}>
            <option value="">{t('all')}</option>
            {[5,6,7,8,9,10,11,12].map(g => <option key={g} value={g}>{g}</option>)}
          </select>
        </div>

        {/* Metric */}
        <div className="min-w-[160px]">
          <label className="label">{t('comparison_metric')}</label>
          <select className="input" value={metric} onChange={e => setMetric(e.target.value)}>
            {METRICS.map(m => (
              <option key={m.key} value={m.key}>{t(m.label)}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Year toggles */}
      <div className="flex flex-wrap gap-2">
        {years.map((y, i) => (
          <button
            key={y}
            onClick={() => toggleYear(y)}
            className={`px-3 py-1.5 rounded-full text-sm font-medium border transition-colors`}
            style={selectedYears.includes(y)
              ? { background: COLORS[i % COLORS.length], color: 'white', borderColor: COLORS[i % COLORS.length] }
              : { borderColor: '#d1d5db', color: '#6b7280' }
            }
          >
            {y}
          </button>
        ))}
      </div>

      {/* Chart */}
      <div className="card">
        <h2 className="font-semibold mb-3">
          {SUBJECT_LABELS[subject]?.[lang]} — {t(METRICS.find(m => m.key === metric)?.label ?? 'analysis_pass_rate')}
        </h2>
        <ResponsiveContainer width="100%" height={280}>
          <LineChart data={chartData} margin={{ top: 8, right: 16, left: -8, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" />
            <XAxis dataKey="year" tick={{ fontSize: 12 }} />
            <YAxis tickFormatter={v => metric !== 'mean' ? `${v}%` : String(v)} tick={{ fontSize: 12 }} />
            <Tooltip formatter={(v: number) => [metric !== 'mean' ? `${v}%` : v, '']} />
            <Line type="monotone" dataKey={metric} stroke={COLORS[0]} strokeWidth={2} dot={{ r: 4 }} />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Table */}
      <div className="card overflow-x-auto">
        <table className="table-base">
          <thead>
            <tr>
              <th>{t('year')}</th>
              <th>{t('analysis_count')}</th>
              <th>{t('analysis_pass_rate')}</th>
              <th>{t('analysis_fail_rate')}</th>
              <th>{t('analysis_mean')}</th>
              <th>{t('analysis_above90')}</th>
            </tr>
          </thead>
          <tbody>
            {chartData.map(d => (
              <tr key={d.year}>
                <td className="font-mono">{d.year}</td>
                <td>{d.count}</td>
                <td className="text-green-600">{d.passRate}%</td>
                <td className="text-red-500">{d.failRate}%</td>
                <td>{d.mean}</td>
                <td>{d.above90Rate}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
