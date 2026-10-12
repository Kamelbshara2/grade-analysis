import { Globe } from 'lucide-react'
import type { Language } from '@/types'

interface HeaderProps {
  lang: Language
  onChangeLang: (lang: Language) => void
}

export default function Header({ lang, onChangeLang }: HeaderProps) {
  return (
    <header className="h-14 bg-white dark:bg-gray-900 border-b flex items-center justify-between px-4 shrink-0">
      <div />
      <button
        onClick={() => onChangeLang(lang === 'ar' ? 'en' : 'ar')}
        className="btn-ghost flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400"
        title="Switch language"
      >
        <Globe size={16} />
        <span>{lang === 'ar' ? 'English' : 'العربية'}</span>
      </button>
    </header>
  )
}
