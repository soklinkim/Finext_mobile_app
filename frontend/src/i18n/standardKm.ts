/**
 * Standard Khmer accounting terms for the labels the server sends (statement lines, headings, KPI and ratio names), keyed by the
 * English label in lower case. Used when the app is in Khmer with standard terms (always the case on financial statements).
 *
 * Source: "IFRS for SMEs Illustrative Financial Statements" (Accounting and Auditing Regulator of Cambodia / CamEd), Khmer edition.
 * Terms marked (not in reference) are not in that document; they follow its naming pattern and need a Khmer accountant's review.
 */
export const STANDARD_KM: Record<string, string> = {
  // Statement names and headings
  'income statement': 'របាយការណ៍លទ្ធផល',
  'statement of comprehensive income': 'របាយការណ៍លទ្ធផល និងចំណេញរក្សាទុក',
  'balance sheet': 'របាយការណ៍ស្ថានភាពហិរញ្ញវត្ថុ',
  'statement of financial position': 'របាយការណ៍ស្ថានភាពហិរញ្ញវត្ថុ',
  'cash flow statement': 'របាយការណ៍លំហូរសាច់ប្រាក់',
  'statement of cash flows': 'របាយការណ៍លំហូរសាច់ប្រាក់',
  revenue: 'ចំណូល',
  'operating expenses': 'ចំណាយប្រតិបត្តិការ', // (not in reference)
  assets: 'ទ្រព្យសកម្ម',
  "liabilities & owner's equity": 'បំណុលនិងមូលធន',
  'operating activities': 'សកម្មភាពប្រតិបត្តិការ',
  'investing activities': 'សកម្មភាពវិនិយោគ',
  'financing activities': 'សកម្មភាពហិរញ្ញប្បទាន',

  // Income statement
  'sales revenue': 'ចំណូលពីការលក់',
  'cost of goods sold': 'ថ្លៃដើមទំនិញដែលបានលក់', // (not in reference)
  'gross profit': 'ចំណេញដុល', // (not in reference)
  'salaries & wages': 'ប្រាក់បៀវត្ស និងប្រាក់ឈ្នួល',
  rent: 'ចំណាយថ្លៃជួល',
  utilities: 'ចំណាយអគ្គិសនី និងទឹក',
  'marketing & advertising': 'ចំណាយផ្សាយពាណិជ្ជកម្ម',
  'transport & delivery': 'ចំណាយដឹកជញ្ជូន',
  depreciation: 'ចំណាយរំលស់',
  'other operating expenses': 'ចំណាយផ្សេងៗ',
  'total operating expenses': 'ចំណាយប្រតិបត្តិការសរុប', // (not in reference)
  'operating profit': 'ចំណេញប្រតិបត្តិការ',
  'other income': 'ចំណូលផ្សេងៗ', // (not in reference)
  'interest expense': 'ចំណាយការប្រាក់',
  'profit before tax': 'ប្រាក់ចំណេញមុនគិតពន្ធ',
  'income tax': 'ចំណាយពន្ធលើប្រាក់ចំណូល',
  'net profit': 'ប្រាក់ចំណេញសុទ្ធ', // (not in reference: it says "profit for the year")
  'net profit for the period': 'ប្រាក់ចំណេញសម្រាប់ការិយបរិច្ឆេទ',

  // Balance sheet
  'cash & bank balances': 'សាច់ប្រាក់',
  'accounts receivable': 'គណនីត្រូវទទួល',
  inventory: 'សន្និធិ',
  'prepaid expenses': 'ចំណាយបង់ជាមុន', // (not in reference)
  'total current assets': 'ទ្រព្យសកម្មចរន្តសរុប',
  'property, equipment & vehicles (net)': 'ទ្រព្យ និងបរិក្ខារ',
  'other long-term assets': 'ទ្រព្យសកម្មមិនមែនចរន្តផ្សេងៗ', // (not in reference)
  'total assets': 'ទ្រព្យសកម្មសរុប',
  'accounts payable': 'គណនីត្រូវសង',
  'customer deposits': 'ប្រាក់កក់អតិថិជន', // (not in reference)
  'accrued expenses & taxes payable': 'ចំណាយបង្គរ និងពន្ធត្រូវបង់',
  'short-term loans (bank / mfi)': 'ប្រាក់កម្ចីរយៈពេលខ្លី (ធនាគារ / មីក្រូហិរញ្ញវត្ថុ)', // (not in reference)
  'other short-term borrowings': 'ប្រាក់ខ្ចីរយៈពេលខ្លីផ្សេងៗ', // (not in reference)
  'long-term loans': 'ប្រាក់កម្ចីរយៈពេលវែង', // (not in reference)
  'lease obligations': 'ភតិសន្យាត្រូវសង',
  'total liabilities': 'បំណុលសរុប',
  "owner's capital": 'មូលធនរបស់ម្ចាស់', // (reference has share capital: មូលធនភាគហ៊ុន)
  'retained earnings': 'ចំណេញរក្សាទុក',
  "less: owner's drawings": 'ដក៖ ដកប្រាក់ប្រើប្រាស់ផ្ទាល់ខ្លួន', // (not in reference)
  "total owner's equity": 'មូលធនសរុប',
  "owner's equity": 'មូលធន',
  "total liabilities & owner's equity": 'បំណុលនិងមូលធនសរុប',
  'balance check': 'ការត្រួតពិនិត្យតុល្យភាព', // (not in reference)

  // Cash flow statement
  'add back: depreciation': 'បូកបន្ថែមវិញ៖ ការរំលស់',
  'change in accounts receivable': 'បម្រែបម្រួលគណនីត្រូវទទួល',
  'change in inventory': 'បម្រែបម្រួលសន្និធិ',
  'change in prepaid assets': 'បម្រែបម្រួលចំណាយបង់ជាមុន', // (not in reference)
  'change in accounts payable': 'បម្រែបម្រួលគណនីត្រូវសង',
  'change in customer deposits': 'បម្រែបម្រួលប្រាក់កក់អតិថិជន', // (not in reference)
  'change in accrued expenses & tax': 'បម្រែបម្រួលចំណាយបង្គរ និងពន្ធ',
  'net cash from operating activities': 'លំហូរចូលសាច់ប្រាក់សុទ្ធពីសកម្មភាពប្រតិបត្តិការ',
  'property & equipment': 'ទ្រព្យ និងបរិក្ខារ',
  'net cash from investing activities': 'សាច់ប្រាក់សុទ្ធបានប្រើក្នុងសកម្មភាពវិនិយោគ',
  'loans & lease obligations': 'ប្រាក់កម្ចី និងភតិសន្យា', // (not in reference)
  "owner's capital contributed": 'មូលធនដែលម្ចាស់បានបញ្ចូល', // (not in reference)
  'net cash from financing activities': 'សាច់ប្រាក់សុទ្ធបានប្រើក្នុងសកម្មភាពហិរញ្ញប្បទាន',
  'net increase / (decrease) in cash': 'កំណើន (ការថយចុះ) សុទ្ធក្នុងសាច់ប្រាក់',
  'net cash change': 'បម្រែបម្រួលសាច់ប្រាក់សុទ្ធ', // (not in reference)
  'cash flow check': 'ការត្រួតពិនិត្យលំហូរសាច់ប្រាក់', // (not in reference)
  'cash at start of period': 'សាច់ប្រាក់នៅដើមការិយបរិច្ឆេទ', // (not in reference)
  'cash at end of period': 'សាច់ប្រាក់នៅចុងការិយបរិច្ឆេទ', // (not in reference)

  // Labels as worded in the English statements after they followed the reference
  'employee benefits expense': 'ចំណាយអត្ថប្រយោជន៍និយោជិត',
  'rent expense': 'ចំណាយថ្លៃជួល',
  'utilities expense': 'ចំណាយអគ្គិសនី និងទឹក',
  'income tax expense': 'ចំណាយពន្ធលើប្រាក់ចំណូល',
  cash: 'សាច់ប្រាក់',
  'trade receivables': 'គណនីត្រូវទទួល',
  inventories: 'សន្និធិ',
  'property and equipment': 'ទ្រព្យ និងបរិក្ខារ',
  'trade payables': 'គណនីត្រូវសង',
  'total equity': 'មូលធនសរុប',
  'total liabilities and equity': 'បំណុលនិងមូលធនសរុប',
  'liabilities and equity': 'បំណុលនិងមូលធន',
  'cash flows from operating activities': 'លំហូរសាច់ប្រាក់ពីសកម្មភាពប្រតិបត្តិការ',
  'cash flows from investing activities': 'លំហូរសាច់ប្រាក់ពីសកម្មភាពវិនិយោគ',
  'cash flows from financing activities': 'លំហូរសាច់ប្រាក់ពីសកម្មភាពហិរញ្ញប្បទាន',
  'change in trade receivables': 'បម្រែបម្រួលគណនីត្រូវទទួល',
  'change in inventories': 'បម្រែបម្រួលសន្និធិ',
  'change in trade payables': 'បម្រែបម្រួលគណនីត្រូវសង',
  'net increase (decrease) in cash': 'កំណើន (ការថយចុះ) សុទ្ធក្នុងសាច់ប្រាក់',

  // Quick ratios on the statement pages (not in reference)
  'gross margin': 'អត្រាចំណេញដុល',
  'net margin': 'អត្រាចំណេញសុទ្ធ',
  'current ratio': 'អនុបាតចរន្ត',
  'liabilities-to-equity': 'បំណុលធៀបមូលធន',
};

export const standardKhmerTerm = (label: string): string | null => STANDARD_KM[label.trim().toLowerCase()] ?? null;
