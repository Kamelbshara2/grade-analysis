import type { AppData, YearData, StudentRecord, DiagnosticScore, LearningOutcome, OutcomeScore } from '@/types'

const STORAGE_KEY = 'grade_analysis_v1'

function loadData(): AppData {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) return JSON.parse(raw) as AppData
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

export const dataStore = {
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
      uploadedAt: new Date().toISOString(),
    }
    saveData(_data)
  },

  importDiagnosticScores(yearId: string, scores: DiagnosticScore[]): void {
    if (!_data.years[yearId]) {
      _data.years[yearId] = { yearId, records: [], diagnosticScores: scores, uploadedAt: new Date().toISOString() }
    } else {
      _data.years[yearId].diagnosticScores = scores
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

  getUniqueSections(yearId?: string, grade?: number): string[] {
    let records = yearId ? this.getRecordsByYear(yearId) : this.getAllRecords()
    if (grade) records = records.filter(r => r.grade === grade)
    return [...new Set(records.map(r => r.section))].sort()
  },

  clearAll(): void {
    _data = { years: {}, learningOutcomes: [], outcomeScores: [] }
    localStorage.removeItem(STORAGE_KEY)
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
