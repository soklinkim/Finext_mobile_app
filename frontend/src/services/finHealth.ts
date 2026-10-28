import AsyncStorage from '@react-native-async-storage/async-storage';
import type { TKey } from '@/i18n';

/**
 * Owner check-in: the FinHealth Score® survey of the Financial Health Network (FinHealth Score Toolkit, 2021), used as
 * published: the same eight questions, the same points per answer, the same averages and cut-offs. It measures the
 * owner's household, which in a small business shares its money with the shop. It is shown next to the AI's answer
 * and never fed into it: no data links these answers to Cambodian loan outcomes.
 */
export type Pillar = 'spend' | 'save' | 'borrow' | 'plan';
export type Tier = 'healthy' | 'coping' | 'vulnerable';

export interface Question {
  id: 'q1' | 'q2' | 'q3' | 'q4' | 'q5' | 'q6' | 'q7' | 'q8';
  pillar: Pillar;
  /** Points for each answer, in the toolkit's order (the first option is the healthiest). */
  points: number[];
  lead?: boolean;
  after?: boolean;
}

export const QUESTIONS: Question[] = [
  { id: 'q1', pillar: 'spend', points: [100, 75, 50, 25, 0] },
  { id: 'q2', pillar: 'spend', points: [100, 60, 40, 20, 0], after: true },
  { id: 'q3', pillar: 'save', points: [100, 75, 50, 25, 0] },
  { id: 'q4', pillar: 'save', points: [100, 75, 50, 25, 0], lead: true },
  { id: 'q5', pillar: 'borrow', points: [100, 85, 40, 0], lead: true },
  { id: 'q6', pillar: 'borrow', points: [100, 80, 60, 40, 0, 0], after: true },
  { id: 'q7', pillar: 'plan', points: [100, 75, 50, 25, 10, 0], lead: true },
  { id: 'q8', pillar: 'plan', points: [100, 65, 35, 15, 0], after: true },
];

export const PILLARS: Pillar[] = ['spend', 'save', 'borrow', 'plan'];

export const questionKey = (q: Question, part?: 'lead' | 'after' | number): TKey =>
  (part === undefined ? `fh.${q.id}` : typeof part === 'number' ? `fh.${q.id}.o${part}` : `fh.${q.id}.${part}`) as TKey;

/** Chosen option index per question id. */
export type Answers = Partial<Record<Question['id'], number>>;

export interface FinHealthResult {
  score: number;
  tier: Tier;
  pillars: Record<Pillar, number>;
}

const average = (values: number[]) => values.reduce((sum, v) => sum + v, 0) / values.length;

/** Toolkit scoring: each sub-score is the average of its two questions; the score is the average of all eight.
 * Shown as whole numbers, and the tier is read from the number shown (0–39 vulnerable, 40–79 coping, 80–100 healthy). */
export function scoreAnswers(answers: Answers): FinHealthResult | null {
  if (QUESTIONS.some((q) => answers[q.id] === undefined)) return null;
  const points = (q: Question) => q.points[answers[q.id]!];
  const score = Math.round(average(QUESTIONS.map(points)));
  const pillars = Object.fromEntries(PILLARS.map((p) => [p, Math.round(average(QUESTIONS.filter((q) => q.pillar === p).map(points)))])) as Record<Pillar, number>;
  return { score, tier: score >= 80 ? 'healthy' : score >= 40 ? 'coping' : 'vulnerable', pillars };
}

const KEY = 'finext:finhealth:v1';

export interface SavedCheckIn {
  answers: Answers;
  answeredAt: string;
}

export async function getCheckIn(): Promise<SavedCheckIn | null> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as SavedCheckIn) : null;
  } catch {
    return null;
  }
}

export async function saveCheckIn(answers: Answers): Promise<void> {
  const saved: SavedCheckIn = { answers, answeredAt: new Date().toISOString() };
  await AsyncStorage.setItem(KEY, JSON.stringify(saved)).catch(() => undefined);
}
