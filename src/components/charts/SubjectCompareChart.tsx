import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend,
} from 'recharts'
import type { SubjectStats } from '@/types'
import { SUBJECT_LABELS } from '@/utils/subjectMapping'
import type { Language } from '@/types'
import { round2 } from '@/utils/statistics'
import { t } from '@/i18n/translations'

interface SubjectCompareChartProps {
  statsList: SubjectStats[]
  lang: Language
}

export default function SubjectCompareChart({ statsList, lang }: SubjectCompareChartProps) {
  const data = statsList.map(s => ({
    name: SUBJECT_LABELS[s.subjectCode]?.[lang] ?? s.subjectCode,
    [t('analysis_pass_rate')]: round2(s.passRate),
    [t('analysis_above90')]: round2(s.above90Rate),
    [t('analysis_mean')]: round2(s.mean),
  }))

  return (
    <ResponsiveContainer width="100%" height={260}>
      <BarChart data={data} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" />
        <XAxis dataKey="name" tick={{ fontSize: 11 }} />
        <YAxis tickFormatter={v => `${v}%`} tick={{ fontSize: 11 }} domain={[0, 100]} />
        <Tooltip />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        <Bar dataKey={t('analysis_pass_rate')} fill="#22c55e" radius={[3, 3, 0, 0]} />
        <Bar dataKey={t('analysis_above90')} fill="#3b82f6" radius={[3, 3, 0, 0]} />
        <Bar dataKey={t('analysis_mean')} fill="#a855f7" radius={[3, 3, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  )
}
