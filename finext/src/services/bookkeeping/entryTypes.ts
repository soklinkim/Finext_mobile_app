/**
 * Entry-type catalogue — FINEXT_FINANCE_RULES.md §2 and §5 (Money in / Money out / Move money).
 * Each type says what the entry form must ask for and how the entry counts toward
 * income / expense totals (§8.5). Double-entry journal posting is NOT done on device in this
 * build; see README "What is not built yet".
 */
export type Direction = 'in' | 'out' | 'move';
export type GroupId = 'sales' | 'otherin' | 'monthly' | 'stock' | 'loantax' | 'move';
export type Party = 'customer' | 'supplier';

export type ExtraField =
  | 'cost' // product sale: cost of goods (optional)
  | 'customerRequired' // deposit
  | 'lender'
  | 'lenderType'
  | 'term'
  | 'noteRequired'
  | 'assetName'
  | 'usefulLife'
  | 'loanName'
  | 'interestPart';

export type ImpactKind =
  | 'sales'
  | 'other_income'
  | 'cost'
  | 'stock'
  | 'equipment'
  | 'deposit'
  | 'loan_in'
  | 'capital'
  | 'loan_out'
  | 'owner'
  | 'move';

export interface EntryType {
  id: string;
  direction: Direction;
  groupId: GroupId;
  /** i18n key under `type.` */
  labelKey: string;
  allowsPayLater: boolean;
  /** who to ask for when "Pay later" is chosen */
  party?: Party;
  extraFields: ExtraField[];
  impact: ImpactKind;
  /** counts in Income card (Sales revenue + Other income, §8.5) */
  countsAsIncome: boolean;
  /** counts in Total Expense (COGS + operating expenses + interest + tax, §8.5) */
  countsAsExpense: boolean;
  /** default category name for the transaction row, if any */
  reviewFlag?: boolean;
}

const t = (e: Partial<EntryType> & Pick<EntryType, 'id' | 'direction' | 'groupId' | 'impact'>): EntryType => ({
  labelKey: e.id,
  allowsPayLater: false,
  extraFields: [],
  countsAsIncome: false,
  countsAsExpense: false,
  ...e,
});

export const ENTRY_TYPES: EntryType[] = [
  // Money in → Sales
  t({ id: 'product_sale', direction: 'in', groupId: 'sales', impact: 'sales', allowsPayLater: true, party: 'customer', extraFields: ['cost'], countsAsIncome: true }),
  t({ id: 'service_income', direction: 'in', groupId: 'sales', impact: 'sales', allowsPayLater: true, party: 'customer', countsAsIncome: true }),
  t({ id: 'customer_deposit', direction: 'in', groupId: 'sales', impact: 'deposit', extraFields: ['customerRequired'] }),
  // Money in → Other money in
  t({ id: 'loan_received', direction: 'in', groupId: 'otherin', impact: 'loan_in', extraFields: ['lender', 'lenderType', 'term'] }),
  t({ id: 'owner_capital', direction: 'in', groupId: 'otherin', impact: 'capital' }),
  t({ id: 'other_income', direction: 'in', groupId: 'otherin', impact: 'other_income', extraFields: ['noteRequired'], countsAsIncome: true, reviewFlag: true }),
  // Money out → Monthly expenses
  t({ id: 'rent', direction: 'out', groupId: 'monthly', impact: 'cost', allowsPayLater: true, party: 'supplier', countsAsExpense: true }),
  t({ id: 'wages', direction: 'out', groupId: 'monthly', impact: 'cost', allowsPayLater: true, party: 'supplier', countsAsExpense: true }),
  t({ id: 'utilities', direction: 'out', groupId: 'monthly', impact: 'cost', allowsPayLater: true, party: 'supplier', countsAsExpense: true }),
  t({ id: 'transport', direction: 'out', groupId: 'monthly', impact: 'cost', allowsPayLater: true, party: 'supplier', countsAsExpense: true }),
  t({ id: 'marketing', direction: 'out', groupId: 'monthly', impact: 'cost', allowsPayLater: true, party: 'supplier', countsAsExpense: true }),
  t({ id: 'repairs', direction: 'out', groupId: 'monthly', impact: 'cost', allowsPayLater: true, party: 'supplier', countsAsExpense: true }),
  t({ id: 'fees_licences', direction: 'out', groupId: 'monthly', impact: 'cost', countsAsExpense: true }), // no pay later
  t({ id: 'other_cost', direction: 'out', groupId: 'monthly', impact: 'cost', allowsPayLater: true, party: 'supplier', extraFields: ['noteRequired'], countsAsExpense: true, reviewFlag: true }),
  // Money out → Stock & equipment (not a monthly cost)
  t({ id: 'stock_materials', direction: 'out', groupId: 'stock', impact: 'stock', allowsPayLater: true, party: 'supplier' }),
  t({ id: 'equipment_purchase', direction: 'out', groupId: 'stock', impact: 'equipment', allowsPayLater: true, party: 'supplier', extraFields: ['assetName', 'usefulLife'] }),
  // Money out → Loans, tax & owner
  t({ id: 'loan_repayment', direction: 'out', groupId: 'loantax', impact: 'loan_out', extraFields: ['loanName', 'interestPart'], countsAsExpense: false }), // only the interest part is an expense
  t({ id: 'income_tax', direction: 'out', groupId: 'loantax', impact: 'cost', countsAsExpense: true }),
  t({ id: 'owner_drawings', direction: 'out', groupId: 'loantax', impact: 'owner' }),
  // Move money
  t({ id: 'transfer', direction: 'move', groupId: 'move', impact: 'move' }),
];

export const GROUPS: Record<Exclude<GroupId, 'move'>, { direction: Direction; labelKey: string; subKey?: string }> = {
  sales: { direction: 'in', labelKey: 'group.sales', subKey: 'group.salesSub' },
  otherin: { direction: 'in', labelKey: 'group.otherin', subKey: 'group.otherinSub' },
  monthly: { direction: 'out', labelKey: 'group.monthly' },
  stock: { direction: 'out', labelKey: 'group.stock' },
  loantax: { direction: 'out', labelKey: 'group.loantax' },
};

export function getEntryTypes(direction: Direction): EntryType[] {
  return ENTRY_TYPES.filter((e) => e.direction === direction);
}

export function getEntryType(id: string): EntryType | undefined {
  return ENTRY_TYPES.find((e) => e.id === id);
}

export function allowsPayLater(typeId: string): boolean {
  return getEntryType(typeId)?.allowsPayLater ?? false;
}

export function groupsFor(direction: Direction): GroupId[] {
  return (Object.keys(GROUPS) as Exclude<GroupId, 'move'>[]).filter((g) => GROUPS[g].direction === direction);
}
