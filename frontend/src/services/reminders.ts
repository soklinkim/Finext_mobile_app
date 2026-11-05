/**
 * Entry reminders: like an alarm, the owner picks daily, weekly or monthly, and the time (and weekday or day of the
 * month). When a reminder falls due while the app is open, a pop-up opens Add entry; each one also lands in the
 * notifications list as unread until it is opened. Kept on this device only (alarms are per phone), in AsyncStorage.
 *
 * Only the latest missed occurrence of a reminder is shown when the app has been closed for a while, so a week away
 * does not bring seven pop-ups.
 */
import { useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Crypto from 'expo-crypto';

const createId = (): string => Crypto.randomUUID();

export type ReminderFrequency = 'daily' | 'weekly' | 'monthly';

export interface Reminder {
  id: string;
  frequency: ReminderFrequency;
  hour: number; // 0-23
  minute: number; // 0-59
  /** weekly: 0 = Monday … 6 = Sunday */
  weekday: number;
  /** monthly: 1-31 (a shorter month uses its last day) */
  monthDay: number;
  enabled: boolean;
  /** the newest occurrence already delivered to the inbox */
  lastFired: number;
}

export interface ReminderNotice {
  id: string;
  reminderId: string;
  /** when the reminder was due */
  at: number;
  read: boolean;
  /** the pop-up has been shown for it */
  popped: boolean;
}

const REMINDERS_KEY = 'finext:reminders:v1';
const INBOX_KEY = 'finext:reminderInbox:v1';
const INBOX_LIMIT = 50;

let reminders: Reminder[] = [];
let inbox: ReminderNotice[] = [];
const listeners = new Set<() => void>();
const loaded = Promise.all([AsyncStorage.getItem(REMINDERS_KEY), AsyncStorage.getItem(INBOX_KEY)])
  .then(([r, i]) => {
    try { reminders = r ? (JSON.parse(r) as Reminder[]) : []; } catch { reminders = []; }
    try { inbox = i ? (JSON.parse(i) as ReminderNotice[]) : []; } catch { inbox = []; }
  })
  .catch(() => undefined);

async function commit(): Promise<void> {
  listeners.forEach((listener) => listener());
  await Promise.all([
    AsyncStorage.setItem(REMINDERS_KEY, JSON.stringify(reminders)),
    AsyncStorage.setItem(INBOX_KEY, JSON.stringify(inbox)),
  ]).catch(() => undefined);
}

const daysIn = (year: number, month: number) => new Date(year, month + 1, 0).getDate();

/** The newest time this reminder was due at or before `now`. */
export function latestDue(r: Pick<Reminder, 'frequency' | 'hour' | 'minute' | 'weekday' | 'monthDay'>, now: number): number {
  const at = (y: number, m: number, d: number) => new Date(y, m, d, r.hour, r.minute, 0, 0).getTime();
  const today = new Date(now);
  const y = today.getFullYear();
  const m = today.getMonth();
  const d = today.getDate();
  if (r.frequency === 'daily') {
    const t = at(y, m, d);
    return t <= now ? t : at(y, m, d - 1);
  }
  if (r.frequency === 'weekly') {
    const back = (((today.getDay() + 6) % 7) - r.weekday + 7) % 7; // days since the chosen weekday (Monday = 0)
    const t = at(y, m, d - back);
    return t <= now ? t : at(y, m, d - back - 7);
  }
  const thisMonth = at(y, m, Math.min(r.monthDay, daysIn(y, m)));
  if (thisMonth <= now) return thisMonth;
  const py = m === 0 ? y - 1 : y;
  const pm = m === 0 ? 11 : m - 1;
  return at(py, pm, Math.min(r.monthDay, daysIn(py, pm)));
}

/** The next time this reminder is due after `now`, for showing "Next: …". */
export function nextDue(r: Reminder, now = Date.now()): number {
  const probe = latestDue(r, now);
  const step = r.frequency === 'daily' ? 1 : r.frequency === 'weekly' ? 7 : 0;
  if (step) return new Date(new Date(probe).getFullYear(), new Date(probe).getMonth(), new Date(probe).getDate() + step, r.hour, r.minute).getTime();
  const p = new Date(probe);
  const ny = p.getMonth() === 11 ? p.getFullYear() + 1 : p.getFullYear();
  const nm = (p.getMonth() + 1) % 12;
  return new Date(ny, nm, Math.min(r.monthDay, daysIn(ny, nm)), r.hour, r.minute).getTime();
}

/** "6:05 PM": a 12-hour time with the given AM and PM words. */
export function formatTime12(hour: number, minute: number, am = 'AM', pm = 'PM'): string {
  return `${hour % 12 || 12}:${String(minute).padStart(2, '0')} ${hour >= 12 ? pm : am}`;
}

export async function listReminders(): Promise<Reminder[]> {
  await loaded;
  return reminders;
}

export async function listNotices(): Promise<ReminderNotice[]> {
  await loaded;
  return inbox;
}

export type ReminderInput = Omit<Reminder, 'id' | 'lastFired'> & { id?: string };

/** Add a reminder, or replace the one with the same id. A new or changed reminder starts counting from now. */
export async function saveReminder(input: ReminderInput): Promise<void> {
  await loaded;
  const next: Reminder = { ...input, id: input.id ?? createId(), lastFired: Date.now() };
  reminders = input.id ? reminders.map((r) => (r.id === input.id ? next : r)) : [...reminders, next];
  await commit();
}

export async function setReminderEnabled(id: string, enabled: boolean): Promise<void> {
  await loaded;
  reminders = reminders.map((r) => (r.id === id ? { ...r, enabled, lastFired: enabled ? Date.now() : r.lastFired } : r));
  await commit();
}

export async function deleteReminder(id: string): Promise<void> {
  await loaded;
  reminders = reminders.filter((r) => r.id !== id);
  inbox = inbox.filter((n) => n.reminderId !== id);
  await commit();
}

/** Deliver every reminder that has fallen due since it last did. Returns the new notices (not yet shown as a pop-up). */
export async function checkDueReminders(now = Date.now()): Promise<ReminderNotice[]> {
  await loaded;
  const fresh: ReminderNotice[] = [];
  reminders = reminders.map((r) => {
    if (!r.enabled) return r;
    const due = latestDue(r, now);
    if (due <= r.lastFired) return r;
    fresh.push({ id: createId(), reminderId: r.id, at: due, read: false, popped: false });
    return { ...r, lastFired: due };
  });
  if (fresh.length) {
    inbox = [...fresh, ...inbox].sort((a, b) => b.at - a.at).slice(0, INBOX_LIMIT);
    await commit();
  }
  return fresh;
}

export async function markNoticeRead(id: string): Promise<void> {
  await loaded;
  inbox = inbox.map((n) => (n.id === id ? { ...n, read: true, popped: true } : n));
  await commit();
}

export async function markAllNoticesRead(): Promise<void> {
  await loaded;
  inbox = inbox.map((n) => ({ ...n, read: true, popped: true }));
  await commit();
}

/** The pop-up has been shown (the notice stays unread in the list until it is opened). */
export async function markNoticesPopped(ids: string[]): Promise<void> {
  await loaded;
  inbox = inbox.map((n) => (ids.includes(n.id) ? { ...n, popped: true } : n));
  await commit();
}

/** Live view of the reminders and their notices. */
export function useReminders(): { reminders: Reminder[]; notices: ReminderNotice[]; unread: number } {
  const [state, setState] = useState({ reminders, notices: inbox });
  useEffect(() => {
    let active = true;
    const read = () => { if (active) setState({ reminders: [...reminders], notices: [...inbox] }); };
    void loaded.then(read);
    listeners.add(read);
    return () => { active = false; listeners.delete(read); };
  }, []);
  return { ...state, unread: state.notices.filter((n) => !n.read).length };
}
