import { NavLink } from 'react-router-dom'
import {
  LayoutDashboard, Upload, BarChart2, TrendingUp,
  Target, GitCompare, FileText, BookOpen, Settings,
  User, BookMarked
} from 'lucide-react'
import { t } from '@/i18n/translations'
import type { Language } from '@/types'
import clsx from 'clsx'

interface SidebarProps {
  lang: Language
}

const navItems = [
  { to: '/dashboard', icon: LayoutDashboard, key: 'nav_dashboard' as const },
  { to: '/upload', icon: Upload, key: 'nav_upload' as const },
  { to: '/analysis', icon: BarChart2, key: 'nav_analysis' as const },
  { to: '/progress', icon: TrendingUp, key: 'nav_progress' as const },
  { to: '/student', icon: User, key: 'nav_student' as const },
  { to: '/gap', icon: Target, key: 'nav_gap' as const },
  { to: '/comparison', icon: GitCompare, key: 'nav_comparison' as const },
  { to: '/reports', icon: FileText, key: 'nav_reports' as const },
  { to: '/outcomes', icon: BookOpen, key: 'nav_outcomes' as const },
  { to: '/methodology', icon: BookMarked, key: 'nav_methodology' as const },
  { to: '/settings', icon: Settings, key: 'nav_settings' as const },
]

export default function Sidebar({ lang }: SidebarProps) {
  return (
    <aside className="w-56 bg-white dark:bg-gray-900 border-e flex flex-col shrink-0">
      <div className="h-14 flex items-center px-4 border-b">
        <span className="text-primary-600 font-bold text-base leading-tight">
          {lang === 'ar' ? 'تحليل الدرجات' : 'Grade Analysis'}
        </span>
      </div>
      <nav className="flex-1 py-2 overflow-y-auto">
        {navItems.map(({ to, icon: Icon, key }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              clsx(
                'flex items-center gap-3 px-4 py-2.5 text-sm transition-colors mx-2 rounded-lg my-0.5',
                isActive
                  ? 'bg-primary-50 text-primary-700 dark:bg-primary-900/20 dark:text-primary-400 font-medium'
                  : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'
              )
            }
          >
            <Icon size={17} />
            <span>{t(key)}</span>
          </NavLink>
        ))}
      </nav>
    </aside>
  )
}
