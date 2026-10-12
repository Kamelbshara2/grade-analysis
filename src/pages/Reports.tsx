import { useState, useMemo } from 'react'
import { Printer } from 'lucide-react'
import { t } from '@/i18n/translations'
import type { Language, AnalysisFilter, SubjectCode, Semester } from '@/types'
import { dataStore } from '@/store/dataStore'
import { filterRecords, computeSubjectStats, extractScores, round2 } from '@/utils/statistics'
import { getCycle, SUBJECT_LABELS, getCycleSubjects } from '@/utils/subjectMapping'
import FilterBar from '@/components/ui/FilterBar'
import StatCard from '@/components/ui/StatCard'
import BandBarChart from '@/components/charts/BandBarChart'
import SubjectCompareChart from '@/components/charts/SubjectCompareChart'
import NormalDistributionChart from '@/components/charts/NormalDistributionChart'

interface ReportsProps {
  lang: Language
}

export default function Reports({ lang }: ReportsProps) {
  const [filter, setFilter] = useState<AnalysisFilter>({ semester: 'annual' })
  const [schoolName, setSchoolName] = useState(() => localStorage.getItem('school_name') || '')
  const [selectedSubject, setSelectedSubject] = useState<SubjectCode | ''>('')

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
    return getCycleSubjects(cycle)
      .map(s => computeSubjectStats(records, s, semester, cycle))
      .filter(s => s.count > 0)
  }, [records, cycle, semester])

  // Overall stats (aggregate across all subjects, use first subject with data as proxy)
  const firstStats = subjectStatsList[0]

  // Section analysis
  const sectionStats = useMemo(() => {
    const sections = [...new Set(records.map(r => r.section))].sort()
    if (sections.length <= 1 || subjectStatsList.length === 0) return []
    const subject = subjectStatsList[0].subjectCode
    return sections.map(sec => {
      const secRecords = records.filter(r => r.section === sec)
      const stats = computeSubjectStats(secRecords, subject, semester, cycle)
      return { section: sec, ...stats }
    }).filter(s => s.count > 0)
  }, [records, subjectStatsList, semester, cycle])

  // Normal distribution scores for selected subject (or first available)
  const normalDistSubject = (selectedSubject || subjectStatsList[0]?.subjectCode || 'arabic') as SubjectCode
  const normalDistScores = useMemo(() => {
    return extractScores(records, normalDistSubject, semester)
  }, [records, normalDistSubject, semester])

  function handlePrint() {
    window.print()
  }

  const today = new Date().toLocaleDateString(lang === 'ar' ? 'ar-AE' : 'en-AE')

  return (
    <div className="space-y-6">
      {/* Controls - hidden in print */}
      <div className="flex items-center justify-between no-print">
        <h1 className="text-xl font-bold">{t('reports_title')}</h1>
        <button className="btn-primary flex items-center gap-2" onClick={handlePrint}>
          <Printer size={15} />
          {t('print')}
        </button>
      </div>

      <div className="no-print space-y-4">
        <div className="flex gap-4 flex-wrap items-end">
          <div>
            <label className="label">{t('reports_school')}</label>
            <input
              className="input max-w-xs"
              value={schoolName}
              onChange={e => { setSchoolName(e.target.value); localStorage.setItem('school_name', e.target.value) }}
              placeholder={lang === 'ar' ? 'اسم المدرسة' : 'School name'}
            />
          </div>
          {subjectStatsList.length > 0 && (
            <div>
              <label className="label">{lang === 'ar' ? 'مادة التوزيع الطبيعي' : 'Subject for Distribution'}</label>
              <select
                className="input"
                value={selectedSubject}
                onChange={e => setSelectedSubject(e.target.value as SubjectCode | '')}
              >
                {subjectStatsList.map(s => (
                  <option key={s.subjectCode} value={s.subjectCode}>
                    {SUBJECT_LABELS[s.subjectCode]?.[lang] ?? s.subjectCode}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
        <FilterBar filter={filter} onChange={setFilter} lang={lang} showSubject={false} showSemester showNationality showTrack />
      </div>

      {/* ===== PRINTABLE REPORT ===== */}
      <div className="bg-white dark:bg-gray-900 rounded-xl shadow p-8 space-y-8 print:shadow-none print:rounded-none print:p-0">

        {/* Report Header */}
        <div className="text-center border-b pb-6">
          <div className="w-16 h-16 bg-blue-100 dark:bg-blue-900/30 rounded-full mx-auto mb-3 flex items-center justify-center text-2xl">
            🏫
          </div>
          <h2 className="text-2xl font-bold text-gray-800 dark:text-gray-100">
            {schoolName || (lang === 'ar' ? 'المدرسة' : 'School')}
          </h2>
          <h3 className="text-lg font-semibold text-primary-600 mt-1">
            {lang === 'ar' ? 'تقرير تحليل الدرجات' : 'Grade Analysis Report'}
            {filter.yearId ? ` — ${filter.yearId}` : ''}
          </h3>
          <div className="flex justify-center gap-6 mt-2 text-sm text-gray-500">
            <span>{t('reports_date')}: {today}</span>
            {filter.grade && <span>{t('grade')}: {filter.grade}</span>}
            {filter.yearId && <span>{t('year')}: {filter.yearId}</span>}
          </div>
        </div>

        {/* No data state */}
        {records.length === 0 && (
          <div className="text-center py-12 text-gray-400">{t('no_data')}</div>
        )}

        {records.length > 0 && (
          <>
            {/* Summary Stat Cards */}
            <section>
              <h3 className="font-semibold text-base mb-4 text-gray-700 dark:text-gray-300">
                {lang === 'ar' ? 'الملخص الإحصائي' : 'Statistical Summary'}
              </h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <StatCard
                  label={t('analysis_count')}
                  value={records.length}
                  color="blue"
                />
                {firstStats && (
                  <>
                    <StatCard
                      label={t('analysis_pass_rate')}
                      value={`${round2(firstStats.passRate)}%`}
                      color="green"
                    />
                    <StatCard
                      label={t('analysis_fail_rate')}
                      value={`${round2(firstStats.failRate)}%`}
                      color="red"
                    />
                    <StatCard
                      label={t('analysis_above90')}
                      value={`${round2(firstStats.above90Rate)}%`}
                      color="yellow"
                    />
                  </>
                )}
              </div>
            </section>

            {/* Subject Comparison Chart */}
            {subjectStatsList.length > 1 && (
              <section>
                <h3 className="font-semibold text-base mb-4 text-gray-700 dark:text-gray-300">
                  {t('analysis_by_subject')}
                </h3>
                <SubjectCompareChart statsList={subjectStatsList} lang={lang} />
              </section>
            )}

            {/* Normal Distribution */}
            {normalDistScores.length > 0 && (
              <section>
                <h3 className="font-semibold text-base mb-2 text-gray-700 dark:text-gray-300">
                  {t('report_normal_dist')} — {SUBJECT_LABELS[normalDistSubject]?.[lang] ?? normalDistSubject}
                </h3>
                <NormalDistributionChart scores={normalDistScores} cycle={cycle} />
              </section>
            )}

            {/* Band Bar Chart for first subject */}
            {firstStats && (
              <section>
                <h3 className="font-semibold text-base mb-2 text-gray-700 dark:text-gray-300">
                  {lang === 'ar' ? 'توزيع النطاقات —' : 'Band Distribution —'}{' '}
                  {SUBJECT_LABELS[firstStats.subjectCode]?.[lang] ?? firstStats.subjectCode}
                </h3>
                <BandBarChart stats={firstStats} />
              </section>
            )}

            {/* Subject Stats Table */}
            {subjectStatsList.length > 0 && (
              <section>
                <h3 className="font-semibold text-base mb-3 text-gray-700 dark:text-gray-300">
                  {t('analysis_by_subject')}
                </h3>
                <div className="overflow-x-auto">
                  <table className="table-base w-full text-sm">
                    <thead>
                      <tr>
                        <th>{t('subject')}</th>
                        <th>{t('analysis_count')}</th>
                        <th>{t('analysis_pass_rate')}</th>
                        <th>{t('analysis_fail_rate')}</th>
                        <th>{t('analysis_mean')}</th>
                        <th>{t('analysis_median')}</th>
                        <th>{t('analysis_std')}</th>
                        <th>{t('analysis_above90')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {subjectStatsList.map(s => (
                        <tr key={s.subjectCode}>
                          <td className="font-medium">{SUBJECT_LABELS[s.subjectCode]?.[lang] ?? s.subjectCode}</td>
                          <td>{s.count}</td>
                          <td className="text-green-600">{round2(s.passRate)}%</td>
                          <td className="text-red-600">{round2(s.failRate)}%</td>
                          <td>{round2(s.mean)}</td>
                          <td>{round2(s.median)}</td>
                          <td>{round2(s.stdDev)}</td>
                          <td className="text-blue-600">{round2(s.above90Rate)}%</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            )}

            {/* Section Analysis */}
            {sectionStats.length > 0 && (
              <section>
                <h3 className="font-semibold text-base mb-3 text-gray-700 dark:text-gray-300">
                  {t('report_section_analysis')} — {SUBJECT_LABELS[sectionStats[0].subjectCode]?.[lang]}
                </h3>
                <div className="overflow-x-auto">
                  <table className="table-base w-full text-sm">
                    <thead>
                      <tr>
                        <th>{t('section')}</th>
                        <th>{t('analysis_count')}</th>
                        <th>{t('analysis_pass_rate')}</th>
                        <th>{t('analysis_mean')}</th>
                        <th>{t('analysis_median')}</th>
                        <th>{t('analysis_std')}</th>
                        <th>{t('analysis_above90')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sectionStats.map(s => (
                        <tr key={s.section}>
                          <td className="font-medium">{s.section}</td>
                          <td>{s.count}</td>
                          <td className={s.passRate >= 80 ? 'text-green-600' : s.passRate >= 60 ? 'text-yellow-600' : 'text-red-600'}>
                            {round2(s.passRate)}%
                          </td>
                          <td>{round2(s.mean)}</td>
                          <td>{round2(s.median)}</td>
                          <td>{round2(s.stdDev)}</td>
                          <td>{round2(s.above90Rate)}%</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            )}
          </>
        )}

        {/* Footer */}
        <div className="border-t pt-4 text-sm text-gray-400 text-end">
          {t('reports_prepared_by')}: {lang === 'ar' ? 'نظام تحليل الدرجات' : 'Grade Analysis System'} · {today}
        </div>
      </div>
    </div>
  )
}
