import type {
  AuditEntry,
  CaseDetail,
  CaseHistoryEntry,
  DecisionOption,
  Language,
  QueueItem,
  TranscriptEntry,
} from '@/types';

export const LANGUAGES: Language[] = [
  { code: 'en', name: 'English', native: 'EN' },
  { code: 'ar', name: 'Arabic', native: 'العربية' },
  { code: 'ur', name: 'Urdu', native: 'اردو' },
];

/** Languages a caller can choose to speak in, shown by native name. */
export const SPOKEN_LANGUAGES: { code: Language['code']; label: string }[] = [
  { code: 'en', label: 'English' },
  { code: 'ar', label: 'العربية' },
  { code: 'ur', label: 'اردو' },
];

export const SESSION = {
  workerId: 'WRK-1002',
  caseRef: 'LAB-1002',
  pin: '4821',
  employer: 'Al-Warda Facilities LLC',
  contractWage: 'AED 4,200.00',
  reviewRef: 'RV-2409-0031',
  callDuration: '04:12',
  liveTimer: '03:47',
  toolCalls: 6,
} as const;

export const SPECIALIST = {
  initials: 'FA',
  name: 'Fatima Al Marri',
  role: 'Specialist · Tier 2 cleared',
} as const;

export const TRANSCRIPT: TranscriptEntry[] = [
  {
    who: 'Agent',
    time: '00:04',
    text: "I'm MoHRE's AI assistant. This call is recorded. I give information from your own records — qualified staff make every decision.",
  },
  {
    who: 'Agent',
    time: '00:22',
    tool: 'verify_session',
    text: "Thanks. I've verified WRK-1002 and case LAB-1002. What would you like to check?",
  },
  { who: 'Worker', time: '00:41', text: "My July pay was short. I didn't get the full amount." },
  {
    who: 'Agent',
    time: '03:12',
    tool: 'check_wage',
    text: "For July 2026, the Wage Protection System shows AED 3,500.00 was paid. Your contract total wage is AED 4,200.00. Your employer recorded a deduction of AED 700.00 with the reason 'damage'.",
  },
  { who: 'Worker', time: '03:24', text: 'The damage was not my fault. I did not receive that 700.' },
  {
    who: 'Agent',
    time: '03:29',
    tool: 'record_allegation',
    text: "I've recorded that as your statement, kept separately from the WPS record. I won't say who's right — a specialist will look at both.",
  },
  {
    who: 'Agent',
    time: '03:45',
    text: 'Would you like me to prepare a complaint draft for confirmation? Nothing is filed until a specialist reviews it.',
  },
];

export const QUEUE: QueueItem[] = [
  { ref: 'RV-2409-0031', tier: 'T2', title: 'Contested deduction · Jul 2026', worker: 'WRK-1002 · Al-Warda', ago: '2 min ago', locked: false },
  { ref: 'RV-2409-0030', tier: 'T2', title: 'Payment timing · rule change month (2026-05)', worker: 'WRK-1004 · Gulf Steel', ago: '14 min ago', locked: true },
  { ref: 'RV-2409-0029', tier: 'T2', title: 'Domestic worker · out of scope', worker: 'WRK-1007 · private HH', ago: '38 min ago', locked: false },
  { ref: 'RV-2409-0028', tier: 'T1', title: 'WPS line missing · Jun 2026', worker: 'WRK-1010 · Marina Hosp.', ago: '1 hr ago', locked: false },
  { ref: 'RV-2409-0027', tier: 'T1', title: 'Settlement shortfall · gratuity', worker: 'WRK-1003 · Emirates Log.', ago: '2 hr ago', locked: false },
  { ref: 'RV-2409-0026', tier: 'T0', title: 'Wage shortfall · Jul 2026', worker: 'WRK-1001 · Al-Noor Tech.', ago: '3 hr ago', locked: false },
];

/** Open-case totals per tier across the whole queue (not only the loaded page). */
export const QUEUE_TOTALS = { all: 14, T2: 3, T1: 5, T0: 6 } as const;

export const AUDIT: AuditEntry[] = [
  { time: '16:03:14', tool: 'verify_session', detail: 'WRK-1002 · LAB-1002 · PIN ok · call bound', result: 'ok' },
  { time: '16:04:02', tool: 'check_wage', detail: 'period 2026-07 · contract 4200.00 vs WPS 3500.00 · gap 700.00', result: 'discrepancy' },
  { time: '16:04:47', tool: 'record_allegation', detail: 'caller statement stored (unverified)', result: 'ok' },
  { time: '16:11:52', tool: 'draft_complaint', detail: 'worker_confirmed=true · DR-2409-0087', result: 'ok' },
  { time: '16:12:08', tool: 'send_to_review', detail: 'requested T0 · raised to T2 (record ↔ allegation)', result: 'ok' },
  { time: '16:14:07', tool: 'post_call_webhook', detail: 'HMAC ok · transcript stored (idempotent)', result: 'stored' },
];

export const CASE_HISTORY: CaseHistoryEntry[] = [
  { time: '16:11:52', event: 'Draft confirmed by worker' },
  { time: '16:12:08', event: 'send_to_review · tier raised T0 → T2' },
  { time: '16:12:41', event: 'Call ended' },
  { time: '16:14:07', event: 'Post-call webhook · signature ok' },
  { time: '16:14:07', event: 'Decision unlocked' },
];

export const RULE_IN_FORCE = {
  id: '340/2026',
  summary: 'Salary due 1st of following month; late after the 1st.',
  effective: 'Effective 1 Jun 2026 — present.',
} as const;

export const DEFAULT_DECISION_NOTE =
  'Verified WPS record shows deduction of AED 700 (reason: "damage"). Worker disputes both the amount and the reason. Under FDL 33/2021 unilateral deductions require documented cause and worker acknowledgement — not on file. Opening complaint for employer response within 14 days.';

export const DECISION_OPTIONS: DecisionOption[] = [
  {
    key: 'uphold',
    index: '01',
    title: 'Uphold information',
    description: 'Facts & rule read to the worker were correct; no further action.',
    label: 'Uphold information',
    color: '#0B7568',
  },
  {
    key: 'open',
    index: '02',
    title: 'Open complaint',
    description: 'File the draft into the complaint & labour-disputes service.',
    label: 'Open complaint',
    color: '#B42318',
  },
  {
    key: 'refer',
    index: '03',
    title: 'Refer',
    description: 'Out of scope or wrong authority — route to the correct body.',
    label: 'Refer',
    color: '#3346A8',
  },
  {
    key: 'more',
    index: '04',
    title: 'Request more',
    description: 'Ask the worker or employer for a specific piece of evidence.',
    label: 'Request more evidence',
    color: '#A8650E',
  },
];

export const CASES: Record<string, CaseDetail> = {
  'RV-2409-0031': {
    reviewRef: 'RV-2409-0031',
    tier: 'T2',
    title: 'Contested deduction · July 2026 pay',
    caseRef: 'LAB-1002',
    workerId: 'WRK-1002',
    employer: 'Al-Warda Facilities LLC',
    endedAt: '04:12 PM · 22 Sep 2026',
    transcriptPending: false,
    transcriptStoredAt: '22 Sep 16:14:07',
    draftRef: 'DR-2409-0087',
    draftConfirmedAt: '16:11:52',
  },
};
