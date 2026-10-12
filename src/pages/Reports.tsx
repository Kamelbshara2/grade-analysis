import { useState, useMemo } from 'react'
import { Printer } from 'lucide-react'
import { t } from '@/i18n/translations'
import type { Language, AnalysisFilter, SubjectCode, Semester } from '@/types'
import { dataStore } from '@/store/dataStore'
import { filterRecords, computeSubjectStats, round2 } from '@/utils/statistics'
import { getCycle, SUBJECT_LABELS, getCycleSubjects } from '@/utils/subjectMapping'
import FilterBar from '@/components/ui/FilterBar'

interface ReportsProps {
  lang: Language
}

export default function Reports({ lang }: ReportsProps) {
  const [filter, setFilter] = useState<AnalysisFilter>({ semester: 'annual' })
  const [schoolName, setSchoolName] = useState(() => localStorage.getItem('school_name') || '')
  const [reportType, setReportType] = useState<'semester' | 'annual'>('annual')

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

  function handlePrint() {
    window.print()
  }

  const today = new Date().toLocaleDateString(lang === 'ar' ? 'ar-AE' : 'en-AE')

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between no-print">
        <h1 className="text-xl font-bold">{t('reports_title')}</h1>
        <button className="btn-primary flex items-center gap-2" onClick={handlePrint}>
          <Printer size={15} />
          {t('print')}
        </button>
      </div>

      <div className="no-print space-y-4">
        <div>
          <label className="label">{t('reports_school')}</label>
          <input
            className="input max-w-xs"
            value={schoolName}
            onChange={e => { setSchoolName(e.target.value); localStorage.setItem('school_name', e.target.value) }}
            placeholder={lang === 'ar' ? 'اسم المدرسة' : 'School name'}
          />
        </div>
        <FilterBar filter={filter} onChange={setFilter} lang={lang} showSubject={false} showSemester showNationality showTrack />
      </div>

      {/* Printable Report */}
      <div className="bg-white dark:bg-gray-900 rounded-xl shadow p-8 space-y-6">
        {/* Header */}
        <div className="text-center border-b pb-4">
          <h2 className="text-xl font-bold">{schoolName || (lang === 'ar' ? 'المدرسة' : 'School')}</h2>
          <h3 className="text-lg font-semibold mt-1">
            {lang === 'ar' ? 'تقرير تحليل الدرجات' : 'Grade Analysis Report'}
            {filter.yearId ? ` — ${filter.yearId}` : ''}
          </h3>
          <p className="text-sm text-gray-500 mt-1">{t('reports_date')}: {today}</p>
          {filter.grade && <p className="text-sm text-gray-500">{t('grade')}: {filter.grade}</p>}
        </div>

        {/* Summary */}
        <div className="grid grid-cols-3 gap-4 text-center">
          <div className="border rounded-lg p-3">
            <p className="text-2xl font-bold text-blue-600">{records.length}</p>
            <p className="text-sm text-gray-500">{t('analysis_count')}</p>
          </div>
          {subjectStatsList[0] && (
            <>
              <div className="border rounded-lg p-3">
                <p className="text-2xl font-bold text-green-600">{round2(subjectStatsList[0].passRate)}%</p>
                <p className="text-sm text-gray-500">{t('analysis_pass_rate')}</p>
              </div>
              <div className="border rounded-lg p-3">
                <p className="text-2xl font-bold text-yellow-600">{round2(subjectStatsList[0].above90Rate)}%</p>
                <p className="text-sm text-gray-500">{t('analysis_above90')}</p>
              </div>
            </>
          )}
        </div>

        {/* Subject Table */}
        {subjectStatsList.length > 0 && (
          <div>
            <h3 className="font-semibold mb-3">{t('analysis_by_subject')}</h3>
            <table className="table-base w-full">
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
                    <td>{round2(s.passRate)}%</td>
                    <td>{round2(s.failRate)}%</td>
                    <td>{round2(s.mean)}</td>
                    <td>{round2(s.median)}</td>
                    <td>{round2(s.stdDev)}</td>
                    <td>{round2(s.above90Rate)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="border-t pt-4 text-sm text-gray-400 text-end">
          {t('reports_prepared_by')}: {lang === 'ar' ? 'نظام تحليل الدرجات' : 'Grade Analysis System'}
        </div>
      </div>
    </div>
  )
}
