import { Printer } from 'lucide-react'
import { t } from '@/i18n/translations'
import type { Language } from '@/types'

interface MethodologyProps {
  lang: Language
}

function SectionTitle({ ar, en }: { ar: string; en: string }) {
  return (
    <div className="flex items-center gap-3 mb-4 border-b pb-2">
      <h2 className="text-lg font-bold text-primary-700 dark:text-primary-400">{ar}</h2>
      <span className="text-gray-400 text-sm">|</span>
      <h2 className="text-base font-semibold text-gray-500">{en}</h2>
    </div>
  )
}

function FormulaBox({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-gray-100 dark:bg-gray-800 rounded-lg p-3 font-mono text-sm my-2 text-center border border-gray-200 dark:border-gray-700">
      {children}
    </div>
  )
}

interface VariableRowProps {
  symbol: string
  ar: string
  en: string
  formula: string
  interpretation: string
}

function VariableRow({ symbol, ar, en, formula, interpretation }: VariableRowProps) {
  return (
    <tr className="border-b border-gray-100 dark:border-gray-800">
      <td className="py-2 px-3 font-mono font-bold text-primary-600 text-center">{symbol}</td>
      <td className="py-2 px-3 font-semibold">{ar}</td>
      <td className="py-2 px-3 text-gray-600 dark:text-gray-400">{en}</td>
      <td className="py-2 px-3 font-mono text-xs bg-gray-50 dark:bg-gray-800/50">{formula}</td>
      <td className="py-2 px-3 text-sm text-gray-500">{interpretation}</td>
    </tr>
  )
}

export default function Methodology({ lang }: MethodologyProps) {
  function handlePrint() {
    window.print()
  }

  return (
    <div className="space-y-6 max-w-5xl">
      {/* Header */}
      <div className="flex items-center justify-between no-print">
        <h1 className="text-xl font-bold">{t('methodology_title')}</h1>
        <button className="btn-primary flex items-center gap-2" onClick={handlePrint}>
          <Printer size={15} />
          {t('print')}
        </button>
      </div>

      <div className="bg-white dark:bg-gray-900 rounded-xl shadow p-8 space-y-10 print:shadow-none print:p-0">

        {/* Cover */}
        <div className="text-center border-b pb-6">
          <h2 className="text-2xl font-bold text-primary-700 dark:text-primary-400 mb-1">
            منصة تحليل بيانات انجازات الطلبة
          </h2>
          <h3 className="text-xl font-semibold text-gray-600 mb-1">
            Student Achievement Data Analysis Platform
          </h3>
          <p className="text-gray-500">لفريق ضمان الجودة · For Quality Assurance Teams</p>
        </div>

        {/* Section 1: Mission */}
        <section>
          <SectionTitle ar={t('methodology_mission')} en="Platform Mission" />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
            <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-4">
              <p className="text-gray-700 dark:text-gray-300 leading-relaxed">
                تهدف هذه المنصة إلى تمكين فرق ضمان الجودة من تحليل بيانات انجازات الطلاب بشكل شامل،
                وتتبع التقدم الفردي والجماعي، وتحديد الفجوات في مخرجات التعلم، واتخاذ قرارات
                تعليمية مبنية على البيانات.
              </p>
            </div>
            <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-4">
              <p className="text-gray-600 dark:text-gray-300 leading-relaxed">
                This platform enables quality assurance teams to comprehensively analyze student
                achievement data, track individual and group progress, identify gaps in learning
                outcomes, and make data-driven educational decisions.
              </p>
            </div>
          </div>
        </section>

        {/* Section 2: Data Structure */}
        <section>
          <SectionTitle ar={t('methodology_data_structure')} en="Data Structure" />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-sm">
            <div>
              <h4 className="font-semibold mb-2">الحلقة الثانية (الصفوف 5–8)</h4>
              <ul className="space-y-1 text-gray-600 dark:text-gray-400 list-disc list-inside">
                <li>درجة النجاح: <strong>50</strong></li>
                <li>3 فصول دراسية لكل عام</li>
                <li>الأوزان: ف1=35%, ف2=30%, ف3=35%</li>
              </ul>
            </div>
            <div>
              <h4 className="font-semibold mb-2">الحلقة الثالثة (الصفوف 9–12)</h4>
              <ul className="space-y-1 text-gray-600 dark:text-gray-400 list-disc list-inside">
                <li>درجة النجاح: <strong>60</strong></li>
                <li>3 فصول دراسية لكل عام</li>
                <li>الأوزان: ف1=35%, ف2=30%, ف3=35%</li>
              </ul>
            </div>
          </div>
          <div className="mt-4 overflow-x-auto">
            <table className="table-base w-full text-sm">
              <thead>
                <tr>
                  <th>الحلقة / Cycle</th>
                  <th>الصفوف / Grades</th>
                  <th>درجة النجاح / Pass Mark</th>
                  <th>ف1 Weight</th>
                  <th>ف2 Weight</th>
                  <th>ف3 Weight</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>الثانية / Cycle 2</td>
                  <td>5 – 8</td>
                  <td className="font-bold text-yellow-600">50</td>
                  <td>35%</td>
                  <td>30%</td>
                  <td>35%</td>
                </tr>
                <tr>
                  <td>الثالثة / Cycle 3</td>
                  <td>9 – 12</td>
                  <td className="font-bold text-orange-600">60</td>
                  <td>35%</td>
                  <td>30%</td>
                  <td>35%</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        {/* Section 3: Statistical Variables */}
        <section>
          <SectionTitle ar={t('methodology_variables')} en="Statistical Variables" />
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="bg-gray-100 dark:bg-gray-800">
                  <th className="py-2 px-3 text-center border border-gray-200 dark:border-gray-700">الرمز</th>
                  <th className="py-2 px-3 border border-gray-200 dark:border-gray-700">الاسم العربي</th>
                  <th className="py-2 px-3 border border-gray-200 dark:border-gray-700">English Name</th>
                  <th className="py-2 px-3 border border-gray-200 dark:border-gray-700">المعادلة / Formula</th>
                  <th className="py-2 px-3 border border-gray-200 dark:border-gray-700">التفسير / Interpretation</th>
                </tr>
              </thead>
              <tbody>
                <VariableRow
                  symbol="μ"
                  ar="المتوسط"
                  en="Mean"
                  formula="Σxᵢ / n"
                  interpretation="متوسط الدرجات — Average score"
                />
                <VariableRow
                  symbol="Md"
                  ar="الوسيط"
                  en="Median"
                  formula="القيمة الوسطى المرتبة"
                  interpretation="مقاوم للقيم الشاذة — Resistant to outliers"
                />
                <VariableRow
                  symbol="σ"
                  ar="الانحراف المعياري"
                  en="Std. Deviation"
                  formula="√(Σ(xᵢ−μ)² / n)"
                  interpretation="مدى التشتت حول المتوسط — Spread around mean"
                />
                <VariableRow
                  symbol="σ²"
                  ar="التباين"
                  en="Variance"
                  formula="Σ(xᵢ−μ)² / n"
                  interpretation="التشتت المربع — Squared spread"
                />
                <VariableRow
                  symbol="Q1"
                  ar="الربيع الأول"
                  en="First Quartile"
                  formula="Percentile(25%)"
                  interpretation="25% من الدرجات أدناه"
                />
                <VariableRow
                  symbol="Q3"
                  ar="الربيع الثالث"
                  en="Third Quartile"
                  formula="Percentile(75%)"
                  interpretation="75% من الدرجات أدناه"
                />
                <VariableRow
                  symbol="IQR"
                  ar="المدى الربعي"
                  en="Interquartile Range"
                  formula="Q3 − Q1"
                  interpretation="نطاق الـ 50% الوسطى — Middle 50% range"
                />
                <VariableRow
                  symbol="γ₁"
                  ar="الالتواء"
                  en="Skewness"
                  formula="Σ((xᵢ−μ)/σ)³ / n"
                  interpretation="تماثل التوزيع — Distribution asymmetry"
                />
                <VariableRow
                  symbol="γ₂"
                  ar="التفرطح"
                  en="Kurtosis"
                  formula="Σ((xᵢ−μ)/σ)⁴/n − 3"
                  interpretation="حدة القمة — Peak sharpness (excess)"
                />
                <VariableRow
                  symbol="%pass"
                  ar="نسبة النجاح"
                  en="Pass Rate"
                  formula="(passCount / n) × 100"
                  interpretation="% من الطلاب الناجحين"
                />
                <VariableRow
                  symbol="%90+"
                  ar="نسبة التميز"
                  en="Excellence Rate"
                  formula="(above90Count / n) × 100"
                  interpretation="% من الطلاب بدرجة ≥90"
                />
              </tbody>
            </table>
          </div>
        </section>

        {/* Section 4: Score Bands */}
        <section>
          <SectionTitle ar={t('methodology_bands')} en="Score Bands" />
          <div className="overflow-x-auto">
            <table className="table-base w-full text-sm">
              <thead>
                <tr>
                  <th>النطاق / Band</th>
                  <th>الحلقة الثانية (نجاح=50)</th>
                  <th>الحلقة الثالثة (نجاح=60)</th>
                  <th>التصنيف / Classification</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td className="font-medium text-red-600">دون المقبول / Below Pass</td>
                  <td>0 – 49</td>
                  <td>0 – 59</td>
                  <td>راسب / Fail</td>
                </tr>
                <tr>
                  <td className="font-medium text-orange-600">مقبول – جيد / Pass–Good</td>
                  <td>50 – 69</td>
                  <td>60 – 69</td>
                  <td>ناجح / Pass</td>
                </tr>
                <tr>
                  <td className="font-medium text-yellow-600">جيد – جيد جداً / Good–Very Good</td>
                  <td colSpan={2}>70 – 79</td>
                  <td>جيد / Good</td>
                </tr>
                <tr>
                  <td className="font-medium text-blue-600">جيد جداً – ممتاز / Very Good–Excellent</td>
                  <td colSpan={2}>80 – 89</td>
                  <td>جيد جداً / Very Good</td>
                </tr>
                <tr>
                  <td className="font-medium text-green-600">ممتاز / Excellent (90+)</td>
                  <td colSpan={2}>90 – 100</td>
                  <td>متميز / Outstanding</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        {/* Section 5: Progress Classification */}
        <section>
          <SectionTitle ar={t('methodology_progress')} en="Progress Classification" />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
            <div>
              <h4 className="font-semibold mb-2">الخوارزمية / Algorithm</h4>
              <FormulaBox>
                <div className="text-start space-y-1">
                  <p>إذا الدرجة الأساسية ≥ 90:</p>
                  <p className="ps-4">إذا الدرجة الحالية ≥ 86 → <span className="text-yellow-600">مستقر</span></p>
                  <p className="ps-4">وإلا → <span className="text-red-600">تراجع</span></p>
                  <p>وإلا:</p>
                  <p className="ps-4">الفرق &gt; 4 → <span className="text-green-600">تقدم ملحوظ</span></p>
                  <p className="ps-4">الفرق ≥ 0 → <span className="text-blue-600">تقدم بسيط</span></p>
                  <p className="ps-4">الفرق &lt; 0 → <span className="text-red-600">تراجع</span></p>
                </div>
              </FormulaBox>
            </div>
            <div>
              <h4 className="font-semibold mb-2">Algorithm (English)</h4>
              <FormulaBox>
                <div className="text-start space-y-1">
                  <p>if baseline ≥ 90:</p>
                  <p className="ps-4">if current ≥ 86 → <span className="text-yellow-600">Stable</span></p>
                  <p className="ps-4">else → <span className="text-red-600">Regression</span></p>
                  <p>else:</p>
                  <p className="ps-4">diff &gt; 4 → <span className="text-green-600">Significant Progress</span></p>
                  <p className="ps-4">diff ≥ 0 → <span className="text-blue-600">Slight Progress</span></p>
                  <p className="ps-4">diff &lt; 0 → <span className="text-red-600">Regression</span></p>
                </div>
              </FormulaBox>
            </div>
          </div>
        </section>

        {/* Section 6: Normal Distribution */}
        <section>
          <SectionTitle ar={t('methodology_normal_dist')} en="Normal Distribution" />
          <div className="space-y-3 text-sm">
            <p className="text-gray-600 dark:text-gray-400">
              يُستخدم التوزيع الطبيعي لوصف توزيع الدرجات وتحليل طبيعة توزيعها.
              The normal distribution is used to describe and analyze the nature of score distributions.
            </p>
            <div>
              <p className="font-semibold mb-1">دالة الكثافة الاحتمالية / Probability Density Function (PDF):</p>
              <FormulaBox>
                f(x) = 1 / (σ√(2π)) × e^(−(x−μ)² / (2σ²))
              </FormulaBox>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-3">
                <p className="font-semibold mb-1">الالتواء / Skewness:</p>
                <ul className="space-y-1 text-gray-600 dark:text-gray-400">
                  <li>γ₁ &lt; −0.5: {t('dist_left_skew')}</li>
                  <li>γ₁ &gt; 0.5: {t('dist_right_skew')}</li>
                  <li>−0.5 ≤ γ₁ ≤ 0.5: {t('dist_symmetric')}</li>
                </ul>
              </div>
              <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-3">
                <p className="font-semibold mb-1">التفرطح / Kurtosis (Excess):</p>
                <ul className="space-y-1 text-gray-600 dark:text-gray-400">
                  <li>γ₂ &lt; −1: {t('dist_platykurtic')}</li>
                  <li>γ₂ &gt; 1: {t('dist_leptokurtic')}</li>
                  <li>−1 ≤ γ₂ ≤ 1: {t('dist_mesokurtic')}</li>
                </ul>
              </div>
            </div>
          </div>
        </section>

        {/* Section 7: Gap Analysis Priority */}
        <section>
          <SectionTitle ar={t('methodology_gap_priority')} en="Gap Analysis Priorities" />
          <div className="text-sm space-y-3">
            <p className="text-gray-600 dark:text-gray-400">
              يتم تحديد أولوية تحليل الفجوات بناءً على معدل الإتقان لكل مخرج تعليمي.
              Gap analysis priorities are determined based on mastery rate for each learning outcome.
            </p>
            <div className="overflow-x-auto">
              <table className="table-base w-full">
                <thead>
                  <tr>
                    <th>الأولوية / Priority</th>
                    <th>نسبة الإتقان / Mastery Rate</th>
                    <th>الإجراء المقترح / Suggested Action</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td><span className="px-2 py-0.5 rounded bg-red-100 text-red-700 font-medium">حرج / Critical</span></td>
                    <td>&lt; 40%</td>
                    <td>تدخل فوري — Immediate intervention required</td>
                  </tr>
                  <tr>
                    <td><span className="px-2 py-0.5 rounded bg-orange-100 text-orange-700 font-medium">عالي / High</span></td>
                    <td>40% – 59%</td>
                    <td>خطة تحسين عاجلة — Urgent improvement plan</td>
                  </tr>
                  <tr>
                    <td><span className="px-2 py-0.5 rounded bg-yellow-100 text-yellow-700 font-medium">متوسط / Medium</span></td>
                    <td>60% – 74%</td>
                    <td>مراجعة وتعزيز — Review and reinforce</td>
                  </tr>
                  <tr>
                    <td><span className="px-2 py-0.5 rounded bg-green-100 text-green-700 font-medium">منخفض / Low</span></td>
                    <td>≥ 75%</td>
                    <td>متابعة منتظمة — Regular monitoring</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </section>

        <div className="border-t pt-4 text-sm text-gray-400 text-end">
          {lang === 'ar' ? 'نظام تحليل الدرجات — فريق ضمان الجودة' : 'Grade Analysis System — Quality Assurance Team'}
        </div>
      </div>
    </div>
  )
}
