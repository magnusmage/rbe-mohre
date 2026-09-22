export type LanguageCode = 'en' | 'ar' | 'ur';

export interface Language {
  code: LanguageCode;
  name: string;
  native: string;
}

export type Speaker = 'Agent' | 'Worker';

export interface TranscriptEntry {
  who: Speaker;
  time: string;
  text: string;
  /** Tool invoked by the agent for this turn, if any. */
  tool?: string;
}

export type Tier = 'T0' | 'T1' | 'T2';

export interface QueueItem {
  ref: string;
  tier: Tier;
  title: string;
  worker: string;
  ago: string;
  /** Decision locked while the verified transcript is pending. */
  locked: boolean;
}

export type AuditResult = 'ok' | 'discrepancy' | 'stored' | 'refused';

export interface AuditEntry {
  time: string;
  tool: string;
  detail: string;
  result: AuditResult;
}

export interface CaseHistoryEntry {
  time: string;
  event: string;
}

export type DecisionKey = 'uphold' | 'open' | 'refer' | 'more';

export interface DecisionOption {
  key: DecisionKey;
  index: string;
  title: string;
  description: string;
  /** Label used in the confirm button / note placeholder. */
  label: string;
  color: string;
}


export interface CaseDetail {
  reviewRef: string;
  tier: Tier;
  title: string;
  caseRef: string;
  workerId: string;
  employer: string;
  endedAt: string;
  /** Decision stays locked until the HMAC-verified transcript is stored. */
  transcriptPending: boolean;
  transcriptStoredAt: string;
  draftRef: string;
  draftConfirmedAt: string;
}
