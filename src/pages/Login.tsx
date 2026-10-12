import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { Language } from '@/types'

interface LoginProps {
  lang: Language
  onLogin: () => void
}

// Simple credential store — in a real app this would be server-side
const SCHOOL_CREDS_KEY = 'grade_analysis_schools'

interface SchoolAccount {
  schoolName: string
  username: string
  password: string
}

function getSchools(): SchoolAccount[] {
  try {
    const raw = localStorage.getItem(SCHOOL_CREDS_KEY)
    if (raw) return JSON.parse(raw) as SchoolAccount[]
  } catch { /* ignore */ }
  // Default school account
  return [{
    schoolName: 'مدرسة خالد بن الوليد',
    username: 'kbws',
    password: 'kbws2024',
  }]
}

function saveSchools(schools: SchoolAccount[]): void {
  localStorage.setItem(SCHOOL_CREDS_KEY, JSON.stringify(schools))
}

export default function Login({ lang, onLogin }: LoginProps) {
  const navigate = useNavigate()
  const [tab, setTab] = useState<'login' | 'register'>('login')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [schoolName, setSchoolName] = useState('')
  const [newUsername, setNewUsername] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const ar = lang === 'ar'

  function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    const schools = getSchools()
    const match = schools.find(s => s.username === username.trim() && s.password === password)
    if (match) {
      localStorage.setItem('grade_analysis_school_name', match.schoolName)
      onLogin()
      navigate('/dashboard', { replace: true })
    } else {
      setError(ar ? 'اسم المستخدم أو كلمة المرور غير صحيحة' : 'Invalid username or password')
    }
  }

  function handleRegister(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setSuccess('')
    if (!schoolName.trim() || !newUsername.trim() || !newPassword) {
      setError(ar ? 'يرجى تعبئة جميع الحقول' : 'Please fill all fields')
      return
    }
    if (newPassword !== confirmPassword) {
      setError(ar ? 'كلمتا المرور غير متطابقتان' : 'Passwords do not match')
      return
    }
    const schools = getSchools()
    if (schools.find(s => s.username === newUsername.trim())) {
      setError(ar ? 'اسم المستخدم مستخدم بالفعل' : 'Username already taken')
      return
    }
    schools.push({ schoolName: schoolName.trim(), username: newUsername.trim(), password: newPassword })
    saveSchools(schools)
    setSuccess(ar ? 'تم تسجيل المدرسة بنجاح! يمكنك تسجيل الدخول الآن' : 'School registered! You can now log in.')
    setTab('login')
    setUsername(newUsername.trim())
    setPassword('')
  }

  return (
    <div
      dir={ar ? 'rtl' : 'ltr'}
      className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800 px-4"
    >
      <div className="w-full max-w-md">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-primary-600 text-white text-2xl font-bold mb-4 shadow-lg">
            خ
          </div>
          <h1 className="text-2xl font-bold text-gray-800 dark:text-white">
            {ar ? 'مدرسة خالد بن الوليد' : 'Khalid Bin Al-Walid School'}
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            {ar ? 'فريق جودة إنجازات الطلبة' : 'Student Achievement Quality Team'}
          </p>
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
            {ar ? 'منصة تحليل درجات الطلبة' : 'Grade Analysis Platform'}
          </p>
        </div>

        {/* Card */}
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl overflow-hidden">
          {/* Tabs */}
          <div className="flex border-b border-gray-200 dark:border-gray-700">
            <button
              className={`flex-1 py-3 text-sm font-medium transition-colors ${tab === 'login' ? 'border-b-2 border-primary-500 text-primary-600 dark:text-primary-400' : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'}`}
              onClick={() => { setTab('login'); setError(''); setSuccess('') }}
            >
              {ar ? 'تسجيل الدخول' : 'Login'}
            </button>
            <button
              className={`flex-1 py-3 text-sm font-medium transition-colors ${tab === 'register' ? 'border-b-2 border-primary-500 text-primary-600 dark:text-primary-400' : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'}`}
              onClick={() => { setTab('register'); setError(''); setSuccess('') }}
            >
              {ar ? 'تسجيل مدرسة جديدة' : 'Register School'}
            </button>
          </div>

          <div className="p-6">
            {error && (
              <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-red-700 dark:text-red-400 text-sm">
                {error}
              </div>
            )}
            {success && (
              <div className="mb-4 p-3 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg text-green-700 dark:text-green-400 text-sm">
                {success}
              </div>
            )}

            {tab === 'login' ? (
              <form onSubmit={handleLogin} className="space-y-4">
                <div>
                  <label className="label">{ar ? 'اسم المستخدم' : 'Username'}</label>
                  <input
                    className="input"
                    value={username}
                    onChange={e => setUsername(e.target.value)}
                    placeholder={ar ? 'أدخل اسم المستخدم' : 'Enter username'}
                    autoComplete="username"
                  />
                </div>
                <div>
                  <label className="label">{ar ? 'كلمة المرور' : 'Password'}</label>
                  <input
                    className="input"
                    type="password"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    placeholder={ar ? 'أدخل كلمة المرور' : 'Enter password'}
                    autoComplete="current-password"
                  />
                </div>
                <button type="submit" className="btn-primary w-full py-2.5 text-base">
                  {ar ? 'دخول' : 'Login'}
                </button>
                <p className="text-xs text-center text-gray-400">
                  {ar ? 'الحساب الافتراضي: kbws / kbws2024' : 'Default: kbws / kbws2024'}
                </p>
              </form>
            ) : (
              <form onSubmit={handleRegister} className="space-y-4">
                <div>
                  <label className="label">{ar ? 'اسم المدرسة' : 'School Name'}</label>
                  <input
                    className="input"
                    value={schoolName}
                    onChange={e => setSchoolName(e.target.value)}
                    placeholder={ar ? 'اسم المدرسة' : 'School name'}
                  />
                </div>
                <div>
                  <label className="label">{ar ? 'اسم المستخدم' : 'Username'}</label>
                  <input
                    className="input"
                    value={newUsername}
                    onChange={e => setNewUsername(e.target.value)}
                    placeholder={ar ? 'اختر اسم مستخدم' : 'Choose a username'}
                    autoComplete="username"
                  />
                </div>
                <div>
                  <label className="label">{ar ? 'كلمة المرور' : 'Password'}</label>
                  <input
                    className="input"
                    type="password"
                    value={newPassword}
                    onChange={e => setNewPassword(e.target.value)}
                    placeholder={ar ? 'كلمة المرور' : 'Password'}
                    autoComplete="new-password"
                  />
                </div>
                <div>
                  <label className="label">{ar ? 'تأكيد كلمة المرور' : 'Confirm Password'}</label>
                  <input
                    className="input"
                    type="password"
                    value={confirmPassword}
                    onChange={e => setConfirmPassword(e.target.value)}
                    placeholder={ar ? 'أعد كتابة كلمة المرور' : 'Confirm password'}
                    autoComplete="new-password"
                  />
                </div>
                <button type="submit" className="btn-primary w-full py-2.5 text-base">
                  {ar ? 'تسجيل المدرسة' : 'Register School'}
                </button>
              </form>
            )}
          </div>
        </div>

        <p className="text-center text-xs text-gray-400 mt-6">
          {ar ? '© 2024 فريق جودة إنجازات الطلبة' : '© 2024 Student Achievement Quality Team'}
        </p>
      </div>
    </div>
  )
}
