import type {
  AnalysisPeriod,
  AnalysisResult,
  AppNotification,
  CategorySlice,
  Statements,
  Target,
} from './types';

/** Empty responses until server-backed accounting and analysis are implemented. */
export async function emptyAnalysis(period: AnalysisPeriod): Promise<AnalysisResult> {
  return { period, currency: 'USD', labels: [], income: [], expense: [], totals: { income: 0, expense: 0 } };
}

export async function emptyTargets(): Promise<Target[]> {
  return [];
}

export async function emptyCategoryBreakdown(): Promise<CategorySlice[]> {
  return [];
}

export async function emptyNotifications(): Promise<AppNotification[]> {
  return [];
}

export async function emptyStatements(): Promise<Statements | null> {
  return null;
}
