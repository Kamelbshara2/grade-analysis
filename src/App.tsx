import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useState } from 'react'
import Layout from '@/components/layout/Layout'
import Dashboard from '@/pages/Dashboard'
import Upload from '@/pages/Upload'
import Analysis from '@/pages/Analysis'
import Progress from '@/pages/Progress'
import GapAnalysis from '@/pages/GapAnalysis'
import Comparison from '@/pages/Comparison'
import Reports from '@/pages/Reports'
import Outcomes from '@/pages/Outcomes'
import Settings from '@/pages/Settings'
import type { Language } from '@/types'
import { getCurrentLanguage, setLanguage } from '@/i18n/translations'

export default function App() {
  const [lang, setLang] = useState<Language>(getCurrentLanguage())

  function changeLanguage(newLang: Language) {
    setLanguage(newLang)
    setLang(newLang)
  }

  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout lang={lang} onChangeLang={changeLanguage} />}>
          <Route index element={<Navigate to="/dashboard" replace />} />
          <Route path="/dashboard" element={<Dashboard lang={lang} />} />
          <Route path="/upload" element={<Upload lang={lang} />} />
          <Route path="/analysis" element={<Analysis lang={lang} />} />
          <Route path="/progress" element={<Progress lang={lang} />} />
          <Route path="/gap" element={<GapAnalysis lang={lang} />} />
          <Route path="/comparison" element={<Comparison lang={lang} />} />
          <Route path="/reports" element={<Reports lang={lang} />} />
          <Route path="/outcomes" element={<Outcomes lang={lang} />} />
          <Route path="/settings" element={<Settings lang={lang} onChangeLang={changeLanguage} />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
