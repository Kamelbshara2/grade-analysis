import { useState, useMemo } from 'react'
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Legend, Cell, ReferenceLine,
} from 'recharts'
import { Printer, ChevronDown, ChevronRight } from 'lucide-react'
import { t } from '@/i18n/translations'
import type { Language, AnalysisFilter, SubjectCode, Semester, Cycle } from '@/types'
import { dataStore } from '@/store/dataStore'
import {
  filterRecords, computeSubjectStats, extractScores, round2,
  computeMultiYearProgress,
  computeAchievementIndicators, getProportionLabel, getLetterGrade,
  type AchievementIndicator,
} from '@/utils/statistics'
import { getCycle, SUBJECT_LABELS, getCycleSubjects, getPassMark } from '@/utils/subjectMapping'
import FilterBar from '@/components/ui/FilterBar'
import NormalDistributionChart from '@/components/charts/NormalDistributionChart'
import clsx from 'clsx'

interface ReportsProps { lang: Language }

// ── Palette ────────────────────────────────────────────────────────────────────
const SUBJECT_COLORS = [
  '#1D5E3F','#2563eb','#d97706','#9333ea','#0891b2','#16a34a','#dc2626','#db2777',
]

// ── Level colours ──────────────────────────────────────────────────────────────
const LEVEL_COLOR: Record<string, string> = {
  excellent: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300',
  very_good: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
  good:      'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300',
  below:     'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300',
}
const LEVEL_COLOR_HEX: Record<string, string> = {
  excellent: '#16a34a', very_good: '#2563eb', good: '#ca8a04', below: '#dc2626',
}

// ── Helpers ────────────────────────────────────────────────────────────────────
function SectionTitle({ num, ar: arLabel, en: enLabel }: { num: number; ar: string; en: string }) {
  return (
    <div className="flex items-center gap-3 mb-5 border-b-2 border-primary-200 pb-3 print:break-before-auto">
      <div className="w-8 h-8 rounded-full bg-primary-600 text-white font-bold flex items-center justify-center text-sm shrink-0">{num}</div>
      <div>
        <h2 className="text-base font-bold text-primary-700 print:text-black leading-tight">{arLabel}</h2>
        <p className="text-xs text-gray-400">{enLabel}</p>
      </div>
    </div>
  )
}

function KpiTile({ label, value, sub, color }: { label: string; value: string | number; sub?: string; color: string }) {
  return (
    <div className={`rounded-xl border p-4 ${color}`}>
      <p className="text-xs text-gray-500 mb-1">{label}</p>
      <p className="text-2xl font-bold">{value}</p>
      {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
    </div>
  )
}

function SectionToggle({ expanded, onClick, children }: { expanded: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      className="no-print flex items-center gap-1 text-xs text-primary-600 hover:underline mb-2"
      onClick={onClick}
    >
      {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
      {children}
    </button>
  )
}

// ── Cover page ─────────────────────────────────────────────────────────────────
function CoverPage({ lang, filter, reportTitle, reportSubtitle }: {
  lang: Language; filter: AnalysisFilter; reportTitle: string; reportSubtitle: string
}) {
  const ar = lang === 'ar'
  const today = new Date().toLocaleDateString(ar ? 'ar-AE' : 'en-AE', { year: 'numeric', month: 'long', day: 'numeric' })
  return (
    <div className="hidden print:flex flex-col items-center justify-center min-h-[280px] border-b-2 border-primary-300 mb-8 pb-8 text-center">
      <div className="w-16 h-16 rounded-2xl bg-primary-600 flex items-center justify-center mb-4">
        <span className="text-white font-bold text-2xl">ج</span>
      </div>
      <h1 className="text-2xl font-bold text-primary-800 mb-1">مدرسة خالد بن الوليد</h1>
      <p className="text-sm text-gray-500 mb-4">فريق جودة انجازات الطلبة</p>
      <div className="border rounded-xl px-8 py-4 bg-primary-50">
        <h2 className="text-xl font-bold text-primary-700 mb-1">{reportTitle}</h2>
        <p className="text-sm text-gray-600">{reportSubtitle}</p>
      </div>
      <div className="mt-4 flex flex-wrap gap-4 justify-center text-sm text-gray-500">
        {filter.yearId && <span>{ar ? 'العام:' : 'Year:'} {filter.yearId}</span>}
        {filter.grade && <span>{ar ? 'الصف:' : 'Grade:'} {filter.grade}</span>}
        {filter.track && <span>{ar ? 'المسار:' : 'Track:'} {ar ? (filter.track === 'general' ? 'عام' : 'متقدم') : filter.track}</span>}
        {filter.semester && <span>{ar ? 'الفصل:' : 'Sem:'} {filter.semester}</span>}
        <span>{ar ? 'التاريخ:' : 'Date:'} {today}</span>
      </div>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// REPORT 1: ACADEMIC ACHIEVEMENT INDICATOR (المؤشر 1.1)
// ══════════════════════════════════════════════════════════════════════════════
function AchievementReport({ lang, filter }: { lang: Language; filter: AnalysisFilter }) {
  const ar = lang === 'ar'
  const [expanded, setExpanded] = useState<Set<number>>(new Set([0, 1, 2, 3]))
  const toggle = (n: number) => setExpanded(s => { const ns = new Set(s); ns.has(n) ? ns.delete(n) : ns.add(n); return ns })

  const records = useMemo(() => {
    const raw = filter.yearId ? dataStore.getRecordsByYear(filter.yearId) : dataStore.getAllRecords()
    return filterRecords(raw, filter)
  }, [filter])

  const sem = filter.semester ?? 'annual'
  const indicators = useMemo(() => computeAchievementIndicators(records, sem as Semester | 'annual'), [records, sem])

  if (records.length === 0) return (
    <div className="card text-center py-12 text-gray-400">{t('no_data')}</div>
  )

  // School-wide summary
  const totalStudents = records.length
  const schoolAbove75 = records.filter(r => {
    const avg = r.annualAvg ?? 0
    return avg >= 75
  }).length
  const schoolAbove75Rate = round2((schoolAbove75 / totalStudents) * 100)

  let schoolLevel = 'below'
  let schoolLevelAr = 'دون المستوى'
  if (schoolAbove75Rate >= 70) { schoolLevel = 'excellent'; schoolLevelAr = 'ممتاز' }
  else if (schoolAbove75Rate >= 60) { schoolLevel = 'very_good'; schoolLevelAr = 'جيد جداً' }
  else if (schoolAbove75Rate >= 50) { schoolLevel = 'good'; schoolLevelAr = 'جيد' }

  // Grade-level breakdown
  const grades = [...new Set(records.map(r => r.grade))].sort((a, b) => a - b)
  const gradeData = grades.map(g => {
    const gr = records.filter(r => r.grade === g)
    const a75 = gr.filter(r => (r.annualAvg ?? 0) >= 75).length
    const rate = round2((a75 / gr.length) * 100)
    return { grade: `${ar ? 'ص' : 'G'}${g}`, above75Rate: rate, total: gr.length, above75: a75 }
  })

  // Chart data
  const subjectChartData = indicators.map((ind, i) => ({
    name: ar ? SUBJECT_LABELS[ind.subjectCode]?.ar ?? ind.subjectCode : SUBJECT_LABELS[ind.subjectCode]?.en ?? ind.subjectCode,
    above75: ind.above75Rate,
    mean: ind.mean,
    color: LEVEL_COLOR_HEX[ind.level],
    idx: i,
  }))

  return (
    <div className="space-y-8 print:space-y-6">
      <CoverPage
        lang={lang}
        filter={filter}
        reportTitle={ar ? 'تقرير التحصيل الدراسي' : 'Academic Achievement Report'}
        reportSubtitle={ar ? 'المؤشر 1.1 — نسبة الطلاب المحققين للمعيار (≥75%)' : 'Indicator 1.1 — % of Students at Standard (≥75%)'}
      />

      {/* ── Section 1: Executive Summary ── */}
      <div className="card print:shadow-none print:border">
        <SectionTitle num={1} ar="الملخص التنفيذي" en="Executive Summary" />
        <SectionToggle expanded={expanded.has(0)} onClick={() => toggle(0)}>
          {expanded.has(0) ? (ar ? 'إخفاء' : 'Hide') : (ar ? 'إظهار' : 'Show')}
        </SectionToggle>
        {expanded.has(0) && (
          <>
            {/* Explanation box */}
            <div className="bg-primary-50 dark:bg-primary-900/20 rounded-lg p-4 mb-6 text-sm">
              <h3 className="font-bold text-primary-700 mb-2">
                {ar ? 'معيار التحصيل الأكاديمي (المؤشر 1.1)' : 'Academic Achievement Indicator (1.1)'}
              </h3>
              <p className="text-gray-700 dark:text-gray-300 leading-relaxed">
                {ar
                  ? 'يقيس هذا المؤشر نسبة الطلاب الذين حققوا درجة ≥75% في كل مادة. لكي يكون مستوى التحصيل مقبولاً يجب أن لا تقل هذه النسبة عن 75% من إجمالي الطلاب.'
                  : 'This indicator measures the % of students scoring ≥75% in each subject. Achievement is acceptable when at least 75% of students reach this threshold.'}
              </p>
              <div className="mt-3 grid grid-cols-3 gap-3 text-xs">
                <div className="bg-yellow-100 dark:bg-yellow-900/20 rounded p-2 text-center">
                  <div className="font-bold text-yellow-700">≥50% → {ar ? 'جيد' : 'Good'}</div>
                  <div className="text-gray-500">{ar ? 'من الطلاب فوق 75' : 'of students ≥75'}</div>
                </div>
                <div className="bg-blue-100 dark:bg-blue-900/20 rounded p-2 text-center">
                  <div className="font-bold text-blue-700">≥60% → {ar ? 'جيد جداً' : 'Very Good'}</div>
                  <div className="text-gray-500">{ar ? 'من الطلاب فوق 75' : 'of students ≥75'}</div>
                </div>
                <div className="bg-green-100 dark:bg-green-900/20 rounded p-2 text-center">
                  <div className="font-bold text-green-700">≥70% → {ar ? 'ممتاز' : 'Excellent'}</div>
                  <div className="text-gray-500">{ar ? 'من الطلاب فوق 75' : 'of students ≥75'}</div>
                </div>
              </div>
            </div>
            {/* KPI tiles */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
              <KpiTile label={ar ? 'إجمالي الطلاب' : 'Total Students'} value={totalStudents} color="bg-gray-50 dark:bg-gray-800" />
              <KpiTile label={ar ? 'طلاب ≥75%' : 'Students ≥75%'} value={schoolAbove75} sub={`${schoolAbove75Rate}%`} color="bg-primary-50 dark:bg-primary-900/20" />
              <KpiTile label={ar ? 'نسبة المحققين' : 'Above-75 Rate'} value={`${schoolAbove75Rate}%`} color="bg-primary-50 dark:bg-primary-900/20" />
              <KpiTile
                label={ar ? 'مستوى التحصيل' : 'Achievement Level'}
                value={ar ? schoolLevelAr : (schoolLevel === 'excellent' ? 'Excellent' : schoolLevel === 'very_good' ? 'Very Good' : schoolLevel === 'good' ? 'Good' : 'Below Std')}
                color={schoolLevel === 'excellent' ? 'bg-green-50 dark:bg-green-900/20' : schoolLevel === 'very_good' ? 'bg-blue-50 dark:bg-blue-900/20' : schoolLevel === 'good' ? 'bg-yellow-50 dark:bg-yellow-900/20' : 'bg-red-50 dark:bg-red-900/20'}
              />
            </div>
            {/* Descriptive paragraph */}
            <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-4 text-sm text-gray-700 dark:text-gray-300">
              {ar
                ? `${getProportionLabel(schoolAbove75Rate, 'ar')} الطلاب (${schoolAbove75} من ${totalStudents}) حققوا درجة ≥75% في المتوسط السنوي العام. مستوى التحصيل الأكاديمي للمدرسة: ${schoolLevelAr}.`
                : `${getProportionLabel(schoolAbove75Rate, 'en')} of students (${schoolAbove75} out of ${totalStudents}) achieved ≥75% in overall annual average. School academic achievement level: ${schoolLevel === 'excellent' ? 'Excellent' : schoolLevel === 'very_good' ? 'Very Good' : schoolLevel === 'good' ? 'Good' : 'Below Standard'}.`
              }
            </div>
          </>
        )}
      </div>

      {/* ── Section 2: Subject-level Analysis ── */}
      <div className="card print:shadow-none print:border">
        <SectionTitle num={2} ar="التحصيل الدراسي حسب المادة" en="Achievement by Subject" />
        <SectionToggle expanded={expanded.has(1)} onClick={() => toggle(1)}>
          {expanded.has(1) ? (ar ? 'إخفاء' : 'Hide') : (ar ? 'إظهار' : 'Show')}
        </SectionToggle>
        {expanded.has(1) && (
          <>
            {/* Bar chart: % above 75 per subject */}
            <div className="mb-6">
              <h3 className="text-sm font-medium text-gray-600 mb-3">{ar ? 'نسبة الطلاب ≥75% بالمادة' : '% Students ≥75% by Subject'}</h3>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={subjectChartData} margin={{ top: 5, right: 10, left: -10, bottom: 45 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="name" tick={{ fontSize: 9 }} angle={-35} textAnchor="end" interval={0} />
                  <YAxis tickFormatter={v => `${v}%`} tick={{ fontSize: 10 }} domain={[0, 100]} />
                  <Tooltip formatter={(v: number) => `${v}%`} />
                  <ReferenceLine y={70} stroke="#16a34a" strokeDasharray="4 2" label={{ value: ar ? 'ممتاز' : 'Exc.', position: 'right', fontSize: 9 }} />
                  <ReferenceLine y={60} stroke="#2563eb" strokeDasharray="4 2" label={{ value: ar ? 'جيد جداً' : 'VG', position: 'right', fontSize: 9 }} />
                  <ReferenceLine y={50} stroke="#ca8a04" strokeDasharray="4 2" label={{ value: ar ? 'جيد' : 'Good', position: 'right', fontSize: 9 }} />
                  <Bar dataKey="above75" name={ar ? '% فوق 75' : '% above 75'} radius={[3, 3, 0, 0]}>
                    {subjectChartData.map((d, i) => <Cell key={i} fill={d.color} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* Table */}
            <div className="overflow-x-auto">
              <table className="table-base">
                <thead>
                  <tr>
                    <th>{ar ? 'المادة' : 'Subject'}</th>
                    <th>{ar ? 'الطلاب' : 'Students'}</th>
                    <th>{ar ? 'فوق 75' : '≥75'}</th>
                    <th>{ar ? 'نسبة ≥75' : '% ≥75'}</th>
                    <th>{ar ? 'المتوسط' : 'Mean'}</th>
                    <th>{ar ? 'التقدير' : 'Grade'}</th>
                    <th>{ar ? 'المستوى' : 'Level'}</th>
                    <th>{ar ? 'الوصف النسبي' : 'Proportion'}</th>
                  </tr>
                </thead>
                <tbody>
                  {indicators.map(ind => (
                    <tr key={ind.subjectCode}>
                      <td className="font-medium">
                        {ar ? SUBJECT_LABELS[ind.subjectCode]?.ar : SUBJECT_LABELS[ind.subjectCode]?.en}
                      </td>
                      <td className="font-mono text-sm">{ind.totalStudents}</td>
                      <td className="font-mono text-sm">{ind.above75Count}</td>
                      <td className="font-mono text-sm font-bold">{ind.above75Rate}%</td>
                      <td className="font-mono text-sm">{ind.mean.toFixed(1)}</td>
                      <td className="font-mono text-sm font-bold">{ind.letterGrade}</td>
                      <td>
                        <span className={clsx('text-xs px-2 py-0.5 rounded-full font-medium', LEVEL_COLOR[ind.level])}>
                          {ar ? ind.levelAr : ind.levelEn}
                        </span>
                      </td>
                      <td className="text-sm text-gray-600 dark:text-gray-400">
                        {ar ? ind.proportionAr : ind.proportionEn}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Descriptive analysis */}
            <div className="mt-4 space-y-2 text-sm text-gray-700 dark:text-gray-300 bg-gray-50 dark:bg-gray-800 rounded-lg p-4">
              <p className="font-medium mb-2">{ar ? 'التحليل الوصفي:' : 'Descriptive Analysis:'}</p>
              {indicators.map(ind => {
                const subName = ar ? SUBJECT_LABELS[ind.subjectCode]?.ar : SUBJECT_LABELS[ind.subjectCode]?.en
                return (
                  <p key={ind.subjectCode} className="leading-relaxed">
                    {ar
                      ? `• ${subName}: ${ind.proportionAr} الطلاب (${ind.above75Rate}%) حققوا درجة ≥75%، بمتوسط ${ind.mean.toFixed(1)} (${ind.letterGrade})، المستوى: ${ind.levelAr}.`
                      : `• ${subName}: ${ind.proportionEn} of students (${ind.above75Rate}%) achieved ≥75%, mean ${ind.mean.toFixed(1)} (${ind.letterGrade}), level: ${ind.levelEn}.`
                    }
                  </p>
                )
              })}
            </div>
          </>
        )}
      </div>

      {/* ── Section 3: Grade-level breakdown ── */}
      {gradeData.length > 1 && (
        <div className="card print:shadow-none print:border">
          <SectionTitle num={3} ar="التحصيل حسب الصف الدراسي" en="Achievement by Grade" />
          <SectionToggle expanded={expanded.has(2)} onClick={() => toggle(2)}>
            {expanded.has(2) ? (ar ? 'إخفاء' : 'Hide') : (ar ? 'إظهار' : 'Show')}
          </SectionToggle>
          {expanded.has(2) && (
            <>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={gradeData} margin={{ top: 5, right: 10, left: -10, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="grade" tick={{ fontSize: 11 }} />
                  <YAxis tickFormatter={v => `${v}%`} tick={{ fontSize: 10 }} domain={[0, 100]} />
                  <Tooltip formatter={(v: number) => `${v}%`} />
                  <ReferenceLine y={70} stroke="#16a34a" strokeDasharray="4 2" />
                  <ReferenceLine y={50} stroke="#ca8a04" strokeDasharray="4 2" />
                  <Bar dataKey="above75Rate" name={ar ? '% فوق 75' : '% above 75'} radius={[3, 3, 0, 0]}>
                    {gradeData.map((d, i) => (
                      <Cell key={i} fill={d.above75Rate >= 70 ? '#16a34a' : d.above75Rate >= 60 ? '#2563eb' : d.above75Rate >= 50 ? '#ca8a04' : '#dc2626'} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
              <div className="overflow-x-auto mt-4">
                <table className="table-base">
                  <thead>
                    <tr>
                      <th>{ar ? 'الصف' : 'Grade'}</th>
                      <th>{ar ? 'الطلاب' : 'Students'}</th>
                      <th>{ar ? 'فوق 75' : '≥75'}</th>
                      <th>{ar ? 'نسبة ≥75' : '% ≥75'}</th>
                      <th>{ar ? 'المستوى' : 'Level'}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {gradeData.map(d => {
                      let lvl = 'below', lvlAr = 'دون المستوى', lvlEn = 'Below Std'
                      if (d.above75Rate >= 70) { lvl = 'excellent'; lvlAr = 'ممتاز'; lvlEn = 'Excellent' }
                      else if (d.above75Rate >= 60) { lvl = 'very_good'; lvlAr = 'جيد جداً'; lvlEn = 'Very Good' }
                      else if (d.above75Rate >= 50) { lvl = 'good'; lvlAr = 'جيد'; lvlEn = 'Good' }
                      return (
                        <tr key={d.grade}>
                          <td className="font-medium">{d.grade}</td>
                          <td className="font-mono text-sm">{d.total}</td>
                          <td className="font-mono text-sm">{d.above75}</td>
                          <td className="font-mono text-sm font-bold">{d.above75Rate}%</td>
                          <td>
                            <span className={clsx('text-xs px-2 py-0.5 rounded-full font-medium', LEVEL_COLOR[lvl])}>
                              {ar ? lvlAr : lvlEn}
                            </span>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      )}

      {/* ── Section 4: Normal Distribution per subject ── */}
      <div className="card print:shadow-none print:border">
        <SectionTitle num={gradeData.length > 1 ? 4 : 3} ar="التوزيع الطبيعي للدرجات" en="Score Normal Distribution" />
        <SectionToggle expanded={expanded.has(3)} onClick={() => toggle(3)}>
          {expanded.has(3) ? (ar ? 'إخفاء' : 'Hide') : (ar ? 'إظهار' : 'Show')}
        </SectionToggle>
        {expanded.has(3) && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            {indicators.slice(0, 6).map(ind => {
              const scores = extractScores(records, ind.subjectCode, sem as any)
              return (
                <div key={ind.subjectCode}>
                  <p className="text-xs font-medium text-gray-500 mb-2">
                    {ar ? SUBJECT_LABELS[ind.subjectCode]?.ar : SUBJECT_LABELS[ind.subjectCode]?.en}
                  </p>
                  <NormalDistributionChart scores={scores} cycle={getCycle(filter.grade ?? 5)} />
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// REPORT 2: PROGRESS TRENDS (اتجاهات التقدم)
// ══════════════════════════════════════════════════════════════════════════════
function ProgressTrendsReport({ lang, filter }: { lang: Language; filter: AnalysisFilter }) {
  const ar = lang === 'ar'
  const [expanded, setExpanded] = useState<Set<number>>(new Set([0, 1, 2, 3, 4]))
  const toggle = (n: number) => setExpanded(s => { const ns = new Set(s); ns.has(n) ? ns.delete(n) : ns.add(n); return ns })

  const years = dataStore.getYears()
  const sem: Semester | 'annual' = (filter.semester as any) ?? 'annual'

  // Current year records
  const latestYear = filter.yearId ?? years[years.length - 1] ?? ''
  const records = useMemo(() => {
    const raw = dataStore.getRecordsByYear(latestYear)
    return filterRecords(raw, filter)
  }, [latestYear, filter])

  // All years records (filtered by grade/track)
  const allYearRecords = useMemo(() =>
    years.map(yId => ({
      yearId: yId,
      records: filterRecords(dataStore.getRecordsByYear(yId), { grade: filter.grade, track: filter.track }),
    })), [years, filter.grade, filter.track])

  // Subjects present in current year
  const subjectCodes = useMemo(() => [...new Set(
    records.flatMap(r => Object.keys(r.grades) as SubjectCode[])
  )], [records])

  // Multi-year trend: average per subject per year
  const trendData = useMemo(() =>
    years.map(yId => {
      const yr = allYearRecords.find(r => r.yearId === yId)?.records ?? []
      const row: Record<string, string | number> = { yearId: yId }
      for (const sc of subjectCodes) {
        const scores = extractScores(yr, sc, sem)
        if (scores.length > 0) row[sc] = round2(scores.reduce((a, b) => a + b, 0) / scores.length)
      }
      return row
    }), [years, subjectCodes, sem, allYearRecords])

  // Progress summary (current vs previous year)
  const prevYear = years[years.length - 2]
  const progressRows = useMemo(() => {
    if (!prevYear) return []
    const prevRecords = filterRecords(dataStore.getRecordsByYear(prevYear), filter)
    // Compute overall average progress per student across all subjects
    const prevMap = new Map<string, number>()
    for (const r of prevRecords) {
      const scores = Object.values(r.grades).flatMap(g =>
        g ? [g.s1, g.s2, g.s3, g.annual].filter((x): x is number => x !== null && x !== undefined) : []
      )
      if (scores.length > 0) prevMap.set(r.student.id, scores.reduce((a, b) => a + b, 0) / scores.length)
    }
    return records.map(r => {
      const scores = Object.values(r.grades).flatMap(g =>
        g ? [g.s1, g.s2, g.s3, g.annual].filter((x): x is number => x !== null && x !== undefined) : []
      )
      const curr = scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : null
      const prev = prevMap.get(r.student.id) ?? null
      const diff = curr !== null && prev !== null ? curr - prev : null
      let category: 'significant_progress' | 'slight_progress' | 'stable' | 'regression' | 'no_baseline' = 'no_baseline'
      if (diff !== null) {
        if (diff >= 10) category = 'significant_progress'
        else if (diff >= 3) category = 'slight_progress'
        else if (diff >= -3) category = 'stable'
        else category = 'regression'
      }
      return { studentId: r.student.id, studentName: r.student.name, baselineScore: prev, baselineType: 'previous' as const, currentScore: curr, diff, category }
    })
  }, [records, prevYear, filter])

  const progressStats = useMemo(() => {
    const total = progressRows.length
    const counts = { significant_progress: 0, slight_progress: 0, stable: 0, regression: 0, no_baseline: 0 }
    for (const r of progressRows) counts[r.category]++
    return { total, ...counts }
  }, [progressRows])

  // Multi-year trajectory
  const multiYearRows = useMemo(() => {
    if (years.length < 2) return []
    return computeMultiYearProgress(allYearRecords, subjectCodes[0] ?? 'arabic', sem)
  }, [allYearRecords, subjectCodes, sem, years.length])

  const trajectoryStats = useMemo(() => {
    const total = multiYearRows.length
    const improved = multiYearRows.filter(r => (r.overallDiff ?? 0) > 0).length
    const declined = multiYearRows.filter(r => (r.overallDiff ?? 0) < 0).length
    const avgDiff = multiYearRows.length > 0
      ? round2(multiYearRows.reduce((acc, r) => acc + (r.overallDiff ?? 0), 0) / multiYearRows.length)
      : 0
    return { total, improved, declined, avgDiff }
  }, [multiYearRows])

  // Year-over-year average change per subject
  const yearDeltaData = useMemo(() => {
    if (years.length < 2) return []
    return subjectCodes.map(sc => {
      const deltas: number[] = []
      for (let i = 1; i < years.length; i++) {
        const prev = trendData[i - 1][sc] as number | undefined
        const curr = trendData[i][sc] as number | undefined
        if (prev !== undefined && curr !== undefined) deltas.push(curr - prev)
      }
      const avgDelta = deltas.length > 0 ? round2(deltas.reduce((a, b) => a + b, 0) / deltas.length) : 0
      return {
        name: ar ? SUBJECT_LABELS[sc]?.ar ?? sc : SUBJECT_LABELS[sc]?.en ?? sc,
        delta: avgDelta,
        sc,
      }
    })
  }, [subjectCodes, trendData, ar, years.length])

  if (records.length === 0 || years.length === 0) {
    return <div className="card text-center py-12 text-gray-400">{t('no_data')}</div>
  }

  return (
    <div className="space-y-8 print:space-y-6">
      <CoverPage
        lang={lang}
        filter={filter}
        reportTitle={ar ? 'تقرير اتجاهات التقدم' : 'Progress Trends Report'}
        reportSubtitle={ar ? 'تحليل شامل للتقدم والتراجع والاتجاهات عبر السنوات' : 'Comprehensive analysis of progress, regression & multi-year trends'}
      />

      {/* ── Section 1: Progress Summary ── */}
      <div className="card print:shadow-none print:border">
        <SectionTitle num={1} ar="ملخص التقدم والتراجع" en="Progress & Regression Summary" />
        <SectionToggle expanded={expanded.has(0)} onClick={() => toggle(0)}>
          {expanded.has(0) ? (ar ? 'إخفاء' : 'Hide') : (ar ? 'إظهار' : 'Show')}
        </SectionToggle>
        {expanded.has(0) && (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-5">
              <KpiTile label={ar ? 'إجمالي الطلاب' : 'Total'} value={progressStats.total} color="bg-gray-50 dark:bg-gray-800" />
              <KpiTile label={ar ? 'تقدم ملحوظ' : 'Sig. Progress'} value={progressStats.significant_progress} sub={`${round2((progressStats.significant_progress / progressStats.total) * 100)}%`} color="bg-green-50 dark:bg-green-900/20" />
              <KpiTile label={ar ? 'تقدم بسيط' : 'Slight Progress'} value={progressStats.slight_progress} sub={`${round2((progressStats.slight_progress / progressStats.total) * 100)}%`} color="bg-teal-50 dark:bg-teal-900/20" />
              <KpiTile label={ar ? 'مستقر' : 'Stable'} value={progressStats.stable} sub={`${round2((progressStats.stable / progressStats.total) * 100)}%`} color="bg-yellow-50 dark:bg-yellow-900/20" />
              <KpiTile label={ar ? 'تراجع' : 'Regression'} value={progressStats.regression} sub={`${round2((progressStats.regression / progressStats.total) * 100)}%`} color="bg-red-50 dark:bg-red-900/20" />
            </div>

            {/* Progress bar visualization */}
            {progressStats.total > 0 && (
              <div className="mb-4">
                <p className="text-xs text-gray-500 mb-1">{ar ? 'توزيع التقدم' : 'Progress Distribution'}</p>
                <div className="flex h-6 rounded-full overflow-hidden w-full">
                  {progressStats.significant_progress > 0 && (
                    <div className="bg-green-500" style={{ width: `${(progressStats.significant_progress / progressStats.total) * 100}%` }} title={ar ? 'تقدم ملحوظ' : 'Significant'} />
                  )}
                  {progressStats.slight_progress > 0 && (
                    <div className="bg-teal-400" style={{ width: `${(progressStats.slight_progress / progressStats.total) * 100}%` }} title={ar ? 'تقدم بسيط' : 'Slight'} />
                  )}
                  {progressStats.stable > 0 && (
                    <div className="bg-yellow-400" style={{ width: `${(progressStats.stable / progressStats.total) * 100}%` }} title={ar ? 'مستقر' : 'Stable'} />
                  )}
                  {progressStats.regression > 0 && (
                    <div className="bg-red-500" style={{ width: `${(progressStats.regression / progressStats.total) * 100}%` }} title={ar ? 'تراجع' : 'Regression'} />
                  )}
                </div>
              </div>
            )}

            {/* Descriptive text */}
            <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-4 text-sm text-gray-700 dark:text-gray-300">
              {progressStats.total > 0 ? (
                <>
                  <p className="mb-1">
                    {ar
                      ? `• ${getProportionLabel((progressStats.significant_progress + progressStats.slight_progress) / progressStats.total * 100, 'ar')} الطلاب (${progressStats.significant_progress + progressStats.slight_progress} من ${progressStats.total}) أظهروا تقدماً مقارنة بالعام السابق.`
                      : `• ${getProportionLabel((progressStats.significant_progress + progressStats.slight_progress) / progressStats.total * 100, 'en')} of students (${progressStats.significant_progress + progressStats.slight_progress} out of ${progressStats.total}) showed improvement vs previous year.`}
                  </p>
                  <p>
                    {ar
                      ? `• ${getProportionLabel(progressStats.regression / progressStats.total * 100, 'ar')} الطلاب (${progressStats.regression} طالب) سجلوا تراجعاً.`
                      : `• ${getProportionLabel(progressStats.regression / progressStats.total * 100, 'en')} of students (${progressStats.regression}) showed regression.`}
                  </p>
                </>
              ) : (
                <p>{ar ? 'لا توجد بيانات للمقارنة.' : 'No comparison data available.'}</p>
              )}
            </div>
          </>
        )}
      </div>

      {/* ── Section 2: Multi-year trend ── */}
      {years.length >= 2 && (
        <div className="card print:shadow-none print:border">
          <SectionTitle num={2} ar="الاتجاه العام عبر السنوات" en="Multi-Year Trend" />
          <SectionToggle expanded={expanded.has(1)} onClick={() => toggle(1)}>
            {expanded.has(1) ? (ar ? 'إخفاء' : 'Hide') : (ar ? 'إظهار' : 'Show')}
          </SectionToggle>
          {expanded.has(1) && (
            <>
              <ResponsiveContainer width="100%" height={260}>
                <LineChart data={trendData} margin={{ top: 5, right: 20, left: -10, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="yearId" tick={{ fontSize: 10 }} />
                  <YAxis domain={[0, 100]} tick={{ fontSize: 10 }} />
                  <Tooltip />
                  <Legend wrapperStyle={{ fontSize: 10 }} />
                  {subjectCodes.map((sc, i) => (
                    <Line
                      key={sc}
                      type="monotone"
                      dataKey={sc}
                      name={ar ? SUBJECT_LABELS[sc]?.ar : SUBJECT_LABELS[sc]?.en}
                      stroke={SUBJECT_COLORS[i % SUBJECT_COLORS.length]}
                      dot={{ r: 4 }}
                      strokeWidth={2}
                    />
                  ))}
                </LineChart>
              </ResponsiveContainer>

              {/* Year comparison table */}
              <div className="overflow-x-auto mt-4">
                <table className="table-base">
                  <thead>
                    <tr>
                      <th>{ar ? 'المادة' : 'Subject'}</th>
                      {years.map(y => <th key={y}>{y}</th>)}
                      {years.length >= 2 && <th>Δ {ar ? 'الكلي' : 'Total'}</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {subjectCodes.map(sc => {
                      const vals = years.map(y => trendData.find(d => d.yearId === y)?.[sc] as number | undefined)
                      const first = vals.find(v => v !== undefined)
                      const last = [...vals].reverse().find(v => v !== undefined)
                      const delta = (first !== undefined && last !== undefined) ? round2(last - first) : null
                      return (
                        <tr key={sc}>
                          <td className="font-medium">{ar ? SUBJECT_LABELS[sc]?.ar : SUBJECT_LABELS[sc]?.en}</td>
                          {vals.map((v, i) => <td key={i} className="font-mono text-sm">{v !== undefined ? v.toFixed(1) : '—'}</td>)}
                          {years.length >= 2 && (
                            <td className={clsx('font-mono text-sm font-bold', delta === null ? '' : delta > 0 ? 'text-green-600' : delta < 0 ? 'text-red-600' : '')}>
                              {delta !== null ? (delta > 0 ? `+${delta}` : `${delta}`) : '—'}
                            </td>
                          )}
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      )}

      {/* ── Section 3: Change in averages (bar chart delta) ── */}
      {years.length >= 2 && (
        <div className="card print:shadow-none print:border">
          <SectionTitle num={3} ar="تغير المعدل التحصيلي" en="Change in Academic Averages" />
          <SectionToggle expanded={expanded.has(2)} onClick={() => toggle(2)}>
            {expanded.has(2) ? (ar ? 'إخفاء' : 'Hide') : (ar ? 'إظهار' : 'Show')}
          </SectionToggle>
          {expanded.has(2) && (
            <>
              <p className="text-xs text-gray-500 mb-3">
                {ar ? 'متوسط التغير السنوي في درجة كل مادة' : 'Average annual change per subject score'}
              </p>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={yearDeltaData} margin={{ top: 5, right: 10, left: -10, bottom: 45 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="name" tick={{ fontSize: 9 }} angle={-35} textAnchor="end" interval={0} />
                  <YAxis tick={{ fontSize: 10 }} />
                  <Tooltip formatter={(v: number) => v > 0 ? `+${v}` : `${v}`} />
                  <ReferenceLine y={0} stroke="#6b7280" />
                  <Bar dataKey="delta" name={ar ? 'التغير' : 'Change'} radius={[3, 3, 0, 0]}>
                    {yearDeltaData.map((d, i) => (
                      <Cell key={i} fill={d.delta > 0 ? '#22c55e' : d.delta < -3 ? '#ef4444' : '#f97316'} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
              {/* Descriptive text */}
              <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-4 text-sm text-gray-700 dark:text-gray-300 mt-3 space-y-1">
                {yearDeltaData.map(d => (
                  <p key={d.sc}>
                    {ar
                      ? `• ${d.name}: متوسط التغير السنوي ${d.delta > 0 ? `↑ +${d.delta}` : `↓ ${d.delta}`} نقطة`
                      : `• ${d.name}: avg. annual change ${d.delta > 0 ? `↑ +${d.delta}` : `↓ ${d.delta}`} pts`}
                  </p>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {/* ── Section 4: Normal distribution change ── */}
      {years.length >= 2 && (
        <div className="card print:shadow-none print:border">
          <SectionTitle num={4} ar="تغير التوزيع الطبيعي" en="Normal Distribution Change" />
          <SectionToggle expanded={expanded.has(3)} onClick={() => toggle(3)}>
            {expanded.has(3) ? (ar ? 'إخفاء' : 'Hide') : (ar ? 'إظهار' : 'Show')}
          </SectionToggle>
          {expanded.has(3) && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              {subjectCodes.slice(0, 4).map(sc => {
                const currScores = extractScores(records, sc, sem)
                const prevRecords = filterRecords(
                  dataStore.getRecordsByYear(prevYear ?? ''),
                  { grade: filter.grade, track: filter.track }
                )
                const prevScores = extractScores(prevRecords, sc, sem)
                const currMean = currScores.length > 0 ? round2(currScores.reduce((a, b) => a + b, 0) / currScores.length) : 0
                const prevMean = prevScores.length > 0 ? round2(prevScores.reduce((a, b) => a + b, 0) / prevScores.length) : 0
                const shift = round2(currMean - prevMean)
                return (
                  <div key={sc}>
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-xs font-medium text-gray-500">
                        {ar ? SUBJECT_LABELS[sc]?.ar : SUBJECT_LABELS[sc]?.en}
                      </p>
                      <span className={clsx('text-xs font-bold', shift > 0 ? 'text-green-600' : shift < 0 ? 'text-red-600' : 'text-gray-400')}>
                        {shift > 0 ? `↑ +${shift}` : shift < 0 ? `↓ ${shift}` : '→ 0'}
                      </span>
                    </div>
                    <NormalDistributionChart scores={currScores} cycle={getCycle(filter.grade ?? 5)} />
                    <p className="text-xs text-gray-400 text-center mt-1">
                      {ar ? `متوسط هذا العام: ${currMean} | السابق: ${prevMean}` : `This year avg: ${currMean} | Prev: ${prevMean}`}
                    </p>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* ── Section 5: Student trajectory ── */}
      {years.length >= 2 && (
        <div className="card print:shadow-none print:border">
          <SectionTitle num={5} ar="تتبع المسار — منحنى التقدم" en="Student Trajectory — Progress Curve" />
          <SectionToggle expanded={expanded.has(4)} onClick={() => toggle(4)}>
            {expanded.has(4) ? (ar ? 'إخفاء' : 'Hide') : (ar ? 'إظهار' : 'Show')}
          </SectionToggle>
          {expanded.has(4) && (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
                <KpiTile label={ar ? 'طلاب المسار' : 'Tracked Students'} value={trajectoryStats.total} color="bg-gray-50 dark:bg-gray-800" />
                <KpiTile label={ar ? 'تحسّن' : 'Improved'} value={trajectoryStats.improved} sub={trajectoryStats.total > 0 ? `${round2(trajectoryStats.improved / trajectoryStats.total * 100)}%` : ''} color="bg-green-50 dark:bg-green-900/20" />
                <KpiTile label={ar ? 'تراجع' : 'Declined'} value={trajectoryStats.declined} sub={trajectoryStats.total > 0 ? `${round2(trajectoryStats.declined / trajectoryStats.total * 100)}%` : ''} color="bg-red-50 dark:bg-red-900/20" />
                <KpiTile label={ar ? 'متوسط التغير' : 'Avg Change'} value={trajectoryStats.avgDiff > 0 ? `+${trajectoryStats.avgDiff}` : `${trajectoryStats.avgDiff}`} color={trajectoryStats.avgDiff >= 0 ? 'bg-green-50 dark:bg-green-900/20' : 'bg-red-50 dark:bg-red-900/20'} />
              </div>

              {/* Progress curve: distribution of overall diffs */}
              {multiYearRows.length > 0 && (() => {
                const diffBins: Record<string, number> = {
                  '< -10': 0, '-10 to -5': 0, '-5 to 0': 0, '0': 0, '0 to 5': 0, '5 to 10': 0, '> 10': 0
                }
                for (const r of multiYearRows) {
                  const d = r.overallDiff ?? 0
                  if (d < -10) diffBins['< -10']++
                  else if (d < -5) diffBins['-10 to -5']++
                  else if (d < 0) diffBins['-5 to 0']++
                  else if (d === 0) diffBins['0']++
                  else if (d <= 5) diffBins['0 to 5']++
                  else if (d <= 10) diffBins['5 to 10']++
                  else diffBins['> 10']++
                }
                const curveData = Object.entries(diffBins).map(([label, count]) => ({ label, count }))
                return (
                  <>
                    <p className="text-xs text-gray-500 mb-2">{ar ? 'توزيع التغير الإجمالي (ف1 أول سنة → السنة الحالية)' : 'Distribution of overall change (first S1 → current year)'}</p>
                    <ResponsiveContainer width="100%" height={180}>
                      <BarChart data={curveData} margin={{ top: 5, right: 10, left: -10, bottom: 5 }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} />
                        <XAxis dataKey="label" tick={{ fontSize: 9 }} />
                        <YAxis tick={{ fontSize: 10 }} />
                        <Tooltip />
                        <ReferenceLine x="0" stroke="#6b7280" />
                        <Bar dataKey="count" name={ar ? 'طلاب' : 'Students'} radius={[3, 3, 0, 0]}>
                          {curveData.map((d, i) => {
                            const isPos = d.label.startsWith('0 to') || d.label.startsWith('5 to') || d.label.startsWith('>')
                            const isNeg = d.label.startsWith('<') || d.label.startsWith('-')
                            return <Cell key={i} fill={isPos ? '#22c55e' : isNeg ? '#ef4444' : '#94a3b8'} />
                          })}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </>
                )
              })()}
            </>
          )}
        </div>
      )}
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// MAIN REPORTS PAGE
// ══════════════════════════════════════════════════════════════════════════════
export default function Reports({ lang }: ReportsProps) {
  const ar = lang === 'ar'
  const [tab, setTab] = useState<'achievement' | 'trends'>('achievement')
  const [filter, setFilter] = useState<AnalysisFilter>({
    yearId: dataStore.getYears().slice(-1)[0],
    semester: 'annual',
  })

  const years = dataStore.getYears()
  if (years.length === 0) {
    return (
      <div className="card text-center py-12 text-gray-500">
        {t('no_data')}
      </div>
    )
  }

  return (
    <div className="space-y-5">
      {/* Header + tabs + print button */}
      <div className="flex items-center justify-between flex-wrap gap-3 no-print">
        <div>
          <h1 className="text-xl font-bold">{t('reports_title')}</h1>
          <p className="text-xs text-gray-400 mt-0.5">
            {ar ? 'اختر نوع التقرير ثم اضغط طباعة' : 'Choose report type then print'}
          </p>
        </div>
        <button
          className="btn-primary flex items-center gap-2"
          onClick={() => window.print()}
        >
          <Printer size={15} />
          {ar ? 'طباعة التقرير' : 'Print Report'}
        </button>
      </div>

      {/* Tab selector */}
      <div className="no-print flex gap-2 border-b">
        <button
          className={clsx('px-4 py-2 text-sm font-medium border-b-2 transition-colors', tab === 'achievement' ? 'border-primary-600 text-primary-700' : 'border-transparent text-gray-500 hover:text-gray-700')}
          onClick={() => setTab('achievement')}
        >
          {ar ? '📊 التحصيل الدراسي (المؤشر 1.1)' : '📊 Achievement Indicator (1.1)'}
        </button>
        <button
          className={clsx('px-4 py-2 text-sm font-medium border-b-2 transition-colors', tab === 'trends' ? 'border-primary-600 text-primary-700' : 'border-transparent text-gray-500 hover:text-gray-700')}
          onClick={() => setTab('trends')}
        >
          {ar ? '📈 اتجاهات التقدم' : '📈 Progress Trends'}
        </button>
      </div>

      {/* Filters */}
      <div className="no-print">
        <FilterBar
          filter={filter}
          onChange={setFilter}
          lang={lang}
          showSubject={false}
          showSemester={true}
          showNationality={false}
        />
      </div>

      {/* Report content */}
      {tab === 'achievement'
        ? <AchievementReport lang={lang} filter={filter} />
        : <ProgressTrendsReport lang={lang} filter={filter} />
      }
    </div>
  )
}
