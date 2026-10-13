import { useState, useMemo } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend, ReferenceLine,
} from 'recharts'
import { t } from '@/i18n/translations'
import type { Language } from '@/types'
import { dataStore } from '@/store/dataStore'
import { filterRecords, computeAchievementIndicators, getProportionLabel, round2 } from '@/utils/statistics'
import { SUBJECT_LABELS } from '@/utils/subjectMapping'
import clsx from 'clsx'

interface AchievementProfileProps { lang: Language }

// ── level badge colours ────────────────────────────────────────────────────
const LEVEL_COLOR: Record<string, string> = {
  excellent: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
  very_good: 'bg-teal-100 text-teal-800 dark:bg-teal-900/30 dark:text-teal-400',
  good:      'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400',
  below:     'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
}

// ── per-band colour dots shown in table header ────────────────────────────
const BAND_COLORS = {
  b75: '#1D5E3F',
  b70: '#2563eb',
  b60: '#f59e0b',
  b50: '#94a3b8',
}

function BandCell({ count, rate, lang }: { count: number; rate: number; lang: Language }) {
  const ar = lang === 'ar'
  const desc = getProportionLabel(rate, ar ? 'ar' : 'en')
  return (
    <td className="text-center px-2 py-2">
      <span className="block font-bold text-sm">{rate}%</span>
      <span className="block text-xs text-gray-500">({count})</span>
      <span className="block text-[10px] text-gray-400 mt-0.5">{desc}</span>
    </td>
  )
}

export default function AchievementProfile({ lang }: AchievementProfileProps) {
  const ar = lang === 'ar'
  const years = dataStore.getYears()
  const [yearId, setYearId] = useState(() => years[years.length - 1] ?? '')
  const [grade, setGrade] = useState<number | undefined>(undefined)
  const [track, setTrack] = useState<string | undefined>(undefined)
  const [semester, setSemester] = useState<string>('annual')

  const grades = useMemo(() => dataStore.getUniqueGrades(yearId || undefined), [yearId])

  const records = useMemo(() => {
    const raw = yearId ? dataStore.getRecordsByYear(yearId) : dataStore.getAllRecords()
    return filterRecords(raw, { grade, track: track as any })
  }, [yearId, grade, track])

  const indicators = useMemo(
    () => computeAchievementIndicators(records, semester as any),
    [records, semester],
  )

  // School-wide aggregate for المؤشر 1.1
  const schoolStats = useMemo(() => {
    const total = records.length
    if (total === 0) return null
    const above75 = records.filter(r => (r.annualAvg ?? 0) >= 75).length
    const above75Rate = round2((above75 / total) * 100)
    let level = 'below', levelAr = 'دون المقبول', levelEn = 'Below Standard'
    if (above75Rate >= 70) { level = 'excellent'; levelAr = 'ممتاز'; levelEn = 'Excellent' }
    else if (above75Rate >= 60) { level = 'very_good'; levelAr = 'جيد جداً'; levelEn = 'Very Good' }
    else if (above75Rate >= 50) { level = 'good'; levelAr = 'جيد'; levelEn = 'Good' }
    return { total, above75, above75Rate, level, levelAr, levelEn }
  }, [records])

  // Chart data: one row per subject, 4 bands
  const chartData = indicators.map(ind => ({
    name: ar ? SUBJECT_LABELS[ind.subjectCode]?.ar ?? ind.subjectCode : SUBJECT_LABELS[ind.subjectCode]?.en ?? ind.subjectCode,
    b75: ind.above75Rate,
    b70: ind.above70Rate,
    b60: ind.above60Rate,
    b50: ind.above50Rate,
  }))

  if (years.length === 0) {
    return <div className="card text-center py-12 text-gray-500">{t('no_data')}</div>
  }

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold">
        {ar ? 'ملف التحصيل الدراسي — المؤشر ١.١' : 'Academic Achievement Profile — Indicator 1.1'}
      </h1>

      {/* ── Filters ────────────────────────────────────────────────────── */}
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
        <div className="min-w-[140px]">
          <label className="label">{ar ? 'الفصل' : 'Semester'}</label>
          <select className="input" value={semester} onChange={e => setSemester(e.target.value)}>
            <option value="annual">{ar ? 'السنوي' : 'Annual'}</option>
            <option value="s1">{ar ? 'الفصل الأول' : 'Semester 1'}</option>
            <option value="s2">{ar ? 'الفصل الثاني' : 'Semester 2'}</option>
            <option value="s3">{ar ? 'الفصل الثالث' : 'Semester 3'}</option>
          </select>
        </div>
      </div>

      {indicators.length === 0 ? (
        <div className="card text-center py-12 text-gray-400">{t('no_data')}</div>
      ) : (
        <>
          {/* ── School-level indicator tile ───────────────────────────── */}
          {schoolStats && (
            <div className="card">
              <h2 className="font-semibold text-sm mb-4">
                {ar ? 'المؤشر ١.١ — مستوى التحصيل الدراسي للمدرسة' : 'Indicator 1.1 — School Academic Achievement Level'}
              </h2>
              <div className="flex flex-wrap gap-4 items-center">
                <div className="flex-1 min-w-[200px]">
                  <p className="text-xs text-gray-500 mb-1">
                    {ar ? 'نسبة الطلاب الذين حققوا 75% فأكثر' : '% of students scoring ≥ 75'}
                  </p>
                  <div className="flex items-end gap-2">
                    <span className="text-4xl font-bold text-primary-700 dark:text-primary-400">
                      {schoolStats.above75Rate}%
                    </span>
                    <span className="text-sm text-gray-400 mb-1">
                      ({schoolStats.above75} {ar ? 'من' : 'of'} {schoolStats.total})
                    </span>
                  </div>
                  {/* Progress bar toward 70% target */}
                  <div className="mt-2 h-3 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden w-full max-w-xs">
                    <div
                      className={clsx('h-full rounded-full transition-all', {
                        'bg-green-500': schoolStats.level === 'excellent',
                        'bg-teal-500': schoolStats.level === 'very_good',
                        'bg-yellow-400': schoolStats.level === 'good',
                        'bg-red-400': schoolStats.level === 'below',
                      })}
                      style={{ width: `${Math.min(schoolStats.above75Rate, 100)}%` }}
                    />
                  </div>
                  <div className="flex justify-between text-[9px] text-gray-400 mt-0.5 max-w-xs">
                    <span>0%</span><span className="ms-auto">50% جيد</span>
                    <span className="mx-1">60% جيد جداً</span><span>70% ممتاز</span>
                  </div>
                </div>
                <div className={clsx('px-5 py-3 rounded-xl text-center', LEVEL_COLOR[schoolStats.level])}>
                  <p className="text-2xl font-bold">{ar ? schoolStats.levelAr : schoolStats.levelEn}</p>
                  <p className="text-xs mt-1">{ar ? 'مستوى التحصيل' : 'Achievement Level'}</p>
                </div>
                {/* Reference bands legend */}
                <div className="text-xs text-gray-500 space-y-1 border-s ps-4">
                  <p><span className={clsx('inline-block w-2 h-2 rounded-full me-1 bg-red-400')} />{ar ? 'دون المقبول' : 'Below'}: &lt; 50%</p>
                  <p><span className={clsx('inline-block w-2 h-2 rounded-full me-1 bg-yellow-400')} />{ar ? 'جيد' : 'Good'}: ≥ 50%</p>
                  <p><span className={clsx('inline-block w-2 h-2 rounded-full me-1 bg-teal-500')} />{ar ? 'جيد جداً' : 'Very Good'}: ≥ 60%</p>
                  <p><span className={clsx('inline-block w-2 h-2 rounded-full me-1 bg-green-500')} />{ar ? 'ممتاز' : 'Excellent'}: ≥ 70%</p>
                </div>
              </div>
            </div>
          )}

          {/* ── Band chart ──────────────────────────────────────────────── */}
          <div className="card">
            <h2 className="font-semibold text-sm mb-4">
              {ar ? 'نسبة الطلاب في كل شريحة درجات — حسب المادة' : 'Student Band Distribution by Subject'}
            </h2>
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={chartData} margin={{ top: 5, right: 10, left: -10, bottom: 50 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="name" tick={{ fontSize: 9 }} angle={-35} textAnchor="end" interval={0} />
                <YAxis tick={{ fontSize: 10 }} domain={[0, 100]} tickFormatter={v => `${v}%`} />
                <Tooltip formatter={(v: number) => `${v}%`} />
                <Legend wrapperStyle={{ fontSize: 10 }} />
                <ReferenceLine y={70} stroke="#22c55e" strokeDasharray="4 2" label={{ value: ar ? 'ممتاز 70%' : 'Exc. 70%', fontSize: 9, fill: '#22c55e' }} />
                <ReferenceLine y={60} stroke="#0d9488" strokeDasharray="4 2" label={{ value: ar ? 'جيد جداً 60%' : 'VG 60%', fontSize: 9, fill: '#0d9488' }} />
                <ReferenceLine y={50} stroke="#f59e0b" strokeDasharray="4 2" label={{ value: ar ? 'جيد 50%' : 'Good 50%', fontSize: 9, fill: '#f59e0b' }} />
                <Bar dataKey="b75" name={ar ? '≥75%' : '≥75%'} fill={BAND_COLORS.b75} radius={[3, 3, 0, 0]} />
                <Bar dataKey="b70" name={ar ? '≥70%' : '≥70%'} fill={BAND_COLORS.b70} radius={[3, 3, 0, 0]} />
                <Bar dataKey="b60" name={ar ? '≥60%' : '≥60%'} fill={BAND_COLORS.b60} radius={[3, 3, 0, 0]} />
                <Bar dataKey="b50" name={ar ? '≥50%' : '≥50%'} fill={BAND_COLORS.b50} radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* ── Detail table ─────────────────────────────────────────────── */}
          <div className="card overflow-x-auto">
            <h2 className="font-semibold text-sm mb-4">
              {ar ? 'جدول التحصيل التفصيلي — نسبة وعدد الطلاب في كل شريحة' : 'Detailed Achievement Table — Count & % per Band'}
            </h2>
            <table className="table-base text-xs">
              <thead>
                <tr>
                  <th className="text-start">{ar ? 'المادة' : 'Subject'}</th>
                  <th>{ar ? 'العدد' : 'Total'}</th>
                  <th>{ar ? 'المتوسط' : 'Mean'}</th>
                  <th>
                    <span className="inline-block w-2 h-2 rounded-full me-1" style={{ background: BAND_COLORS.b75 }} />
                    {ar ? 'فوق 75%' : '≥ 75%'}
                  </th>
                  <th>
                    <span className="inline-block w-2 h-2 rounded-full me-1" style={{ background: BAND_COLORS.b70 }} />
                    {ar ? 'فوق 70%' : '≥ 70%'}
                  </th>
                  <th>
                    <span className="inline-block w-2 h-2 rounded-full me-1" style={{ background: BAND_COLORS.b60 }} />
                    {ar ? 'فوق 60%' : '≥ 60%'}
                  </th>
                  <th>
                    <span className="inline-block w-2 h-2 rounded-full me-1" style={{ background: BAND_COLORS.b50 }} />
                    {ar ? 'فوق 50%' : '≥ 50%'}
                  </th>
                  <th>{ar ? 'المؤشر ١.١' : 'Indicator 1.1'}</th>
                </tr>
              </thead>
              <tbody>
                {indicators.map(ind => {
                  const subName = ar
                    ? SUBJECT_LABELS[ind.subjectCode]?.ar ?? ind.subjectCode
                    : SUBJECT_LABELS[ind.subjectCode]?.en ?? ind.subjectCode
                  return (
                    <tr key={ind.subjectCode}>
                      <td className="font-medium text-start">{subName}</td>
                      <td className="text-center font-mono">{ind.totalStudents}</td>
                      <td className="text-center font-mono">{ind.mean}</td>
                      <BandCell count={ind.above75Count} rate={ind.above75Rate} lang={lang} />
                      <BandCell count={ind.above70Count} rate={ind.above70Rate} lang={lang} />
                      <BandCell count={ind.above60Count} rate={ind.above60Rate} lang={lang} />
                      <BandCell count={ind.above50Count} rate={ind.above50Rate} lang={lang} />
                      <td className="text-center">
                        <span className={clsx('badge text-[10px] px-2 py-0.5 rounded-full font-medium', LEVEL_COLOR[ind.level])}>
                          {ar ? ind.levelAr : ind.levelEn}
                        </span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {/* ── Descriptive summary ──────────────────────────────────────── */}
          <div className="card space-y-2 text-sm text-gray-700 dark:text-gray-300">
            <h2 className="font-semibold text-sm mb-3">
              {ar ? 'التحليل الوصفي لملف التحصيل' : 'Descriptive Analysis'}
            </h2>
            {indicators.map(ind => {
              const subName = ar
                ? SUBJECT_LABELS[ind.subjectCode]?.ar ?? ind.subjectCode
                : SUBJECT_LABELS[ind.subjectCode]?.en ?? ind.subjectCode
              const prop75 = getProportionLabel(ind.above75Rate, ar ? 'ar' : 'en')
              const prop70 = getProportionLabel(ind.above70Rate, ar ? 'ar' : 'en')
              const prop60 = getProportionLabel(ind.above60Rate, ar ? 'ar' : 'en')
              return (
                <p key={ind.subjectCode} className="text-xs leading-relaxed">
                  {ar
                    ? `• ${subName}: ${prop75} الطلاب (${ind.above75Rate}%) حققوا 75% فأكثر — مستوى التحصيل: ${ind.levelAr}. ${prop70} (${ind.above70Rate}%) فوق 70%، ${prop60} (${ind.above60Rate}%) فوق 60%.`
                    : `• ${subName}: ${prop75} of students (${ind.above75Rate}%) scored ≥75 — Achievement level: ${ind.levelEn}. ${prop70} (${ind.above70Rate}%) above 70%, ${prop60} (${ind.above60Rate}%) above 60%.`
                  }
                </p>
              )
            })}
          </div>

          {/* ── Band legend ──────────────────────────────────────────────── */}
          <div className="card text-xs text-gray-500 space-y-1">
            <p className="font-medium text-gray-700 dark:text-gray-300 mb-2">
              {ar ? 'تفسير شرائح التحصيل' : 'Achievement Band Reference'}
            </p>
            <p>{ar ? '• فوق 75%: معيار التحصيل الأكاديمي (المؤشر ١.١)' : '• ≥ 75%: Academic achievement indicator threshold (1.1)'}</p>
            <p>{ar ? '• فوق 70%: مستوى جيد (C فأعلى)' : '• ≥ 70%: Good level (C or above)'}</p>
            <p>{ar ? '• فوق 60%: حد النجاح للحلقة الثالثة (الصفوف 9–12)' : '• ≥ 60%: Cycle 3 pass mark (grades 9–12)'}</p>
            <p>{ar ? '• فوق 50%: حد النجاح للحلقتين الأولى والثانية (الصفوف 1–8)' : '• ≥ 50%: Cycle 1&2 pass mark (grades 1–8)'}</p>
            <p className="pt-2 font-medium text-gray-700 dark:text-gray-300">
              {ar ? 'مستويات المؤشر ١.١ (بناءً على نسبة الطلاب فوق 75%):' : 'Indicator 1.1 levels (based on % of students ≥75%):'}
            </p>
            <p>{ar ? '≥70% → ممتاز  |  ≥60% → جيد جداً  |  ≥50% → جيد  |  <50% → دون المقبول' : '≥70% → Excellent  |  ≥60% → Very Good  |  ≥50% → Good  |  <50% → Below Standard'}</p>
          </div>
        </>
      )}
    </div>
  )
}
