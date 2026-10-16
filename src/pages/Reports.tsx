import { useState, useMemo } from 'react'
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Legend, Cell, ReferenceLine,
} from 'recharts'
import { Printer, ChevronDown, ChevronRight, Download as DownloadIcon } from 'lucide-react'
import { t } from '@/i18n/translations'
import type { Language, AnalysisFilter, SubjectCode, Semester, Cycle, FormativeScore, ExamScore } from '@/types'
import { dataStore } from '@/store/dataStore'
import {
  filterRecords, computeSubjectStats, extractScores, round2,
  computeMultiYearProgress,
  computeAchievementIndicators, getProportionLabel, getLetterGrade,
  type AchievementIndicator,
} from '@/utils/statistics'
import { getCycle, SUBJECT_LABELS, getCycleSubjects, getPassMark } from '@/utils/subjectMapping'
import { downloadFormativeTemplate, downloadExamTemplate } from '@/utils/templateGenerator'
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
  excellent:  'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300',
  very_good:  'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
  good:       'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300',
  acceptable: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300',
  weak:       'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300',
}
const LEVEL_COLOR_HEX: Record<string, string> = {
  excellent: '#16a34a', very_good: '#2563eb', good: '#ca8a04', acceptable: '#f59e0b', weak: '#dc2626',
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

  const schoolPassRate = indicators.length ? round2(indicators.reduce((s, i) => s + i.passRate, 0) / indicators.length) : 0
  let schoolLevel = 'acceptable'
  let schoolLevelAr = 'مقبول'
  if (schoolPassRate < 75) { schoolLevel = 'weak'; schoolLevelAr = 'ضعيف' }
  else if (schoolAbove75Rate >= 70) { schoolLevel = 'excellent'; schoolLevelAr = 'ممتاز' }
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
                      let lvl = 'acceptable', lvlAr = 'مقبول', lvlEn = 'Acceptable'
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
      {years.length >= 2 && (() => {
        // School-wide average per year (avg of all subject averages)
        const schoolTrendData = trendData.map(row => {
          const vals = subjectCodes.map(sc => row[sc] as number | undefined).filter((v): v is number => v !== undefined)
          return { yearId: row.yearId as string, avg: vals.length ? round2(vals.reduce((a, b) => a + b, 0) / vals.length) : null }
        })
        return (
          <>
            {/* School-wide average trend */}
            <div className="card print:shadow-none print:border">
              <SectionTitle num={2} ar="منحنى الاتجاه العام للمدرسة عبر السنوات" en="School-Wide Average Trend" />
              <SectionToggle expanded={expanded.has('s2')} onClick={() => toggle('s2')}>
                {expanded.has('s2') ? (ar ? 'إخفاء' : 'Hide') : (ar ? 'إظهار' : 'Show')}
              </SectionToggle>
              {expanded.has('s2') && (
                <>
                  <ResponsiveContainer width="100%" height={240}>
                    <LineChart data={schoolTrendData} margin={{ top: 5, right: 20, left: -10, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} />
                      <XAxis dataKey="yearId" tick={{ fontSize: 10 }} />
                      <YAxis domain={[0, 100]} tick={{ fontSize: 10 }} tickFormatter={v => `${v}`} />
                      <Tooltip formatter={(v: number) => [`${v}%`, ar ? 'معدل المدرسة' : 'School Avg']} />
                      <Line type="monotone" dataKey="avg" stroke="#1D5E3F" dot={{ r: 5 }} strokeWidth={2.5} name={ar ? 'معدل المدرسة' : 'School Avg'} />
                    </LineChart>
                  </ResponsiveContainer>
                  {/* Year-by-year value row */}
                  <div className="flex gap-6 mt-3 flex-wrap">
                    {schoolTrendData.map((d, i) => (
                      <div key={i} className="text-center">
                        <div className="text-xs text-gray-500">{d.yearId}</div>
                        <div className="text-sm font-bold text-primary-700">{d.avg !== null ? `${d.avg}%` : '—'}</div>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>

            {/* Per-subject trend — one card per subject */}
            {subjectCodes.map((sc, idx) => {
              const subjectColor = SUBJECT_COLORS[idx % SUBJECT_COLORS.length]
              const subjectName = ar ? SUBJECT_LABELS[sc]?.ar ?? sc : SUBJECT_LABELS[sc]?.en ?? sc
              const subjectTrend = trendData.map(row => ({
                yearId: row.yearId as string,
                avg: (row[sc] as number | undefined) ?? null,
              }))
              const avgs = subjectTrend.map(d => d.avg)
              const first = avgs.find(v => v !== null)
              const last = [...avgs].reverse().find(v => v !== null)
              const delta = (first !== null && first !== undefined && last !== null && last !== undefined) ? round2(last - first) : null
              return (
                <div key={sc} className="card print:shadow-none print:border mt-4" style={{ borderLeftColor: subjectColor, borderLeftWidth: 3 }}>
                  <div className="flex items-center gap-3 mb-4 pb-3 border-b border-gray-100">
                    <div className="w-7 h-7 rounded-full flex items-center justify-center text-white font-bold text-xs shrink-0"
                      style={{ backgroundColor: subjectColor }}>
                      {idx + 1}
                    </div>
                    <div>
                      <h3 className="font-bold text-primary-700 text-sm">{subjectName}</h3>
                      <p className="text-[10px] text-gray-400">{ar ? 'اتجاه المعدل عبر السنوات' : 'Average trend over years'}</p>
                    </div>
                    {delta !== null && (
                      <span className={clsx('ms-auto text-sm font-bold', delta > 0 ? 'text-green-600' : delta < 0 ? 'text-red-600' : 'text-gray-400')}>
                        {delta > 0 ? `↑ +${delta}` : delta < 0 ? `↓ ${delta}` : '→ 0'}
                      </span>
                    )}
                  </div>
                  <ResponsiveContainer width="100%" height={200}>
                    <LineChart data={subjectTrend} margin={{ top: 5, right: 20, left: -10, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} />
                      <XAxis dataKey="yearId" tick={{ fontSize: 10 }} />
                      <YAxis domain={[0, 100]} tick={{ fontSize: 10 }} />
                      <Tooltip formatter={(v: number) => [`${v}`, ar ? 'المعدل' : 'Avg']} />
                      <Line type="monotone" dataKey="avg" stroke={subjectColor} dot={{ r: 4 }} strokeWidth={2} name={ar ? 'المعدل' : 'Average'} />
                    </LineChart>
                  </ResponsiveContainer>
                  {/* Year-by-year value row */}
                  <div className="flex gap-6 mt-3 flex-wrap">
                    {subjectTrend.map((d, i) => (
                      <div key={i} className="text-center">
                        <div className="text-xs text-gray-500">{d.yearId}</div>
                        <div className="text-sm font-bold" style={{ color: subjectColor }}>
                          {d.avg !== null ? `${d.avg}` : '—'}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )
            })}
          </>
        )
      })()}

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

    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// REPORT 3: FORMATIVE vs EXAM GAP (معيار 1.3)
// ══════════════════════════════════════════════════════════════════════════════
function FormativeGapReport({ lang, filter }: { lang: Language; filter: AnalysisFilter }) {
  const ar = lang === 'ar'
  const yearId = filter.yearId ?? ''

  const allFormative: FormativeScore[] = useMemo(() => dataStore.getFormativeScores(yearId), [yearId])
  const allExam: ExamScore[] = useMemo(() => dataStore.getExamScores(yearId), [yearId])

  // Apply grade filter
  const formativeScores = useMemo(() =>
    filter.grade ? allFormative.filter(s => s.grade === filter.grade) : allFormative,
    [allFormative, filter.grade])
  const examScores = useMemo(() =>
    filter.grade ? allExam.filter(s => s.grade === filter.grade) : allExam,
    [allExam, filter.grade])

  const hasFormative = allFormative.length > 0
  const hasExam = allExam.length > 0
  const hasData = formativeScores.length > 0 && examScores.length > 0

  // Helper: average of non-null numbers
  const avg = (arr: (number | null)[]) => {
    const v = arr.filter((x): x is number => x !== null)
    return v.length ? round2(v.reduce((a, b) => a + b, 0) / v.length) : null
  }
  const pct = (val: number | null, denom: number) => val !== null ? round2(val / denom * 100) : null

  // Gap badge component
  const GapBadge = ({ gap }: { gap: number | null }) => {
    if (gap === null) return <span className="text-gray-400">—</span>
    const color = Math.abs(gap) <= 5 ? 'bg-green-100 text-green-800' : Math.abs(gap) <= 15 ? 'bg-yellow-100 text-yellow-800' : 'bg-red-100 text-red-800'
    return <span className={clsx('text-xs px-2 py-0.5 rounded-full font-mono font-bold', color)}>{gap > 0 ? `+${gap}%` : `${gap}%`}</span>
  }

  // ── Subject-level gap data (filtered) ──
  const subjectGaps = useMemo(() => {
    const codes = [...new Set([...formativeScores.map(s => s.subjectCode), ...examScores.map(s => s.subjectCode)])] as SubjectCode[]
    return codes.map(sc => {
      const fRec = formativeScores.filter(s => s.subjectCode === sc)
      const eRec = examScores.filter(s => s.subjectCode === sc)
      // S1
      const fs1Rate = pct(avg(fRec.map(s => s.s1)), 10)
      const es1Rate = pct(avg(eRec.map(s => s.s1)), 25)
      const gapS1 = fs1Rate !== null && es1Rate !== null ? round2(es1Rate - fs1Rate) : null
      // S3
      const fs3Rate = pct(avg(fRec.map(s => s.s3)), 10)
      const es3Rate = pct(avg(eRec.map(s => s.s3)), 25)
      const gapS3 = fs3Rate !== null && es3Rate !== null ? round2(es3Rate - fs3Rate) : null
      // S2 (formative only)
      const s2Rate = pct(avg(fRec.map(s => s.s2 ?? null)), 30)
      // Totals for cross-semester
      const s1Total = (avg(fRec.map(s => s.s1)) !== null && avg(eRec.map(s => s.s1)) !== null)
        ? pct((avg(fRec.map(s => s.s1))! + avg(eRec.map(s => s.s1))!), 35) : null
      const s3Total = (avg(fRec.map(s => s.s3)) !== null && avg(eRec.map(s => s.s3)) !== null)
        ? pct((avg(fRec.map(s => s.s3))! + avg(eRec.map(s => s.s3))!), 35) : null
      const crossGap = s2Rate !== null && (s1Total !== null || s3Total !== null)
        ? (() => { const ref = (s1Total !== null && s3Total !== null) ? (s1Total + s3Total) / 2 : (s1Total ?? s3Total)!; return round2(s2Rate - ref) })()
        : null
      const label = ar ? SUBJECT_LABELS[sc]?.ar ?? sc : SUBJECT_LABELS[sc]?.en ?? sc
      return { sc, label, fs1Rate, es1Rate, gapS1, fs3Rate, es3Rate, gapS3, s2Rate, s1Total, s3Total, crossGap }
    }).filter(d => d.fs1Rate !== null || d.es1Rate !== null || d.fs3Rate !== null || d.es3Rate !== null)
      .sort((a, b) => a.label.localeCompare(b.label))
  }, [formativeScores, examScores, ar])

  // ── School-wide averages ──
  const schoolAvg = useMemo(() => {
    const fs1Rate = pct(avg(formativeScores.map(s => s.s1)), 10)
    const es1Rate = pct(avg(examScores.map(s => s.s1)), 25)
    const gapS1 = fs1Rate !== null && es1Rate !== null ? round2(es1Rate - fs1Rate) : null
    const fs3Rate = pct(avg(formativeScores.map(s => s.s3)), 10)
    const es3Rate = pct(avg(examScores.map(s => s.s3)), 25)
    const gapS3 = fs3Rate !== null && es3Rate !== null ? round2(es3Rate - fs3Rate) : null
    const s2Rate = pct(avg(formativeScores.map(s => s.s2 ?? null)), 30)
    const fS1v = avg(formativeScores.map(s => s.s1)); const eS1v = avg(examScores.map(s => s.s1))
    const fS3v = avg(formativeScores.map(s => s.s3)); const eS3v = avg(examScores.map(s => s.s3))
    const s1Total = fS1v !== null && eS1v !== null ? pct(fS1v + eS1v, 35) : null
    const s3Total = fS3v !== null && eS3v !== null ? pct(fS3v + eS3v, 35) : null
    const crossGap = s2Rate !== null && (s1Total !== null || s3Total !== null)
      ? (() => { const ref = (s1Total !== null && s3Total !== null) ? (s1Total + s3Total) / 2 : (s1Total ?? s3Total)!; return round2(s2Rate - ref) })()
      : null
    return { fs1Rate, es1Rate, gapS1, fs3Rate, es3Rate, gapS3, s2Rate, s1Total, s3Total, crossGap }
  }, [formativeScores, examScores])

  // ── Per-grade cross-semester data ──
  const gradeData = useMemo(() => {
    const grades = [...new Set([...allFormative.map(s => s.grade), ...allExam.map(s => s.grade)])].sort((a, b) => a - b)
    return grades.map(g => {
      const fRec = allFormative.filter(s => s.grade === g)
      const eRec = allExam.filter(s => s.grade === g)
      const fS1v = avg(fRec.map(s => s.s1)); const eS1v = avg(eRec.map(s => s.s1))
      const fS3v = avg(fRec.map(s => s.s3)); const eS3v = avg(eRec.map(s => s.s3))
      const s1Total = fS1v !== null && eS1v !== null ? pct(fS1v + eS1v, 35) : null
      const s3Total = fS3v !== null && eS3v !== null ? pct(fS3v + eS3v, 35) : null
      const s2Rate = pct(avg(fRec.map(s => s.s2 ?? null)), 30)
      const crossGap = s2Rate !== null && (s1Total !== null || s3Total !== null)
        ? (() => { const ref = (s1Total !== null && s3Total !== null) ? (s1Total + s3Total) / 2 : (s1Total ?? s3Total)!; return round2(s2Rate - ref) })()
        : null
      return { grade: g, s1Total, s2Rate, s3Total, crossGap }
    })
  }, [allFormative, allExam])

  if (!hasFormative && !hasExam) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="card border-2 border-dashed border-gray-300 text-center py-8">
            <p className="text-sm text-gray-500 mb-3">{ar ? 'التقويم التكويني — لم يُرفع بعد' : 'Continuous Assessment — Not uploaded'}</p>
            <button onClick={downloadFormativeTemplate} className="inline-flex items-center gap-1 text-xs px-3 py-1.5 bg-primary-600 text-white rounded-lg hover:bg-primary-700"><DownloadIcon size={12} />{ar ? 'نموذج التكويني' : 'Formative Template'}</button>
          </div>
          <div className="card border-2 border-dashed border-gray-300 text-center py-8">
            <p className="text-sm text-gray-500 mb-3">{ar ? 'درجات الاختبار — لم تُرفع بعد' : 'Exam Scores — Not uploaded'}</p>
            <button onClick={downloadExamTemplate} className="inline-flex items-center gap-1 text-xs px-3 py-1.5 bg-primary-600 text-white rounded-lg hover:bg-primary-700"><DownloadIcon size={12} />{ar ? 'نموذج الاختبار' : 'Exam Template'}</button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-8 print:space-y-6">

      {/* ── Upload status strip ── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 no-print">
        <div className={clsx('card border-2 py-3', hasFormative ? 'border-green-300 bg-green-50' : 'border-dashed border-gray-300')}>
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-semibold text-sm">{ar ? 'التقويم التكويني / المستمر' : 'Continuous Assessment'}</h3>
              <p className="text-xs text-gray-500">{hasFormative ? `${allFormative.length} ${ar ? 'سجل' : 'records'}` : (ar ? 'لم يُرفع' : 'Not uploaded')}</p>
            </div>
            {hasFormative ? <span className="text-xs px-2 py-1 bg-green-100 text-green-700 rounded-full">{ar ? 'تم ✓' : 'Done ✓'}</span>
              : <button onClick={downloadFormativeTemplate} className="flex items-center gap-1 text-xs px-3 py-1.5 bg-primary-600 text-white rounded-lg"><DownloadIcon size={12} />{ar ? 'نموذج' : 'Template'}</button>}
          </div>
        </div>
        <div className={clsx('card border-2 py-3', hasExam ? 'border-green-300 bg-green-50' : 'border-dashed border-gray-300')}>
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-semibold text-sm">{ar ? 'درجات الاختبار (نهاية الفصل)' : 'Exam Scores (End of Term)'}</h3>
              <p className="text-xs text-gray-500">{hasExam ? `${allExam.length} ${ar ? 'سجل' : 'records'}` : (ar ? 'لم تُرفع' : 'Not uploaded')}</p>
            </div>
            {hasExam ? <span className="text-xs px-2 py-1 bg-green-100 text-green-700 rounded-full">{ar ? 'تم ✓' : 'Done ✓'}</span>
              : <button onClick={downloadExamTemplate} className="flex items-center gap-1 text-xs px-3 py-1.5 bg-primary-600 text-white rounded-lg"><DownloadIcon size={12} />{ar ? 'نموذج' : 'Template'}</button>}
          </div>
        </div>
      </div>

      {!hasData && (
        <div className="card text-center py-10 text-gray-400">
          {ar ? 'يجب توفر بيانات التكويني والاختبار معاً لإظهار التحليل.' : 'Both formative and exam data are required to show the analysis.'}
        </div>
      )}

      {hasData && <>
        {/* ══════════════════════════════════════════════════════════
            SECTION 1 — SCHOOL-WIDE AVERAGES: FORMATIVE VS EXAM
        ══════════════════════════════════════════════════════════ */}
        <div className="card print:shadow-none print:border print:break-before-page">
          <SectionTitle num={1}
            ar="المؤشر الكلي للمدرسة — التكويني مقابل الاختبار"
            en="School-Wide Average — Formative vs Exam" />

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
            {/* Term 1 */}
            <div className="rounded-xl border border-blue-200 bg-blue-50 dark:bg-blue-900/10 p-5">
              <h4 className="font-bold text-blue-700 text-sm mb-4 text-center">{ar ? 'الفصل الأول (ف1)' : 'Term 1'}</h4>
              <div className="space-y-3">
                <div className="flex items-center justify-between p-3 bg-white rounded-lg shadow-sm">
                  <span className="text-sm text-gray-600">{ar ? 'التكويني (من 10)' : 'Formative (/10)'}</span>
                  <span className="font-bold text-lg text-primary-700">{schoolAvg.fs1Rate !== null ? `${schoolAvg.fs1Rate}%` : '—'}</span>
                </div>
                <div className="flex items-center justify-between p-3 bg-white rounded-lg shadow-sm">
                  <span className="text-sm text-gray-600">{ar ? 'الاختبار (من 25)' : 'Exam (/25)'}</span>
                  <span className="font-bold text-lg text-blue-700">{schoolAvg.es1Rate !== null ? `${schoolAvg.es1Rate}%` : '—'}</span>
                </div>
                <div className="flex items-center justify-between p-3 rounded-lg" style={{ background: schoolAvg.gapS1 === null ? '#f3f4f6' : Math.abs(schoolAvg.gapS1) <= 5 ? '#f0fdf4' : Math.abs(schoolAvg.gapS1) <= 15 ? '#fffbeb' : '#fef2f2' }}>
                  <span className="text-sm font-semibold">{ar ? 'الفجوة (اختبار − تكويني)' : 'Gap (Exam − Formative)'}</span>
                  <GapBadge gap={schoolAvg.gapS1} />
                </div>
              </div>
            </div>
            {/* Term 3 */}
            <div className="rounded-xl border border-green-200 bg-green-50 dark:bg-green-900/10 p-5">
              <h4 className="font-bold text-green-700 text-sm mb-4 text-center">{ar ? 'الفصل الثالث (ف3)' : 'Term 3'}</h4>
              <div className="space-y-3">
                <div className="flex items-center justify-between p-3 bg-white rounded-lg shadow-sm">
                  <span className="text-sm text-gray-600">{ar ? 'التكويني (من 10)' : 'Formative (/10)'}</span>
                  <span className="font-bold text-lg text-primary-700">{schoolAvg.fs3Rate !== null ? `${schoolAvg.fs3Rate}%` : '—'}</span>
                </div>
                <div className="flex items-center justify-between p-3 bg-white rounded-lg shadow-sm">
                  <span className="text-sm text-gray-600">{ar ? 'الاختبار (من 25)' : 'Exam (/25)'}</span>
                  <span className="font-bold text-lg text-blue-700">{schoolAvg.es3Rate !== null ? `${schoolAvg.es3Rate}%` : '—'}</span>
                </div>
                <div className="flex items-center justify-between p-3 rounded-lg" style={{ background: schoolAvg.gapS3 === null ? '#f3f4f6' : Math.abs(schoolAvg.gapS3) <= 5 ? '#f0fdf4' : Math.abs(schoolAvg.gapS3) <= 15 ? '#fffbeb' : '#fef2f2' }}>
                  <span className="text-sm font-semibold">{ar ? 'الفجوة (اختبار − تكويني)' : 'Gap (Exam − Formative)'}</span>
                  <GapBadge gap={schoolAvg.gapS3} />
                </div>
              </div>
            </div>
          </div>

          {/* Chart: school-wide S1 & S3 comparison */}
          {(schoolAvg.fs1Rate !== null || schoolAvg.fs3Rate !== null) && (
            <ResponsiveContainer width="100%" height={180}>
              <BarChart
                data={[
                  { name: ar ? 'ف1 — تكويني' : 'T1 Formative', value: schoolAvg.fs1Rate, fill: '#1D5E3F' },
                  { name: ar ? 'ف1 — اختبار' : 'T1 Exam', value: schoolAvg.es1Rate, fill: '#2563eb' },
                  { name: ar ? 'ف3 — تكويني' : 'T3 Formative', value: schoolAvg.fs3Rate, fill: '#16a34a' },
                  { name: ar ? 'ف3 — اختبار' : 'T3 Exam', value: schoolAvg.es3Rate, fill: '#0891b2' },
                ]}
                margin={{ top: 5, right: 20, left: 0, bottom: 5 }}
              >
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                <YAxis domain={[0, 100]} tick={{ fontSize: 10 }} />
                <Tooltip formatter={(v: number) => `${v}%`} />
                <ReferenceLine y={75} stroke="#dc2626" strokeDasharray="4 2" />
                <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                  {[{ fill: '#1D5E3F' }, { fill: '#2563eb' }, { fill: '#16a34a' }, { fill: '#0891b2' }].map((c, i) => (
                    <Cell key={i} fill={c.fill} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* ══════════════════════════════════════════════════════════
            SECTION 2 — PER-SUBJECT: FORMATIVE VS EXAM
        ══════════════════════════════════════════════════════════ */}
        <div className="card print:shadow-none print:border print:break-before-page">
          <SectionTitle num={2}
            ar="تحليل الفجوة لكل مادة — الفصل الأول والثالث"
            en="Per-Subject Gap Analysis — Term 1 & Term 3" />

          <div className="space-y-6">
            {subjectGaps.map((d, idx) => {
              const color = SUBJECT_COLORS[idx % SUBJECT_COLORS.length]
              const chartData = [
                { name: ar ? 'تكويني ف1' : 'Form. T1', value: d.fs1Rate },
                { name: ar ? 'اختبار ف1' : 'Exam T1', value: d.es1Rate },
                { name: ar ? 'تكويني ف3' : 'Form. T3', value: d.fs3Rate },
                { name: ar ? 'اختبار ف3' : 'Exam T3', value: d.es3Rate },
              ]
              return (
                <div key={d.sc} className="border rounded-xl p-4" style={{ borderColor: color + '40', background: color + '06' }}>
                  <div className="flex items-center gap-2 mb-4">
                    <div className="w-3 h-3 rounded-full" style={{ background: color }} />
                    <h4 className="font-bold text-sm" style={{ color }}>{d.label}</h4>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Term 1 */}
                    <div className="bg-white dark:bg-gray-800 rounded-lg p-3 border border-gray-100">
                      <p className="text-xs font-semibold text-gray-500 mb-2">{ar ? 'الفصل الأول (ف1)' : 'Term 1'}</p>
                      <div className="flex justify-between items-center mb-1">
                        <span className="text-xs text-gray-600">{ar ? 'التكويني' : 'Formative'}</span>
                        <span className="font-mono text-sm font-bold text-primary-700">{d.fs1Rate !== null ? `${d.fs1Rate}%` : '—'}</span>
                      </div>
                      <div className="flex justify-between items-center mb-2">
                        <span className="text-xs text-gray-600">{ar ? 'الاختبار' : 'Exam'}</span>
                        <span className="font-mono text-sm font-bold text-blue-700">{d.es1Rate !== null ? `${d.es1Rate}%` : '—'}</span>
                      </div>
                      <div className="flex justify-between items-center pt-2 border-t">
                        <span className="text-xs font-semibold">{ar ? 'الفجوة' : 'Gap'}</span>
                        <GapBadge gap={d.gapS1} />
                      </div>
                    </div>
                    {/* Term 3 */}
                    <div className="bg-white dark:bg-gray-800 rounded-lg p-3 border border-gray-100">
                      <p className="text-xs font-semibold text-gray-500 mb-2">{ar ? 'الفصل الثالث (ف3)' : 'Term 3'}</p>
                      <div className="flex justify-between items-center mb-1">
                        <span className="text-xs text-gray-600">{ar ? 'التكويني' : 'Formative'}</span>
                        <span className="font-mono text-sm font-bold text-primary-700">{d.fs3Rate !== null ? `${d.fs3Rate}%` : '—'}</span>
                      </div>
                      <div className="flex justify-between items-center mb-2">
                        <span className="text-xs text-gray-600">{ar ? 'الاختبار' : 'Exam'}</span>
                        <span className="font-mono text-sm font-bold text-blue-700">{d.es3Rate !== null ? `${d.es3Rate}%` : '—'}</span>
                      </div>
                      <div className="flex justify-between items-center pt-2 border-t">
                        <span className="text-xs font-semibold">{ar ? 'الفجوة' : 'Gap'}</span>
                        <GapBadge gap={d.gapS3} />
                      </div>
                    </div>
                  </div>
                  <ResponsiveContainer width="100%" height={120} className="mt-3">
                    <BarChart data={chartData} margin={{ top: 2, right: 10, left: -10, bottom: 2 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} />
                      <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                      <YAxis domain={[0, 100]} tick={{ fontSize: 9 }} />
                      <Tooltip formatter={(v: number) => `${v}%`} />
                      <ReferenceLine y={75} stroke="#dc2626" strokeDasharray="3 1" />
                      <Bar dataKey="value" radius={[3, 3, 0, 0]}>
                        {[{ fill: '#1D5E3F' }, { fill: '#2563eb' }, { fill: '#16a34a' }, { fill: '#0891b2' }].map((c, i) => (
                          <Cell key={i} fill={c.fill} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )
            })}
          </div>
        </div>

        {/* ══════════════════════════════════════════════════════════
            SECTION 3 — TERM 1 & 3 vs TERM 2 (CROSS-SEMESTER)
        ══════════════════════════════════════════════════════════ */}
        <div className="card print:shadow-none print:border print:break-before-page">
          <SectionTitle num={3}
            ar="مقارنة الفصل الثاني مع الفصلين الأول والثالث"
            en="Term 2 vs Term 1 & Term 3 — Cross-Semester Gap" />

          {/* School average row */}
          <div className="mb-6">
            <h4 className="text-sm font-bold text-gray-700 mb-3">{ar ? '📊 معدل المدرسة ككل' : '📊 School-Wide Average'}</h4>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {[
                { label: ar ? 'ف1 (إجمالي%)' : 'T1 Total%', value: schoolAvg.s1Total, color: '#2563eb' },
                { label: ar ? 'ف2 (تكويني%)' : 'T2 Formative%', value: schoolAvg.s2Rate, color: '#d97706' },
                { label: ar ? 'ف3 (إجمالي%)' : 'T3 Total%', value: schoolAvg.s3Total, color: '#16a34a' },
                { label: ar ? 'الفجوة المتقاطعة' : 'Cross Gap', value: schoolAvg.crossGap, color: schoolAvg.crossGap === null ? '#6b7280' : Math.abs(schoolAvg.crossGap) <= 5 ? '#16a34a' : Math.abs(schoolAvg.crossGap) <= 15 ? '#d97706' : '#dc2626', isGap: true },
              ].map((item, i) => (
                <div key={i} className="rounded-xl p-4 text-center border" style={{ borderColor: item.color + '40', background: item.color + '10' }}>
                  <div className="text-xs text-gray-500 mb-1">{item.label}</div>
                  <div className="text-xl font-bold" style={{ color: item.color }}>
                    {item.value !== null ? (item.isGap ? (item.value > 0 ? `+${item.value}%` : `${item.value}%`) : `${item.value}%`) : '—'}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Subject-by-subject cross-semester table */}
          <div className="mb-6">
            <h4 className="text-sm font-bold text-gray-700 mb-3">{ar ? '📚 تفصيل لكل مادة' : '📚 Per-Subject Breakdown'}</h4>
            <div className="overflow-x-auto">
              <table className="table-base">
                <thead>
                  <tr>
                    <th className="text-start">{ar ? 'المادة' : 'Subject'}</th>
                    <th className="text-center">{ar ? 'ف1 (إجمالي%)' : 'T1 Total%'}</th>
                    <th className="text-center">{ar ? 'ف2 (تكويني%)' : 'T2 Form.%'}</th>
                    <th className="text-center">{ar ? 'ف3 (إجمالي%)' : 'T3 Total%'}</th>
                    <th className="text-center">{ar ? 'الفجوة' : 'Cross Gap'}</th>
                  </tr>
                </thead>
                <tbody>
                  {subjectGaps.map(d => (
                    <tr key={d.sc}>
                      <td className="font-medium">{d.label}</td>
                      <td className="text-center font-mono text-sm">{d.s1Total !== null ? `${d.s1Total}%` : '—'}</td>
                      <td className="text-center font-mono text-sm">{d.s2Rate !== null ? `${d.s2Rate}%` : '—'}</td>
                      <td className="text-center font-mono text-sm">{d.s3Total !== null ? `${d.s3Total}%` : '—'}</td>
                      <td className="text-center"><GapBadge gap={d.crossGap} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Per-grade breakdown */}
          {gradeData.length > 0 && (
            <div>
              <h4 className="text-sm font-bold text-gray-700 mb-3">{ar ? '🏫 تفصيل لكل صف دراسي' : '🏫 Per-Grade Breakdown'}</h4>
              <div className="overflow-x-auto">
                <table className="table-base">
                  <thead>
                    <tr>
                      <th className="text-start">{ar ? 'الصف' : 'Grade'}</th>
                      <th className="text-center">{ar ? 'ف1 (إجمالي%)' : 'T1 Total%'}</th>
                      <th className="text-center">{ar ? 'ف2 (تكويني%)' : 'T2 Form.%'}</th>
                      <th className="text-center">{ar ? 'ف3 (إجمالي%)' : 'T3 Total%'}</th>
                      <th className="text-center">{ar ? 'الفجوة المتقاطعة' : 'Cross Gap'}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {gradeData.map(g => (
                      <tr key={g.grade}>
                        <td className="font-medium">{ar ? `الصف ${g.grade}` : `Grade ${g.grade}`}</td>
                        <td className="text-center font-mono text-sm">{g.s1Total !== null ? `${g.s1Total}%` : '—'}</td>
                        <td className="text-center font-mono text-sm">{g.s2Rate !== null ? `${g.s2Rate}%` : '—'}</td>
                        <td className="text-center font-mono text-sm">{g.s3Total !== null ? `${g.s3Total}%` : '—'}</td>
                        <td className="text-center"><GapBadge gap={g.crossGap} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <ResponsiveContainer width="100%" height={200} className="mt-4">
                <BarChart
                  data={gradeData.map(g => ({
                    name: ar ? `ص${g.grade}` : `G${g.grade}`,
                    [ar ? 'ف1' : 'T1']: g.s1Total,
                    [ar ? 'ف2' : 'T2']: g.s2Rate,
                    [ar ? 'ف3' : 'T3']: g.s3Total,
                  }))}
                  margin={{ top: 5, right: 20, left: 0, bottom: 5 }}
                >
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                  <YAxis domain={[0, 100]} tick={{ fontSize: 10 }} />
                  <Tooltip formatter={(v: number) => `${v}%`} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <ReferenceLine y={75} stroke="#dc2626" strokeDasharray="4 2" />
                  <Bar dataKey={ar ? 'ف1' : 'T1'} fill="#2563eb" radius={[3, 3, 0, 0]} />
                  <Bar dataKey={ar ? 'ف2' : 'T2'} fill="#d97706" radius={[3, 3, 0, 0]} />
                  <Bar dataKey={ar ? 'ف3' : 'T3'} fill="#16a34a" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      </>}
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// TERM PROGRESS REPORT (معيار — متابعة الفصول)
// ══════════════════════════════════════════════════════════════════════════════
function TermProgressReport({ lang, filter }: { lang: Language; filter: AnalysisFilter }) {
  const ar = lang === 'ar'
  const yearId = filter.yearId || dataStore.getYears().slice(-1)[0]

  const { rows, subjects } = useMemo(() => {
    const diag = dataStore.getDiagnosticScores(yearId)
    const t1 = dataStore.getTermScores(yearId, 1)
    const t2 = dataStore.getTermScores(yearId, 2)
    const t3 = dataStore.getTermScores(yearId, 3)

    const avg = (scores: { subjectCode: SubjectCode; score: number | null }[], code: SubjectCode) => {
      const vals = scores.filter(s => s.subjectCode === code && s.score !== null).map(s => s.score as number)
      return vals.length ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length) : null
    }
    const avgDiag = (code: SubjectCode) => {
      const vals = diag.filter(s => s.subjectCode === code).map(s => s.score)
      return vals.length ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length) : null
    }

    const allCodes = [...new Set([
      ...diag.map(s => s.subjectCode),
      ...t1.map(s => s.subjectCode),
      ...t2.map(s => s.subjectCode),
      ...t3.map(s => s.subjectCode),
    ])] as SubjectCode[]

    const rows = allCodes.map(code => {
      const diagnostic = avgDiag(code)
      const term1 = avg(t1, code)
      const term2 = avg(t2, code)
      const term3 = avg(t3, code)
      const baseline = diagnostic ?? term1
      const latest = term3 ?? term2 ?? term1
      const diff = baseline !== null && latest !== null ? latest - baseline : null
      return { code, diagnostic, term1, term2, term3, diff }
    }).sort((a, b) => (SUBJECT_LABELS[a.code]?.ar ?? '').localeCompare(SUBJECT_LABELS[b.code]?.ar ?? ''))

    return { rows, subjects: allCodes }
  }, [yearId])

  const hasAnyData = rows.some(r => r.diagnostic !== null || r.term1 !== null)

  if (!hasAnyData) {
    return (
      <div className="space-y-4">
        <div className="card bg-blue-50 dark:bg-blue-900/10 border-blue-200 dark:border-blue-800 text-center py-8">
          <p className="font-semibold text-blue-800 dark:text-blue-300 mb-2">
            {ar ? 'لا توجد بيانات فصلية لهذا العام' : 'No term data for this year'}
          </p>
          <p className="text-sm text-blue-600 dark:text-blue-400">
            {ar
              ? 'ارفع درجات التشخيصي كخط أساس ثم ارفع درجات كل فصل عبر تبويب "درجات الفصل" في صفحة الرفع.'
              : 'Upload diagnostic scores as a baseline, then upload each term\'s scores via the "Term Scores" tab in the Upload page.'}
          </p>
        </div>
      </div>
    )
  }

  // Chart data: one bar group per subject
  const chartData = rows.map(r => ({
    name: SUBJECT_LABELS[r.code]?.[ar ? 'ar' : 'en'] ?? r.code,
    ...(r.diagnostic !== null ? { [ar ? 'التشخيصي' : 'Diagnostic']: r.diagnostic } : {}),
    ...(r.term1 !== null ? { [ar ? 'ف1' : 'Term 1']: r.term1 } : {}),
    ...(r.term2 !== null ? { [ar ? 'ف2' : 'Term 2']: r.term2 } : {}),
    ...(r.term3 !== null ? { [ar ? 'ف3' : 'Term 3']: r.term3 } : {}),
  }))

  const seriesKeys = [
    rows.some(r => r.diagnostic !== null) ? (ar ? 'التشخيصي' : 'Diagnostic') : null,
    rows.some(r => r.term1 !== null) ? (ar ? 'ف1' : 'Term 1') : null,
    rows.some(r => r.term2 !== null) ? (ar ? 'ف2' : 'Term 2') : null,
    rows.some(r => r.term3 !== null) ? (ar ? 'ف3' : 'Term 3') : null,
  ].filter(Boolean) as string[]

  const SERIES_COLORS = ['#6b7280', '#2563eb', '#d97706', '#16a34a']

  return (
    <div className="space-y-6">
      <div className="card">
        <h3 className="font-semibold text-sm text-gray-700 dark:text-gray-300 mb-4">
          {ar ? 'متوسط الدرجات — التشخيصي والفصول' : 'Average Scores — Diagnostic & Terms'}
        </h3>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={chartData} margin={{ top: 5, right: 10, left: 0, bottom: 60 }}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="name" angle={-35} textAnchor="end" tick={{ fontSize: 11 }} interval={0} />
            <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} />
            <Tooltip />
            <Legend />
            {seriesKeys.map((key, i) => (
              <Bar key={key} dataKey={key} fill={SERIES_COLORS[i]} radius={[3, 3, 0, 0]} />
            ))}
            <ReferenceLine y={75} stroke="#dc2626" strokeDasharray="4 2" label={{ value: '75%', position: 'right', fontSize: 10 }} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Detail table */}
      <div className="card overflow-x-auto">
        <h3 className="font-semibold text-sm text-gray-700 dark:text-gray-300 mb-3">
          {ar ? 'جدول المتابعة التفصيلي' : 'Detailed Tracking Table'}
        </h3>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b">
              <th className="text-start py-2 px-3 text-xs text-gray-500">{ar ? 'المادة' : 'Subject'}</th>
              <th className="text-center py-2 px-3 text-xs text-gray-500">{ar ? 'التشخيصي' : 'Diag.'}</th>
              <th className="text-center py-2 px-3 text-xs text-gray-500">{ar ? 'ف1' : 'T1'}</th>
              <th className="text-center py-2 px-3 text-xs text-gray-500">{ar ? 'ف2' : 'T2'}</th>
              <th className="text-center py-2 px-3 text-xs text-gray-500">{ar ? 'ف3' : 'T3'}</th>
              <th className="text-center py-2 px-3 text-xs text-gray-500">{ar ? 'التغيير' : 'Change'}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.code} className="border-b hover:bg-gray-50 dark:hover:bg-gray-800/30">
                <td className="py-2 px-3 font-medium text-gray-800 dark:text-gray-200">
                  {SUBJECT_LABELS[r.code]?.[ar ? 'ar' : 'en'] ?? r.code}
                </td>
                {[r.diagnostic, r.term1, r.term2, r.term3].map((val, i) => (
                  <td key={i} className="text-center py-2 px-3 text-gray-600 dark:text-gray-400">
                    {val !== null ? (
                      <span className={clsx('inline-block px-2 py-0.5 rounded text-xs font-semibold', val >= 75 ? 'bg-green-100 text-green-800' : val >= 50 ? 'bg-yellow-100 text-yellow-800' : 'bg-red-100 text-red-800')}>
                        {val}
                      </span>
                    ) : <span className="text-gray-300">—</span>}
                  </td>
                ))}
                <td className="text-center py-2 px-3">
                  {r.diff !== null ? (
                    <span className={clsx('text-xs font-bold', r.diff > 0 ? 'text-green-600' : r.diff < 0 ? 'text-red-600' : 'text-gray-400')}>
                      {r.diff > 0 ? `▲ +${r.diff}` : r.diff < 0 ? `▼ ${r.diff}` : '= 0'}
                    </span>
                  ) : <span className="text-gray-300 text-xs">—</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="text-xs text-gray-400 mt-3">
          {ar
            ? '* التغيير = آخر فصل متاح مقارنةً بالتشخيصي (أو الفصل الأول إن لم يكن هناك تشخيصي)'
            : '* Change = latest available term vs. diagnostic (or Term 1 if no diagnostic)'}
        </p>
      </div>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// MAIN REPORTS PAGE
// ══════════════════════════════════════════════════════════════════════════════
export default function Reports({ lang }: ReportsProps) {
  const ar = lang === 'ar'
  const [tab, setTab] = useState<'achievement' | 'trends' | 'formative_gap' | 'term_progress'>('achievement')
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
        <button
          className={clsx('px-4 py-2 text-sm font-medium border-b-2 transition-colors', tab === 'formative_gap' ? 'border-primary-600 text-primary-700' : 'border-transparent text-gray-500 hover:text-gray-700')}
          onClick={() => setTab('formative_gap')}
        >
          {ar ? '🔍 الفجوات التكويني/الختامي (معيار 1.3)' : '🔍 Formative/Exam Gaps (1.3)'}
        </button>
        <button
          className={clsx('px-4 py-2 text-sm font-medium border-b-2 transition-colors', tab === 'term_progress' ? 'border-primary-600 text-primary-700' : 'border-transparent text-gray-500 hover:text-gray-700')}
          onClick={() => setTab('term_progress')}
        >
          {ar ? '📅 متابعة الفصول' : '📅 Term Tracking'}
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
      {tab === 'achievement' && <AchievementReport lang={lang} filter={filter} />}
      {tab === 'trends' && <ProgressTrendsReport lang={lang} filter={filter} />}
      {tab === 'formative_gap' && <FormativeGapReport lang={lang} filter={filter} />}
      {tab === 'term_progress' && <TermProgressReport lang={lang} filter={filter} />}
    </div>
  )
}
