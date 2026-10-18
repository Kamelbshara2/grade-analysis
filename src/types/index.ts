// ===== SUBJECT CODES =====
export type SubjectCode =
  | 'arabic'
  | 'english'
  | 'math'
  | 'islamic'
  | 'social'
  | 'science'
  | 'physics'
  | 'chemistry'
  | 'biology';

export type Track = 'general' | 'advanced';
export type Cycle = 2 | 3;
export type Semester = 1 | 2 | 3;
export type Nationality = 'citizen' | 'expat' | 'unknown';
export type Language = 'ar' | 'en';

// ===== STUDENT & GRADE DATA =====
export interface Student {
  id: string;       // permanent student ID
  name: string;
  nationality: Nationality;
}

export interface SubjectGrade {
  s1: number | null;
  s2: number | null;
  s3: number | null;
  annual: number | null;
}

export interface StudentRecord {
  student: Student;
  yearId: string;       // e.g. '2023-2024'
  grade: number;        // 5-12
  track: Track;
  section: string;      // section number e.g. '1'
  sectionRaw: string;   // original section string
  cycle: Cycle;
  grades: Partial<Record<SubjectCode, SubjectGrade>>;
  annualAvg: number | null;
  annualTotal: number | null;
  status: 'pass' | 'fail' | 'unknown';
}

// ===== DIAGNOSTIC TEST =====
export interface DiagnosticScore {
  studentId: string;
  yearId: string;
  subjectCode: SubjectCode;
  score: number;
}

// ===== LEARNING OUTCOMES =====
export interface LearningOutcome {
  id: string;
  subjectCode: SubjectCode;
  grade: number;
  code: string;
  descriptionAr: string;
  descriptionEn: string;
}

export interface OutcomeScore {
  studentId: string;
  yearId: string;
  semester: Semester;
  subjectCode: SubjectCode;
  outcomeId: string;
  score: number;
  maxScore: number;
}

// ===== STATISTICS =====
export interface SubjectStats {
  subjectCode: SubjectCode;
  count: number;
  passCount: number;
  failCount: number;
  above75Count: number;
  above90Count: number;
  passRate: number;
  failRate: number;
  above75Rate: number;
  above90Rate: number;
  mean: number;
  median: number;
  stdDev: number;
  variance: number;
  q1: number;
  q3: number;
  iqr: number;
  min: number;
  max: number;
  // Bands
  band_low: number;       // <50 (cycle2) or <60 (cycle3)
  band_low_mid: number;   // 50-70 or 60-70
  band_mid: number;       // 70-80
  band_high: number;      // 80-90
  band_top: number;       // 90+
}

export interface ProgressResult {
  studentId: string;
  studentName: string;
  baselineScore: number | null;
  baselineType: 'previous' | 'diagnostic' | 'none';
  currentScore: number | null;
  diff: number | null;
  category: 'significant_progress' | 'slight_progress' | 'stable' | 'regression' | 'no_baseline';
}

// ===== FILTERS =====
export interface AnalysisFilter {
  yearId?: string;
  semester?: Semester | 'annual';
  subjectCode?: SubjectCode;
  grade?: number;
  section?: string;
  track?: Track;
  nationality?: Nationality;
  baselineMode?: 'previous' | 'diagnostic';
}

// ===== UPLOAD =====
export interface UploadResult {
  yearId: string;
  totalRows: number;
  imported: number;
  skipped: number;
  errors: string[];
  subjects: SubjectCode[];
  sections: string[];
}

// ===== TERM SCORES (simple per-term upload) =====
export interface TermScore {
  studentId: string;
  yearId: string;
  semester: 1 | 2 | 3;
  subjectCode: SubjectCode;
  grade: number;
  section: string;
  score: number | null;
}

// ===== FORMATIVE / EXAM COMPONENT SCORES =====
export interface FormativeScore {
  studentId: string;
  yearId: string;
  subjectCode: SubjectCode;
  grade: number;
  section: string;
  s1: number | null;   // التقويم التكويني/المستمر للفصل الأول
  s2: number | null;   // التقويم التكويني/المستمر للفصل الثاني
  s3: number | null;   // التقويم التكويني/المستمر للفصل الثالث
}

export interface ExamScore {
  studentId: string;
  yearId: string;
  subjectCode: SubjectCode;
  grade: number;
  section: string;
  s1: number | null;   // درجة اختبار الفصل الأول
  s2: number | null;   // درجة اختبار الفصل الثاني
  s3: number | null;   // درجة اختبار الفصل الثالث
}

// ===== STORED DATA (in localStorage / D1) =====
export interface YearData {
  yearId: string;
  records: StudentRecord[];
  diagnosticScores: DiagnosticScore[];
  formativeScores: FormativeScore[];
  examScores: ExamScore[];
  termScores: TermScore[];
  uploadedAt: string;
}

export interface AppData {
  years: Record<string, YearData>;
  learningOutcomes: LearningOutcome[];
  outcomeScores: OutcomeScore[];
}
