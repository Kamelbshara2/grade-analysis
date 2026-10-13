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

// ── Formative / Continuous Assessment Template ───────────────────────────────
// Columns: رقم الطالب | الصف | الفصل | per subject: (ف1 - تكويني) | (ف3 - تكويني)
export function downloadFormativeTemplate() {
  const wb = XLSX.utils.book_new()

  const allSubjects = [
    'اللغة العربية', 'اللغة الإنجليزية', 'الرياضيات',
    'التربية الإسلامية', 'الدراسات الاجتماعية', 'العلوم',
    'الفيزياء', 'الكيمياء', 'الأحياء',
  ]

  // Row 0: title
  const titleRow = ['نموذج رفع درجات التقويم التكويني / المستمر (الفصل الأول والثالث)', ...Array(2 + allSubjects.length * 2 - 1).fill(null)]
  // Row 1: subject spans
  const subjectRow: (string | null)[] = [null, null, null]
  for (const s of allSubjects) subjectRow.push(s, null)
  // Row 2: semester labels
  const semRow: (string | null)[] = [null, null, null]
  for (const _s of allSubjects) { semRow.push('ف1 - تكويني', 'ف3 - تكويني') }
  // Row 3: column headers
  const headerRow = ['رقم الطالب', 'الصف', 'الفصل (القسم)', ...allSubjects.flatMap(s => [`${s} ف1`, `${s} ف3`])]
  // Row 4: example
  const exRow = ['123456', 7, '1', 78, 82, 70, 75, 80, 85, 72, 74, '', '', '', '', '', '', '', '', '']

  const data = [titleRow, subjectRow, semRow, headerRow, exRow]
  const ws = XLSX.utils.aoa_to_sheet(data)
  ws['!cols'] = [{ wch: 14 }, { wch: 7 }, { wch: 12 }, ...Array(allSubjects.length * 2).fill({ wch: 10 })]
  XLSX.utils.book_append_sheet(wb, ws, 'التقويم التكويني')

  // Instruction sheet
  const instrData = [
    ['تعليمات ملء النموذج'],
    [''],
    ['1. أدخل رقم الطالب في العمود الأول (يجب أن يطابق رقم الطالب في ملف الدرجات السنوية).'],
    ['2. أدخل رقم الصف الدراسي (5-12).'],
    ['3. أدخل رقم القسم/الفصل.'],
    ['4. لكل مادة: أدخل درجة التقويم التكويني للفصل الأول (ف1) والثالث (ف3).'],
    ['5. اترك الخانة فارغة إذا لم تُدرَّس المادة للطالب.'],
    ['6. النطاق المقبول: 0 - 100.'],
    [''],
    ['* يستخدم هذا النموذج لتقرير معيار 1.3 - تحليل الفجوات بين التكويني والختامي.'],
  ]
  const instrWs = XLSX.utils.aoa_to_sheet(instrData)
  instrWs['!cols'] = [{ wch: 70 }]
  XLSX.utils.book_append_sheet(wb, instrWs, 'تعليمات')

  XLSX.writeFile(wb, 'نموذج_التقويم_التكويني.xlsx')
}

// ── Exam Scores Template ──────────────────────────────────────────────────────
// Columns: رقم الطالب | الصف | الفصل | per subject: (ف1 - اختبار) | (ف3 - اختبار)
export function downloadExamTemplate() {
  const wb = XLSX.utils.book_new()

  const allSubjects = [
    'اللغة العربية', 'اللغة الإنجليزية', 'الرياضيات',
    'التربية الإسلامية', 'الدراسات الاجتماعية', 'العلوم',
    'الفيزياء', 'الكيمياء', 'الأحياء',
  ]

  const titleRow = ['نموذج رفع درجات اختبار نهاية الفصل (الفصل الأول والثالث)', ...Array(2 + allSubjects.length * 2 - 1).fill(null)]
  const subjectRow: (string | null)[] = [null, null, null]
  for (const s of allSubjects) subjectRow.push(s, null)
  const semRow: (string | null)[] = [null, null, null]
  for (const _s of allSubjects) { semRow.push('ف1 - اختبار', 'ف3 - اختبار') }
  const headerRow = ['رقم الطالب', 'الصف', 'الفصل (القسم)', ...allSubjects.flatMap(s => [`${s} ف1`, `${s} ف3`])]
  const exRow = ['123456', 7, '1', 72, 78, 65, 70, 74, 80, 68, 72, '', '', '', '', '', '', '', '', '']

  const data = [titleRow, subjectRow, semRow, headerRow, exRow]
  const ws = XLSX.utils.aoa_to_sheet(data)
  ws['!cols'] = [{ wch: 14 }, { wch: 7 }, { wch: 12 }, ...Array(allSubjects.length * 2).fill({ wch: 10 })]
  XLSX.utils.book_append_sheet(wb, ws, 'درجات الاختبار')

  const instrData = [
    ['تعليمات ملء النموذج'],
    [''],
    ['1. أدخل رقم الطالب (يطابق ملف الدرجات السنوية).'],
    ['2. أدخل رقم الصف الدراسي (5-12).'],
    ['3. أدخل رقم القسم/الفصل.'],
    ['4. لكل مادة: أدخل درجة اختبار نهاية الفصل الأول (ف1) والثالث (ف3).'],
    ['5. اترك الخانة فارغة إذا لم تُدرَّس المادة.'],
    ['6. النطاق المقبول: 0 - 100.'],
    [''],
    ['* يستخدم هذا النموذج للمقارنة مع درجات التقويم التكويني في تقرير معيار 1.3.'],
  ]
  const instrWs = XLSX.utils.aoa_to_sheet(instrData)
  instrWs['!cols'] = [{ wch: 70 }]
  XLSX.utils.book_append_sheet(wb, instrWs, 'تعليمات')

  XLSX.writeFile(wb, 'نموذج_درجات_الاختبار.xlsx')
}

// ── Term Scores Template ──────────────────────────────────────────────────────
// Simple format: رقم الطالب | الصف | الفصل | subject1 | subject2 | ...
export function downloadTermTemplate(semester: 1 | 2 | 3) {
  const wb = XLSX.utils.book_new()
  const semLabel = semester === 1 ? 'الأول' : semester === 2 ? 'الثاني' : 'الثالث'

  const allSubjects = [
    'اللغة العربية', 'اللغة الإنجليزية', 'الرياضيات',
    'التربية الإسلامية', 'الدراسات الاجتماعية', 'العلوم',
    'الفيزياء', 'الكيمياء', 'الأحياء',
  ]

  const titleRow = [`نموذج رفع درجات الفصل ${semLabel}`, ...Array(2 + allSubjects.length - 1).fill(null)]
  const headerRow = ['رقم الطالب', 'الصف', 'الفصل (القسم)', ...allSubjects]
  const exRow = ['123456', 7, '1', 78, 72, 80, 75, 70, 82, '', '', '']

  const ws = XLSX.utils.aoa_to_sheet([titleRow, headerRow, exRow])
  ws['!cols'] = [{ wch: 14 }, { wch: 7 }, { wch: 12 }, ...Array(allSubjects.length).fill({ wch: 12 })]
  XLSX.utils.book_append_sheet(wb, ws, `درجات الفصل ${semLabel}`)

  const instrData = [
    [`تعليمات ملء نموذج درجات الفصل ${semLabel}`],
    [''],
    ['1. أدخل رقم الطالب (يجب أن يطابق رقم الطالب في ملف الدرجات السنوية).'],
    ['2. أدخل رقم الصف الدراسي (5-12).'],
    ['3. أدخل رقم القسم/الفصل.'],
    ['4. أدخل درجة كل مادة من 100.'],
    ['5. اترك الخانة فارغة إذا لم تُدرَّس المادة للطالب.'],
    ['6. النطاق المقبول: 0 - 100.'],
    [''],
    ['* تُستخدم هذه الدرجات لمتابعة تطور أداء الطلاب من فصل لآخر ومقارنتهم بدرجات التشخيصي.'],
  ]
  const instrWs = XLSX.utils.aoa_to_sheet(instrData)
  instrWs['!cols'] = [{ wch: 70 }]
  XLSX.utils.book_append_sheet(wb, instrWs, 'تعليمات')

  XLSX.writeFile(wb, `نموذج_درجات_الفصل_${semLabel}.xlsx`)
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
