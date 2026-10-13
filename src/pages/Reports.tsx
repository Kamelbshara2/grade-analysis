import { useState, useMemo, useRef } from 'react'
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Legend, Cell, ReferenceLine,
  ComposedChart,
} from 'recharts'
import { Printer, ChevronDown, ChevronRight } from 'lucide-react'
import { t } from '@/i18n/translations'
import type { Language, AnalysisFilter, SubjectCode, Semester, Cycle } from '@/types'
import { dataStore } from '@/store/dataStore'
import {
  filterRecords, computeSubjectStats, extractScores, round2,
  computeProgress, computeMultiYearProgress,
} from '@/utils/statistics'
import { getCycle, SUBJECT_LABELS, getCycleSubjects, getPassMark } from '@/utils/subjectMapping'
import FilterBar from '@/components/ui/FilterBar'
import NormalDistributionChart from '@/components/charts/NormalDistributionChart'

interface ReportsProps { lang: Language }

// ── Colour palette ─────────────────────────────────────────────────────────────
const SUBJECT_COLORS = [
  '#1D5E3F','#2563eb','#d97706','#9333ea','#0891b2','#16a34a','#dc2626','#db2777',
]
const BAND_COLORS = { band_low:'#ef4444', band_low_mid:'#f97316', band_mid:'#eab308', band_high:'#22c55e', band_top:'#0ea5e9' }

// ── Small helpers ───────────────────────────────────────────────────────────────
function SectionTitle({ num, ar, en }: { num: number; ar: string; en: string }) {
  return (
    <div className="flex items-center gap-3 mb-5 border-b-2 border-primary-200 pb-3 break-before-page">
      <div className="w-8 h-8 rounded-full bg-primary-600 text-white font-bold flex items-center justify-center text-sm shrink-0">{num}</div>
      <div>
        <h2 className="text-base font-bold text-primary-700 print:text-black leading-tight">{ar}</h2>
        <p className="text-xs text-gray-400">{en}</p>
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

// ── Subject bar comparison chart ────────────────────────────────────────────────
function SubjectBarChart({ data, lang }: { data: { name: string; passRate: number; mean: number }[]; lang: Language }) {
  const ar = lang === 'ar'
  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={data} margin={{ top: 5, right: 10, left: -10, bottom: 40 }}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey="name" tick={{ fontSize: 9 }} angle={-35} textAnchor="end" interval={0} />
        <YAxis tickFormatter={v => `${v}%`} tick={{ fontSize: 10 }} domain={[0, 100]} />
        <Tooltip formatter={(v: number) => `${round2(v)}%`} />
        <Legend wrapperStyle={{ fontSize: 10 }} />
        <Bar dataKey="passRate" name={ar ? 'نسبة النجاح' : 'Pass Rate'} radius={[3, 3, 0, 0]}>
          {data.map((_, i) => <Cell key={i} fill={SUBJECT_COLORS[i % SUBJECT_COLORS.length]} />)}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}

// ── Multi-year trend line chart ─────────────────────────────────────────────────
function TrendLineChart({ yearData, subjects, lang }: {
  yearData: { yearId: string; [k: string]: string | number }[]
  subjects: { code: string; name: string }[]
  lang: Language
}) {
  return (
    <ResponsiveContainer width="100%" height={240}>
      <LineChart data={yearData} margin={{ top: 5, right: 10, left: -10, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey="yearId" tick={{ fontSize: 10 }} />
        <YAxis domain={[0, 100]} tick={{ fontSize: 10 }} tickFormatter={v => `${v}`} />
        <Tooltip formatter={(v: number) => round2(v)} />
        <Legend wrapperStyle={{ fontSize: 9 }} />
        {subjects.map((s, i) => (
          <Line
            key={s.code}
            type="monotone"
            dataKey={s.code}
            name={s.name}
            stroke={SUBJECT_COLORS[i % SUBJECT_COLORS.length]}
            strokeWidth={2}
            dot={{ r: 4 }}
            connectNulls
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  )
}

// ── Semester performance curve ──────────────────────────────────────────────────
function SemesterCurveChart({ data, lang }: {
  data: { sem: string; [k: string]: string | number }[]
  subjects: { code: string; name: string }[]
  lang: Language
  subjects2?: { code: string; name: string }[]
}) {
  return (
    <ResponsiveContainer width="100%" height={220}>
      <LineChart data={data} margin={{ top: 5, right: 10, left: -10, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey="sem" tick={{ fontSize: 10 }} />
        <YAxis domain={[40, 100]} tick={{ fontSize: 10 }} />
        <Tooltip formatter={(v: number) => round2(v)} />
        <Legend wrapperStyle={{ fontSize: 9 }} />
        {Object.keys(data[0] || {}).filter(k => k !== 'sem').map((k, i) => (
          <Line
            key={k}
            type="monotone"
            dataKey={k}
            stroke={SUBJECT_COLORS[i % SUBJECT_COLORS.length]}
            strokeWidth={2}
            dot={{ r: 3 }}
            connectNulls
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  )
}

// ── Band stacked bar per subject ────────────────────────────────────────────────
function BandStackedChart({ data, lang }: {
  data: { name: string; band_low: number; band_low_mid: number; band_mid: number; band_high: number; band_top: number }[]
  lang: Language
}) {
  const ar = lang === 'ar'
  const bands = [
    { key: 'band_top',     label: ar ? 'ممتاز (90+)'    : 'Excellent (90+)',    color: BAND_COLORS.band_top },
    { key: 'band_high',    label: ar ? 'جيد جداً (80-89)' : 'Very Good (80-89)',  color: BAND_COLORS.band_high },
    { key: 'band_mid',     label: ar ? 'جيد (70-79)'    : 'Good (70-79)',        color: BAND_COLORS.band_mid },
    { key: 'band_low_mid', label: ar ? 'مقبول (60-69)'  : 'Acceptable (60-69)', color: BAND_COLORS.band_low_mid },
    { key: 'band_low',     label: ar ? 'راسب'           : 'Fail',               color: BAND_COLORS.band_low },
  ]
  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={data} layout="vertical" margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" horizontal={false} />
        <XAxis type="number" domain={[0, 100]} tickFormatter={v => `${v}%`} tick={{ fontSize: 9 }} />
        <YAxis type="category" dataKey="name" tick={{ fontSize: 9 }} width={90} />
        <Tooltip formatter={(v: number) => `${round2(v)}%`} />
        <Legend wrapperStyle={{ fontSize: 9 }} />
        {bands.map(b => (
          <Bar key={b.key} dataKey={b.key} name={b.label} stackId="a" fill={b.color} />
        ))}
      </BarChart>
    </ResponsiveContainer>
  )
}

// ── Progress summary donut-style bar ───────────────────────────────────────────
function ProgressSummaryBar({ progress, stable, regression, total, lang }: {
  progress: number; stable: number; regression: number; total: number; lang: Language
}) {
  if (total === 0) return null
  const ar = lang === 'ar'
  const pct = (n: number) => total > 0 ? round2((n / total) * 100) : 0
  const items = [
    { label: ar ? 'تقدم ملحوظ' : 'Progress',   value: progress,   pct: pct(progress),   color: 'bg-green-500', text: 'text-green-700' },
    { label: ar ? 'مستقر'      : 'Stable',      value: stable,     pct: pct(stable),     color: 'bg-blue-400',  text: 'text-blue-700' },
    { label: ar ? 'تراجع'      : 'Regression',  value: regression, pct: pct(regression), color: 'bg-red-500',   text: 'text-red-700' },
  ]
  return (
    <div className="space-y-3">
      {/* Bar */}
      <div className="flex h-8 rounded-lg overflow-hidden w-full">
        {items.map(it => it.pct > 0 && (
          <div key={it.label} className={`${it.color} flex items-center justify-center text-white text-xs font-semibold`} style={{ width: `${it.pct}%` }}>
            {it.pct > 5 ? `${it.pct}%` : ''}
          </div>
        ))}
      </div>
      <div className="flex gap-6 justify-center text-sm">
        {items.map(it => (
          <div key={it.label} className="flex items-center gap-1.5">
            <span className={`w-3 h-3 rounded-full ${it.color}`} />
            <span className={`font-semibold ${it.text}`}>{it.value}</span>
            <span className="text-gray-400">({it.pct}%)</span>
            <span className="text-gray-500">{it.label}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Grade performance bar chart ─────────────────────────────────────────────────
function GradePerformanceChart({ data, lang, passMark }: {
  data: { grade: number; passRate: number; mean: number; count: number }[]
  lang: Language
  passMark: number
}) {
  const ar = lang === 'ar'
  return (
    <ResponsiveContainer width="100%" height={200}>
      <BarChart data={data} margin={{ top: 5, right: 10, left: -10, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey="grade" tickFormatter={v => `${ar ? 'الصف' : 'G'} ${v}`} tick={{ fontSize: 10 }} />
        <YAxis tickFormatter={v => `${v}%`} tick={{ fontSize: 10 }} domain={[0, 100]} />
        <Tooltip formatter={(v: number) => `${round2(v)}%`} />
        <Legend wrapperStyle={{ fontSize: 10 }} />
        <ReferenceLine y={passMark} stroke="#9333ea" strokeDasharray="5 3" label={{ value: `حد النجاح ${passMark}%`, position: 'insideTopRight', fontSize: 9, fill: '#9333ea' }} />
        <Bar dataKey="passRate" name={ar ? 'نسبة النجاح' : 'Pass Rate'} radius={[3, 3, 0, 0]}>
          {data.map((d, i) => <Cell key={i} fill={d.passRate >= 80 ? '#16a34a' : d.passRate >= 60 ? '#eab308' : '#ef4444'} />)}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}

// ── Main Report component ───────────────────────────────────────────────────────
export default function Reports({ lang }: ReportsProps) {
  const ar = lang === 'ar'
  const [filter, setFilter] = useState<AnalysisFilter>({ semester: 'annual' })
  const [schoolName, setSchoolName] = useState(() => localStorage.getItem('school_name') || 'مدرسة خالد بن الوليد')
  const [expandedSections, setExpandedSections] = useState<Set<number>>(new Set([1,2,3,4,5,6,7]))
  const printRef = useRef<HTMLDivElement>(null)

  const years = dataStore.getYears()
  const today = new Date().toLocaleDateString(ar ? 'ar-AE' : 'en-AE')

  // ── Records for selected year/filter ──────────────────────────────────────────
  const records = useMemo(() => {
    const all = filter.yearId ? dataStore.getRecordsByYear(filter.yearId) : dataStore.getAllRecords()
    return filterRecords(all, filter)
  }, [filter])

  const cycle: Cycle = useMemo(() => {
    if (records.length > 0) return getCycle(records[0].grade)
    if (filter.grade) return getCycle(filter.grade)
    return 3 as const
  }, [records, filter.grade])

  const semester = (filter.semester ?? 'annual') as Semester | 'annual'
  const passMark = getPassMark(cycle)

  // ── Subject stats list ────────────────────────────────────────────────────────
  const subjectStatsList = useMemo(() =>
    getCycleSubjects(cycle)
      .map(s => computeSubjectStats(records, s, semester, cycle))
      .filter(s => s.count > 0),
    [records, cycle, semester]
  )

  const firstStats = subjectStatsList[0]

  // ── Per-grade stats (for subject with most data) ──────────────────────────────
  const gradeStats = useMemo(() => {
    const subject = firstStats?.subjectCode
    if (!subject) return []
    const grades = [...new Set(records.map(r => r.grade))].sort((a, b) => a - b)
    return grades.map(g => {
      const gr = records.filter(r => r.grade === g)
      const st = computeSubjectStats(gr, subject, semester, getCycle(g))
      return { grade: g, passRate: st.passRate, mean: st.mean, count: st.count }
    }).filter(g => g.count > 0)
  }, [records, firstStats, semester])

  // ── Band distribution per subject ─────────────────────────────────────────────
  const bandData = useMemo(() =>
    subjectStatsList.map(s => ({
      name: SUBJECT_LABELS[s.subjectCode]?.[lang] ?? s.subjectCode,
      band_low: round2((s.band_low / s.count) * 100),
      band_low_mid: round2((s.band_low_mid / s.count) * 100),
      band_mid: round2((s.band_mid / s.count) * 100),
      band_high: round2((s.band_high / s.count) * 100),
      band_top: round2((s.band_top / s.count) * 100),
    })),
    [subjectStatsList, lang]
  )

  // ── Multi-year trend ──────────────────────────────────────────────────────────
  const trendData = useMemo(() => {
    if (years.length < 2) return { yearRows: [], subjects: [] }
    const subjects = getCycleSubjects(cycle)
    const yearRows = years.map(yId => {
      const yr = filterRecords(dataStore.getRecordsByYear(yId), { grade: filter.grade, track: filter.track, section: filter.section })
      const row: { yearId: string; [k: string]: string | number } = { yearId: yId }
      for (const sc of subjects) {
        const scores = extractScores(yr, sc, 'annual')
        if (scores.length > 0) row[sc] = round2(scores.reduce((a, b) => a + b, 0) / scores.length)
      }
      return row
    })
    const subjectsMeta = subjects
      .filter(sc => yearRows.some(r => r[sc] !== undefined))
      .map(sc => ({ code: sc, name: SUBJECT_LABELS[sc]?.[lang] ?? sc }))
    return { yearRows, subjects: subjectsMeta }
  }, [years, cycle, filter.grade, filter.track, filter.section, lang])

  // ── Semester performance curve ────────────────────────────────────────────────
  const semesterCurveData = useMemo(() => {
    const semLabels = [
      { key: 1 as Semester, label: ar ? 'ف1' : 'S1' },
      { key: 2 as Semester, label: ar ? 'ف2' : 'S2' },
      { key: 3 as Semester, label: ar ? 'ف3' : 'S3' },
      { key: 'annual' as 'annual', label: ar ? 'سنوي' : 'Annual' },
    ]
    return semLabels.map(({ key, label }) => {
      const row: { sem: string; [k: string]: string | number } = { sem: label }
      for (const s of subjectStatsList) {
        const scores = extractScores(records, s.subjectCode, key)
        if (scores.length > 0) row[SUBJECT_LABELS[s.subjectCode]?.[lang] ?? s.subjectCode] = round2(scores.reduce((a, b) => a + b, 0) / scores.length)
      }
      return row
    })
  }, [records, subjectStatsList, ar, lang])

  // ── Progress summary ──────────────────────────────────────────────────────────
  const progressSummary = useMemo(() => {
    if (years.length < 2) return null
    const currentYear = filter.yearId ?? years[years.length - 1]
    const prevYear = years[years.indexOf(currentYear) - 1]
    if (!prevYear) return null
    const currRec = filterRecords(dataStore.getRecordsByYear(currentYear), filter)
    const prevRec = dataStore.getRecordsByYear(prevYear)
    const subject = firstStats?.subjectCode
    if (!subject) return null
    const results = computeProgress(currRec, prevRec, dataStore.getDiagnosticScores(currentYear), subject, semester, 'previous')
    const progress = results.filter(r => r.category === 'significant_progress').length
    const stable = results.filter(r => r.category === 'stable' || r.category === 'slight_progress').length
    const regression = results.filter(r => r.category === 'regression').length
    const tracked = results.filter(r => r.category !== 'no_baseline').length
    return { progress, stable, regression, total: tracked, subject, prevYear, currentYear }
  }, [years, filter, firstStats, semester])

  // ── Multi-year trajectory summary ─────────────────────────────────────────────
  const trajectoryStats = useMemo(() => {
    if (years.length < 2 || !firstStats) return null
    const latestYear = years[years.length - 1]
    const latestFiltered = filterRecords(dataStore.getRecordsByYear(latestYear), { grade: filter.grade, section: filter.section, track: filter.track })
    const anchorIds = (filter.grade || filter.section) ? new Set(latestFiltered.map(r => r.student.id)) : undefined
    const allYearRecords = years.map(yId => ({ yearId: yId, records: dataStore.getRecordsByYear(yId) }))
    const rows = computeMultiYearProgress(allYearRecords, firstStats.subjectCode, 'annual', anchorIds)
    const withData = rows.filter(r => r.overallCategory !== null)
    return {
      total: withData.length,
      progress: withData.filter(r => r.overallCategory === 'significant_progress').length,
      stable: withData.filter(r => r.overallCategory === 'stable').length,
      regression: withData.filter(r => r.overallCategory === 'regression').length,
    }
  }, [years, firstStats, filter.grade, filter.section, filter.track])

  function toggleSection(n: number) {
    setExpandedSections(prev => {
      const s = new Set(prev)
      s.has(n) ? s.delete(n) : s.add(n)
      return s
    })
  }

  function SectionToggle({ num, ar: arLabel, en }: { num: number; ar: string; en: string }) {
    const expanded = expandedSections.has(num)
    return (
      <button
        onClick={() => toggleSection(num)}
        className="w-full flex items-center gap-3 mb-3 border-b-2 border-primary-200 pb-3 no-print group text-start"
      >
        <div className="w-8 h-8 rounded-full bg-primary-600 text-white font-bold flex items-center justify-center text-sm shrink-0">{num}</div>
        <div className="flex-1">
          <h2 className="text-base font-bold text-primary-700 leading-tight">{arLabel}</h2>
          <p className="text-xs text-gray-400">{en}</p>
        </div>
        {expanded ? <ChevronDown size={16} className="text-gray-400" /> : <ChevronRight size={16} className="text-gray-400" />}
      </button>
    )
  }

  // ── Render ─────────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6">
      {/* Toolbar – hidden in print */}
      <div className="no-print flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-xl font-bold">{t('reports_title')}</h1>
        <button className="btn-primary flex items-center gap-2" onClick={() => window.print()}>
          <Printer size={15} />
          {ar ? 'طباعة التقرير الكامل' : 'Print Full Report'}
        </button>
      </div>

      {/* Controls */}
      <div className="no-print space-y-4">
        <div className="flex gap-4 flex-wrap items-end">
          <div>
            <label className="label">{t('reports_school')}</label>
            <input
              className="input max-w-xs"
              value={schoolName}
              onChange={e => { setSchoolName(e.target.value); localStorage.setItem('school_name', e.target.value) }}
              placeholder={ar ? 'اسم المدرسة' : 'School name'}
            />
          </div>
        </div>
        <FilterBar filter={filter} onChange={setFilter} lang={lang} showSubject={false} showSemester showNationality />
      </div>

      {/* ===== PRINTABLE REPORT ===== */}
      <div ref={printRef} className="bg-white dark:bg-gray-900 rounded-xl shadow print:shadow-none print:rounded-none print:p-0 print:bg-white space-y-0">

        {/* ── Cover / Header ────────────────────────────────────────────────────── */}
        <div className="p-8 print:p-6">
          <div className="text-center border-b-2 border-primary-600 pb-8 mb-8">
            <div className="w-20 h-20 bg-primary-50 rounded-full mx-auto mb-4 flex items-center justify-center">
              <div className="w-12 h-12 rounded-lg bg-primary-600 flex items-center justify-center">
                <span className="text-white text-2xl font-bold">خ</span>
              </div>
            </div>
            <h1 className="text-2xl font-bold text-gray-800 dark:text-gray-100">{schoolName}</h1>
            <p className="text-primary-600 font-semibold mt-1">{ar ? 'فريق جودة انجازات الطلبة' : 'Student Achievement Quality Team'}</p>
            <div className="mt-4 inline-block bg-primary-600 text-white px-6 py-2 rounded-full text-lg font-semibold">
              {ar ? 'تقرير تحليل الإنجاز الشامل' : 'Comprehensive Achievement Analysis Report'}
            </div>
            <div className="flex justify-center gap-8 mt-4 text-sm text-gray-500 flex-wrap">
              {filter.yearId && <span className="font-medium">{ar ? 'السنة الدراسية:' : 'Year:'} {filter.yearId}</span>}
              {filter.grade && <span>{ar ? 'الصف:' : 'Grade:'} {filter.grade}</span>}
              {filter.track && <span>{ar ? 'المسار:' : 'Track:'} {filter.track === 'general' ? (ar ? 'العام' : 'General') : (ar ? 'المتقدم' : 'Advanced')}</span>}
              {filter.section && <span>{ar ? 'الشعبة:' : 'Section:'} {filter.section}</span>}
              <span>{ar ? 'تاريخ التقرير:' : 'Report Date:'} {today}</span>
            </div>
          </div>

          {records.length === 0 && (
            <div className="text-center py-16 text-gray-400 text-lg">{t('no_data')}</div>
          )}
        </div>

        {records.length > 0 && (
          <div className="px-8 pb-8 print:px-6 space-y-10">

            {/* ═══ SECTION 1: الملخص التنفيذي ══════════════════════════════════ */}
            <section>
              <SectionToggle num={1} ar="الملخص التنفيذي" en="Executive Summary" />
              <div className="print-section-title hidden print:flex items-center gap-3 mb-5 border-b-2 border-primary-200 pb-3">
                <div className="w-8 h-8 rounded-full bg-primary-600 text-white font-bold flex items-center justify-center text-sm">1</div>
                <div><h2 className="text-base font-bold text-black">الملخص التنفيذي</h2><p className="text-xs text-gray-400">Executive Summary</p></div>
              </div>
              {expandedSections.has(1) && (
                <div className="space-y-6">
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <KpiTile label={ar ? 'إجمالي الطلاب' : 'Total Students'} value={records.length} color="bg-blue-50 border-blue-200" />
                    {firstStats && <>
                      <KpiTile label={ar ? 'نسبة النجاح' : 'Pass Rate'} value={`${round2(firstStats.passRate)}%`} color="bg-green-50 border-green-200" sub={ar ? 'في المادة الأولى' : 'First subject'} />
                      <KpiTile label={ar ? 'نسبة الرسوب' : 'Fail Rate'} value={`${round2(firstStats.failRate)}%`} color="bg-red-50 border-red-200" />
                      <KpiTile label={ar ? 'نسبة التميز (90+)' : 'Excellence (90+)'} value={`${round2(firstStats.above90Rate)}%`} color="bg-yellow-50 border-yellow-200" />
                    </>}
                  </div>

                  {/* Subject summary table */}
                  {subjectStatsList.length > 0 && (
                    <div className="overflow-x-auto">
                      <table className="table-base w-full text-sm">
                        <thead>
                          <tr>
                            <th>{t('subject')}</th>
                            <th className="text-center">{ar ? 'ع' : 'N'}</th>
                            <th className="text-center">{ar ? 'نجاح%' : 'Pass%'}</th>
                            <th className="text-center">{ar ? 'رسوب%' : 'Fail%'}</th>
                            <th className="text-center">{ar ? 'المتوسط' : 'Mean'}</th>
                            <th className="text-center">{ar ? 'الوسيط' : 'Median'}</th>
                            <th className="text-center">{ar ? 'الانحراف' : 'Std'}</th>
                            <th className="text-center">{ar ? 'تميز%' : 'Exc%'}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {subjectStatsList.map(s => (
                            <tr key={s.subjectCode}>
                              <td className="font-medium">{SUBJECT_LABELS[s.subjectCode]?.[lang] ?? s.subjectCode}</td>
                              <td className="text-center">{s.count}</td>
                              <td className="text-center text-green-600 font-semibold">{round2(s.passRate)}%</td>
                              <td className="text-center text-red-600">{round2(s.failRate)}%</td>
                              <td className="text-center font-mono">{round2(s.mean)}</td>
                              <td className="text-center font-mono">{round2(s.median)}</td>
                              <td className="text-center font-mono">{round2(s.stdDev)}</td>
                              <td className="text-center text-blue-600">{round2(s.above90Rate)}%</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}
            </section>

            {/* ═══ SECTION 2: تحليل الأداء بالمادة ═══════════════════════════ */}
            <section>
              <SectionToggle num={2} ar="تحليل الأداء بالمادة" en="Subject Performance Analysis" />
              {expandedSections.has(2) && subjectStatsList.length > 1 && (
                <div className="space-y-5">
                  <div>
                    <h4 className="text-sm text-gray-500 mb-2">{ar ? 'نسبة النجاح لكل مادة' : 'Pass Rate by Subject'}</h4>
                    <SubjectBarChart
                      data={subjectStatsList.map((s, i) => ({
                        name: SUBJECT_LABELS[s.subjectCode]?.[lang] ?? s.subjectCode,
                        passRate: s.passRate,
                        mean: s.mean,
                        color: SUBJECT_COLORS[i % SUBJECT_COLORS.length],
                      }))}
                      lang={lang}
                    />
                  </div>
                  <div>
                    <h4 className="text-sm text-gray-500 mb-2">{ar ? 'توزيع النطاقات لكل مادة' : 'Band Distribution by Subject'}</h4>
                    <BandStackedChart data={bandData} lang={lang} />
                  </div>
                </div>
              )}
            </section>

            {/* ═══ SECTION 3: منحنى الأداء عبر الفصول ════════════════════════ */}
            <section>
              <SectionToggle num={3} ar="منحنى الأداء عبر الفصول الدراسية" en="Performance Curve Across Semesters" />
              {expandedSections.has(3) && subjectStatsList.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs text-gray-400">
                    {ar ? 'متوسط الدرجات من الفصل الأول إلى الدرجة السنوية — يكشف اتجاه الأداء خلال العام' : 'Average score from S1 to Annual — reveals within-year performance trend'}
                  </p>
                  <SemesterCurveChart data={semesterCurveData} subjects={subjectStatsList.map(s => ({ code: s.subjectCode, name: SUBJECT_LABELS[s.subjectCode]?.[lang] ?? s.subjectCode }))} lang={lang} />
                </div>
              )}
            </section>

            {/* ═══ SECTION 4: الأداء بالصف ════════════════════════════════════ */}
            {gradeStats.length > 1 && (
              <section>
                <SectionToggle num={4} ar="الأداء حسب الصف الدراسي" en="Performance by Grade" />
                {expandedSections.has(4) && (
                  <div className="space-y-3">
                    <p className="text-xs text-gray-400">{ar ? `نسبة النجاح لكل صف — ${SUBJECT_LABELS[firstStats?.subjectCode ?? 'arabic']?.[lang]}` : `Pass rate by grade — ${SUBJECT_LABELS[firstStats?.subjectCode ?? 'arabic']?.en}`}</p>
                    <GradePerformanceChart data={gradeStats} lang={lang} passMark={passMark} />
                    <div className="overflow-x-auto">
                      <table className="table-base w-full text-sm">
                        <thead>
                          <tr>
                            <th>{ar ? 'الصف' : 'Grade'}</th>
                            <th className="text-center">{ar ? 'عدد الطلاب' : 'Students'}</th>
                            <th className="text-center">{ar ? 'نسبة النجاح' : 'Pass%'}</th>
                            <th className="text-center">{ar ? 'المتوسط' : 'Mean'}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {gradeStats.map(g => (
                            <tr key={g.grade}>
                              <td className="font-medium">{ar ? `الصف ${g.grade}` : `Grade ${g.grade}`}</td>
                              <td className="text-center">{g.count}</td>
                              <td className={`text-center font-semibold ${g.passRate >= 80 ? 'text-green-600' : g.passRate >= 60 ? 'text-yellow-600' : 'text-red-600'}`}>{round2(g.passRate)}%</td>
                              <td className="text-center font-mono">{round2(g.mean)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </section>
            )}

            {/* ═══ SECTION 5: التوزيع الطبيعي ═════════════════════════════════ */}
            <section>
              <SectionToggle num={5} ar="التوزيع الطبيعي للدرجات" en="Normal Distribution of Scores" />
              {expandedSections.has(5) && (
                <div className="space-y-6">
                  {subjectStatsList.slice(0, 4).map(s => (
                    <div key={s.subjectCode}>
                      <h4 className="text-sm font-semibold text-gray-600 mb-2">
                        {SUBJECT_LABELS[s.subjectCode]?.[lang] ?? s.subjectCode}
                        <span className="text-xs font-normal text-gray-400 ms-2">μ={round2(s.mean)}  σ={round2(s.stdDev)}</span>
                      </h4>
                      <NormalDistributionChart scores={extractScores(records, s.subjectCode, semester)} cycle={cycle} />
                    </div>
                  ))}
                </div>
              )}
            </section>

            {/* ═══ SECTION 6: مقارنة السنوات والاتجاه العام ══════════════════ */}
            {years.length >= 2 && (
              <section>
                <SectionToggle num={6} ar="مقارنة السنوات الدراسية — الاتجاه العام" en="Year-over-Year Comparison & Trend" />
                {expandedSections.has(6) && trendData.subjects.length > 0 && (
                  <div className="space-y-3">
                    <p className="text-xs text-gray-400">
                      {ar ? 'متوسط الدرجة السنوية لكل مادة عبر السنوات الدراسية' : 'Annual average score per subject across academic years'}
                    </p>
                    <TrendLineChart yearData={trendData.yearRows} subjects={trendData.subjects} lang={lang} />

                    {/* Year comparison table */}
                    <div className="overflow-x-auto mt-4">
                      <table className="table-base w-full text-sm">
                        <thead>
                          <tr>
                            <th>{ar ? 'المادة' : 'Subject'}</th>
                            {years.map(y => <th key={y} className="text-center">{y}</th>)}
                            {years.length >= 2 && <th className="text-center text-xs">Δ {ar ? 'الكلي' : 'Total'}</th>}
                          </tr>
                        </thead>
                        <tbody>
                          {trendData.subjects.map(s => {
                            const vals = trendData.yearRows.map(r => r[s.code] as number | undefined)
                            const first = vals.find(v => v !== undefined)
                            const last = [...vals].reverse().find(v => v !== undefined)
                            const delta = first !== undefined && last !== undefined && first !== last ? round2(last - first) : null
                            return (
                              <tr key={s.code}>
                                <td className="font-medium">{s.name}</td>
                                {vals.map((v, i) => <td key={i} className="text-center font-mono">{v !== undefined ? round2(v) : '—'}</td>)}
                                {delta !== null && (
                                  <td className={`text-center font-semibold ${delta > 0 ? 'text-green-600' : 'text-red-600'}`}>
                                    {delta > 0 ? `+${delta}` : delta}
                                  </td>
                                )}
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </section>
            )}

            {/* ═══ SECTION 7: تتبع تقدم الطلبة ══════════════════════════════ */}
            <section>
              <SectionToggle num={7} ar="تتبع تقدم الطلبة — منحنى التقدم" en="Student Progress Tracking & Progress Curve" />
              {expandedSections.has(7) && (
                <div className="space-y-5">

                  {/* Year-over-year progress (previous year comparison) */}
                  {progressSummary && (
                    <div>
                      <h4 className="text-sm font-semibold text-gray-600 mb-3">
                        {ar
                          ? `مقارنة ${progressSummary.prevYear} → ${progressSummary.currentYear} — ${SUBJECT_LABELS[progressSummary.subject]?.[lang]}`
                          : `${progressSummary.prevYear} → ${progressSummary.currentYear} comparison — ${SUBJECT_LABELS[progressSummary.subject]?.en}`}
                      </h4>
                      <ProgressSummaryBar
                        progress={progressSummary.progress}
                        stable={progressSummary.stable}
                        regression={progressSummary.regression}
                        total={progressSummary.total}
                        lang={lang}
                      />
                    </div>
                  )}

                  {/* Multi-year trajectory */}
                  {trajectoryStats && trajectoryStats.total > 0 && (
                    <div>
                      <h4 className="text-sm font-semibold text-gray-600 mb-3">
                        {ar ? `الاتجاه الكلي عبر ${years.length} سنوات` : `Overall trajectory across ${years.length} years`}
                      </h4>
                      <ProgressSummaryBar
                        progress={trajectoryStats.progress}
                        stable={trajectoryStats.stable}
                        regression={trajectoryStats.regression}
                        total={trajectoryStats.total}
                        lang={lang}
                      />
                      <div className="grid grid-cols-3 gap-3 mt-4">
                        <KpiTile label={ar ? 'تقدم ملحوظ' : 'Progress'} value={trajectoryStats.progress} color="bg-green-50 border-green-200" sub={`${round2((trajectoryStats.progress / trajectoryStats.total) * 100)}%`} />
                        <KpiTile label={ar ? 'مستقر' : 'Stable'} value={trajectoryStats.stable} color="bg-blue-50 border-blue-200" sub={`${round2((trajectoryStats.stable / trajectoryStats.total) * 100)}%`} />
                        <KpiTile label={ar ? 'تراجع' : 'Regression'} value={trajectoryStats.regression} color="bg-red-50 border-red-200" sub={`${round2((trajectoryStats.regression / trajectoryStats.total) * 100)}%`} />
                      </div>
                    </div>
                  )}

                  {/* Progress curve — avg score per year */}
                  {years.length >= 2 && trendData.subjects.length > 0 && (
                    <div>
                      <h4 className="text-sm font-semibold text-gray-600 mb-2">
                        {ar ? 'منحنى التقدم — المتوسط السنوي عبر السنوات' : 'Progress Curve — Annual Average Across Years'}
                      </h4>
                      <TrendLineChart yearData={trendData.yearRows} subjects={trendData.subjects} lang={lang} />
                    </div>
                  )}

                  {(years.length < 2 && !progressSummary) && (
                    <p className="text-sm text-gray-400 text-center py-6">
                      {ar ? 'يتطلب هذا القسم بيانات سنتين دراسيتين على الأقل' : 'This section requires at least 2 academic years of data'}
                    </p>
                  )}
                </div>
              )}
            </section>

          </div>
        )}

        {/* Footer */}
        <div className="px-8 pb-6 print:px-6 border-t mt-6 pt-4 flex justify-between items-center text-xs text-gray-400">
          <span>{ar ? 'مدرسة خالد بن الوليد — فريق جودة انجازات الطلبة' : 'Khalid bin Al-Walid School — Student Achievement Quality Team'}</span>
          <span>{today}</span>
        </div>
      </div>
    </div>
  )
}
