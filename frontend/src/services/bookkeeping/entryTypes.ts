/**
 * Entry-type catalogue — FINEXT_FINANCE_RULES.md §2 and §5 (Money in / Money out / Move money).
 * This catalogue drives form labels and required input fields. Posting and financial
 * classification are decided by the backend accounting engine.
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
  | 'interestPart'
  | 'repaymentSchedule';

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
  /** default category name for the transaction row, if any */
  reviewFlag?: boolean;
}

const t = (e: Partial<EntryType> & Pick<EntryType, 'id' | 'direction' | 'groupId'>): EntryType => ({
  labelKey: e.id,
  allowsPayLater: false,
  extraFields: [],
  ...e,
});

export const ENTRY_TYPES: EntryType[] = [
  // Money in → Sales
  t({ id: 'product_sale', direction: 'in', groupId: 'sales', allowsPayLater: true, party: 'customer', extraFields: ['cost'] }),
  t({ id: 'service_income', direction: 'in', groupId: 'sales', allowsPayLater: true, party: 'customer' }),
  t({ id: 'customer_deposit', direction: 'in', groupId: 'sales', extraFields: ['customerRequired'] }),
  // Money in → Other money in
  t({ id: 'loan_received', direction: 'in', groupId: 'otherin', extraFields: ['lender', 'lenderType', 'term', 'repaymentSchedule'] }),
  t({ id: 'owner_capital', direction: 'in', groupId: 'otherin' }),
  t({ id: 'other_income', direction: 'in', groupId: 'otherin', extraFields: ['noteRequired'], reviewFlag: true }),
  // Money out → Monthly expenses
  t({ id: 'rent', direction: 'out', groupId: 'monthly', allowsPayLater: true, party: 'supplier' }),
  t({ id: 'wages', direction: 'out', groupId: 'monthly', allowsPayLater: true, party: 'supplier' }),
  t({ id: 'utilities', direction: 'out', groupId: 'monthly', allowsPayLater: true, party: 'supplier' }),
  t({ id: 'transport', direction: 'out', groupId: 'monthly', allowsPayLater: true, party: 'supplier' }),
  t({ id: 'marketing', direction: 'out', groupId: 'monthly', allowsPayLater: true, party: 'supplier' }),
  t({ id: 'repairs', direction: 'out', groupId: 'monthly', allowsPayLater: true, party: 'supplier' }),
  t({ id: 'fees_licences', direction: 'out', groupId: 'monthly' }), // no pay later
  t({ id: 'other_cost', direction: 'out', groupId: 'monthly', allowsPayLater: true, party: 'supplier', extraFields: ['noteRequired'], reviewFlag: true }),
  // Money out → Stock & equipment (not a monthly cost)
  t({ id: 'stock_materials', direction: 'out', groupId: 'stock', allowsPayLater: true, party: 'supplier' }),
  t({ id: 'equipment_purchase', direction: 'out', groupId: 'stock', allowsPayLater: true, party: 'supplier', extraFields: ['assetName', 'usefulLife'] }),
  // Money out → Loans, tax & owner
  t({ id: 'loan_repayment', direction: 'out', groupId: 'loantax', extraFields: ['loanName', 'interestPart'] }), // only interest is an expense
  t({ id: 'income_tax', direction: 'out', groupId: 'loantax' }),
  t({ id: 'owner_drawings', direction: 'out', groupId: 'loantax' }),
  // Move money
  t({ id: 'transfer', direction: 'move', groupId: 'move' }),
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
