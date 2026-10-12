import clsx from 'clsx'

interface StatCardProps {
  label: string
  value: string | number
  sub?: string
  color?: 'green' | 'red' | 'blue' | 'yellow' | 'gray'
  large?: boolean
}

const colorMap = {
  green: 'text-green-600 dark:text-green-400',
  red: 'text-red-600 dark:text-red-400',
  blue: 'text-blue-600 dark:text-blue-400',
  yellow: 'text-yellow-600 dark:text-yellow-400',
  gray: 'text-gray-700 dark:text-gray-300',
}

export default function StatCard({ label, value, sub, color = 'gray', large }: StatCardProps) {
  return (
    <div className="stat-card">
      <p className="text-xs text-gray-500 dark:text-gray-400">{label}</p>
      <p className={clsx('font-bold', large ? 'text-3xl' : 'text-2xl', colorMap[color])}>
        {value}
      </p>
      {sub && <p className="text-xs text-gray-400">{sub}</p>}
    </div>
  )
}
