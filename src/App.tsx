import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useState, useEffect } from 'react'
import Layout from '@/components/layout/Layout'
import Dashboard from '@/pages/Dashboard'
import Upload from '@/pages/Upload'
import Analysis from '@/pages/Analysis'
import Progress from '@/pages/Progress'
import GapAnalysis from '@/pages/GapAnalysis'
import Comparison from '@/pages/Comparison'
import Reports from '@/pages/Reports'
import Settings from '@/pages/Settings'
import StudentProfile from '@/pages/StudentProfile'
import Methodology from '@/pages/Methodology'
import Login from '@/pages/Login'
import type { Language } from '@/types'
import { getCurrentLanguage, setLanguage } from '@/i18n/translations'
import { dataStore } from '@/store/dataStore'

const AUTH_KEY = 'grade_analysis_auth'

function isAuthenticated(): boolean {
  return localStorage.getItem(AUTH_KEY) === 'true'
}

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  if (!isAuthenticated()) return <Navigate to="/login" replace />
  return <>{children}</>
}

export default function App() {
  const [lang, setLang] = useState<Language>(getCurrentLanguage())
  const [loading, setLoading] = useState(true)
  const [, forceUpdate] = useState(0)

  useEffect(() => {
    dataStore.initFromAPI().finally(() => {
      setLoading(false)
      forceUpdate(n => n + 1)
    })
  }, [])

  function changeLanguage(newLang: Language) {
    setLanguage(newLang)
    setLang(newLang)
  }

  function handleLogin() {
    localStorage.setItem(AUTH_KEY, 'true')
    forceUpdate(n => n + 1)
  }

  function handleLogout() {
    localStorage.removeItem(AUTH_KEY)
    forceUpdate(n => n + 1)
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-primary-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-gray-500 dark:text-gray-400">
            {lang === 'ar' ? 'جاري تحميل البيانات...' : 'Loading data...'}
          </p>
        </div>
      </div>
    )
  }

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login lang={lang} onLogin={handleLogin} />} />
        <Route element={
          <ProtectedRoute>
            <Layout lang={lang} onChangeLang={changeLanguage} onLogout={handleLogout} />
          </ProtectedRoute>
        }>
          <Route index element={<Navigate to="/dashboard" replace />} />
          <Route path="/dashboard" element={<Dashboard lang={lang} />} />
          <Route path="/upload" element={<Upload lang={lang} />} />
          <Route path="/analysis" element={<Analysis lang={lang} />} />
          <Route path="/progress" element={<Progress lang={lang} />} />
          <Route path="/gap" element={<GapAnalysis lang={lang} />} />
          <Route path="/comparison" element={<Comparison lang={lang} />} />
          <Route path="/reports" element={<Reports lang={lang} />} />
          <Route path="/student" element={<StudentProfile lang={lang} />} />
          <Route path="/methodology" element={<Methodology lang={lang} />} />
          <Route path="/settings" element={<Settings lang={lang} onChangeLang={changeLanguage} />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
