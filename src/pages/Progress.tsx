import { useState, useMemo } from 'react'
import { t } from '@/i18n/translations'
import type { Language, AnalysisFilter, SubjectCode, Semester } from '@/types'
import { dataStore } from '@/store/dataStore'
import { filterRecords, computeProgress, computeSemesterProgress, computeMultiYearProgress } from '@/utils/statistics'
import type { MultiYearRow } from '@/utils/statistics'
import { SUBJECT_LABELS } from '@/utils/subjectMapping'
import FilterBar from '@/components/ui/FilterBar'
import ProgressPieChart from '@/components/charts/ProgressPieChart'
import clsx from 'clsx'

interface ProgressProps {
  lang: Language
}

const CATEGORY_STYLE: Record<string, string> = {
  significant_progress: 'text-green-600 font-semibold',
  slight_progress: 'text-blue-500', // merged into stable
  stable: 'text-blue-500',
  regression: 'text-red-500',
  no_baseline: 'text-gray-400',
}

const CATEGORY_LABEL_KEY: Record<string, 'progress_significant' | 'progress_slight' | 'progress_stable' | 'progress_regression' | 'progress_no_baseline'> = {
  significant_progress: 'progress_significant',
  slight_progress: 'progress_stable', // merged into stable
  stable: 'progress_stable',
  regression: 'progress_regression',
  no_baseline: 'progress_no_baseline',
}

export default function Progress({ lang }: ProgressProps) {
  const [filter, setFilter] = useState<AnalysisFilter>(() => {
    const ys = dataStore.getYears()
    return { semester: 'annual', yearId: ys[ys.length - 1] }
  })
  const [baselineMode, setBaselineMode] = useState<'previous' | 'diagnostic'>('previous')
  const [view, setView] = useState<'summary' | 'semester' | 'multiyear'>('summary')

  const years = dataStore.getYears()

  const currentYear = filter.yearId ?? years[years.length - 1] ?? ''
  const prevYear = years[years.indexOf(currentYear) - 1] ?? ''

  const currentRecords = useMemo(() => {
    const r = dataStore.getRecordsByYear(currentYear)
    return filterRecords(r, { grade: filter.grade, section: filter.section, track: filter.track, nationality: filter.nationality })
  }, [currentYear, filter])

  const previousRecords = useMemo(() => prevYear ? dataStore.getRecordsByYear(prevYear) : [], [prevYear])
  const diagnosticScores = useMemo(() => dataStore.getDiagnosticScores(currentYear), [currentYear])

  const subject = (filter.subjectCode ?? 'arabic') as SubjectCode
  const semester = (filter.semester ?? 'annual') as Semester | 'annual'

  const progressResults = useMemo(() => {
    if (!currentYear) return []
    return computeProgress(
      currentRecords, previousRecords, diagnosticScores,
      subject, semester, baselineMode,
    )
  }, [currentRecords, previousRecords, diagnosticScores, subject, semester, baselineMode])

  const semesterProgress = useMemo(() => {
    if (!currentYear || view !== 'semester') return []
    return computeSemesterProgress(
      currentRecords, previousRecords, diagnosticScores,
      subject, baselineMode,
    )
  }, [currentRecords, previousRecords, diagnosticScores, subject, baselineMode, view])

  const multiYearRows = useMemo(() => {
    if (view !== 'multiyear') return []

    // Anchor: students are identified by their grade in the LATEST (current) year.
    // Past years are searched without grade filter — students move up a grade each year.
    const latestYear = years[years.length - 1]
    const latestFiltered = filterRecords(
      dataStore.getRecordsByYear(latestYear ?? ''),
      { grade: filter.grade, section: filter.section, track: filter.track, nationality: filter.nationality }
    )
    const anchorIds = (filter.grade || filter.section)
      ? new Set(latestFiltered.map(r => r.student.id))
      : undefined

    const allYearRecords = years.map(yId => ({
      yearId: yId,
      records: dataStore.getRecordsByYear(yId), // unfiltered — anchor handles selection
    }))
    return computeMultiYearProgress(allYearRecords, subject, semester, anchorIds)
  }, [view, years, subject, semester, filter.grade, filter.section, filter.track, filter.nationality])

  if (years.length === 0) {
    return <div className="card text-center py-12 text-gray-500">{t('no_data')}</div>
  }

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold">{t('progress_title')}</h1>

      <FilterBar filter={filter} onChange={f => setFilter({ ...f, semester: filter.semester })} lang={lang} showSubject showSemester showNationality showTrack />

      {/* Options */}
      <div className="flex flex-wrap gap-4 items-center">
        <div className="flex gap-2">
          <button
            className={clsx('px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors', baselineMode === 'previous' ? 'bg-primary-600 text-white border-primary-600' : 'border-gray-300 text-gray-600')}
            onClick={() => setBaselineMode('previous')}
          >
            {t('progress_mode_prev')} {prevYear ? `(${prevYear})` : ''}
          </button>
          <button
            className={clsx('px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors', baselineMode === 'diagnostic' ? 'bg-primary-600 text-white border-primary-600' : 'border-gray-300 text-gray-600')}
            onClick={() => setBaselineMode('diagnostic')}
          >
            {t('progress_mode_diag')}
          </button>
        </div>

        <div className="flex gap-2">
          <button
            className={clsx('px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors', view === 'summary' ? 'bg-gray-700 text-white border-gray-700' : 'border-gray-300 text-gray-600')}
            onClick={() => setView('summary')}
          >
            {lang === 'ar' ? 'ملخص' : 'Summary'}
          </button>
          <button
            className={clsx('px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors', view === 'semester' ? 'bg-gray-700 text-white border-gray-700' : 'border-gray-300 text-gray-600')}
            onClick={() => setView('semester')}
          >
            {t('progress_semester_view')}
          </button>
          <button
            className={clsx('px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors', view === 'multiyear' ? 'bg-primary-600 text-white border-primary-600' : 'border-gray-300 text-gray-600')}
            onClick={() => setView('multiyear')}
          >
            {lang === 'ar' ? 'المسار عبر السنوات' : 'Multi-Year Trend'}
          </button>
        </div>
      </div>

      {view === 'summary' && (
        <>
          <div className="card">
            <h2 className="font-semibold mb-3">{SUBJECT_LABELS[subject]?.[lang] ?? subject}</h2>
            {/* Data availability */}
            {progressResults.length > 0 && (() => {
              const withData = progressResults.filter(r => r.category !== 'no_baseline').length
              const pct = ((withData / progressResults.length) * 100).toFixed(0)
              return (
                <p className="text-xs text-gray-400 mb-3">
                  {lang === 'ar'
                    ? `البيانات المتوفرة: ${withData} من ${progressResults.length} طالب (${pct}%)`
                    : `Available data: ${withData} of ${progressResults.length} students (${pct}%)`}
                </p>
              )
            })()}
            <ProgressPieChart results={progressResults} />
          </div>

          <div className="card overflow-x-auto">
            <table className="table-base">
              <thead>
                <tr>
                  <th>{t('progress_student')}</th>
                  <th>{t('progress_baseline_score')}</th>
                  <th>{t('progress_current')}</th>
                  <th>{t('progress_diff')}</th>
                  <th>{t('progress_category')}</th>
                </tr>
              </thead>
              <tbody>
                {progressResults.map(r => (
                  <tr key={r.studentId}>
                    <td>{r.studentName}</td>
                    <td className="font-mono">{r.baselineScore ?? '—'}</td>
                    <td className="font-mono">{r.currentScore ?? '—'}</td>
                    <td className={clsx('font-mono', r.diff !== null && r.diff > 0 ? 'text-green-600' : r.diff !== null && r.diff < 0 ? 'text-red-500' : '')}>
                      {r.diff !== null ? (r.diff > 0 ? `+${r.diff.toFixed(1)}` : r.diff.toFixed(1)) : '—'}
                    </td>
                    <td className={CATEGORY_STYLE[r.category]}>
                      {t(CATEGORY_LABEL_KEY[r.category] ?? 'progress_no_baseline')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {view === 'semester' && (
        <div className="card overflow-x-auto">
          {/* Data availability for semester view */}
          {semesterProgress.length > 0 && (() => {
            const withAny = semesterProgress.filter(r => r.s1 !== null || r.s2 !== null || r.s3 !== null).length
            const withS1S2 = semesterProgress.filter(r => r.s1 !== null && r.s2 !== null).length
            const withAll3 = semesterProgress.filter(r => r.s1 !== null && r.s2 !== null && r.s3 !== null).length
            const total = semesterProgress.length
            return (
              <div className="flex flex-wrap gap-4 text-xs text-gray-500 mb-3 pb-3 border-b border-gray-100 dark:border-gray-700">
                <span>{lang === 'ar' ? `إجمالي الطلاب: ${total}` : `Total students: ${total}`}</span>
                <span className="text-blue-500">{lang === 'ar' ? `لديهم بيانات: ${withAny} (${((withAny/total)*100).toFixed(0)}%)` : `Any data: ${withAny} (${((withAny/total)*100).toFixed(0)}%)`}</span>
                <span className="text-green-500">{lang === 'ar' ? `ف1+ف2: ${withS1S2} (${((withS1S2/total)*100).toFixed(0)}%)` : `S1+S2: ${withS1S2} (${((withS1S2/total)*100).toFixed(0)}%)`}</span>
                <span className="text-primary-500">{lang === 'ar' ? `الفصول الثلاثة: ${withAll3} (${((withAll3/total)*100).toFixed(0)}%)` : `All 3 semesters: ${withAll3} (${((withAll3/total)*100).toFixed(0)}%)`}</span>
              </div>
            )
          })()}
          <table className="table-base">
            <thead>
              <tr>
                <th>{t('progress_student')}</th>
                <th>{t('progress_baseline_score')}</th>
                <th>{t('progress_s1')}</th>
                <th>{t('progress_base_to_s1')}</th>
                <th>{t('progress_s2')}</th>
                <th>{t('progress_s1_to_s2')}</th>
                <th>{t('progress_s3')}</th>
                <th>{t('progress_s12_to_s3')}</th>
              </tr>
            </thead>
            <tbody>
              {semesterProgress.map(r => (
                <tr key={r.studentId}>
                  <td>{r.studentName}</td>
                  <td className="font-mono">{r.baselineScore?.toFixed(1) ?? '—'}</td>
                  <td className="font-mono">{r.s1?.toFixed(1) ?? '—'}</td>
                  <td className={CATEGORY_STYLE[r.baseToS1 ?? 'no_baseline']}>{r.baseToS1 ? t(CATEGORY_LABEL_KEY[r.baseToS1]) : '—'}</td>
                  <td className="font-mono">{r.s2?.toFixed(1) ?? '—'}</td>
                  <td className={CATEGORY_STYLE[r.s1ToS2 ?? 'no_baseline']}>{r.s1ToS2 ? t(CATEGORY_LABEL_KEY[r.s1ToS2]) : '—'}</td>
                  <td className="font-mono">{r.s3?.toFixed(1) ?? '—'}</td>
                  <td className={CATEGORY_STYLE[r.s12ToS3 ?? 'no_baseline']}>{r.s12ToS3 ? t(CATEGORY_LABEL_KEY[r.s12ToS3]) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {view === 'multiyear' && <MultiYearView rows={multiYearRows} years={years} lang={lang} subject={subject} totalCurrentStudents={currentRecords.length} />}
    </div>
  )
}

// ── Multi-Year Trajectory Panel ──────────────────────────────────────────────

const CAT_DOT: Record<string, string> = {
  significant_progress: 'bg-green-500',
  stable: 'bg-blue-400',
  regression: 'bg-red-500',
  no_baseline: 'bg-gray-300',
}

const CAT_CHIP: Record<string, string> = {
  significant_progress: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  stable: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  regression: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  no_baseline: 'bg-gray-100 text-gray-500',
}

function catLabel(cat: string, lang: Language): string {
  if (cat === 'significant_progress') return lang === 'ar' ? 'تقدم ملحوظ' : 'Progress'
  if (cat === 'stable') return lang === 'ar' ? 'مستقر' : 'Stable'
  if (cat === 'regression') return lang === 'ar' ? 'تراجع' : 'Regressed'
  return '—'
}

function DiffCell({ diff }: { diff: number | null }) {
  if (diff === null) return <td className="font-mono text-gray-300 text-center">—</td>
  const color = diff > 4 ? 'text-green-600' : diff >= 0 ? 'text-blue-500' : 'text-red-500'
  return <td className={clsx('font-mono text-center text-sm', color)}>{diff > 0 ? `+${diff.toFixed(1)}` : diff.toFixed(1)}</td>
}

function MultiYearView({ rows, years, lang, subject, totalCurrentStudents }: {
  rows: MultiYearRow[]
  years: string[]
  lang: Language
  subject: SubjectCode
  totalCurrentStudents: number
}) {
  const ar = lang === 'ar'

  // Summary counts for overall trend
  const tracked = rows.filter(r => r.overallCategory !== null).length
  const progress = rows.filter(r => r.overallCategory === 'significant_progress').length
  const stable = rows.filter(r => r.overallCategory === 'stable').length
  const regression = rows.filter(r => r.overallCategory === 'regression').length
  // Data availability: how many current students have multi-year tracking
  const availPct = totalCurrentStudents > 0 ? ((tracked / totalCurrentStudents) * 100).toFixed(0) : '0'

  return (
    <div className="space-y-4">

      {/* Data availability notice */}
      <div className="text-xs text-gray-400 flex gap-2 items-center">
        <span className="px-2 py-0.5 rounded-full bg-gray-100 dark:bg-gray-800">
          {ar
            ? `البيانات المتوفرة: ${tracked} من ${totalCurrentStudents} طالب (${availPct}%)`
            : `Available data: ${tracked} of ${totalCurrentStudents} students (${availPct}%)`}
        </span>
      </div>

      {/* Summary KPI strip */}
      {tracked > 0 && (
        <div className="grid grid-cols-4 gap-3">
          {[
            { label: ar ? 'إجمالي المتابَعين' : 'Tracked', value: tracked, color: 'text-gray-700 dark:text-gray-200' },
            { label: ar ? 'تقدم ملحوظ' : 'Progress', value: progress, color: 'text-green-600 dark:text-green-400' },
            { label: ar ? 'مستقر' : 'Stable', value: stable, color: 'text-blue-600 dark:text-blue-400' },
            { label: ar ? 'تراجع' : 'Regressed', value: regression, color: 'text-red-600 dark:text-red-400' },
          ].map(k => (
            <div key={k.label} className="metric-card">
              <p className="text-xs text-gray-400">{k.label}</p>
              <p className={clsx('text-2xl font-bold', k.color)}>{k.value}</p>
              {tracked > 0 && k.value !== tracked && (
                <p className="text-xs text-gray-400">{((k.value / tracked) * 100).toFixed(0)}%</p>
              )}
            </div>
          ))}
        </div>
      )}

      {rows.length === 0 ? (
        <div className="card text-center py-10 text-gray-400">
          {ar ? 'لا توجد بيانات للعرض' : 'No data available'}
        </div>
      ) : (
        <div className="card overflow-x-auto">
          <p className="text-xs text-gray-400 mb-3">
            {ar
              ? `مسار ${SUBJECT_LABELS[subject]?.[lang] ?? subject} عبر ${years.length} سنوات دراسية`
              : `${SUBJECT_LABELS[subject]?.en ?? subject} trajectory across ${years.length} academic years`}
          </p>
          <table className="table-base w-full">
            <thead>
              <tr>
                <th className="text-start">{ar ? 'الطالب' : 'Student'}</th>
                <th className="text-center text-xs">{ar ? 'الصف الحالي' : 'Current Grade'}</th>
                {years.map(y => (
                  <th key={y} className="text-center">{y}</th>
                ))}
                {years.slice(1).map((y, i) => (
                  <th key={`d${i}`} className="text-center text-xs">
                    Δ {years[i]} → {y}
                  </th>
                ))}
                <th className="text-center">{ar ? 'الاتجاه الكلي' : 'Overall'}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.studentId}>
                  <td className="whitespace-nowrap">{r.studentName}</td>
                  <td className="text-center text-xs text-gray-500 whitespace-nowrap">
                    {r.currentGrade ? `${ar ? 'الصف' : 'G'} ${r.currentGrade}` : '—'}
                    {r.currentSection ? ` / ${r.currentSection}` : ''}
                  </td>
                  {r.scores.map((s, i) => (
                    <td key={i} className="font-mono text-center text-sm">
                      {s !== null ? s.toFixed(1) : <span className="text-gray-300">—</span>}
                    </td>
                  ))}
                  {r.diffs.map((d, i) => <DiffCell key={i} diff={d} />)}
                  <td className="text-center">
                    {r.overallCategory ? (
                      <span className={clsx('inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium', CAT_CHIP[r.overallCategory])}>
                        <span className={clsx('w-1.5 h-1.5 rounded-full', CAT_DOT[r.overallCategory])} />
                        {catLabel(r.overallCategory, lang)}
                        {r.overallDiff !== null && (
                          <span className="opacity-70">({r.overallDiff > 0 ? '+' : ''}{r.overallDiff.toFixed(1)})</span>
                        )}
                      </span>
                    ) : <span className="text-gray-300 text-xs">—</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
