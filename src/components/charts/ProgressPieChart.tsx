import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import type { ProgressResult } from '@/types'
import { t } from '@/i18n/translations'

interface ProgressPieChartProps {
  results: ProgressResult[]
}

const COLORS = {
  significant_progress: '#22c55e',
  slight_progress: '#84cc16',
  stable: '#3b82f6',
  regression: '#ef4444',
  no_baseline: '#9ca3af',
}

export default function ProgressPieChart({ results }: ProgressPieChartProps) {
  const counts: Record<string, number> = {}
  for (const r of results) {
    counts[r.category] = (counts[r.category] || 0) + 1
  }

  const labelMap: Record<string, string> = {
    significant_progress: t('progress_significant'),
    slight_progress: t('progress_slight'),
    stable: t('progress_stable'),
    regression: t('progress_regression'),
    no_baseline: t('progress_no_baseline'),
  }

  const data = Object.entries(counts)
    .filter(([, v]) => v > 0)
    .map(([k, v]) => ({ name: labelMap[k] ?? k, value: v, key: k }))

  if (data.length === 0) return null

  return (
    <ResponsiveContainer width="100%" height={220}>
      <PieChart>
        <Pie data={data} dataKey="value" cx="50%" cy="50%" outerRadius={80} label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`} labelLine={false}>
          {data.map((d, i) => <Cell key={i} fill={COLORS[d.key as keyof typeof COLORS] ?? '#6b7280'} />)}
        </Pie>
        <Tooltip />
      </PieChart>
    </ResponsiveContainer>
  )
}
