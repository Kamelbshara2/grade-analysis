import {
  ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, ReferenceLine, Legend,
} from 'recharts'
import { t } from '@/i18n/translations'
import type { Cycle } from '@/types'
import { round2 } from '@/utils/statistics'
import { getPassMark } from '@/utils/subjectMapping'

interface NormalDistributionChartProps {
  scores: number[]
  cycle: Cycle
}

export default function NormalDistributionChart({ scores, cycle }: NormalDistributionChartProps) {
  const n = scores.length
  const passMark = getPassMark(cycle)

  if (n === 0) {
    return <div className="flex items-center justify-center h-64 text-gray-400">{t('no_data')}</div>
  }

  // Compute mean and stdDev
  const mean = scores.reduce((s, x) => s + x, 0) / n
  const variance = scores.reduce((s, x) => s + (x - mean) ** 2, 0) / n
  const stdDev = Math.sqrt(variance)

  // Compute skewness and kurtosis
  const skewness = stdDev > 0
    ? scores.reduce((s, x) => s + ((x - mean) / stdDev) ** 3, 0) / n
    : 0
  const kurtosis = stdDev > 0
    ? scores.reduce((s, x) => s + ((x - mean) / stdDev) ** 4, 0) / n - 3
    : 0

  // Histogram bins width=5 from 0 to 100
  const binWidth = 5
  const bins: { binStart: number; count: number; freq: number }[] = []
  for (let start = 0; start < 100; start += binWidth) {
    const count = scores.filter(s => s >= start && s < start + binWidth).length
    bins.push({ binStart: start, count, freq: count / n })
  }

  // Normal PDF scaled by n * binWidth
  function pdf(x: number): number {
    if (stdDev === 0) return 0
    return (1 / (stdDev * Math.sqrt(2 * Math.PI))) * Math.exp(-0.5 * ((x - mean) / stdDev) ** 2)
  }

  // Build chart data: merge histogram and curve
  const chartData = bins.map(b => {
    const midX = b.binStart + binWidth / 2
    return {
      name: `${b.binStart}`,
      histogram: round2((b.freq) * 100),  // percentage
      curve: round2(pdf(midX) * binWidth * 100), // scaled to match %
    }
  })

  // Interpretation
  function interpretSkewness(sk: number): string {
    if (sk < -0.5) return t('dist_left_skew')
    if (sk > 0.5) return t('dist_right_skew')
    return t('dist_symmetric')
  }

  function interpretKurtosis(ku: number): string {
    if (ku < -1) return t('dist_platykurtic')
    if (ku > 1) return t('dist_leptokurtic')
    return t('dist_mesokurtic')
  }

  const sigma1Low = mean - stdDev
  const sigma1High = mean + stdDev
  const sigma2Low = mean - 2 * stdDev
  const sigma2High = mean + 2 * stdDev

  return (
    <div className="space-y-4">
      <ResponsiveContainer width="100%" height={280}>
        <ComposedChart data={chartData} margin={{ top: 10, right: 20, left: -10, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" vertical={false} />
          <XAxis dataKey="name" tick={{ fontSize: 10 }} interval={1} />
          <YAxis tickFormatter={v => `${v}%`} tick={{ fontSize: 10 }} />
          <Tooltip
            formatter={(value: number, name: string) => {
              const label = name === 'histogram'
                ? (t('dist_mean') === 'المتوسط' ? 'التكرار %' : 'Frequency %')
                : (t('dist_mean') === 'المتوسط' ? 'المنحنى الطبيعي' : 'Normal Curve')
              return [`${value}%`, label]
            }}
          />
          <Legend
            formatter={(value) => {
              if (value === 'histogram') return t('dist_mean') === 'المتوسط' ? 'التوزيع التكراري' : 'Histogram'
              return t('dist_mean') === 'المتوسط' ? 'المنحنى الطبيعي' : 'Normal Curve'
            }}
          />
          <Bar dataKey="histogram" fill="#3b82f6" opacity={0.7} name="histogram" />
          <Line
            type="monotone"
            dataKey="curve"
            stroke="#ef4444"
            strokeWidth={2}
            strokeDasharray="5 5"
            dot={false}
            name="curve"
          />
          {/* Pass mark */}
          <ReferenceLine
            x={String(passMark)}
            stroke="#9333ea"
            strokeWidth={2}
            label={{ value: `Pass ${passMark}`, position: 'top', fontSize: 10, fill: '#9333ea' }}
          />
          {/* Mean */}
          <ReferenceLine
            x={String(Math.round(mean / binWidth) * binWidth)}
            stroke="#2563eb"
            strokeWidth={2}
            strokeDasharray=""
            label={{ value: `μ=${round2(mean)}`, position: 'insideTopRight', fontSize: 10, fill: '#2563eb' }}
          />
          {/* ±1σ */}
          {sigma1Low >= 0 && (
            <ReferenceLine
              x={String(Math.round(sigma1Low / binWidth) * binWidth)}
              stroke="#16a34a"
              strokeDasharray="4 4"
              label={{ value: '-1σ', position: 'top', fontSize: 9, fill: '#16a34a' }}
            />
          )}
          {sigma1High <= 100 && (
            <ReferenceLine
              x={String(Math.round(sigma1High / binWidth) * binWidth)}
              stroke="#16a34a"
              strokeDasharray="4 4"
              label={{ value: '+1σ', position: 'top', fontSize: 9, fill: '#16a34a' }}
            />
          )}
          {/* ±2σ */}
          {sigma2Low >= 0 && (
            <ReferenceLine
              x={String(Math.round(sigma2Low / binWidth) * binWidth)}
              stroke="#d97706"
              strokeDasharray="2 4"
              label={{ value: '-2σ', position: 'top', fontSize: 9, fill: '#d97706' }}
            />
          )}
          {sigma2High <= 100 && (
            <ReferenceLine
              x={String(Math.round(sigma2High / binWidth) * binWidth)}
              stroke="#d97706"
              strokeDasharray="2 4"
              label={{ value: '+2σ', position: 'top', fontSize: 9, fill: '#d97706' }}
            />
          )}
        </ComposedChart>
      </ResponsiveContainer>

      {/* Stats summary */}
      <div className="grid grid-cols-2 gap-3 text-sm">
        <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-3 space-y-1">
          <p><span className="font-semibold">{t('dist_mean')} (μ):</span> {round2(mean)}</p>
          <p><span className="font-semibold">{t('dist_std')} (σ):</span> {round2(stdDev)}</p>
          <p><span className="font-semibold">{t('dist_variance')} (σ²):</span> {round2(variance)}</p>
        </div>
        <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-3 space-y-1">
          <p>
            <span className="font-semibold">{t('dist_skewness')}:</span>{' '}
            {round2(skewness)} — {interpretSkewness(skewness)}
          </p>
          <p>
            <span className="font-semibold">{t('dist_kurtosis')}:</span>{' '}
            {round2(kurtosis)} — {interpretKurtosis(kurtosis)}
          </p>
        </div>
      </div>
    </div>
  )
}
