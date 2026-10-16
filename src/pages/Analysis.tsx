import { useState, useMemo } from 'react'
import { t } from '@/i18n/translations'
import type { Language, AnalysisFilter, SubjectCode, Semester } from '@/types'
import { dataStore } from '@/store/dataStore'
import { filterRecords, computeSubjectStats, computeSchoolStats, round2 } from '@/utils/statistics'
import { getCycle, SUBJECT_LABELS, getCycleSubjects } from '@/utils/subjectMapping'
import FilterBar from '@/components/ui/FilterBar'
import StatCard from '@/components/ui/StatCard'
import BandBarChart from '@/components/charts/BandBarChart'
import SubjectCompareChart from '@/components/charts/SubjectCompareChart'

interface AnalysisProps {
  lang: Language
}

export default function Analysis({ lang }: AnalysisProps) {
  const [filter, setFilter] = useState<AnalysisFilter>(() => {
    const years = dataStore.getYears()
    return { semester: 'annual', yearId: years[years.length - 1] }
  })

  const records = useMemo(() => {
    const all = filter.yearId
      ? dataStore.getRecordsByYear(filter.yearId)
      : dataStore.getAllRecords()
    return filterRecords(all, filter)
  }, [filter])

  const cycle = useMemo(() => {
    if (records.length > 0) return getCycle(records[0].grade)
    if (filter.grade) return getCycle(filter.grade)
    return 3 as const
  }, [records, filter.grade])

  const semester = (filter.semester ?? 'annual') as Semester | 'annual'

  const subjectStatsList = useMemo(() => {
    const subjects = getCycleSubjects(cycle)
    return subjects
      .map(s => computeSubjectStats(records, s, semester, cycle))
      .filter(s => s.count > 0)
  }, [records, cycle, semester])

  const selectedSubjectStats = useMemo(() => {
    if (!filter.subjectCode) return null
    return computeSubjectStats(records, filter.subjectCode as SubjectCode, semester, cycle)
  }, [records, filter.subjectCode, semester, cycle])

  const statsToShow = selectedSubjectStats ?? (subjectStatsList[0] ?? null)

  const schoolStats = useMemo(() => computeSchoolStats(records, semester), [records, semester])

  if (dataStore.getYears().length === 0) {
    return <div className="card text-center py-12 text-gray-500">{t('no_data')}</div>
  }

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold">{t('analysis_title')}</h1>

      <FilterBar
        filter={filter}
        onChange={setFilter}
        lang={lang}
        showSubject
        showSemester
        showNationality
        showTrack
      />

      <p className="text-sm text-gray-500">
        {records.length} {t('students')}
      </p>

      {/* School-wide Summary */}
      {schoolStats.count > 0 && (
        <div className="card border-l-4 border-primary-500">
          <h2 className="font-semibold mb-3 text-primary-700">{lang === 'ar' ? 'مستوى المدرسة — متوسط الطلاب عبر جميع المواد' : 'School Level — Student Average Across All Subjects'}</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <StatCard label={lang === 'ar' ? 'إجمالي الطلاب' : 'Total Students'} value={schoolStats.count} color="blue" />
            <StatCard label={lang === 'ar' ? 'طلاب متوسطهم ≥75%' : 'Students avg ≥75%'} value={schoolStats.above75Count} sub={`${schoolStats.above75Rate}%`} color="green" />
            <StatCard label={lang === 'ar' ? 'متوسط المدرسة' : 'School Mean'} value={`${schoolStats.mean}%`} color="yellow" />
            <div className="rounded-xl border p-3 flex flex-col items-center justify-center gap-1 bg-gray-50 dark:bg-gray-800">
              <div className="text-2xl font-bold text-primary-600">{schoolStats.above75Rate}%</div>
              <div className="text-xs text-gray-500 text-center">{lang === 'ar' ? '% طلاب فوق 75' : '% above 75 avg'}</div>
              <div className={`text-xs font-semibold mt-1 px-2 py-0.5 rounded-full ${schoolStats.above75Rate >= 70 ? 'bg-green-100 text-green-700' : schoolStats.above75Rate >= 50 ? 'bg-yellow-100 text-yellow-700' : 'bg-red-100 text-red-700'}`}>
                {schoolStats.above75Rate >= 70 ? (lang === 'ar' ? 'ممتاز' : 'Excellent') : schoolStats.above75Rate >= 50 ? (lang === 'ar' ? 'جيد' : 'Good') : (lang === 'ar' ? 'يحتاج تحسين' : 'Needs improvement')}
              </div>
            </div>
          </div>
        </div>
      )}

      {statsToShow && (
        <>
          {/* Key Stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <StatCard label={t('analysis_count')} value={statsToShow.count} color="blue" />
            <StatCard label={lang === 'ar' ? 'طلاب ≥75%' : 'Students ≥75%'} value={statsToShow.above75Count} sub={`${round2(statsToShow.above75Rate)}%`} color="green" />
            <StatCard label={t('analysis_fail_rate')} value={`${round2(statsToShow.failRate)}%`} color="red" />
            <StatCard label={t('analysis_above90')} value={statsToShow.above90Count} sub={`${round2(statsToShow.above90Rate)}%`} color="yellow" />
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <StatCard label={t('analysis_mean')} value={round2(statsToShow.mean)} />
            <StatCard label={t('analysis_median')} value={round2(statsToShow.median)} />
            <StatCard label={t('analysis_std')} value={round2(statsToShow.stdDev)} />
            <StatCard label={`${t('analysis_q1')} / ${t('analysis_q3')}`} value={`${round2(statsToShow.q1)} / ${round2(statsToShow.q3)}`} />
          </div>

          {/* Distribution Chart */}
          <div className="card">
            <h2 className="font-semibold mb-3">{t('analysis_distribution')}</h2>
            <BandBarChart stats={statsToShow} />
          </div>
        </>
      )}

      {/* Subject Comparison */}
      {subjectStatsList.length > 1 && (
        <div className="card">
          <h2 className="font-semibold mb-3">{t('analysis_by_subject')}</h2>
          <SubjectCompareChart statsList={subjectStatsList} lang={lang} />

          <div className="mt-4 overflow-x-auto">
            <table className="table-base">
              <thead>
                <tr>
                  <th>{t('subject')}</th>
                  <th>{t('analysis_count')}</th>
                  <th>{lang === 'ar' ? 'فوق 75%' : 'Above 75%'}</th>
                  <th>{t('analysis_pass_rate')}</th>
                  <th>{t('analysis_fail_rate')}</th>
                  <th>{t('analysis_mean')}</th>
                  <th>{t('analysis_above90')}</th>
                </tr>
              </thead>
              <tbody>
                {subjectStatsList.map(s => (
                  <tr key={s.subjectCode}>
                    <td className="font-medium">
                      {SUBJECT_LABELS[s.subjectCode]?.[lang] ?? s.subjectCode}
                    </td>
                    <td>{s.count}</td>
                    <td>
                      <span className={`font-semibold ${s.above75Rate >= 70 ? 'text-green-600' : s.above75Rate >= 50 ? 'text-yellow-600' : 'text-red-500'}`}>
                        {round2(s.above75Rate)}%
                      </span>
                    </td>
                    <td className="text-green-600">{round2(s.passRate)}%</td>
                    <td className="text-red-500">{round2(s.failRate)}%</td>
                    <td>{round2(s.mean)}</td>
                    <td>{round2(s.above90Rate)}%</td>
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
