import { useState, useMemo } from 'react'
import { t } from '@/i18n/translations'
import type { Language, AnalysisFilter, SubjectCode, Semester } from '@/types'
import { dataStore } from '@/store/dataStore'
import { filterRecords, computeProgress, computeSemesterProgress } from '@/utils/statistics'
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
  const [view, setView] = useState<'summary' | 'semester'>('summary')

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
        </div>
      </div>

      {view === 'summary' && (
        <>
          <div className="card">
            <h2 className="font-semibold mb-3">{SUBJECT_LABELS[subject]?.[lang] ?? subject}</h2>
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
    </div>
  )
}
