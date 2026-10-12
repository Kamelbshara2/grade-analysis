import * as XLSX from 'xlsx'

// ── Annual Grades Template ───────────────────────────────────────────────────
// Matches the Manhal export format the parser expects:
//   Row 0: title row
//   Row 1: subject names (cols 9+, groups of 4)
//   Row 2: semester labels (ف1, ف2, ف3, السنوي per subject)
//   Row 3: column-header row (م, الصف, ..., اسم الطالب, رقم الطالب, subj headers)
//   Row 4+: data (example row)

const CYCLE2_SUBJECTS = [
  'اللغة العربية',
  'اللغة الإنجليزية',
  'الرياضيات',
  'التربية الإسلامية',
  'الدراسات الاجتماعية',
  'العلوم',
]

const CYCLE3_SUBJECTS = [
  'اللغة العربية',
  'اللغة الإنجليزية',
  'الرياضيات',
  'التربية الإسلامية',
  'الدراسات الاجتماعية',
  'الفيزياء',
  'الكيمياء',
  'الأحياء',
]

const SEM_LABELS = ['ف1', 'ف2', 'ف3', 'السنوي']

function buildAnnualSheet(subjects: string[], cycleLabel: string, gradeRange: string) {
  const fixedCols = ['م', 'رمز المدرسة', 'المدرسة', 'المرحلة', 'الحلقة', 'الجنس', 'الفصل', 'اسم الطالب', 'رقم الطالب']

  // Row 0: title
  const titleRow = [`نموذج رفع الدرجات السنوية — ${cycleLabel} (${gradeRange})`, ...Array(fixedCols.length - 1 + subjects.length * 4 - 1).fill(null)]

  // Row 1 (index 1): subject names, starting at col 9
  const subjectRow: (string | null)[] = [...Array(9).fill(null)]
  for (const s of subjects) {
    subjectRow.push(s, null, null, null)
  }

  // Row 2 (index 2): semester labels
  const semRow: (string | null)[] = [...Array(9).fill(null)]
  for (const _s of subjects) {
    for (const label of SEM_LABELS) semRow.push(label)
  }

  // Row 3 (index 3): column headers
  const headerRow: string[] = [...fixedCols]
  for (const s of subjects) {
    for (const label of SEM_LABELS) headerRow.push(`${s} ${label}`)
  }

  // Row 4 (index 4): example data row
  const exampleGrade = gradeRange.split('–')[0].trim()
  const exampleSection = `0${exampleGrade}[اللغة الثالثة - المسار العام]/1`
  const exRow: (string | number | null)[] = [
    1, 'KBWS', 'مدرسة خالد بن الوليد', 'الثانوية', cycleLabel, 'ذكر',
    exampleSection, 'اسم الطالب (مثال)', '123456',
  ]
  for (const _s of subjects) {
    exRow.push(75, 78, 80, 78) // example scores
  }

  return [titleRow, subjectRow, semRow, headerRow, exRow]
}

export function downloadAnnualTemplate() {
  const wb = XLSX.utils.book_new()

  // Sheet 1: Cycle 2 (grades 5–8)
  const c2Data = buildAnnualSheet(CYCLE2_SUBJECTS, 'الثانية', '5–8')
  const ws2 = XLSX.utils.aoa_to_sheet(c2Data)
  ws2['!cols'] = [
    { wch: 4 }, { wch: 10 }, { wch: 20 }, { wch: 10 }, { wch: 10 }, { wch: 6 },
    { wch: 30 }, { wch: 22 }, { wch: 12 },
    ...Array(CYCLE2_SUBJECTS.length * 4).fill({ wch: 8 }),
  ]
  XLSX.utils.book_append_sheet(wb, ws2, 'الحلقة الثانية (5-8)')

  // Sheet 2: Cycle 3 (grades 9–12)
  const c3Data = buildAnnualSheet(CYCLE3_SUBJECTS, 'الثالثة', '9–12')
  const ws3 = XLSX.utils.aoa_to_sheet(c3Data)
  ws3['!cols'] = [
    { wch: 4 }, { wch: 10 }, { wch: 20 }, { wch: 10 }, { wch: 10 }, { wch: 6 },
    { wch: 30 }, { wch: 22 }, { wch: 12 },
    ...Array(CYCLE3_SUBJECTS.length * 4).fill({ wch: 8 }),
  ]
  XLSX.utils.book_append_sheet(wb, ws3, 'الحلقة الثالثة (9-12)')

  XLSX.writeFile(wb, 'نموذج_رفع_الدرجات_السنوية.xlsx')
}

// ── Diagnostic Scores Template ───────────────────────────────────────────────
// Wide format: student_id | arabic | english | math | science | islamic | social | physics | chemistry | biology
export function downloadDiagnosticTemplate() {
  const wb = XLSX.utils.book_new()

  const headers = [
    'رقم الطالب',
    'اللغة العربية',
    'اللغة الإنجليزية',
    'الرياضيات',
    'العلوم',
    'التربية الإسلامية',
    'الدراسات الاجتماعية',
    'الفيزياء',
    'الكيمياء',
    'الأحياء',
  ]

  const data = [
    headers,
    ['123456', 72, 68, 75, '', '', '', '', '', ''],
    ['123457', 65, 70, 80, 74, 88, 70, '', '', ''],
  ]

  const ws = XLSX.utils.aoa_to_sheet(data)
  ws['!cols'] = [{ wch: 14 }, ...Array(9).fill({ wch: 14 })]

  // Add a note row at the bottom
  const noteRow = ['* اترك الخانة فارغة إذا لم تُدرَّس المادة للطالب']
  XLSX.utils.sheet_add_aoa(ws, [noteRow], { origin: -1 })

  XLSX.utils.book_append_sheet(wb, ws, 'درجات التشخيصي')
  XLSX.writeFile(wb, 'نموذج_درجات_التشخيصي.xlsx')
}

// ── Nationality Template ─────────────────────────────────────────────────────
// Columns: رقم الطالب | الجنسية (مواطن / وافد)
export function downloadNationalityTemplate() {
  const wb = XLSX.utils.book_new()

  const data = [
    ['رقم الطالب', 'الجنسية'],
    ['123456', 'مواطن'],
    ['123457', 'وافد'],
    ['123458', 'مواطن'],
    ['', ''],
    ['* القيم المقبولة في عمود الجنسية:', 'مواطن   أو   وافد'],
  ]

  const ws = XLSX.utils.aoa_to_sheet(data)
  ws['!cols'] = [{ wch: 16 }, { wch: 20 }]

  XLSX.utils.book_append_sheet(wb, ws, 'الجنسية')
  XLSX.writeFile(wb, 'نموذج_الجنسية.xlsx')
}
