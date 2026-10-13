import { useState, useMemo } from 'react'
import { Link } from 'react-router-dom'
import {
  Upload, Users, CheckCircle, XCircle, Award,
  AlertTriangle, TrendingUp, BarChart2, ChevronLeft,
} from 'lucide-react'
import type { Language, SubjectCode, StudentRecord } from '@/types'
import { dataStore } from '@/store/dataStore'
import { SUBJECT_LABELS, getPassMark, getCycle } from '@/utils/subjectMapping'
import { round2 } from '@/utils/statistics'
import clsx from 'clsx'

interface DashboardProps {
  lang: Language
}

// ── helpers ────────────────────────────────────────────────

function rateClass(pct: number) {
  if (pct >= 90) return 'rate-excellent'
  if (pct >= 80) return 'rate-good'
  if (pct >= 70) return 'rate-fair'
  return 'rate-poor'
}

function cellClass(pct: number) {
  if (pct >= 90) return 'cell-excellent'
  if (pct >= 80) return 'cell-good'
  if (pct >= 70) return 'cell-fair'
  return 'cell-poor'
}

function barColor(pct: number) {
  if (pct >= 90) return 'bg-green-500'
  if (pct >= 80) return 'bg-blue-500'
  if (pct >= 70) return 'bg-amber-500'
  return 'bg-red-500'
}

interface KpiCardProps {
  label: string
  value: string | number
  sub?: string
  icon: React.ReactNode
  color: 'green' | 'red' | 'blue' | 'yellow'
}

const KPI_COLORS = {
  green:  { bg: 'bg-green-50 dark:bg-green-900/20',  icon: 'text-green-600 dark:text-green-400',  val: 'text-green-700 dark:text-green-300' },
  red:    { bg: 'bg-red-50 dark:bg-red-900/20',      icon: 'text-red-500 dark:text-red-400',      val: 'text-red-700 dark:text-red-300' },
  blue:   { bg: 'bg-blue-50 dark:bg-blue-900/20',    icon: 'text-blue-600 dark:text-blue-400',    val: 'text-blue-700 dark:text-blue-300' },
  yellow: { bg: 'bg-amber-50 dark:bg-amber-900/20',  icon: 'text-amber-500 dark:text-amber-400',  val: 'text-amber-700 dark:text-amber-300' },
}

function KpiCard({ label, value, sub, icon, color }: KpiCardProps) {
  const c = KPI_COLORS[color]
  return (
    <div className="metric-card">
      <div className={clsx('w-9 h-9 rounded-lg flex items-center justify-center', c.bg)}>
        <span className={c.icon}>{icon}</span>
      </div>
      <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{label}</p>
      <p className={clsx('text-2xl font-bold', c.val)}>{value}</p>
      {sub && <p className="text-xs text-gray-400">{sub}</p>}
    </div>
  )
}

// ── main component ─────────────────────────────────────────

export default function Dashboard({ lang }: DashboardProps) {
  const ar = lang === 'ar'
  const years = dataStore.getYears()
  const [selectedYear, setSelectedYear] = useState(() => years[years.length - 1] ?? '')

  const yearRecords: StudentRecord[] = useMemo(
    () => dataStore.getRecordsByYear(selectedYear),
    [selectedYear],
  )

  // ── KPIs ──────────────────────────────────────────────
  const kpi = useMemo(() => {
    if (!yearRecords.length) return null
    const pass = yearRecords.filter(r => r.status === 'pass').length
    const total = yearRecords.length
    const avgs = yearRecords.map(r => r.annualAvg).filter((v): v is number => v !== null)
    const above90 = avgs.filter(v => v >= 90).length
    const mean = avgs.length > 0 ? avgs.reduce((a, b) => a + b, 0) / avgs.length : 0
    return {
      total,
      pass,
      fail: total - pass,
      passRate: (pass / total) * 100,
      failRate: ((total - pass) / total) * 100,
      above90,
      above90Rate: avgs.length > 0 ? (above90 / avgs.length) * 100 : 0,
      mean,
    }
  }, [yearRecords])

  // ── Subject pass rates (annual) ───────────────────────
  const subjectStats = useMemo(() => {
    const map = new Map<SubjectCode, { scores: number[]; passMark: number }>()
    for (const r of yearRecords) {
      const passMark = getPassMark(r.cycle)
      for (const [s, g] of Object.entries(r.grades) as [SubjectCode, { annual: number | null }][]) {
        if (g.annual === null) continue
        if (!map.has(s)) map.set(s, { scores: [], passMark })
        map.get(s)!.scores.push(g.annual)
      }
    }
    return [...map.entries()]
      .map(([subject, { scores, passMark }]) => {
        const total = scores.length
        const failCount = scores.filter(v => v < passMark).length
        const passCount = scores.filter(v => v >= passMark && v < 75).length
        const above75Count = scores.filter(v => v >= 75).length
        return {
          subject,
          label: (ar ? SUBJECT_LABELS[subject]?.ar : SUBJECT_LABELS[subject]?.en) ?? subject,
          count: total,
          passRate: ((total - failCount) / total) * 100,
          failRate: (failCount / total) * 100,
          above75Rate: (above75Count / total) * 100,
          mean: scores.reduce((a, b) => a + b, 0) / total,
          failCount,
          passCount,
          above75Count,
        }
      })
      .filter(s => s.count >= 3)
      .sort((a, b) => b.above75Rate - a.above75Rate)
  }, [yearRecords, ar])

  // ── Per-grade stats ───────────────────────────────────
  const gradeStats = useMemo(() => {
    const map = new Map<number, StudentRecord[]>()
    for (const r of yearRecords) {
      if (!map.has(r.grade)) map.set(r.grade, [])
      map.get(r.grade)!.push(r)
    }
    return [...map.entries()]
      .sort(([a], [b]) => a - b)
      .map(([grade, recs]) => {
        const pass = recs.filter(r => r.status === 'pass').length
        const avgs = recs.map(r => r.annualAvg).filter((v): v is number => v !== null)
        const above90 = avgs.filter(v => v >= 90).length
        const mean = avgs.length > 0 ? avgs.reduce((a, b) => a + b, 0) / avgs.length : 0
        const sections = new Set(recs.map(r => r.section)).size
        return {
          grade,
          count: recs.length,
          pass,
          fail: recs.length - pass,
          passRate: (pass / recs.length) * 100,
          mean,
          above90Rate: avgs.length > 0 ? (above90 / avgs.length) * 100 : 0,
          sections,
        }
      })
  }, [yearRecords])

  // ── Alerts: subjects with pass rate < 70% ────────────
  const lowSubjects = useMemo(
    () => subjectStats.filter(s => s.passRate < 70),
    [subjectStats],
  )

  // ── Performance band distribution (annual avgs) ───────
  const bandDist = useMemo(() => {
    const avgs = yearRecords.map(r => r.annualAvg).filter((v): v is number => v !== null)
    if (!avgs.length) return null
    const total = avgs.length
    // Use mixed: cycle 2 pass = 50, cycle 3 pass = 60. Use 60 as universal "pass" for band display
    const fail  = avgs.filter(v => v < 60).length
    const pass  = avgs.filter(v => v >= 60 && v < 70).length
    const good  = avgs.filter(v => v >= 70 && v < 80).length
    const vgood = avgs.filter(v => v >= 80 && v < 90).length
    const excel = avgs.filter(v => v >= 90).length
    return [
      { label: ar ? 'دون 60' : '< 60',      pct: (fail / total) * 100,  color: 'bg-red-500',   textColor: 'text-red-700' },
      { label: ar ? '60–70'  : '60–70',      pct: (pass / total) * 100,  color: 'bg-orange-400',textColor: 'text-orange-700' },
      { label: ar ? '70–80'  : '70–80',      pct: (good / total) * 100,  color: 'bg-amber-400', textColor: 'text-amber-700' },
      { label: ar ? '80–90'  : '80–90',      pct: (vgood / total) * 100, color: 'bg-blue-500',  textColor: 'text-blue-700' },
      { label: ar ? '90+'    : '90+',        pct: (excel / total) * 100, color: 'bg-green-500', textColor: 'text-green-700' },
    ]
  }, [yearRecords, ar])

  // ── Empty state ───────────────────────────────────────
  if (years.length === 0) {
    return (
      <div className="max-w-2xl mx-auto mt-16 text-center">
        <div className="card p-12">
          <Upload size={48} className="mx-auto text-gray-300 mb-4" />
          <h1 className="text-xl font-bold text-gray-700 dark:text-gray-200 mb-2">
            {ar ? 'مرحباً بك في منصة تحليل الإنجاز' : 'Welcome to Achievement Analysis'}
          </h1>
          <p className="text-gray-500 mb-2">
            {ar ? 'مدرسة خالد بن الوليد — فريق جودة إنجازات الطلبة' : 'Khalid bin Al-Walid — Student Achievement Quality Team'}
          </p>
          <p className="text-gray-400 text-sm mb-6">
            {ar ? 'ابدأ برفع ملف الدرجات السنوي من نظام المنهل' : 'Start by uploading the annual grade file from Manhal'}
          </p>
          <Link to="/upload" className="btn-primary inline-flex items-center gap-2">
            <Upload size={16} />
            {ar ? 'رفع البيانات' : 'Upload Data'}
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">

      {/* ── Page header with year selector ── */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-800 dark:text-white">
            {ar ? 'لوحة الإنجاز المدرسي' : 'School Achievement Dashboard'}
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {ar ? 'مدرسة خالد بن الوليد — فريق جودة انجازات الطلبة' : 'Khalid bin Al-Walid — Achievement Quality Team'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-sm text-gray-500">{ar ? 'العام الدراسي:' : 'Year:'}</label>
          <select
            className="input w-auto py-1.5 text-sm font-medium"
            value={selectedYear}
            onChange={e => setSelectedYear(e.target.value)}
          >
            {years.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
      </div>

      {/* ── KPI Cards ── */}
      {kpi && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <KpiCard
            icon={<Users size={18} />}
            label={ar ? 'إجمالي الطلاب' : 'Total Students'}
            value={kpi.total.toLocaleString()}
            sub={selectedYear}
            color="blue"
          />
          <KpiCard
            icon={<CheckCircle size={18} />}
            label={ar ? 'نسبة النجاح' : 'Pass Rate'}
            value={`${round2(kpi.passRate)}%`}
            sub={`${kpi.pass} ${ar ? 'طالب' : 'students'}`}
            color="green"
          />
          <KpiCard
            icon={<Award size={18} />}
            label={ar ? 'نسبة التميز (90+)' : 'Excellence (90+)'}
            value={`${round2(kpi.above90Rate)}%`}
            sub={`${kpi.above90} ${ar ? 'طالب' : 'students'}`}
            color="yellow"
          />
          <KpiCard
            icon={<XCircle size={18} />}
            label={ar ? 'يحتاجون تدخلاً' : 'Need Intervention'}
            value={kpi.fail.toLocaleString()}
            sub={`${round2(kpi.failRate)}% ${ar ? 'من الإجمالي' : 'of total'}`}
            color="red"
          />
        </div>
      )}

      {/* ── Alerts ── */}
      {lowSubjects.length > 0 && (
        <div className="alert-warn flex items-start gap-3">
          <AlertTriangle size={18} className="shrink-0 mt-0.5 text-amber-600" />
          <div>
            <p className="font-semibold text-amber-900 dark:text-amber-200 mb-1">
              {ar ? 'مواد تحتاج انتباهاً' : 'Subjects Requiring Attention'}
              {' '}
              <span className="font-normal">({ar ? 'نسبة نجاح أقل من 70%' : 'pass rate below 70%'})</span>
            </p>
            <div className="flex flex-wrap gap-2">
              {lowSubjects.map(s => (
                <span key={s.subject} className="badge-high">
                  {s.label} — {round2(s.passRate)}%
                </span>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── Subject Performance + Band Distribution ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

        {/* Subject performance bars */}
        <div className="card lg:col-span-2">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-gray-700 dark:text-gray-300">
              {ar ? 'أداء المواد الدراسية — نسبة النجاح' : 'Subject Performance — Pass Rates'}
            </h2>
            <Link to="/analysis" className="text-xs text-primary-600 dark:text-primary-400 flex items-center gap-0.5 hover:underline">
              {ar ? 'تفاصيل' : 'Details'}
              <ChevronLeft size={13} />
            </Link>
          </div>
          <div className="space-y-3">
            {subjectStats.map(s => (
              <div key={s.subject}>
                <div className="flex justify-between text-sm mb-1">
                  <span className="text-gray-700 dark:text-gray-300">{s.label}</span>
                  <span className={rateClass(s.passRate)}>{round2(s.passRate)}%</span>
                </div>
                <div className="pbar-track">
                  <div
                    className={clsx('pbar-fill', barColor(s.passRate))}
                    style={{ width: `${s.passRate}%` }}
                  />
                </div>
              </div>
            ))}
            {subjectStats.length === 0 && (
              <p className="text-sm text-gray-400 text-center py-4">
                {ar ? 'لا توجد بيانات لهذا العام' : 'No data for this year'}
              </p>
            )}
          </div>
        </div>

        {/* Band distribution */}
        {bandDist && (
          <div className="card">
            <h2 className="font-semibold text-gray-700 dark:text-gray-300 mb-4">
              {ar ? 'توزيع الطلاب بالفئات' : 'Students by Band'}
            </h2>
            <div className="space-y-3">
              {bandDist.map(b => (
                <div key={b.label}>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-gray-600 dark:text-gray-400">{b.label}</span>
                    <span className={clsx('font-semibold', b.textColor)}>{round2(b.pct)}%</span>
                  </div>
                  <div className="pbar-track">
                    <div className={clsx('pbar-fill', b.color)} style={{ width: `${b.pct}%` }} />
                  </div>
                </div>
              ))}
            </div>

            {/* Legend */}
            <div className="mt-4 pt-3 border-t space-y-1 text-xs text-gray-500">
              <div className="flex gap-2 items-center"><span className="w-2 h-2 rounded-full bg-green-500 inline-block" />{ar ? 'ممتاز: 90+' : 'Excellent: 90+'}</div>
              <div className="flex gap-2 items-center"><span className="w-2 h-2 rounded-full bg-blue-500 inline-block" />{ar ? 'جيد جداً: 80–90' : 'Very Good: 80–90'}</div>
              <div className="flex gap-2 items-center"><span className="w-2 h-2 rounded-full bg-amber-400 inline-block" />{ar ? 'جيد: 70–80' : 'Good: 70–80'}</div>
              <div className="flex gap-2 items-center"><span className="w-2 h-2 rounded-full bg-orange-400 inline-block" />{ar ? 'مقبول: 60–70' : 'Pass: 60–70'}</div>
              <div className="flex gap-2 items-center"><span className="w-2 h-2 rounded-full bg-red-500 inline-block" />{ar ? 'دون المقبول' : 'Below Pass'}</div>
            </div>
          </div>
        )}
      </div>

      {/* ── Grade-level breakdown ── */}
      {gradeStats.length > 0 && (
        <div className="card overflow-x-auto">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold text-gray-700 dark:text-gray-300">
              {ar ? 'الأداء حسب الصف الدراسي' : 'Performance by Grade'}
            </h2>
            <Link to="/analysis" className="text-xs text-primary-600 dark:text-primary-400 flex items-center gap-0.5 hover:underline">
              {ar ? 'تحليل تفصيلي' : 'Detailed Analysis'}
              <ChevronLeft size={13} />
            </Link>
          </div>
          <table className="table-base">
            <thead>
              <tr>
                <th>{ar ? 'الصف' : 'Grade'}</th>
                <th>{ar ? 'الحلقة' : 'Cycle'}</th>
                <th>{ar ? 'الطلاب' : 'Students'}</th>
                <th>{ar ? 'الفصول' : 'Sections'}</th>
                <th>{ar ? 'نسبة النجاح' : 'Pass Rate'}</th>
                <th>{ar ? 'المتوسط' : 'Mean'}</th>
                <th>{ar ? 'التميز 90+' : '90+ Rate'}</th>
                <th>{ar ? 'راسبون' : 'Failing'}</th>
              </tr>
            </thead>
            <tbody>
              {gradeStats.map(g => (
                <tr key={g.grade}>
                  <td className="font-semibold">
                    {ar ? `الصف ${g.grade}` : `Grade ${g.grade}`}
                  </td>
                  <td className="text-xs text-gray-500">
                    {g.grade <= 8
                      ? (ar ? 'الثانية' : 'Cycle 2')
                      : (ar ? 'الثالثة' : 'Cycle 3')}
                  </td>
                  <td>{g.count}</td>
                  <td>{g.sections}</td>
                  <td>
                    <span className={clsx('px-2 py-0.5 rounded text-xs', cellClass(g.passRate))}>
                      {round2(g.passRate)}%
                    </span>
                  </td>
                  <td className={rateClass(g.mean)}>{round2(g.mean)}</td>
                  <td className={rateClass(g.above90Rate)}>{round2(g.above90Rate)}%</td>
                  <td className={g.fail > 0 ? 'text-red-600 font-semibold' : 'text-gray-400'}>
                    {g.fail}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Per-subject achievement bands ── */}
      {subjectStats.length > 0 && (
        <div className="card overflow-x-auto">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h2 className="font-semibold text-gray-700 dark:text-gray-300">
                {ar ? 'توزيع الطلاب حسب الإنجاز — بالمادة' : 'Student Achievement Distribution by Subject'}
              </h2>
              <p className="text-xs text-gray-400 mt-0.5">
                {ar ? 'نسبة النجاح · نسبة الرسوب · نسبة الطلاب أعلى من 75%' : 'Pass rate · Fail rate · Students above 75%'}
              </p>
            </div>
          </div>
          <table className="table-base">
            <thead>
              <tr>
                <th>{ar ? 'المادة' : 'Subject'}</th>
                <th>{ar ? 'طلاب' : 'Students'}</th>
                <th>{ar ? 'نسبة النجاح' : 'Pass Rate'}</th>
                <th>{ar ? 'نسبة الرسوب' : 'Fail Rate'}</th>
                <th>{ar ? 'أعلى من 75%' : 'Above 75%'}</th>
                <th>{ar ? 'المتوسط' : 'Mean'}</th>
              </tr>
            </thead>
            <tbody>
              {subjectStats.map(s => (
                <tr key={s.subject}>
                  <td className="font-medium">{s.label}</td>
                  <td className="text-gray-500">{s.count}</td>
                  <td>
                    <div className="flex items-center gap-2">
                      <div className="w-20 bg-gray-100 dark:bg-gray-700 rounded-full h-1.5">
                        <div className="bg-green-500 h-1.5 rounded-full" style={{ width: `${s.passRate}%` }} />
                      </div>
                      <span className={clsx('text-xs font-semibold', s.passRate >= 90 ? 'text-green-600' : s.passRate >= 70 ? 'text-amber-600' : 'text-red-600')}>
                        {round2(s.passRate)}%
                      </span>
                    </div>
                  </td>
                  <td>
                    <div className="flex items-center gap-2">
                      <div className="w-20 bg-gray-100 dark:bg-gray-700 rounded-full h-1.5">
                        <div className="bg-red-500 h-1.5 rounded-full" style={{ width: `${s.failRate}%` }} />
                      </div>
                      <span className={clsx('text-xs font-semibold', s.failRate <= 10 ? 'text-green-600' : s.failRate <= 30 ? 'text-amber-600' : 'text-red-600')}>
                        {round2(s.failRate)}%
                      </span>
                    </div>
                  </td>
                  <td>
                    <div className="flex items-center gap-2">
                      <div className="w-20 bg-gray-100 dark:bg-gray-700 rounded-full h-1.5">
                        <div className="bg-blue-500 h-1.5 rounded-full" style={{ width: `${s.above75Rate}%` }} />
                      </div>
                      <span className={clsx('text-xs font-semibold', s.above75Rate >= 70 ? 'text-green-600' : s.above75Rate >= 50 ? 'text-amber-600' : 'text-red-600')}>
                        {round2(s.above75Rate)}%
                      </span>
                    </div>
                  </td>
                  <td className={clsx('font-mono text-sm', s.mean >= 75 ? 'text-green-600' : s.mean >= 60 ? 'text-amber-600' : 'text-red-600')}>
                    {round2(s.mean)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Legend */}
          <div className="mt-3 pt-3 border-t flex flex-wrap gap-4 text-xs text-gray-500">
            <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-green-500 inline-block" />{ar ? 'نجاح (≥ معيار النجاح)' : 'Pass (≥ pass mark)'}</span>
            <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-red-500 inline-block" />{ar ? 'رسوب (< معيار النجاح)' : 'Fail (< pass mark)'}</span>
            <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-blue-500 inline-block" />{ar ? 'أعلى من 75% (المعيار الوزاري)' : 'Above 75% (MOE Standard)'}</span>
          </div>
        </div>
      )}

      {/* ── Quick nav ── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { to: '/analysis',   icon: BarChart2,   ar: 'تحليل الدرجات',  en: 'Grade Analysis' },
          { to: '/progress',   icon: TrendingUp,  ar: 'تتبع التقدم',     en: 'Progress Tracking' },
          { to: '/comparison', icon: BarChart2,   ar: 'المقارنة السنوية', en: 'Year Comparison' },
          { to: '/upload',     icon: Upload,      ar: 'رفع البيانات',    en: 'Upload Data' },
        ].map(({ to, icon: Icon, ar: labelAr, en: labelEn }) => (
          <Link
            key={to}
            to={to}
            className="card-flat hover:shadow-md transition-shadow flex items-center gap-3 p-3 group"
          >
            <div className="w-8 h-8 rounded-lg bg-primary-50 dark:bg-primary-900/20 flex items-center justify-center shrink-0 group-hover:bg-primary-100 dark:group-hover:bg-primary-900/40 transition-colors">
              <Icon size={16} className="text-primary-600 dark:text-primary-400" />
            </div>
            <span className="font-medium text-sm text-gray-700 dark:text-gray-300">{ar ? labelAr : labelEn}</span>
          </Link>
        ))}
      </div>

      {/* ── Data summary footer ── */}
      <div className="card-flat flex flex-wrap gap-4 items-center text-sm text-gray-500">
        <span className="font-medium text-gray-700 dark:text-gray-300">
          {ar ? 'ملخص البيانات المتاحة:' : 'Available Data:'}
        </span>
        {years.map(y => {
          const yd = dataStore.getYearData(y)
          return (
            <span
              key={y}
              className={clsx(
                'px-3 py-1 rounded-full text-xs border',
                y === selectedYear
                  ? 'bg-primary-50 border-primary-300 text-primary-700 dark:bg-primary-900/20 dark:border-primary-700 dark:text-primary-400 font-medium'
                  : 'bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-700',
              )}
            >
              {y} · {yd?.records.length ?? 0} {ar ? 'طالب' : 'students'}
            </span>
          )
        })}
      </div>
    </div>
  )
}
