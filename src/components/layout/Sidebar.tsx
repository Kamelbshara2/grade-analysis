import { NavLink } from 'react-router-dom'
import {
  LayoutDashboard, Upload, BarChart2, TrendingUp,
  Target, GitCompare, FileText, BookOpen, Settings,
  User, BookMarked, GraduationCap,
} from 'lucide-react'
import { t } from '@/i18n/translations'
import type { Language } from '@/types'
import clsx from 'clsx'

interface SidebarProps {
  lang: Language
}

const NAV_GROUPS = [
  {
    labelAr: 'الرئيسية',
    labelEn: 'Overview',
    items: [
      { to: '/dashboard', icon: LayoutDashboard, key: 'nav_dashboard' as const },
    ],
  },
  {
    labelAr: 'التحليل والإنجاز',
    labelEn: 'Analysis',
    items: [
      { to: '/analysis',    icon: BarChart2,    key: 'nav_analysis' as const },
      { to: '/comparison',  icon: GitCompare,   key: 'nav_comparison' as const },
    ],
  },
  {
    labelAr: 'تتبع التقدم',
    labelEn: 'Progress',
    items: [
      { to: '/progress', icon: TrendingUp, key: 'nav_progress' as const },
      { to: '/student',  icon: User,       key: 'nav_student' as const },
    ],
  },
  {
    labelAr: 'ضمان الجودة',
    labelEn: 'Quality',
    items: [
      { to: '/gap',      icon: Target,   key: 'nav_gap' as const },
      { to: '/outcomes', icon: BookOpen, key: 'nav_outcomes' as const },
    ],
  },
  {
    labelAr: 'الإدارة والتقارير',
    labelEn: 'Reports',
    items: [
      { to: '/reports',      icon: FileText,   key: 'nav_reports' as const },
      { to: '/methodology',  icon: BookMarked, key: 'nav_methodology' as const },
      { to: '/upload',       icon: Upload,     key: 'nav_upload' as const },
      { to: '/settings',     icon: Settings,   key: 'nav_settings' as const },
    ],
  },
]

export default function Sidebar({ lang }: SidebarProps) {
  const ar = lang === 'ar'

  return (
    <aside className="w-56 bg-white dark:bg-gray-900 border-e flex flex-col shrink-0">

      {/* Brand / School */}
      <div className="h-auto min-h-[56px] flex items-center gap-2.5 px-4 py-3 border-b">
        <div className="w-8 h-8 rounded-lg bg-primary-600 flex items-center justify-center shrink-0">
          <GraduationCap size={16} className="text-white" />
        </div>
        <div className="min-w-0">
          <p className="text-primary-700 dark:text-primary-400 font-bold text-sm leading-tight truncate">
            {ar ? 'مدرسة خالد بن الوليد' : 'Khalid bin Al-Walid'}
          </p>
          <p className="text-gray-400 text-[10px] leading-tight truncate">
            {ar ? 'فريق جودة انجازات الطلبة' : 'Achievement Quality'}
          </p>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 py-2 overflow-y-auto">
        {NAV_GROUPS.map(group => (
          <div key={group.labelAr}>
            <p className="nav-section">{ar ? group.labelAr : group.labelEn}</p>
            {group.items.map(({ to, icon: Icon, key }) => (
              <NavLink
                key={to}
                to={to}
                className={({ isActive }) =>
                  clsx(
                    'flex items-center gap-3 px-3 py-2 text-sm transition-colors mx-2 rounded-lg my-0.5',
                    isActive
                      ? 'bg-primary-50 text-primary-700 dark:bg-primary-900/20 dark:text-primary-400 font-medium'
                      : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'
                  )
                }
              >
                <Icon size={15} className="shrink-0" />
                <span className="truncate">{t(key)}</span>
              </NavLink>
            ))}
          </div>
        ))}
      </nav>

      {/* Footer */}
      <div className="border-t px-4 py-2.5 text-[10px] text-gray-400 dark:text-gray-600">
        {ar ? 'منصة تحليل الإنجاز' : 'Achievement Analysis Platform'}
      </div>
    </aside>
  )
}
