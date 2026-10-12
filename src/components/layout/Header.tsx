import { Globe, LogOut } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import type { Language } from '@/types'

interface HeaderProps {
  lang: Language
  onChangeLang: (lang: Language) => void
  onLogout?: () => void
}

export default function Header({ lang, onChangeLang, onLogout }: HeaderProps) {
  const navigate = useNavigate()
  const schoolName = localStorage.getItem('grade_analysis_school_name') || (lang === 'ar' ? 'المدرسة' : 'School')

  function handleLogout() {
    if (onLogout) onLogout()
    navigate('/login', { replace: true })
  }

  return (
    <header className="h-14 bg-white dark:bg-gray-900 border-b flex items-center justify-between px-4 shrink-0">
      <span className="text-sm font-medium text-gray-600 dark:text-gray-400">{schoolName}</span>
      <div className="flex items-center gap-2">
        <button
          onClick={() => onChangeLang(lang === 'ar' ? 'en' : 'ar')}
          className="btn-ghost flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400"
          title="Switch language"
        >
          <Globe size={16} />
          <span>{lang === 'ar' ? 'English' : 'العربية'}</span>
        </button>
        {onLogout && (
          <button
            onClick={handleLogout}
            className="btn-ghost flex items-center gap-2 text-sm text-red-500 hover:text-red-700"
            title={lang === 'ar' ? 'تسجيل الخروج' : 'Logout'}
          >
            <LogOut size={16} />
          </button>
        )}
      </div>
    </header>
  )
}
