import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell, LabelList,
} from 'recharts'
import { t } from '@/i18n/translations'
import type { SubjectStats } from '@/types'
import { round2 } from '@/utils/statistics'

interface BandBarChartProps {
  stats: SubjectStats
}

export default function BandBarChart({ stats }: BandBarChartProps) {
  const bands = [
    { name: t('analysis_band_low'), value: round2(stats.band_low), color: '#ef4444' },
    { name: t('analysis_band_low_mid'), value: round2(stats.band_low_mid), color: '#f97316' },
    { name: t('analysis_band_mid'), value: round2(stats.band_mid), color: '#eab308' },
    { name: t('analysis_band_high'), value: round2(stats.band_high), color: '#3b82f6' },
    { name: t('analysis_band_top'), value: round2(stats.band_top), color: '#22c55e' },
  ]

  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={bands} margin={{ top: 16, right: 8, left: -8, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" />
        <XAxis dataKey="name" tick={{ fontSize: 11 }} />
        <YAxis tickFormatter={v => `${v}%`} tick={{ fontSize: 11 }} domain={[0, 100]} />
        <Tooltip formatter={(v: number) => [`${v}%`, '']} />
        <Bar dataKey="value" radius={[4, 4, 0, 0]}>
          {bands.map((b, i) => <Cell key={i} fill={b.color} />)}
          <LabelList dataKey="value" position="top" formatter={(v: number) => `${v}%`} style={{ fontSize: 11 }} />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}
