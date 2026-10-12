import { Printer } from 'lucide-react'
import { t } from '@/i18n/translations'
import type { Language } from '@/types'

interface MethodologyProps {
  lang: Language
}

function SectionTitle({ ar, en, num }: { ar: string; en: string; num: number }) {
  return (
    <div className="flex items-center gap-3 mb-5 border-b pb-3">
      <span className="w-7 h-7 rounded-full bg-primary-600 text-white text-sm font-bold flex items-center justify-center shrink-0">
        {num}
      </span>
      <div>
        <h2 className="text-base font-bold text-primary-700 dark:text-primary-400 leading-tight">{ar}</h2>
        <p className="text-xs text-gray-400">{en}</p>
      </div>
    </div>
  )
}

function FormulaBox({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-4 font-mono text-sm my-3 border border-gray-200 dark:border-gray-700">
      {children}
    </div>
  )
}

interface VariableRowProps {
  symbol: string
  ar: string
  en: string
  formula: string
  note: string
}

function VariableRow({ symbol, ar, en, formula, note }: VariableRowProps) {
  return (
    <tr>
      <td className="py-2 px-3 font-mono font-bold text-primary-600 dark:text-primary-400 text-center whitespace-nowrap">{symbol}</td>
      <td className="py-2 px-3 font-semibold whitespace-nowrap">{ar}</td>
      <td className="py-2 px-3 text-gray-500 dark:text-gray-400 whitespace-nowrap">{en}</td>
      <td className="py-2 px-3 font-mono text-xs bg-gray-50 dark:bg-gray-800/60 whitespace-nowrap">{formula}</td>
      <td className="py-2 px-3 text-sm text-gray-500 dark:text-gray-400">{note}</td>
    </tr>
  )
}

function BandChip({ color, label, range }: { color: string; label: string; range: string }) {
  return (
    <div className={`flex items-center gap-3 rounded-lg px-4 py-2.5 ${color}`}>
      <span className="font-semibold text-sm">{label}</span>
      <span className="text-xs opacity-75 ms-auto">{range}</span>
    </div>
  )
}

export default function Methodology({ lang }: MethodologyProps) {
  return (
    <div className="space-y-6 max-w-5xl">
      <div className="flex items-center justify-between no-print">
        <h1 className="text-xl font-bold">{t('methodology_title')}</h1>
        <button className="btn-primary flex items-center gap-2" onClick={() => window.print()}>
          <Printer size={15} />
          {t('print')}
        </button>
      </div>

      <div className="bg-white dark:bg-gray-900 rounded-xl shadow p-8 space-y-10 print:shadow-none print:p-0">

        {/* Cover */}
        <div className="text-center border-b pb-8">
          <div className="w-14 h-14 rounded-2xl bg-primary-600 flex items-center justify-center mx-auto mb-4">
            <span className="text-white text-2xl font-bold">ت</span>
          </div>
          <h2 className="text-2xl font-bold text-primary-700 dark:text-primary-400 mb-1">
            منصة تحليل بيانات إنجازات الطلبة
          </h2>
          <h3 className="text-lg font-semibold text-gray-500 mb-1">
            Student Achievement Data Analysis Platform
          </h3>
          <p className="text-gray-400 text-sm">مدرسة خالد بن الوليد · فريق جودة انجازات الطلبة</p>
        </div>

        {/* Section 1: Mission */}
        <section>
          <SectionTitle num={1} ar="رسالة المنصة وأهدافها" en="Platform Mission & Objectives" />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
            <div className="bg-primary-50 dark:bg-primary-900/20 rounded-lg p-4 border border-primary-100 dark:border-primary-800">
              <p className="text-gray-700 dark:text-gray-300 leading-relaxed">
                تهدف هذه المنصة إلى تمكين فريق جودة انجازات الطلبة من تحليل بيانات إنجازات الطلاب بشكل شامل،
                وتتبع التقدم الفردي والجماعي عبر السنوات الأكاديمية، وتحديد الفجوات في مخرجات التعلم،
                واتخاذ قرارات تعليمية مبنية على البيانات.
              </p>
            </div>
            <div className="bg-primary-50 dark:bg-primary-900/20 rounded-lg p-4 border border-primary-100 dark:border-primary-800">
              <p className="text-gray-600 dark:text-gray-300 leading-relaxed">
                This platform enables the achievement quality team to comprehensively analyze student
                achievement data, track individual and collective progress across academic years,
                identify gaps in learning outcomes, and make data-driven educational decisions.
              </p>
            </div>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-4 text-sm">
            {[
              { ar: 'تحليل الإنجاز', en: 'Achievement Analysis' },
              { ar: 'تتبع التقدم', en: 'Progress Tracking' },
              { ar: 'تحليل الفجوات', en: 'Gap Analysis' },
              { ar: 'المقارنة الزمنية', en: 'Temporal Comparison' },
            ].map(item => (
              <div key={item.en} className="rounded-lg border border-gray-200 dark:border-gray-700 p-3 text-center">
                <p className="font-semibold text-primary-700 dark:text-primary-400">{item.ar}</p>
                <p className="text-xs text-gray-400 mt-0.5">{item.en}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Section 2: Data Structure */}
        <section>
          <SectionTitle num={2} ar="هيكل البيانات والحلقات الدراسية" en="Data Structure & School Cycles" />
          <div className="overflow-x-auto">
            <table className="table-base w-full text-sm">
              <thead>
                <tr>
                  <th>الحلقة / Cycle</th>
                  <th>الصفوف / Grades</th>
                  <th>درجة النجاح / Pass Mark</th>
                  <th>الفصل 1</th>
                  <th>الفصل 2</th>
                  <th>الفصل 3</th>
                  <th>المواد / Subjects</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td className="font-semibold">الثانية / Cycle 2</td>
                  <td>5 – 8</td>
                  <td><span className="font-bold text-amber-600 bg-amber-50 dark:bg-amber-900/20 px-2 py-0.5 rounded">50</span></td>
                  <td>35%</td>
                  <td>30%</td>
                  <td>35%</td>
                  <td className="text-xs text-gray-500">عربي، إنجليزي، رياضيات، علوم، دراسات، تربية إسلامية</td>
                </tr>
                <tr>
                  <td className="font-semibold">الثالثة / Cycle 3</td>
                  <td>9 – 12</td>
                  <td><span className="font-bold text-orange-600 bg-orange-50 dark:bg-orange-900/20 px-2 py-0.5 rounded">60</span></td>
                  <td>35%</td>
                  <td>30%</td>
                  <td>35%</td>
                  <td className="text-xs text-gray-500">عربي، إنجليزي، رياضيات، فيزياء، كيمياء، أحياء، دراسات، تربية إسلامية</td>
                </tr>
              </tbody>
            </table>
          </div>
          <p className="text-xs text-gray-400 mt-2">
            * السنة الأكاديمية تشمل 3 فصول دراسية — الدرجة السنوية = 0.35×ف1 + 0.30×ف2 + 0.35×ف3
          </p>
        </section>

        {/* Section 3: Score Bands */}
        <section>
          <SectionTitle num={3} ar="نطاقات الأداء / التصنيف" en="Performance Bands" />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <h4 className="font-semibold text-sm mb-3">الحلقة الثانية (نجاح = 50)</h4>
              <BandChip color="bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400" label="دون المستوى / Below Pass" range="0 – 49" />
              <BandChip color="bg-orange-50 dark:bg-orange-900/20 text-orange-700 dark:text-orange-400" label="مقبول / Pass" range="50 – 69" />
              <BandChip color="bg-yellow-50 dark:bg-yellow-900/20 text-yellow-700 dark:text-yellow-400" label="جيد / Good" range="70 – 79" />
              <BandChip color="bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400" label="جيد جداً / Very Good" range="80 – 89" />
              <BandChip color="bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400" label="ممتاز / Excellent" range="90 – 100" />
            </div>
            <div className="space-y-2">
              <h4 className="font-semibold text-sm mb-3">الحلقة الثالثة (نجاح = 60)</h4>
              <BandChip color="bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400" label="دون المستوى / Below Pass" range="0 – 59" />
              <BandChip color="bg-orange-50 dark:bg-orange-900/20 text-orange-700 dark:text-orange-400" label="مقبول / Pass" range="60 – 69" />
              <BandChip color="bg-yellow-50 dark:bg-yellow-900/20 text-yellow-700 dark:text-yellow-400" label="جيد / Good" range="70 – 79" />
              <BandChip color="bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400" label="جيد جداً / Very Good" range="80 – 89" />
              <BandChip color="bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400" label="ممتاز / Excellent" range="90 – 100" />
            </div>
          </div>
        </section>

        {/* Section 4: Statistical Variables */}
        <section>
          <SectionTitle num={4} ar="المتغيرات الإحصائية" en="Statistical Variables" />
          <div className="overflow-x-auto">
            <table className="table-base w-full text-sm">
              <thead>
                <tr>
                  <th className="text-center">الرمز</th>
                  <th>الاسم العربي</th>
                  <th>English Name</th>
                  <th>المعادلة / Formula</th>
                  <th>الدلالة / Interpretation</th>
                </tr>
              </thead>
              <tbody>
                <VariableRow symbol="n" ar="حجم العينة" en="Sample Size" formula="count(students)" note="عدد الطلاب في المجموعة" />
                <VariableRow symbol="μ" ar="المتوسط الحسابي" en="Mean" formula="Σxᵢ / n" note="متوسط الدرجات — Average score" />
                <VariableRow symbol="Md" ar="الوسيط" en="Median" formula="x[(n+1)/2]" note="مقاوم للقيم الشاذة — Outlier-resistant" />
                <VariableRow symbol="σ" ar="الانحراف المعياري" en="Std. Deviation" formula="√(Σ(xᵢ−μ)² / n)" note="مدى التشتت — Spread measure" />
                <VariableRow symbol="σ²" ar="التباين" en="Variance" formula="Σ(xᵢ−μ)² / n" note="التشتت المربع — Squared spread" />
                <VariableRow symbol="Q1" ar="الربيع الأول" en="1st Quartile" formula="Percentile(25)" note="25% من الطلاب أدناه" />
                <VariableRow symbol="Q3" ar="الربيع الثالث" en="3rd Quartile" formula="Percentile(75)" note="75% من الطلاب أدناه" />
                <VariableRow symbol="IQR" ar="المدى الربعي" en="Interquartile Range" formula="Q3 − Q1" note="نطاق الـ 50% الوسطى" />
                <VariableRow symbol="γ₁" ar="الالتواء" en="Skewness" formula="Σ((xᵢ−μ)/σ)³ / n" note="تماثل التوزيع — Symmetry" />
                <VariableRow symbol="γ₂" ar="التفرطح" en="Kurtosis (excess)" formula="Σ((xᵢ−μ)/σ)⁴/n − 3" note="حدة القمة — Peak sharpness" />
                <VariableRow symbol="%pass" ar="نسبة النجاح" en="Pass Rate" formula="(passed / n) × 100" note="% الطلاب الناجحين" />
                <VariableRow symbol="%90+" ar="نسبة التميز" en="Excellence Rate" formula="(above90 / n) × 100" note="% الطلاب بدرجة ≥ 90" />
                <VariableRow symbol="Δ" ar="الفرق (للتقدم)" en="Progress Diff" formula="current − baseline" note="الدرجة الحالية − الأساسية" />
              </tbody>
            </table>
          </div>
        </section>

        {/* Section 5: Progress Classification Algorithm */}
        <section>
          <SectionTitle num={5} ar="خوارزمية تصنيف تقدم الطلاب" en="Student Progress Classification Algorithm" />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <p className="text-sm font-semibold mb-3 text-gray-700 dark:text-gray-300">الخوارزمية / Algorithm</p>
              <FormulaBox>
                <div className="text-start space-y-1.5 text-sm">
                  <p className="text-gray-500 dark:text-gray-400">// Δ = درجة هذا العام − درجة العام السابق</p>
                  <p className="font-semibold">if Δ {'>'} 4:</p>
                  <p className="ps-6 text-green-600 dark:text-green-400">→ تقدم ملحوظ (Significant Progress)</p>
                  <p className="font-semibold">else if Δ ≥ 0:</p>
                  <p className="ps-6 text-blue-600 dark:text-blue-400">→ مستقر (Stable)</p>
                  <p className="font-semibold">else (Δ {'<'} 0):</p>
                  <p className="ps-6 text-red-600 dark:text-red-400">→ تراجع (Regression)</p>
                </div>
              </FormulaBox>
              <p className="text-xs text-gray-400 mt-2">
                * الحد 4 نقاط يُمثل تقدماً ذا دلالة تربوية فوق مستوى التغير الطبيعي.
                The 4-point threshold represents educationally meaningful progress above natural variation.
              </p>
            </div>
            <div>
              <p className="text-sm font-semibold mb-3 text-gray-700 dark:text-gray-300">التصنيفات / Classifications</p>
              <div className="space-y-2 text-sm">
                <div className="flex items-center gap-3 p-3 rounded-lg bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800">
                  <div className="w-2 h-2 rounded-full bg-green-500 shrink-0" />
                  <div>
                    <p className="font-semibold text-green-700 dark:text-green-400">تقدم ملحوظ / Significant Progress</p>
                    <p className="text-xs text-green-600 dark:text-green-500">Δ {'>'} 4 نقاط — يستحق تعزيزاً وتوثيقاً</p>
                  </div>
                </div>
                <div className="flex items-center gap-3 p-3 rounded-lg bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800">
                  <div className="w-2 h-2 rounded-full bg-blue-500 shrink-0" />
                  <div>
                    <p className="font-semibold text-blue-700 dark:text-blue-400">مستقر / Stable</p>
                    <p className="text-xs text-blue-600 dark:text-blue-500">0 ≤ Δ ≤ 4 — أداء ثابت أو تحسن طفيف</p>
                  </div>
                </div>
                <div className="flex items-center gap-3 p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
                  <div className="w-2 h-2 rounded-full bg-red-500 shrink-0" />
                  <div>
                    <p className="font-semibold text-red-700 dark:text-red-400">تراجع / Regression</p>
                    <p className="text-xs text-red-600 dark:text-red-500">Δ {'<'} 0 — يستدعي تدخلاً فورياً</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Section 6: Normal Distribution */}
        <section>
          <SectionTitle num={6} ar="التوزيع الطبيعي وتفسيره" en="Normal Distribution & Interpretation" />
          <div className="space-y-4 text-sm">
            <div>
              <p className="font-semibold mb-1 text-gray-700 dark:text-gray-300">دالة الكثافة الاحتمالية / Probability Density Function:</p>
              <FormulaBox>
                f(x) = 1 / (σ√(2π)) × e^(−(x−μ)² / (2σ²))
              </FormulaBox>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="rounded-lg border border-gray-200 dark:border-gray-700 p-4">
                <p className="font-semibold mb-3">الالتواء / Skewness (γ₁)</p>
                <div className="space-y-2">
                  <div className="flex gap-2 items-start">
                    <span className="font-mono text-xs bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 px-2 py-0.5 rounded shrink-0">γ₁ {'<'} −0.5</span>
                    <span className="text-gray-600 dark:text-gray-400">{t('dist_left_skew')} — الطلاب يتمركزون في الدرجات العليا</span>
                  </div>
                  <div className="flex gap-2 items-start">
                    <span className="font-mono text-xs bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 px-2 py-0.5 rounded shrink-0">−0.5 ≤ γ₁ ≤ 0.5</span>
                    <span className="text-gray-600 dark:text-gray-400">{t('dist_symmetric')} — توزيع متوازن</span>
                  </div>
                  <div className="flex gap-2 items-start">
                    <span className="font-mono text-xs bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-400 px-2 py-0.5 rounded shrink-0">γ₁ {'>'} 0.5</span>
                    <span className="text-gray-600 dark:text-gray-400">{t('dist_right_skew')} — الطلاب يتمركزون في الدرجات الدنيا</span>
                  </div>
                </div>
              </div>
              <div className="rounded-lg border border-gray-200 dark:border-gray-700 p-4">
                <p className="font-semibold mb-3">التفرطح / Kurtosis (γ₂, excess)</p>
                <div className="space-y-2">
                  <div className="flex gap-2 items-start">
                    <span className="font-mono text-xs bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400 px-2 py-0.5 rounded shrink-0">γ₂ {'<'} −1</span>
                    <span className="text-gray-600 dark:text-gray-400">{t('dist_platykurtic')} — توزيع مفلطح</span>
                  </div>
                  <div className="flex gap-2 items-start">
                    <span className="font-mono text-xs bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 px-2 py-0.5 rounded shrink-0">−1 ≤ γ₂ ≤ 1</span>
                    <span className="text-gray-600 dark:text-gray-400">{t('dist_mesokurtic')} — توزيع طبيعي</span>
                  </div>
                  <div className="flex gap-2 items-start">
                    <span className="font-mono text-xs bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 px-2 py-0.5 rounded shrink-0">γ₂ {'>'} 1</span>
                    <span className="text-gray-600 dark:text-gray-400">{t('dist_leptokurtic')} — توزيع حاد القمة</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Section 7: Gap Analysis */}
        <section>
          <SectionTitle num={7} ar="أولويات تحليل الفجوات (مخرجات التعلم)" en="Learning Outcome Gap Analysis Priorities" />
          <div className="text-sm space-y-4">
            <p className="text-gray-600 dark:text-gray-400">
              يتم تحديد أولوية المخرجات التعليمية بناءً على معدل الإتقان الجماعي (نسبة الطلاب الذين أتقنوا المخرج).
              Outcomes are prioritized based on the collective mastery rate across all assessed students.
            </p>
            <div className="overflow-x-auto">
              <table className="table-base w-full">
                <thead>
                  <tr>
                    <th>الأولوية / Priority</th>
                    <th>نسبة الإتقان / Mastery Rate</th>
                    <th>التفسير</th>
                    <th>الإجراء المقترح / Action</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td><span className="badge-critical">{t('gap_critical')}</span></td>
                    <td className="font-mono">&lt; 40%</td>
                    <td>أغلب الطلاب لم يتقنوا المخرج</td>
                    <td>تدخل فوري — Immediate intervention</td>
                  </tr>
                  <tr>
                    <td><span className="badge-high">{t('gap_high')}</span></td>
                    <td className="font-mono">40% – 59%</td>
                    <td>أقل من نصف الطلاب أتقنوا المخرج</td>
                    <td>خطة تحسين عاجلة — Urgent plan</td>
                  </tr>
                  <tr>
                    <td><span className="badge-medium">{t('gap_medium')}</span></td>
                    <td className="font-mono">60% – 74%</td>
                    <td>أداء متوسط يحتاج تعزيزاً</td>
                    <td>مراجعة وتعزيز — Review & reinforce</td>
                  </tr>
                  <tr>
                    <td><span className="badge-low">{t('gap_low')}</span></td>
                    <td className="font-mono">≥ 75%</td>
                    <td>إتقان جيد يحتاج متابعة</td>
                    <td>متابعة منتظمة — Regular monitoring</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </section>

        {/* Section 8: Analysis Framework Summary */}
        <section>
          <SectionTitle num={8} ar="إطار التحليل المتكامل" en="Integrated Analysis Framework" />
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
            <div className="rounded-lg border border-gray-200 dark:border-gray-700 p-4 space-y-2">
              <p className="font-bold text-primary-700 dark:text-primary-400">التحليل الإحصائي الوصفي</p>
              <p className="text-xs text-gray-400 mb-2">Descriptive Statistical Analysis</p>
              <ul className="space-y-1 text-gray-600 dark:text-gray-400 text-xs">
                <li>• المتوسط والوسيط لكل مادة/صف</li>
                <li>• التشتت والانحراف المعياري</li>
                <li>• توزيع النطاقات (دون 60، 60-70، إلخ)</li>
                <li>• معدلات النجاح والتميز</li>
              </ul>
            </div>
            <div className="rounded-lg border border-gray-200 dark:border-gray-700 p-4 space-y-2">
              <p className="font-bold text-primary-700 dark:text-primary-400">تحليل التقدم الزمني</p>
              <p className="text-xs text-gray-400 mb-2">Temporal Progress Analysis</p>
              <ul className="space-y-1 text-gray-600 dark:text-gray-400 text-xs">
                <li>• مقارنة الطالب بنفسه عبر السنوات</li>
                <li>• تصنيف: تقدم ملحوظ / مستقر / تراجع</li>
                <li>• تحديد الطلاب بحاجة لتدخل</li>
                <li>• تتبع المسارات التعليمية الفردية</li>
              </ul>
            </div>
            <div className="rounded-lg border border-gray-200 dark:border-gray-700 p-4 space-y-2">
              <p className="font-bold text-primary-700 dark:text-primary-400">تحليل مخرجات التعلم</p>
              <p className="text-xs text-gray-400 mb-2">Learning Outcome Gap Analysis</p>
              <ul className="space-y-1 text-gray-600 dark:text-gray-400 text-xs">
                <li>• قياس إتقان كل مخرج تعليمي</li>
                <li>• تحديد الأولويات (حرج/عالي/متوسط/منخفض)</li>
                <li>• ربط الفجوات بخطط التحسين</li>
                <li>• تقارير قابلة للتصدير</li>
              </ul>
            </div>
          </div>
        </section>

        <div className="border-t pt-4 text-sm text-gray-400 flex items-center justify-between">
          <span>مدرسة خالد بن الوليد · فريق جودة انجازات الطلبة</span>
          <span>{lang === 'ar' ? 'منصة تحليل الإنجاز' : 'Achievement Analysis Platform'}</span>
        </div>
      </div>
    </div>
  )
}
