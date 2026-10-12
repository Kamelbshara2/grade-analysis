import { Outlet } from 'react-router-dom'
import Sidebar from './Sidebar'
import Header from './Header'
import type { Language } from '@/types'

interface LayoutProps {
  lang: Language
  onChangeLang: (lang: Language) => void
  onLogout?: () => void
}

export default function Layout({ lang, onChangeLang, onLogout }: LayoutProps) {
  return (
    <div className="flex h-screen bg-gray-50 dark:bg-gray-950 overflow-hidden">
      <Sidebar lang={lang} />
      <div className="flex-1 flex flex-col min-w-0">
        <Header lang={lang} onChangeLang={onChangeLang} onLogout={onLogout} />
        <main className="flex-1 overflow-y-auto p-4 md:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
