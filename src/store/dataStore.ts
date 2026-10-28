import type { AppData, YearData, StudentRecord, DiagnosticScore, LearningOutcome, OutcomeScore, FormativeScore, ExamScore, TermScore, SubjectCode } from '@/types'

const STORAGE_KEY = 'grade_analysis_v1'
const API_LOADED_KEY = 'grade_analysis_api_loaded'
const NEON_SYNCED_KEY = 'grade_analysis_neon_synced_v1'

function loadData(): AppData {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as AppData
      // Backfill missing arrays from older stored data
      for (const yd of Object.values(parsed.years)) {
        if (!yd.formativeScores) yd.formativeScores = []
        if (!yd.examScores) yd.examScores = []
        if (!yd.termScores) yd.termScores = []
      }
      return parsed
    }
  } catch {
    // ignore
  }
  return { years: {}, learningOutcomes: [], outcomeScores: [] }
}

function saveData(data: AppData): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
  } catch {
    console.warn('Failed to save to localStorage')
  }
}

let _data: AppData = loadData()
let _initPromise: Promise<void> | null = null

/** Merge API data into existing data without overwriting user-added outcomes/scores */
function mergeApiData(apiData: AppData): void {
  for (const [yearId, yearData] of Object.entries(apiData.years)) {
    if (!_data.years[yearId]) {
      _data.years[yearId] = yearData
    } else {
      // Merge student records if API has more
      if (yearData.records.length > _data.years[yearId].records.length) {
        _data.years[yearId].records = yearData.records
      }
      // Always refresh scores from Neon — they may have been uploaded after the
      // student records were cached in localStorage
      if (yearData.formativeScores?.length) _data.years[yearId].formativeScores = yearData.formativeScores
      if (yearData.examScores?.length) _data.years[yearId].examScores = yearData.examScores
      if (yearData.termScores?.length) _data.years[yearId].termScores = yearData.termScores
      if (yearData.diagnosticScores?.length) _data.years[yearId].diagnosticScores = yearData.diagnosticScores
    }
  }
  saveData(_data)
}

export const dataStore = {
  // ===== INIT FROM API =====
  async initFromAPI(): Promise<void> {
    if (_initPromise) return _initPromise
    _initPromise = (async () => {
      try {
        const res = await fetch('/api/data')
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const apiData = await res.json() as AppData
        if (apiData.years && Object.keys(apiData.years).length > 0) {
          mergeApiData(apiData)
        }
      } catch (err) {
        console.warn('Failed to load data from API, using localStorage only:', err)
      }

      // One-time migration: push any old localStorage data to Neon
      if (!localStorage.getItem(NEON_SYNCED_KEY)) {
        this.syncAllToNeon()
          .then(() => localStorage.setItem(NEON_SYNCED_KEY, 'true'))
          .catch(e => console.warn('One-time Neon sync failed:', e))
      }
    })()
    return _initPromise
  },

  /** Push all localStorage data to Neon (one-time migration for old data) */
  async syncAllToNeon(): Promise<void> {
    for (const [yearId, yd] of Object.entries(_data.years)) {
      const calls: Promise<unknown>[] = []

      if (yd.records.length > 0) {
        calls.push(fetch('/api/students', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ yearId, records: yd.records }),
        }))
      }
      if (yd.diagnosticScores && yd.diagnosticScores.length > 0) {
        calls.push(fetch('/api/diagnostic-scores', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ yearId, scores: yd.diagnosticScores }),
        }))
      }
      if (yd.formativeScores && yd.formativeScores.length > 0) {
        calls.push(fetch('/api/formative-scores', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ yearId, scores: yd.formativeScores }),
        }))
      }
      if (yd.examScores && yd.examScores.length > 0) {
        calls.push(fetch('/api/exam-scores', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ yearId, scores: yd.examScores }),
        }))
      }
      // Term scores grouped by semester
      for (const sem of [1, 2, 3] as const) {
        const semScores = (yd.termScores || []).filter(s => s.semester === sem)
        if (semScores.length > 0) {
          calls.push(fetch('/api/term-scores', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ yearId, semester: sem, scores: semScores }),
          }))
        }
      }

      await Promise.all(calls)
    }
  },

  /** Reload in-memory data from localStorage (call after external mutation) */
  reload(): void {
    _data = loadData()
  },

  // ===== YEARS =====
  getYears(): string[] {
    return Object.keys(_data.years).sort()
  },

  getYearData(yearId: string): YearData | null {
    return _data.years[yearId] || null
  },

  getAllRecords(): StudentRecord[] {
    return Object.values(_data.years).flatMap(y => y.records)
  },

  getRecordsByYear(yearId: string): StudentRecord[] {
    return _data.years[yearId]?.records || []
  },

  getDiagnosticScores(yearId: string): DiagnosticScore[] {
    return _data.years[yearId]?.diagnosticScores || []
  },

  // ===== IMPORT =====
  importYearData(yearId: string, records: StudentRecord[]): void {
    const existing = _data.years[yearId]
    _data.years[yearId] = {
      yearId,
      records,
      diagnosticScores: existing?.diagnosticScores || [],
      formativeScores: existing?.formativeScores || [],
      examScores: existing?.examScores || [],
      termScores: existing?.termScores || [],
      uploadedAt: new Date().toISOString(),
    }
    saveData(_data)
    fetch('/api/students', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ yearId, records }),
    }).catch(e => console.warn('Neon sync students failed:', e))
  },

  importExternalRecords(yearId: string, records: StudentRecord[]): void {
    if (!_data.years[yearId]) {
      _data.years[yearId] = { yearId, records, diagnosticScores: [], formativeScores: [], examScores: [], termScores: [], uploadedAt: new Date().toISOString() }
    } else {
      // Remove existing records with same studentId+sourceSchool combination, then append
      const schoolName = records[0]?.sourceSchool
      const existing = _data.years[yearId].records.filter(r => r.sourceSchool !== schoolName)
      _data.years[yearId].records = [...existing, ...records]
    }
    saveData(_data)
    fetch('/api/students', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ yearId, records }),
    }).catch(e => console.warn('Neon sync students failed:', e))
  },

  getSourceSchools(yearId?: string): string[] {
    const years = yearId ? [yearId] : Object.keys(_data.years)
    const schools = new Set<string>()
    for (const yr of years) {
      for (const r of (_data.years[yr]?.records || [])) {
        if (r.sourceSchool) schools.add(r.sourceSchool)
      }
    }
    return Array.from(schools).sort()
  },

  importDiagnosticScores(yearId: string, scores: DiagnosticScore[]): void {
    if (!_data.years[yearId]) {
      _data.years[yearId] = { yearId, records: [], diagnosticScores: scores, formativeScores: [], examScores: [], termScores: [], uploadedAt: new Date().toISOString() }
    } else {
      _data.years[yearId].diagnosticScores = scores
    }
    saveData(_data)
    fetch('/api/diagnostic-scores', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ yearId, scores }),
    }).catch(e => console.warn('Neon sync diagnostic-scores failed:', e))
  },

  getFormativeScores(yearId: string): FormativeScore[] {
    return _data.years[yearId]?.formativeScores || []
  },

  importFormativeScores(yearId: string, scores: FormativeScore[]): void {
    if (!_data.years[yearId]) {
      _data.years[yearId] = { yearId, records: [], diagnosticScores: [], formativeScores: scores, examScores: [], termScores: [], uploadedAt: new Date().toISOString() }
    } else {
      _data.years[yearId].formativeScores = scores
    }
    saveData(_data)
    fetch('/api/formative-scores', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ yearId, scores }),
    }).catch(e => console.warn('Neon sync formative-scores failed:', e))
  },

  getExamScores(yearId: string): ExamScore[] {
    return _data.years[yearId]?.examScores || []
  },

  importExamScores(yearId: string, scores: ExamScore[]): void {
    if (!_data.years[yearId]) {
      _data.years[yearId] = { yearId, records: [], diagnosticScores: [], formativeScores: [], examScores: scores, termScores: [], uploadedAt: new Date().toISOString() }
    } else {
      _data.years[yearId].examScores = scores
    }
    saveData(_data)
    fetch('/api/exam-scores', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ yearId, scores }),
    }).catch(e => console.warn('Neon sync exam-scores failed:', e))
  },

  getTermScores(yearId: string, semester?: 1 | 2 | 3): TermScore[] {
    const all = _data.years[yearId]?.termScores || []
    return semester ? all.filter(s => s.semester === semester) : all
  },

  importTermScores(yearId: string, semester: 1 | 2 | 3, scores: TermScore[]): void {
    if (!_data.years[yearId]) {
      _data.years[yearId] = { yearId, records: [], diagnosticScores: [], formativeScores: [], examScores: [], termScores: scores, uploadedAt: new Date().toISOString() }
    } else {
      const existing = (_data.years[yearId].termScores || []).filter(s => s.semester !== semester)
      _data.years[yearId].termScores = [...existing, ...scores]
    }
    saveData(_data)
    fetch('/api/term-scores', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ yearId, semester, scores }),
    }).catch(e => console.warn('Neon sync term-scores failed:', e))
  },

  mergeFormativeExam(
    yearId: string,
    semester: 1 | 2 | 3,
    formativeItems: Array<{ studentId: string; subjectCode: SubjectCode; grade: number; section: string; score: number | null }>,
    examItems: Array<{ studentId: string; subjectCode: SubjectCode; grade: number; section: string; score: number | null }>,
  ): void {
    if (!_data.years[yearId]) {
      _data.years[yearId] = { yearId, records: [], diagnosticScores: [], formativeScores: [], examScores: [], termScores: [], uploadedAt: new Date().toISOString() }
    }

    const semKey = `s${semester}` as 's1' | 's2' | 's3'

    // Merge formative scores
    const fScores = _data.years[yearId].formativeScores
    for (const item of formativeItems) {
      const existing = fScores.find(f => f.studentId === item.studentId && f.subjectCode === item.subjectCode)
      if (existing) {
        existing[semKey] = item.score
      } else {
        fScores.push({ studentId: item.studentId, yearId, subjectCode: item.subjectCode, grade: item.grade, section: item.section, s1: null, s2: null, s3: null, [semKey]: item.score })
      }
    }

    // Merge exam scores
    const eScores = _data.years[yearId].examScores
    for (const item of examItems) {
      const existing = eScores.find(e => e.studentId === item.studentId && e.subjectCode === item.subjectCode)
      if (existing) {
        existing[semKey] = item.score
      } else {
        eScores.push({ studentId: item.studentId, yearId, subjectCode: item.subjectCode, grade: item.grade, section: item.section, s1: null, s2: null, s3: null, [semKey]: item.score })
      }
    }

    saveData(_data)
    fetch('/api/formative-exam', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ yearId, semester, formativeItems, examItems }),
    }).catch(e => console.warn('Neon sync formative-exam failed:', e))
  },

  // ===== LEARNING OUTCOMES =====
  getLearningOutcomes(): LearningOutcome[] {
    return _data.learningOutcomes
  },

  saveLearningOutcome(outcome: LearningOutcome): void {
    const idx = _data.learningOutcomes.findIndex(o => o.id === outcome.id)
    if (idx >= 0) _data.learningOutcomes[idx] = outcome
    else _data.learningOutcomes.push(outcome)
    saveData(_data)
  },

  deleteLearningOutcome(id: string): void {
    _data.learningOutcomes = _data.learningOutcomes.filter(o => o.id !== id)
    saveData(_data)
  },

  // ===== OUTCOME SCORES =====
  getOutcomeScores(): OutcomeScore[] {
    return _data.outcomeScores
  },

  importOutcomeScores(scores: OutcomeScore[]): void {
    _data.outcomeScores = scores
    saveData(_data)
  },

  // ===== UTILITIES =====
  getUniqueGrades(yearId?: string): number[] {
    const records = yearId ? this.getRecordsByYear(yearId) : this.getAllRecords()
    return [...new Set(records.map(r => r.grade))].sort((a, b) => a - b)
  },

  getUniqueSections(yearId?: string, grade?: number, track?: string): string[] {
    let records = yearId ? this.getRecordsByYear(yearId) : this.getAllRecords()
    if (grade) records = records.filter(r => r.grade === grade)
    if (track) records = records.filter(r => r.track === track)
    return [...new Set(records.map(r => r.section))].sort((a, b) => +a - +b)
  },

  clearAll(): void {
    _data = { years: {}, learningOutcomes: [], outcomeScores: [] }
    localStorage.removeItem(STORAGE_KEY)
    localStorage.removeItem(API_LOADED_KEY)
    _initPromise = null
  },

  getStorageSizeKB(): number {
    try {
      const raw = localStorage.getItem(STORAGE_KEY) || ''
      return Math.round(raw.length / 1024)
    } catch {
      return 0
    }
  },
}
