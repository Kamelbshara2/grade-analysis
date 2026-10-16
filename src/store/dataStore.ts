import type { AppData, YearData, StudentRecord, DiagnosticScore, LearningOutcome, OutcomeScore, FormativeScore, ExamScore, TermScore } from '@/types'

const STORAGE_KEY = 'grade_analysis_v1'
const API_LOADED_KEY = 'grade_analysis_api_loaded'

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
  // Merge year records from API (API is source of truth for grade records)
  for (const [yearId, yearData] of Object.entries(apiData.years)) {
    if (!_data.years[yearId] || _data.years[yearId].records.length === 0) {
      _data.years[yearId] = yearData
    }
  }
  // Keep user's local learningOutcomes and outcomeScores
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
    })()
    return _initPromise
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
  },

  importDiagnosticScores(yearId: string, scores: DiagnosticScore[]): void {
    if (!_data.years[yearId]) {
      _data.years[yearId] = { yearId, records: [], diagnosticScores: scores, formativeScores: [], examScores: [], termScores: [], uploadedAt: new Date().toISOString() }
    } else {
      _data.years[yearId].diagnosticScores = scores
    }
    saveData(_data)
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
  },

  getTermScores(yearId: string, semester?: 1 | 2 | 3): TermScore[] {
    const all = _data.years[yearId]?.termScores || []
    return semester ? all.filter(s => s.semester === semester) : all
  },

  /** Merge external baseline records — only adds students not already present for that yearId */
  mergeExternalRecords(yearId: string, incoming: StudentRecord[]): number {
    if (!_data.years[yearId]) {
      _data.years[yearId] = { yearId, records: [], diagnosticScores: [], formativeScores: [], examScores: [], termScores: [], uploadedAt: new Date().toISOString() }
    }
    const existing = new Set(_data.years[yearId].records.map(r => r.student.id))
    const toAdd = incoming.filter(r => !existing.has(r.student.id))
    _data.years[yearId].records = [..._data.years[yearId].records, ...toAdd]
    saveData(_data)
    return toAdd.length
  },

  /** Merge external baseline TermScores — only adds (studentId, semester, subjectCode) combos not already present */
  mergeExternalTermScores(yearId: string, incoming: TermScore[]): number {
    if (!_data.years[yearId]) {
      _data.years[yearId] = { yearId, records: [], diagnosticScores: [], formativeScores: [], examScores: [], termScores: [], uploadedAt: new Date().toISOString() }
    }
    const existing = new Set(
      (_data.years[yearId].termScores || []).map(s => `${s.studentId}|${s.semester}|${s.subjectCode}`)
    )
    const toAdd = incoming.filter(s => !existing.has(`${s.studentId}|${s.semester}|${s.subjectCode}`))
    _data.years[yearId].termScores = [...(_data.years[yearId].termScores || []), ...toAdd]
    saveData(_data)
    return toAdd.length
  },

  importTermScores(yearId: string, semester: 1 | 2 | 3, scores: TermScore[]): void {
    if (!_data.years[yearId]) {
      _data.years[yearId] = { yearId, records: [], diagnosticScores: [], formativeScores: [], examScores: [], termScores: scores, uploadedAt: new Date().toISOString() }
    } else {
      // Replace scores for this semester, keep others
      const existing = (_data.years[yearId].termScores || []).filter(s => s.semester !== semester)
      _data.years[yearId].termScores = [...existing, ...scores]
    }
    saveData(_data)
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

  /**
   * For a given year, classify students as:
   *   returning — their ID also appears in any other year's records
   *   newTransfer — their ID appears only in this year
   */
  getStudentGroups(yearId: string): { returning: Set<string>; newTransfer: Set<string> } {
    const currentIds = new Set((_data.years[yearId]?.records ?? []).map(r => r.student.id))
    const otherYearIds = new Set<string>()
    for (const [yr, yd] of Object.entries(_data.years)) {
      if (yr === yearId) continue
      for (const r of yd.records) otherYearIds.add(r.student.id)
    }
    // Also check TermScores from other years (for years with no annual records)
    for (const [yr, yd] of Object.entries(_data.years)) {
      if (yr === yearId) continue
      for (const s of yd.termScores ?? []) otherYearIds.add(s.studentId)
    }
    const returning = new Set<string>()
    const newTransfer = new Set<string>()
    for (const id of currentIds) {
      if (otherYearIds.has(id)) returning.add(id)
      else newTransfer.add(id)
    }
    return { returning, newTransfer }
  },
}
