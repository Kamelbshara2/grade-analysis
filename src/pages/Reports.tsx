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
  computeMultiYearProgress, computeSemesterGaps,
  computeAchievementIndicators, getProportionLabel, getLetterGrade,
  type AchievementIndicator, type SemesterGap,
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
// REPORT 2: PROGRESS TRENDS — معيار 1.2 (اتجاهات التقدم)
// ══════════════════════════════════════════════════════════════════════════════

// Arabic trajectory bin labels (avoids RTL garbling of English)
const TRAJ_BINS_AR = [
  { key: 'lt-10',   label: 'أقل من −10',   isNeg: true },
  { key: '-10to-5', label: '−10 إلى −5',   isNeg: true },
  { key: '-5to0',   label: '−5 إلى 0',     isNeg: true },
  { key: 'zero',    label: 'صفر',           isNeg: false },
  { key: '0to5',    label: '0 إلى 5',      isNeg: false },
  { key: '5to10',   label: '5 إلى 10',     isNeg: false },
  { key: 'gt10',    label: 'أكثر من 10',   isNeg: false },
]

function buildTrajBins(rows: { overallDiff?: number | null }[]) {
  const counts: Record<string, number> = { 'lt-10': 0, '-10to-5': 0, '-5to0': 0, 'zero': 0, '0to5': 0, '5to10': 0, 'gt10': 0 }
  for (const r of rows) {
    const d = r.overallDiff ?? 0
    if (d < -10) counts['lt-10']++
    else if (d < -5) counts['-10to-5']++
    else if (d < 0) counts['-5to0']++
    else if (d === 0) counts['zero']++
    else if (d <= 5) counts['0to5']++
    else if (d <= 10) counts['5to10']++
    else counts['gt10']++
  }
  return TRAJ_BINS_AR.map(b => ({ ...b, count: counts[b.key] }))
}

function ProgressTrendsReport({ lang, filter }: { lang: Language; filter: AnalysisFilter }) {
  const ar = lang === 'ar'
  const [expanded, setExpanded] = useState<Set<string>>(new Set(['s1', 's2']))
  const toggle = (k: string) => setExpanded(s => { const ns = new Set(s); ns.has(k) ? ns.delete(k) : ns.add(k); return ns })

  const years = dataStore.getYears()
  const sem: Semester | 'annual' = (filter.semester as any) ?? 'annual'

  const latestYear = filter.yearId ?? years[years.length - 1] ?? ''
  const records = useMemo(() => {
    const raw = dataStore.getRecordsByYear(latestYear)
    return filterRecords(raw, filter)
  }, [latestYear, filter])

  const allYearRecords = useMemo(() =>
    years.map(yId => ({
      yearId: yId,
      records: filterRecords(dataStore.getRecordsByYear(yId), { grade: filter.grade, track: filter.track }),
    })), [years, filter.grade, filter.track])

  const subjectCodes = useMemo(() => [...new Set(
    records.flatMap(r => Object.keys(r.grades) as SubjectCode[])
  )], [records])

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

  const prevYear = years[years.length - 2]

  // Progress summary (current vs previous year)
  const progressRows = useMemo(() => {
    if (!prevYear) return []
    const prevRecords = filterRecords(dataStore.getRecordsByYear(prevYear), filter)
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
      return { studentId: r.student.id, studentName: r.student.name, baselineScore: prev, currentScore: curr, diff, category }
    })
  }, [records, prevYear, filter])

  const progressStats = useMemo(() => {
    const total = progressRows.length
    const counts = { significant_progress: 0, slight_progress: 0, stable: 0, regression: 0, no_baseline: 0 }
    for (const r of progressRows) counts[r.category]++
    return { total, ...counts }
  }, [progressRows])

  // Fail / pass / above-75 across all subjects (annual avg or filtered sem)
  const achievementStats = useMemo(() => {
    const cycle = getCycle(filter.grade ?? 5)
    const passMark = getPassMark(cycle)
    const total = records.length
    const failCount   = records.filter(r => (r.annualAvg ?? 0) < passMark).length
    const passCount   = records.filter(r => { const a = r.annualAvg ?? 0; return a >= passMark && a < 75 }).length
    const above75Count = records.filter(r => (r.annualAvg ?? 0) >= 75).length
    return {
      total,
      failCount, failPct: total > 0 ? round2(failCount / total * 100) : 0,
      passCount, passPct: total > 0 ? round2(passCount / total * 100) : 0,
      above75Count, above75Pct: total > 0 ? round2(above75Count / total * 100) : 0,
    }
  }, [records, filter.grade])

  // Semester gaps for معيار 1.3
  const semGaps = useMemo(() => computeSemesterGaps(records), [records])

  if (records.length === 0 || years.length === 0) {
    return <div className="card text-center py-12 text-gray-400">{t('no_data')}</div>
  }

  const prevRecordsForNorm = prevYear
    ? filterRecords(dataStore.getRecordsByYear(prevYear), { grade: filter.grade, track: filter.track })
    : []

  return (
    <div className="space-y-8 print:space-y-6">
      <CoverPage
        lang={lang}
        filter={filter}
        reportTitle={ar ? 'تقرير اتجاهات التقدم' : 'Progress Trends Report'}
        reportSubtitle={ar ? 'معيار 1.2 — تحليل شامل للتقدم والتراجع والاتجاهات عبر السنوات' : 'Indicator 1.2 — Comprehensive analysis of progress, regression & multi-year trends'}
      />

      {/* ── Section 1: معيار 1.2 — ملخص التقدم ── */}
      <div className="card print:shadow-none print:border">
        <SectionTitle num={1} ar="معيار 1.2 — ملخص التقدم والتراجع" en="Indicator 1.2 — Progress & Regression Summary" />
        <SectionToggle expanded={expanded.has('s1')} onClick={() => toggle('s1')}>
          {expanded.has('s1') ? (ar ? 'إخفاء' : 'Hide') : (ar ? 'إظهار' : 'Show')}
        </SectionToggle>
        {expanded.has('s1') && (
          <>
            {/* Fail / Pass / Above-75 band stats */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
              <KpiTile label={ar ? 'إجمالي الطلاب' : 'Total Students'} value={achievementStats.total} color="bg-gray-50 dark:bg-gray-800" />
              <KpiTile
                label={ar ? 'راسبون' : 'Fail %'}
                value={`${achievementStats.failPct}%`}
                sub={`${achievementStats.failCount} ${ar ? 'طالب' : 'students'}`}
                color="bg-red-50 dark:bg-red-900/20"
              />
              <KpiTile
                label={ar ? 'ناجحون (< 75%)' : 'Pass (< 75%)'}
                value={`${achievementStats.passPct}%`}
                sub={`${achievementStats.passCount} ${ar ? 'طالب' : 'students'}`}
                color="bg-yellow-50 dark:bg-yellow-900/20"
              />
              <KpiTile
                label={ar ? 'فوق 75%' : 'Above 75%'}
                value={`${achievementStats.above75Pct}%`}
                sub={`${achievementStats.above75Count} ${ar ? 'طالب' : 'students'}`}
                color="bg-green-50 dark:bg-green-900/20"
              />
            </div>

            {/* Band distribution bar */}
            {achievementStats.total > 0 && (
              <div className="mb-5">
                <p className="text-xs text-gray-500 mb-1">{ar ? 'توزيع الفئات' : 'Band Distribution'}</p>
                <div className="flex h-7 rounded-lg overflow-hidden w-full text-xs text-white font-bold">
                  {achievementStats.failPct > 0 && (
                    <div className="flex items-center justify-center bg-red-500" style={{ width: `${achievementStats.failPct}%` }}>
                      {achievementStats.failPct >= 8 ? `${achievementStats.failPct}%` : ''}
                    </div>
                  )}
                  {achievementStats.passPct > 0 && (
                    <div className="flex items-center justify-center bg-yellow-400 text-gray-800" style={{ width: `${achievementStats.passPct}%` }}>
                      {achievementStats.passPct >= 8 ? `${achievementStats.passPct}%` : ''}
                    </div>
                  )}
                  {achievementStats.above75Pct > 0 && (
                    <div className="flex items-center justify-center bg-green-500" style={{ width: `${achievementStats.above75Pct}%` }}>
                      {achievementStats.above75Pct >= 8 ? `${achievementStats.above75Pct}%` : ''}
                    </div>
                  )}
                </div>
                <div className="flex gap-4 mt-1 text-[10px] text-gray-500">
                  <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-red-500 inline-block" />{ar ? 'راسبون' : 'Fail'}</span>
                  <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-yellow-400 inline-block" />{ar ? 'ناجح (< 75%)' : 'Pass (< 75%)'}</span>
                  <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-green-500 inline-block" />{ar ? 'فوق 75%' : 'Above 75%'}</span>
                </div>
              </div>
            )}

            {/* Progress vs previous year */}
            {progressStats.total > 0 && (
              <>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
                  <KpiTile label={ar ? 'تقدم ملحوظ' : 'Sig. Progress'} value={progressStats.significant_progress} sub={`${round2((progressStats.significant_progress / progressStats.total) * 100)}%`} color="bg-green-50 dark:bg-green-900/20" />
                  <KpiTile label={ar ? 'تقدم بسيط' : 'Slight Progress'} value={progressStats.slight_progress} sub={`${round2((progressStats.slight_progress / progressStats.total) * 100)}%`} color="bg-teal-50 dark:bg-teal-900/20" />
                  <KpiTile label={ar ? 'مستقر' : 'Stable'} value={progressStats.stable} sub={`${round2((progressStats.stable / progressStats.total) * 100)}%`} color="bg-yellow-50 dark:bg-yellow-900/20" />
                  <KpiTile label={ar ? 'تراجع' : 'Regression'} value={progressStats.regression} sub={`${round2((progressStats.regression / progressStats.total) * 100)}%`} color="bg-red-50 dark:bg-red-900/20" />
                </div>
                <div className="mb-4">
                  <p className="text-xs text-gray-500 mb-1">{ar ? 'توزيع التقدم مقارنة بالعام السابق' : 'Progress vs previous year'}</p>
                  <div className="flex h-6 rounded-full overflow-hidden w-full">
                    {progressStats.significant_progress > 0 && <div className="bg-green-500" style={{ width: `${(progressStats.significant_progress / progressStats.total) * 100}%` }} />}
                    {progressStats.slight_progress > 0 && <div className="bg-teal-400" style={{ width: `${(progressStats.slight_progress / progressStats.total) * 100}%` }} />}
                    {progressStats.stable > 0 && <div className="bg-yellow-400" style={{ width: `${(progressStats.stable / progressStats.total) * 100}%` }} />}
                    {progressStats.regression > 0 && <div className="bg-red-500" style={{ width: `${(progressStats.regression / progressStats.total) * 100}%` }} />}
                  </div>
                </div>
              </>
            )}

            <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-4 text-sm text-gray-700 dark:text-gray-300 space-y-1">
              <p>
                {ar
                  ? `• نسبة الرسوب: ${achievementStats.failPct}% (${achievementStats.failCount} طالباً) — نسبة النجاح: ${achievementStats.passPct + achievementStats.above75Pct}% — نسبة الطلاب فوق 75%: ${achievementStats.above75Pct}%`
                  : `• Fail rate: ${achievementStats.failPct}% (${achievementStats.failCount}) — Pass rate: ${achievementStats.passPct + achievementStats.above75Pct}% — Above-75 rate: ${achievementStats.above75Pct}%`}
              </p>
              {progressStats.total > 0 && (
                <>
                  <p>
                    {ar
                      ? `• ${getProportionLabel((progressStats.significant_progress + progressStats.slight_progress) / progressStats.total * 100, 'ar')} الطلاب (${progressStats.significant_progress + progressStats.slight_progress} من ${progressStats.total}) أظهروا تقدماً مقارنة بالعام السابق.`
                      : `• ${getProportionLabel((progressStats.significant_progress + progressStats.slight_progress) / progressStats.total * 100, 'en')} of students (${progressStats.significant_progress + progressStats.slight_progress}/${progressStats.total}) improved vs previous year.`}
                  </p>
                  <p>
                    {ar
                      ? `• ${getProportionLabel(progressStats.regression / progressStats.total * 100, 'ar')} الطلاب (${progressStats.regression} طالب) سجلوا تراجعاً.`
                      : `• ${getProportionLabel(progressStats.regression / progressStats.total * 100, 'en')} of students (${progressStats.regression}) showed regression.`}
                  </p>
                </>
              )}
            </div>
          </>
        )}
      </div>

      {/* ── Section 2: منحنى الاتجاه العام عبر السنوات ── */}
      {years.length >= 2 && (
        <div className="card print:shadow-none print:border">
          <SectionTitle num={2} ar="منحنى الاتجاه العام عبر السنوات" en="Multi-Year Trend Line" />
          <SectionToggle expanded={expanded.has('s2')} onClick={() => toggle('s2')}>
            {expanded.has('s2') ? (ar ? 'إخفاء' : 'Hide') : (ar ? 'إظهار' : 'Show')}
          </SectionToggle>
          {expanded.has('s2') && (
            <>
              <ResponsiveContainer width="100%" height={260}>
                <LineChart data={trendData} margin={{ top: 5, right: 20, left: -10, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="yearId" tick={{ fontSize: 10 }} />
                  <YAxis domain={[0, 100]} tick={{ fontSize: 10 }} />
                  <Tooltip />
                  <Legend wrapperStyle={{ fontSize: 10 }} />
                  {subjectCodes.map((sc, i) => (
                    <Line key={sc} type="monotone" dataKey={sc}
                      name={ar ? SUBJECT_LABELS[sc]?.ar : SUBJECT_LABELS[sc]?.en}
                      stroke={SUBJECT_COLORS[i % SUBJECT_COLORS.length]}
                      dot={{ r: 4 }} strokeWidth={2}
                    />
                  ))}
                </LineChart>
              </ResponsiveContainer>
              <div className="overflow-x-auto mt-4">
                <table className="table-base">
                  <thead>
                    <tr>
                      <th>{ar ? 'المادة' : 'Subject'}</th>
                      {years.map(y => <th key={y}>{y}</th>)}
                      <th>Δ {ar ? 'الكلي' : 'Total'}</th>
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
                          <td className={clsx('font-mono text-sm font-bold', delta === null ? '' : delta > 0 ? 'text-green-600' : delta < 0 ? 'text-red-600' : '')}>
                            {delta !== null ? (delta > 0 ? `+${delta}` : `${delta}`) : '—'}
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

      {/* ── Section 3: Per-subject — one card per subject, print-page-break ── */}
      <div className="space-y-0">
        <div className="card print:shadow-none print:border mb-4">
          <SectionTitle num={3} ar="تحليل كل مادة — التوزيع الطبيعي وتتبع المسار" en="Per-Subject Analysis — Normal Distribution & Trajectory" />
          <p className="text-xs text-gray-500 -mt-2 mb-3">
            {ar
              ? 'لكل مادة: التوزيع الطبيعي للعام الحالي، تغير المعدل، وتتبع مسار تقدم الطلاب عبر السنوات. كل مادة تُطبع في صفحة مستقلة.'
              : 'Each subject shows its normal distribution, average change, and student trajectory histogram. Each subject prints on a separate page.'}
          </p>
        </div>

        {subjectCodes.map((sc, idx) => {
          const currScores = extractScores(records, sc, sem)
          const prevScores = extractScores(prevRecordsForNorm, sc, sem)
          const currMean = currScores.length > 0 ? round2(currScores.reduce((a, b) => a + b, 0) / currScores.length) : 0
          const prevMean = prevScores.length > 0 ? round2(prevScores.reduce((a, b) => a + b, 0) / prevScores.length) : null
          const shift = prevMean !== null ? round2(currMean - prevMean) : null

          // Per-subject trajectory (multi-year)
          const subjRows = years.length >= 2
            ? computeMultiYearProgress(allYearRecords, sc, sem)
            : []
          const trajBins = buildTrajBins(subjRows)
          const trajImproved = subjRows.filter(r => (r.overallDiff ?? 0) > 0).length
          const trajDeclined = subjRows.filter(r => (r.overallDiff ?? 0) < 0).length
          const trajTotal = subjRows.length

          const subjectName = ar ? SUBJECT_LABELS[sc]?.ar ?? sc : SUBJECT_LABELS[sc]?.en ?? sc

          return (
            <div
              key={sc}
              className="card print:shadow-none print:border print:break-before-page mb-4"
            >
              {/* Subject heading */}
              <div className="flex items-center gap-3 mb-5 pb-3 border-b-2 border-primary-100">
                <div className="w-8 h-8 rounded-full flex items-center justify-center text-white font-bold text-xs shrink-0"
                  style={{ backgroundColor: SUBJECT_COLORS[idx % SUBJECT_COLORS.length] }}>
                  {idx + 1}
                </div>
                <div>
                  <h3 className="font-bold text-primary-700 text-sm">{subjectName}</h3>
                  <p className="text-[10px] text-gray-400">{ar ? 'التوزيع الطبيعي | تغير المعدل | تتبع المسار' : 'Normal Dist. | Average Change | Trajectory'}</p>
                </div>
                {shift !== null && (
                  <span className={clsx('ms-auto text-sm font-bold', shift > 0 ? 'text-green-600' : shift < 0 ? 'text-red-600' : 'text-gray-400')}>
                    {shift > 0 ? `↑ +${shift}` : shift < 0 ? `↓ ${shift}` : '→ 0'}
                    <span className="text-xs font-normal ms-1">{ar ? 'تغير المعدل' : 'avg. change'}</span>
                  </span>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                {/* Left: Normal distribution */}
                <div>
                  <p className="text-xs font-medium text-gray-500 mb-2">{ar ? 'التوزيع الطبيعي للدرجات' : 'Score Distribution'}</p>
                  <NormalDistributionChart scores={currScores} cycle={getCycle(filter.grade ?? 5)} />
                  {prevMean !== null && (
                    <p className="text-xs text-gray-400 text-center mt-1">
                      {ar
                        ? `متوسط هذا العام: ${currMean} | العام السابق: ${prevMean}`
                        : `This year avg: ${currMean} | Prev year: ${prevMean}`}
                    </p>
                  )}
                </div>

                {/* Right: Trajectory histogram */}
                <div>
                  <p className="text-xs font-medium text-gray-500 mb-1">
                    {ar ? 'تتبع مسار الطلاب (أول سنة → الحالي)' : 'Student Trajectory (first year → current)'}
                  </p>
                  <p className="text-[10px] text-gray-400 mb-2">
                    {ar
                      ? 'يُظهر هذا الرسم عدد الطلاب الذين تحسّنت درجاتهم (قيم موجبة) أو تراجعت (قيم سالبة) خلال السنوات الدراسية.'
                      : 'Shows how many students improved (positive) or declined (negative) across academic years in this subject.'}
                  </p>
                  {subjRows.length > 0 ? (
                    <>
                      <div className="flex gap-3 text-xs mb-2">
                        <span className="text-green-600 font-medium">↑ {ar ? 'تحسّن' : 'Improved'}: {trajImproved}</span>
                        <span className="text-red-600 font-medium">↓ {ar ? 'تراجع' : 'Declined'}: {trajDeclined}</span>
                        <span className="text-gray-500">{ar ? 'الإجمالي' : 'Total'}: {trajTotal}</span>
                      </div>
                      <ResponsiveContainer width="100%" height={160}>
                        <BarChart data={trajBins} margin={{ top: 4, right: 4, left: -18, bottom: 5 }}>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} />
                          <XAxis dataKey="label" tick={{ fontSize: 8 }} interval={0} />
                          <YAxis tick={{ fontSize: 9 }} allowDecimals={false} />
                          <Tooltip formatter={(v: number) => [`${v} ${ar ? 'طالب' : 'students'}`, ar ? 'العدد' : 'Count']} />
                          <Bar dataKey="count" name={ar ? 'طلاب' : 'Students'} radius={[2, 2, 0, 0]}>
                            {trajBins.map((b, i) => (
                              <Cell key={i} fill={b.key === 'zero' ? '#94a3b8' : b.isNeg ? '#ef4444' : '#22c55e'} />
                            ))}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                      <div className="flex gap-3 mt-1 text-[9px] text-gray-400">
                        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-green-500 inline-block" />{ar ? 'تحسّن' : 'Improved'}</span>
                        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-red-500 inline-block" />{ar ? 'تراجع' : 'Declined'}</span>
                        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-slate-400 inline-block" />{ar ? 'بدون تغيير' : 'No change'}</span>
                      </div>
                    </>
                  ) : (
                    <p className="text-xs text-gray-400 py-4 text-center">{ar ? 'بيانات سنتين أو أكثر مطلوبة' : 'Requires 2+ years of data'}</p>
                  )}
                </div>
              </div>

              {/* Multi-year subject trend inline */}
              {years.length >= 2 && (() => {
                const subjectTrend = years.map(y => {
                  const yr = allYearRecords.find(r => r.yearId === y)?.records ?? []
                  const sc_scores = extractScores(yr, sc, sem)
                  return { yearId: y, avg: sc_scores.length > 0 ? round2(sc_scores.reduce((a, b) => a + b, 0) / sc_scores.length) : null }
                }).filter(d => d.avg !== null)
                if (subjectTrend.length < 2) return null
                return (
                  <div className="mt-4 pt-4 border-t border-gray-100">
                    <p className="text-xs font-medium text-gray-500 mb-2">{ar ? 'اتجاه المعدل عبر السنوات' : 'Average Trend Over Years'}</p>
                    <ResponsiveContainer width="100%" height={100}>
                      <LineChart data={subjectTrend} margin={{ top: 4, right: 10, left: -18, bottom: 4 }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} />
                        <XAxis dataKey="yearId" tick={{ fontSize: 9 }} />
                        <YAxis domain={['auto', 'auto']} tick={{ fontSize: 9 }} />
                        <Tooltip formatter={(v: number) => v.toFixed(1)} />
                        <Line type="monotone" dataKey="avg" stroke={SUBJECT_COLORS[idx % SUBJECT_COLORS.length]} dot={{ r: 3 }} strokeWidth={2} name={ar ? 'المعدل' : 'Average'} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                )
              })()}
            </div>
          )
        })}
      </div>

      {/* ── Section 4: معيار 1.3 — تحليل الفجوات (تكويني vs ختامي) ── */}
      <div className="card print:shadow-none print:border print:break-before-page">
        <SectionTitle num={4} ar="معيار 1.3 — تحليل الفجوات بين التكويني والختامي" en="Indicator 1.3 — Formative vs. Summative Gap Analysis" />
        <SectionToggle expanded={expanded.has('s4')} onClick={() => toggle('s4')}>
          {expanded.has('s4') ? (ar ? 'إخفاء' : 'Hide') : (ar ? 'إظهار' : 'Show')}
        </SectionToggle>
        {!expanded.has('s4') && null}
        {expanded.has('s4') && (
          <>
            <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-4 mb-5 text-sm">
              <h3 className="font-bold text-blue-700 mb-2">
                {ar ? 'منهجية الحساب' : 'Calculation Methodology'}
              </h3>
              <p className="text-gray-700 dark:text-gray-300 leading-relaxed text-xs">
                {ar
                  ? 'يُحسب هذا المؤشر من الفرق بين درجة الفصل الثالث (الاختبار الختامي — ف3) ودرجة الفصل الأول (الاختبار التكويني — ف1). القيمة الموجبة تعني تحسناً، والسالبة تعني تراجعاً بين التكويني والختامي.'
                  : 'This indicator is computed as the gap between Semester 3 (summative exam — S3) and Semester 1 (formative/continuous — S1). Positive = improvement from formative to summative; negative = decline.'}
              </p>
            </div>

            {semGaps.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-6">
                {ar ? 'لا تتوفر بيانات فصلية كافية.' : 'Insufficient semester data.'}
              </p>
            ) : (
              <>
                {/* Gap bar chart */}
                <div className="mb-5">
                  <p className="text-xs text-gray-500 mb-2">
                    {ar ? 'الفجوة بين ف1 (تكويني) و ف3 (ختامي) — متوسط الفصل' : 'Gap S1 (formative) → S3 (summative) — semester averages'}
                  </p>
                  <ResponsiveContainer width="100%" height={200}>
                    <BarChart
                      data={semGaps.map(g => ({
                        name: ar ? g.subjectNameAr : g.subjectNameEn,
                        gap: g.gapS1S3,
                        sc: g.subjectCode,
                      }))}
                      margin={{ top: 5, right: 10, left: -10, bottom: 45 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" vertical={false} />
                      <XAxis dataKey="name" tick={{ fontSize: 9 }} angle={-35} textAnchor="end" interval={0} />
                      <YAxis tick={{ fontSize: 10 }} />
                      <Tooltip formatter={(v: number) => v > 0 ? `+${v}` : `${v}`} />
                      <ReferenceLine y={0} stroke="#6b7280" />
                      <Bar dataKey="gap" name={ar ? 'الفجوة ف1→ف3' : 'S1→S3 Gap'} radius={[3, 3, 0, 0]}>
                        {semGaps.map((g, i) => (
                          <Cell key={i} fill={(g.gapS1S3 ?? 0) >= 0 ? '#22c55e' : (g.gapS1S3 ?? 0) > -8 ? '#f97316' : '#ef4444'} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>

                {/* Detail table */}
                <div className="overflow-x-auto mb-5">
                  <table className="table-base">
                    <thead>
                      <tr>
                        <th>{ar ? 'المادة' : 'Subject'}</th>
                        <th>{ar ? 'متوسط ف1 (تكويني)' : 'S1 Avg (Formative)'}</th>
                        <th>{ar ? 'متوسط ف3 (ختامي)' : 'S3 Avg (Summative)'}</th>
                        <th>{ar ? 'الفجوة ف1→ف3' : 'S1→S3 Gap'}</th>
                        <th>{ar ? 'طلاب تراجعوا' : 'Students Declined'}</th>
                        <th>{ar ? 'طلاب تحسّنوا' : 'Students Improved'}</th>
                        <th>{ar ? 'الأولوية' : 'Priority'}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {semGaps.map(g => {
                        const priorityColors: Record<string, string> = {
                          critical: 'bg-red-100 text-red-800', high: 'bg-orange-100 text-orange-800',
                          medium: 'bg-yellow-100 text-yellow-800', low: 'bg-blue-100 text-blue-800',
                          ok: 'bg-green-100 text-green-800',
                        }
                        const priorityAr: Record<string, string> = {
                          critical: 'حرج', high: 'عالٍ', medium: 'متوسط', low: 'منخفض', ok: 'جيد',
                        }
                        return (
                          <tr key={g.subjectCode}>
                            <td className="font-medium">{ar ? g.subjectNameAr : g.subjectNameEn}</td>
                            <td className="font-mono text-sm">{g.avgS1 !== null ? g.avgS1.toFixed(1) : '—'}</td>
                            <td className="font-mono text-sm">{g.avgS3 !== null ? g.avgS3.toFixed(1) : '—'}</td>
                            <td className={clsx('font-mono text-sm font-bold', (g.gapS1S3 ?? 0) >= 0 ? 'text-green-600' : 'text-red-600')}>
                              {g.gapS1S3 !== null ? (g.gapS1S3 > 0 ? `+${g.gapS1S3}` : `${g.gapS1S3}`) : '—'}
                            </td>
                            <td className="font-mono text-sm text-red-600">{g.studentsWithDrop} / {g.totalStudents}</td>
                            <td className="font-mono text-sm text-green-600">{g.studentsWithGain} / {g.totalStudents}</td>
                            <td>
                              <span className={clsx('text-xs px-2 py-0.5 rounded-full font-medium', priorityColors[g.priority])}>
                                {ar ? priorityAr[g.priority] : g.priority}
                              </span>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Descriptive analysis */}
                <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-4 text-sm text-gray-700 dark:text-gray-300 space-y-1">
                  <p className="font-medium mb-2">{ar ? 'التحليل الوصفي:' : 'Descriptive Analysis:'}</p>
                  {semGaps.map(g => {
                    const name = ar ? g.subjectNameAr : g.subjectNameEn
                    const gapStr = g.gapS1S3 !== null ? (g.gapS1S3 > 0 ? `↑ +${g.gapS1S3}` : `↓ ${g.gapS1S3}`) : '—'
                    return (
                      <p key={g.subjectCode}>
                        {ar
                          ? `• ${name}: الفجوة بين الفصل الأول (تكويني) والفصل الثالث (ختامي) = ${gapStr} — ${g.studentsWithDrop} طالباً تراجعوا في الاختبار الختامي مقارنة بالتكويني.`
                          : `• ${name}: S1 (formative) → S3 (summative) gap = ${gapStr} — ${g.studentsWithDrop} students declined from formative to summative.`}
                      </p>
                    )
                  })}
                </div>
              </>
            )}
          </>
        )}
      </div>
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
          {ar ? '📈 اتجاهات التقدم (معيار 1.2)' : '📈 Progress Trends (1.2)'}
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
