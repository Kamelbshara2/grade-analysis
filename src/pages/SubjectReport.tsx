import { useState, useMemo, useRef } from 'react'
import { Printer } from 'lucide-react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell, ReferenceLine, Legend,
} from 'recharts'
import { dataStore } from '@/store/dataStore'
import {
  filterRecords, computeSubjectStats, computeProgress,
  computeSemesterGaps, computeSemesterGapsFromTermScores,
  round2,
} from '@/utils/statistics'
import { SUBJECT_LABELS, getCycle } from '@/utils/subjectMapping'
import type { Language, SubjectCode, AnalysisFilter, Semester } from '@/types'
import FilterBar from '@/components/ui/FilterBar'
import StatCard from '@/components/ui/StatCard'
import BandBarChart from '@/components/charts/BandBarChart'

interface SubjectReportProps { lang: Language }

const PROGRESS_BAR_COLORS: Record<string, string> = {
  significant_progress: '#16a34a',
  slight_progress: '#3b82f6',
  stable: '#3b82f6',
  regression: '#ef4444',
  no_baseline: '#9ca3af',
}

export default function SubjectReport({ lang }: SubjectReportProps) {
  const ar = lang === 'ar'
  const printRef = useRef<HTMLDivElement>(null)

  const [filter, setFilter] = useState<AnalysisFilter>(() => {
    const years = dataStore.getYears()
    return {
      semester: 'annual',
      yearId: years[years.length - 1],
      subjectCode: 'arabic' as SubjectCode,
    }
  })

  const years = dataStore.getYears()

  const currentYear = filter.yearId ?? years[years.length - 1] ?? ''
  const prevYear = years[years.indexOf(currentYear) - 1] ?? ''

  const records = useMemo(() => {
    const all = filter.yearId
      ? dataStore.getRecordsByYear(filter.yearId)
      : dataStore.getAllRecords()
    let allowedIds: Set<string> | undefined
    if (filter.studentGroup && filter.yearId) {
      const groups = dataStore.getStudentGroups(filter.yearId)
      allowedIds = filter.studentGroup === 'returning' ? groups.returning : groups.newTransfer
    }
    return filterRecords(all, { grade: filter.grade, section: filter.section, track: filter.track }, allowedIds)
  }, [filter])

  const cycle = useMemo(() => {
    if (records.length > 0) return getCycle(records[0].grade)
    if (filter.grade) return getCycle(filter.grade)
    return 3 as const
  }, [records, filter.grade])

  const subject = (filter.subjectCode ?? 'arabic') as SubjectCode
  const semester = (filter.semester ?? 'annual') as Semester | 'annual'

  const subjectLabel = SUBJECT_LABELS[subject]?.[lang] ?? subject

  // ── Indicator 1.1: Achievement stats ─────────────────────────────────────────
  const stats = useMemo(
    () => computeSubjectStats(records, subject, semester, cycle),
    [records, subject, semester, cycle]
  )

  // ── Indicator 1.2: Progress trends ───────────────────────────────────────────
  const previousRecords = useMemo(
    () => prevYear ? dataStore.getRecordsByYear(prevYear) : [],
    [prevYear]
  )
  const diagnosticScores = useMemo(
    () => dataStore.getDiagnosticScores(currentYear),
    [currentYear]
  )

  const progressResults = useMemo(() => {
    if (!currentYear || records.length === 0) return []
    return computeProgress(records, previousRecords, diagnosticScores, subject, semester, 'previous')
  }, [records, previousRecords, diagnosticScores, subject, semester, currentYear])

  const progressSummary = useMemo(() => {
    const sig = progressResults.filter(r => r.category === 'significant_progress').length
    const slight = progressResults.filter(r => r.category === 'slight_progress').length
    const stable = progressResults.filter(r => r.category === 'stable').length
    const reg = progressResults.filter(r => r.category === 'regression').length
    const noBase = progressResults.filter(r => r.category === 'no_baseline').length
    const total = progressResults.length
    return [
      { key: 'significant_progress', labelAr: 'تقدم ملحوظ', labelEn: 'Significant Progress', count: sig, pct: total > 0 ? round2((sig / total) * 100) : 0 },
      { key: 'stable', labelAr: 'مستقر', labelEn: 'Stable', count: stable + slight, pct: total > 0 ? round2(((stable + slight) / total) * 100) : 0 },
      { key: 'regression', labelAr: 'تراجع', labelEn: 'Regression', count: reg, pct: total > 0 ? round2((reg / total) * 100) : 0 },
      { key: 'no_baseline', labelAr: 'بدون خط أساس', labelEn: 'No Baseline', count: noBase, pct: total > 0 ? round2((noBase / total) * 100) : 0 },
    ]
  }, [progressResults])

  // ── Indicator 1.3: Gap analysis ───────────────────────────────────────────────
  const gaps = useMemo(() => {
    const g = computeSemesterGaps(records)
    if (g.length > 0) return g
    if (filter.yearId) {
      const termScores = dataStore.getTermScores(filter.yearId)
      if (termScores.length > 0) return computeSemesterGapsFromTermScores(termScores, { grade: filter.grade, section: filter.section })
    }
    return g
  }, [records, filter.yearId, filter.grade, filter.section])

  const subjectGap = gaps.find(g => g.subjectCode === subject) ?? null

  const gapChartData = subjectGap ? [
    { name: ar ? 'ف1' : 'S1', avg: subjectGap.avgS1 ?? 0 },
    { name: ar ? 'ف2' : 'S2', avg: subjectGap.avgS2 ?? 0 },
    { name: ar ? 'ف3' : 'S3', avg: subjectGap.avgS3 ?? 0 },
  ].filter(d => d.avg > 0) : []

  function handlePrint() {
    window.print()
  }

  if (years.length === 0) {
    return <div className="card text-center py-12 text-gray-500">{ar ? 'لا توجد بيانات' : 'No data'}</div>
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">
          {ar ? 'تقرير المادة الدراسية' : 'Subject Report'}
        </h1>
        <button className="btn-secondary flex items-center gap-2" onClick={handlePrint}>
          <Printer size={15} />
          {ar ? 'طباعة' : 'Print'}
        </button>
      </div>

      <FilterBar
        filter={filter}
        onChange={setFilter}
        lang={lang}
        showSubject
        showSemester
        showTrack
        showStudentGroup
      />

      {stats.count === 0 ? (
        <div className="card text-center py-12 text-gray-400">
          {ar ? 'لا توجد بيانات لهذه المادة' : 'No data for this subject'}
        </div>
      ) : (
        <div ref={printRef} className="space-y-6 print:space-y-4">
          {/* Header */}
          <div className="card print:shadow-none print:border">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="text-lg font-bold text-primary-700">{subjectLabel}</h2>
                <p className="text-sm text-gray-500">
                  {filter.yearId ?? (ar ? 'كل الأعوام' : 'All Years')}
                  {filter.grade ? ` · ${ar ? 'الصف' : 'Grade'} ${filter.grade}` : ''}
                  {filter.track ? ` · ${ar ? (filter.track === 'general' ? 'عام' : 'متقدم') : filter.track}` : ''}
                  {` · ${records.length} ${ar ? 'طالب' : 'students'}`}
                </p>
              </div>
              <span className="text-xs text-gray-400 print:hidden">
                {ar ? 'التقرير الشامل للمادة' : 'Comprehensive Subject Report'}
              </span>
            </div>
          </div>

          {/* ── 1.1 Achievement ────────────────────────────────────────────────── */}
          <div className="card">
            <h3 className="font-semibold mb-4 text-sm text-gray-700 dark:text-gray-300 border-b pb-2">
              {ar ? 'المؤشر 1.1 — نسبة الإنجاز الأكاديمي' : 'Indicator 1.1 — Academic Achievement Rate'}
            </h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
              <StatCard label={ar ? 'عدد الطلاب' : 'Students'} value={stats.count} color="blue" />
              <StatCard label={ar ? 'نسبة النجاح' : 'Pass Rate'} value={`${round2(stats.passRate)}%`} color="green" />
              <StatCard label={ar ? 'نسبة الرسوب' : 'Fail Rate'} value={`${round2(stats.failRate)}%`} color="red" />
              <StatCard label={ar ? 'نسبة ≥ 90' : '≥90 Rate'} value={`${round2(stats.above90Rate)}%`} sub={`${stats.above90Count}`} color="yellow" />
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
              <StatCard label={ar ? 'المتوسط' : 'Mean'} value={round2(stats.mean)} />
              <StatCard label={ar ? 'الوسيط' : 'Median'} value={round2(stats.median)} />
              <StatCard label={ar ? 'الانحراف المعياري' : 'Std Dev'} value={round2(stats.stdDev)} />
              <StatCard label={ar ? 'ر1 / ر3' : 'Q1 / Q3'} value={`${round2(stats.q1)} / ${round2(stats.q3)}`} />
            </div>
            <BandBarChart stats={stats} />
          </div>

          {/* ── 1.2 Progress ───────────────────────────────────────────────────── */}
          {progressResults.length > 0 && (
            <div className="card">
              <h3 className="font-semibold mb-4 text-sm text-gray-700 dark:text-gray-300 border-b pb-2">
                {ar ? 'المؤشر 1.2 — اتجاهات التقدم' : 'Indicator 1.2 — Progress Trends'}
              </h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
                {progressSummary.map(p => (
                  <StatCard
                    key={p.key}
                    label={ar ? p.labelAr : p.labelEn}
                    value={p.count}
                    sub={`${p.pct}%`}
                    color={p.key === 'significant_progress' ? 'green' : p.key === 'regression' ? 'red' : undefined}
                  />
                ))}
              </div>
              <ResponsiveContainer width="100%" height={180}>
                <BarChart
                  data={progressSummary.filter(p => p.key !== 'no_baseline')}
                  margin={{ top: 5, right: 10, left: -10, bottom: 5 }}
                >
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey={ar ? 'labelAr' : 'labelEn'} tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 10 }} unit="%" domain={[0, 100]} />
                  <Tooltip formatter={(v: number) => `${v}%`} />
                  <Bar dataKey="pct" name={ar ? 'النسبة' : 'Rate'} radius={[4, 4, 0, 0]}>
                    {progressSummary.filter(p => p.key !== 'no_baseline').map((p) => (
                      <Cell key={p.key} fill={PROGRESS_BAR_COLORS[p.key]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* ── 1.3 Gap Analysis ───────────────────────────────────────────────── */}
          {subjectGap && (
            <div className="card">
              <h3 className="font-semibold mb-4 text-sm text-gray-700 dark:text-gray-300 border-b pb-2">
                {ar ? 'المؤشر 1.3 — تحليل الفجوة الفصلية' : 'Indicator 1.3 — Semester Gap Analysis'}
              </h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
                <StatCard
                  label={ar ? 'الفجوة ف1→ف3' : 'Gap S1→S3'}
                  value={subjectGap.gapS1S3 !== null ? (subjectGap.gapS1S3 > 0 ? `+${round2(subjectGap.gapS1S3)}` : `${round2(subjectGap.gapS1S3)}`) : '—'}
                  color={subjectGap.gapS1S3 !== null && subjectGap.gapS1S3 < 0 ? 'red' : 'green'}
                />
                <StatCard label={ar ? 'متوسط ف1' : 'Avg S1'} value={subjectGap.avgS1 !== null ? round2(subjectGap.avgS1) : '—'} />
                <StatCard label={ar ? 'متوسط ف2' : 'Avg S2'} value={subjectGap.avgS2 !== null ? round2(subjectGap.avgS2) : '—'} />
                <StatCard label={ar ? 'متوسط ف3' : 'Avg S3'} value={subjectGap.avgS3 !== null ? round2(subjectGap.avgS3) : '—'} />
              </div>
              {gapChartData.length > 0 && (
                <ResponsiveContainer width="100%" height={180}>
                  <BarChart data={gapChartData} margin={{ top: 5, right: 10, left: -10, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                    <YAxis tick={{ fontSize: 10 }} domain={[0, 100]} />
                    <Tooltip />
                    <ReferenceLine y={60} stroke="#9ca3af" strokeDasharray="3 3" />
                    <Bar dataKey="avg" name={ar ? 'المتوسط' : 'Average'} fill="#3b82f6" radius={[4, 4, 0, 0]}>
                      {gapChartData.map((_, i) => (
                        <Cell key={i} fill={['#3b82f6', '#10b981', '#f59e0b'][i % 3]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
              <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
                <div className="bg-red-50 dark:bg-red-900/20 rounded-lg p-3">
                  <p className="text-red-700 dark:text-red-400 font-medium">
                    {ar ? 'طلاب بتراجع' : 'Students with Drop'}
                  </p>
                  <p className="text-2xl font-bold text-red-600">{subjectGap.studentsWithDrop}</p>
                  {subjectGap.totalStudents > 0 && (
                    <p className="text-xs text-red-500">
                      {round2((subjectGap.studentsWithDrop / subjectGap.totalStudents) * 100)}%
                    </p>
                  )}
                </div>
                <div className="bg-green-50 dark:bg-green-900/20 rounded-lg p-3">
                  <p className="text-green-700 dark:text-green-400 font-medium">
                    {ar ? 'طلاب بتحسن' : 'Students with Gain'}
                  </p>
                  <p className="text-2xl font-bold text-green-600">{subjectGap.studentsWithGain}</p>
                  {subjectGap.totalStudents > 0 && (
                    <p className="text-xs text-green-500">
                      {round2((subjectGap.studentsWithGain / subjectGap.totalStudents) * 100)}%
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
