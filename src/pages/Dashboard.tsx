import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { Upload, BarChart2, TrendingUp } from 'lucide-react'
import { t } from '@/i18n/translations'
import type { Language } from '@/types'
import { dataStore } from '@/store/dataStore'
import StatCard from '@/components/ui/StatCard'
import { computeStats } from '@/utils/statistics'
import { getCycle } from '@/utils/subjectMapping'

interface DashboardProps {
  lang: Language
}

export default function Dashboard({ lang }: DashboardProps) {
  const years = dataStore.getYears()
  const allRecords = dataStore.getAllRecords()

  const summary = useMemo(() => {
    if (allRecords.length === 0) return null
    const latestYear = years[years.length - 1]
    const latestRecords = dataStore.getRecordsByYear(latestYear)

    // Aggregate annual averages for pass/fail stats
    const annualScores = latestRecords
      .map(r => r.annualAvg)
      .filter((v): v is number => v !== null)

    const grade = latestRecords[0]?.grade ?? 9
    const cycle = getCycle(grade)
    const stats = computeStats(annualScores, cycle)

    return {
      totalStudents: latestRecords.length,
      passRate: stats.passRate,
      failRate: stats.failRate,
      above90Rate: stats.above90Rate,
      latestYear,
    }
  }, [allRecords, years])

  const storageKB = dataStore.getStorageSizeKB()

  if (years.length === 0) {
    return (
      <div className="max-w-2xl mx-auto mt-16 text-center">
        <div className="card p-12">
          <Upload size={48} className="mx-auto text-gray-300 mb-4" />
          <h1 className="text-xl font-bold text-gray-700 dark:text-gray-200 mb-2">
            {lang === 'ar' ? 'مرحباً بك في نظام تحليل الدرجات' : 'Welcome to Grade Analysis'}
          </h1>
          <p className="text-gray-500 mb-6">
            {lang === 'ar'
              ? 'ابدأ برفع ملف الدرجات السنوي من نظام المنهل'
              : 'Start by uploading the annual grade file from Manhal'}
          </p>
          <Link to="/upload" className="btn-primary inline-flex items-center gap-2">
            <Upload size={16} />
            {t('nav_upload')}
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold">{t('dash_title')}</h1>

      {summary && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard
            label={t('dash_total_students')}
            value={summary.totalStudents.toLocaleString()}
            sub={summary.latestYear}
            color="blue"
          />
          <StatCard
            label={t('dash_pass_rate')}
            value={`${summary.passRate.toFixed(1)}%`}
            color="green"
          />
          <StatCard
            label={t('dash_fail_rate')}
            value={`${summary.failRate.toFixed(1)}%`}
            color="red"
          />
          <StatCard
            label={t('dash_above90')}
            value={`${summary.above90Rate.toFixed(1)}%`}
            color="yellow"
          />
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <StatCard label={t('dash_years_data')} value={years.length} sub={years.join(', ')} />
        <StatCard label={t('dash_storage')} value={`${storageKB} KB`} />
      </div>

      {/* Quick Links */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        {[
          { to: '/analysis', icon: BarChart2, label: t('nav_analysis') },
          { to: '/progress', icon: TrendingUp, label: t('nav_progress') },
          { to: '/upload', icon: Upload, label: t('nav_upload') },
        ].map(({ to, icon: Icon, label }) => (
          <Link
            key={to}
            to={to}
            className="card hover:shadow-md transition-shadow flex items-center gap-3 p-4"
          >
            <Icon size={20} className="text-primary-600" />
            <span className="font-medium text-sm">{label}</span>
          </Link>
        ))}
      </div>

      {/* Year Summary Table */}
      <div className="card">
        <h2 className="font-semibold mb-3">
          {lang === 'ar' ? 'ملخص البيانات المرفوعة' : 'Uploaded Data Summary'}
        </h2>
        <table className="table-base">
          <thead>
            <tr>
              <th>{t('year')}</th>
              <th>{t('students')}</th>
              <th>{lang === 'ar' ? 'تاريخ الرفع' : 'Uploaded At'}</th>
            </tr>
          </thead>
          <tbody>
            {years.map(y => {
              const yd = dataStore.getYearData(y)
              return (
                <tr key={y}>
                  <td className="font-mono">{y}</td>
                  <td>{yd?.records.length ?? 0}</td>
                  <td className="text-gray-500 text-xs">
                    {yd?.uploadedAt ? new Date(yd.uploadedAt).toLocaleDateString(lang === 'ar' ? 'ar-AE' : 'en-AE') : '—'}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
