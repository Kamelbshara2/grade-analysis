import { useState, useMemo } from 'react'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, BarChart, Bar, Cell,
} from 'recharts'
import { t } from '@/i18n/translations'
import type { Language, SubjectCode, Nationality } from '@/types'
import { dataStore } from '@/store/dataStore'
import { filterRecords, computeSubjectStats, computeSchoolStats, round2 } from '@/utils/statistics'
import { getCycle, SUBJECT_LABELS } from '@/utils/subjectMapping'

interface ComparisonProps {
  lang: Language
}

const COLORS = ['#3b82f6', '#22c55e', '#f97316', '#a855f7', '#ef4444']

const METRICS = [
  { key: 'above75Rate', labelAr: 'طلاب فوق 75%', labelEn: 'Students Above 75%' },
  { key: 'passRate', labelAr: 'نسبة النجاح', labelEn: 'Pass Rate' },
  { key: 'above90Rate', labelAr: 'فوق 90%', labelEn: 'Above 90%' },
  { key: 'mean', labelAr: 'المتوسط', labelEn: 'Mean' },
  { key: 'failRate', labelAr: 'نسبة الرسوب', labelEn: 'Fail Rate' },
]

export default function Comparison({ lang }: ComparisonProps) {
  const ar = lang === 'ar'
  const years = dataStore.getYears()
  const [selectedYears, setSelectedYears] = useState<string[]>(years.slice(-3))
  const [subject, setSubject] = useState<SubjectCode>('arabic')
  const [metric, setMetric] = useState<string>('passRate')
  const [grade, setGrade] = useState<number | undefined>()
  const [nationality, setNationality] = useState<Nationality | undefined>()

  function toggleYear(y: string) {
    setSelectedYears(prev =>
      prev.includes(y) ? prev.filter(x => x !== y) : [...prev, y]
    )
  }

  const chartData = useMemo(() => {
    return selectedYears.sort().map(yearId => {
      const records = (grade || nationality)
        ? filterRecords(dataStore.getRecordsByYear(yearId), { grade, nationality })
        : dataStore.getRecordsByYear(yearId)
      const cycle = records.length > 0 ? getCycle(records[0].grade) : (grade ? getCycle(grade) : 3 as const)
      const stats = computeSubjectStats(records, subject, 'annual', cycle)
      return {
        year: yearId,
        above75Rate: round2(stats.above75Rate),
        passRate: round2(stats.passRate),
        failRate: round2(stats.failRate),
        mean: round2(stats.mean),
        above90Rate: round2(stats.above90Rate),
        count: stats.count,
      }
    })
  }, [selectedYears, subject, grade, nationality])

  // School-wide data: % students with overall avg ≥ 75 per year
  const schoolData = useMemo(() => {
    return selectedYears.sort().map(yearId => {
      const records = (grade || nationality)
        ? filterRecords(dataStore.getRecordsByYear(yearId), { grade, nationality })
        : dataStore.getRecordsByYear(yearId)
      const s = computeSchoolStats(records, 'annual')
      return { year: yearId, above75Rate: s.above75Rate, mean: s.mean, count: s.count }
    })
  }, [selectedYears, grade, nationality])

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
              <option key={m.key} value={m.key}>{ar ? m.labelAr : m.labelEn}</option>
            ))}
          </select>
        </div>

        {/* Nationality */}
        <div className="min-w-[130px]">
          <label className="label">{ar ? 'الجنسية' : 'Nationality'}</label>
          <select className="input" value={nationality ?? ''} onChange={e => setNationality((e.target.value as Nationality) || undefined)}>
            <option value="">{ar ? 'الكل' : 'All'}</option>
            <option value="citizen">{ar ? 'مواطن' : 'Citizen'}</option>
            <option value="expat">{ar ? 'وافد' : 'Expat'}</option>
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

      {/* Per-subject chart */}
      <div className="card">
        <h2 className="font-semibold mb-3">
          {SUBJECT_LABELS[subject]?.[lang]} — {METRICS.find(m => m.key === metric)?.[ar ? 'labelAr' : 'labelEn']}
        </h2>
        <ResponsiveContainer width="100%" height={260}>
          <LineChart data={chartData} margin={{ top: 8, right: 16, left: -8, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" />
            <XAxis dataKey="year" tick={{ fontSize: 12 }} />
            <YAxis tickFormatter={v => metric !== 'mean' ? `${v}%` : String(v)} tick={{ fontSize: 12 }} />
            <Tooltip formatter={(v: number) => [metric !== 'mean' ? `${v}%` : v, '']} />
            <Line type="monotone" dataKey={metric} stroke={COLORS[0]} strokeWidth={2} dot={{ r: 4 }} />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Per-subject table */}
      <div className="card overflow-x-auto">
        <h2 className="font-semibold mb-3">{SUBJECT_LABELS[subject]?.[lang]} — {ar ? 'تفاصيل حسب السنة' : 'Year-by-year breakdown'}</h2>
        <table className="table-base">
          <thead>
            <tr>
              <th>{t('year')}</th>
              <th>{t('analysis_count')}</th>
              <th className="text-green-700">{ar ? 'فوق 75%' : 'Above 75%'}</th>
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
                <td className={`font-semibold ${d.above75Rate >= 70 ? 'text-green-600' : d.above75Rate >= 50 ? 'text-yellow-600' : 'text-red-500'}`}>{d.above75Rate}%</td>
                <td className="text-green-600">{d.passRate}%</td>
                <td className="text-red-500">{d.failRate}%</td>
                <td>{d.mean}</td>
                <td>{d.above90Rate}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* School-wide above-75 across years */}
      {schoolData.some(d => d.count > 0) && (
        <div className="card border-l-4 border-primary-500">
          <h2 className="font-semibold mb-1 text-primary-700">{ar ? 'المدرسة — % طلاب متوسطهم العام ≥75%' : 'School — % Students with Overall Average ≥75%'}</h2>
          <p className="text-xs text-gray-500 mb-4">{ar ? 'يحسب متوسط كل طالب عبر جميع موادهم ثم يقيس نسبة من وصلوا 75% فأكثر' : 'Computes each student\'s average across all their subjects, then measures what % reached 75% or above'}</p>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={schoolData} margin={{ top: 4, right: 16, left: -8, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" />
              <XAxis dataKey="year" tick={{ fontSize: 12 }} />
              <YAxis tickFormatter={v => `${v}%`} domain={[0, 100]} tick={{ fontSize: 12 }} />
              <Tooltip formatter={(v: number) => [`${v}%`, ar ? 'فوق 75%' : 'Above 75%']} />
              {schoolData.map((d, i) => (
                <Cell key={d.year} fill={d.above75Rate >= 70 ? '#22c55e' : d.above75Rate >= 50 ? '#f59e0b' : '#ef4444'} />
              ))}
              <Bar dataKey="above75Rate" radius={[4, 4, 0, 0]}>
                {schoolData.map((d, i) => (
                  <Cell key={d.year} fill={d.above75Rate >= 70 ? '#22c55e' : d.above75Rate >= 50 ? '#f59e0b' : '#ef4444'} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
          <div className="mt-3 overflow-x-auto">
            <table className="table-base">
              <thead>
                <tr>
                  <th>{t('year')}</th>
                  <th>{ar ? 'إجمالي الطلاب' : 'Total Students'}</th>
                  <th>{ar ? 'متوسط المدرسة' : 'School Mean'}</th>
                  <th className="text-green-700">{ar ? '% فوق 75%' : '% Above 75%'}</th>
                  <th>{ar ? 'التقييم' : 'Rating'}</th>
                </tr>
              </thead>
              <tbody>
                {schoolData.map(d => (
                  <tr key={d.year}>
                    <td className="font-mono">{d.year}</td>
                    <td>{d.count}</td>
                    <td>{d.mean}%</td>
                    <td className={`font-bold ${d.above75Rate >= 70 ? 'text-green-600' : d.above75Rate >= 50 ? 'text-yellow-600' : 'text-red-500'}`}>{d.above75Rate}%</td>
                    <td>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${d.above75Rate >= 70 ? 'bg-green-100 text-green-700' : d.above75Rate >= 50 ? 'bg-yellow-100 text-yellow-700' : 'bg-red-100 text-red-700'}`}>
                        {d.above75Rate >= 70 ? (ar ? 'ممتاز' : 'Excellent') : d.above75Rate >= 50 ? (ar ? 'جيد' : 'Good') : (ar ? 'يحتاج تحسين' : 'Needs improvement')}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
