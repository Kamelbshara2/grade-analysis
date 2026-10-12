import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine, Dot,
} from 'recharts'
import { getPassMark, getCycle } from '@/utils/subjectMapping'
import type { Language } from '@/types'
import { round2 } from '@/utils/statistics'

interface TrendPoint {
  year: string
  score: number | null
  grade: number
}

interface StudentTrendChartProps {
  data: TrendPoint[]
  subject: string
  lang: Language
}

export default function StudentTrendChart({ data, subject, lang }: StudentTrendChartProps) {
  const validPoints = data.filter(d => d.score !== null)
  if (validPoints.length < 2) {
    return (
      <div className="flex items-center justify-center h-40 text-gray-400 text-sm">
        {lang === 'ar' ? 'بيانات غير كافية' : 'Insufficient data'}
      </div>
    )
  }

  // Determine trend direction
  const first = validPoints[0].score!
  const last = validPoints[validPoints.length - 1].score!
  const trendColor = last >= first ? '#16a34a' : '#ef4444'

  // Pass mark based on first grade
  const passMark = getPassMark(getCycle(data[0].grade))

  const chartData = data.map(d => ({
    label: `${d.year}\n(G${d.grade})`,
    score: d.score,
  }))

  return (
    <div>
      <p className="text-sm font-medium mb-2 text-gray-700 dark:text-gray-300">{subject}</p>
      <ResponsiveContainer width="100%" height={160}>
        <LineChart data={chartData} margin={{ top: 8, right: 16, left: -10, bottom: 24 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
          <XAxis
            dataKey="label"
            tick={{ fontSize: 10 }}
            interval={0}
            angle={-20}
            textAnchor="end"
            height={40}
          />
          <YAxis domain={[0, 100]} tick={{ fontSize: 10 }} />
          <Tooltip
            formatter={(v: number) => [round2(v), lang === 'ar' ? 'الدرجة' : 'Score']}
          />
          <ReferenceLine
            y={passMark}
            stroke="#9333ea"
            strokeDasharray="4 4"
            label={{ value: lang === 'ar' ? `نجاح ${passMark}` : `Pass ${passMark}`, position: 'right', fontSize: 10, fill: '#9333ea' }}
          />
          <Line
            type="monotone"
            dataKey="score"
            stroke={trendColor}
            strokeWidth={2}
            connectNulls={false}
            dot={<Dot r={4} fill={trendColor} />}
            activeDot={{ r: 6 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
