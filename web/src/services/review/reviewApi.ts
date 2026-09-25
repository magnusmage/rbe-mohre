import { env } from '@/config/env';
import { ApiError, apiGet } from '@/services/http/apiClient';
import type { AuditEntry, AuditResult, CaseDetail, CaseHistoryEntry, Tier, TranscriptEntry } from '@/types';

/**
 * Raw shape of a `review_item` row as returned by `GET /review/queue`.
 * The backend serialises tiers as `tier_{0,1,2}_*` and epoch seconds for `at`.
 */
export interface ReviewQueueItemDto {
  review_ref: string;
  case_ref: string;
  conversation_id: string;
  tier: string;
  summary: string;
  decision: string | null;
  decided_by: string | null;
  decided_at: number | null;
  at: number;
  transcript_ready: boolean;
}

export interface ReviewQueueResponse {
  items: ReviewQueueItemDto[];
}

/** Backend tier -> frontend `Tier` code. Anything unknown falls back to T0. */
const TIER_FROM_API: Record<string, Tier> = {
  tier_0_standard_review: 'T0',
  tier_1_priority_review: 'T1',
  tier_2_mandatory_human: 'T2',
};

export function mapTier(apiTier: string): Tier {
  return TIER_FROM_API[apiTier] ?? 'T0';
}

const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** Compact "2 min ago" / "3 hr ago" formatting; matches the mock fixtures. */
export function formatAgo(epochSeconds: number, now: number = Date.now()): string {
  const diff = Math.max(0, now - epochSeconds * 1000);
  if (diff < MINUTE) return 'just now';
  if (diff < HOUR) return `${Math.floor(diff / MINUTE)} min ago`;
  if (diff < DAY) return `${Math.floor(diff / HOUR)} hr ago`;
  return `${Math.floor(diff / DAY)} d ago`;
}

/** Case items as consumed by the Review Queue UI, enriched with the source dto. */
export interface QueueCase {
  ref: string;
  tier: Tier;
  title: string;
  worker: string;
  ago: string;
  /** Decision stays locked until the verified transcript is stored. */
  locked: boolean;
  /** Original row, kept for downstream consumers (case detail, tests). */
  raw: ReviewQueueItemDto;
}

export function toQueueCase(item: ReviewQueueItemDto, now: number = Date.now()): QueueCase {
  return {
    ref: item.review_ref,
    tier: mapTier(item.tier),
    title: item.summary,
    // The queue endpoint only returns `case_ref`; worker name / employer come
    // from the case detail endpoint (see review_detail in app/service.py).
    worker: item.case_ref,
    ago: formatAgo(item.at, now),
    locked: !item.transcript_ready,
    raw: item,
  };
}

/** Missing token is a build-time misconfiguration; surface it as an ApiError. */
function reviewerAuthHeader(): Record<string, string> {
  const token = env.reviewerToken;
  if (!token) {
    throw new ApiError(
      'http',
      'Reviewer token is not configured. Set VITE_REVIEWER_TOKEN in the environment.',
      401,
    );
  }
  return { Authorization: `Bearer ${token}` };
}

/** `GET /review/queue`: open review items ordered by tier then time. */
export async function getReviewQueue(signal?: AbortSignal): Promise<QueueCase[]> {
  const data = await apiGet<ReviewQueueResponse>('/review/queue', {
    signal,
    headers: reviewerAuthHeader(),
  });

  if (!data || !Array.isArray(data.items)) {
    throw new ApiError('parse', 'The review queue service returned an unexpected response.');
  }

  const now = Date.now();
  return data.items.map((item) => toQueueCase(item, now));
}

// ---------------------------------------------------------------------------
// GET /review/{review_ref}
// ---------------------------------------------------------------------------

/** Verified finding inside a draft's `body.verified_findings[].findings[]`. */
export interface VerifiedFindingDto {
  code?: string;
  detail?: string;
  rule_id?: string;
  source?: string;
  verified?: boolean;
  amount?: string;
  period?: string;
}

export interface VerifiedFindingsGroupDto {
  action?: string;
  check?: string;
  status?: string;
  explanation?: string;
  findings?: VerifiedFindingDto[];
}

export interface AllegationDto {
  period: string | null;
  statement: string;
  at: number;
}

export interface DraftBodyDto {
  summary?: string;
  allegations?: AllegationDto[];
  verified_findings?: VerifiedFindingsGroupDto[];
  filed?: boolean;
}

export interface DraftDto {
  draft_ref: string;
  case_ref: string;
  worker_confirmed: number | boolean;
  filed: number | boolean;
  at: number;
  body: DraftBodyDto;
}

export interface AuditEventDto {
  id: number;
  at: number;
  actor: 'agent' | 'reviewer' | 'system' | string;
  action: string;
  conversation_id: string | null;
  case_ref: string | null;
  result: string;
  detail: string | null;
}

export interface ReviewDetailDto {
  review_ref: string;
  case_ref: string;
  conversation_id: string;
  tier: string;
  summary: string;
  decision: string | null;
  decided_by: string | null;
  decided_at: number | null;
  transcript_ready: boolean;
}

export interface ReviewPackageDto {
  allegations?: AllegationDto[];
  [key: string]: unknown;
}

export interface ReviewCaseResponse {
  ok: boolean;
  error?: string;
  review: ReviewDetailDto;
  package: ReviewPackageDto;
  allegations: AllegationDto[];
  draft: DraftDto | null;
  transcript: Record<string, unknown> | null;
  audit: AuditEventDto[];
}

/** UI-facing shape a specialist screen renders. Every field is safe-to-render. */
export interface CaseView {
  reviewRef: string;
  raw: ReviewCaseResponse;
  detail: CaseDetail;
  allegations: AllegationDto[];
  verifiedFindings: VerifiedFindingDto[];
  draft: DraftDto | null;
  draftBody: DraftBodyDto | null;
  transcript: TranscriptEntry[];
  audit: AuditEntry[];
  caseHistory: CaseHistoryEntry[];
  rule: { id: string; summary: string | null } | null;
}

const AUDIT_RESULT_MAP: Record<string, AuditResult> = {
  ok: 'ok',
  verified: 'ok',
  already_bound: 'ok',
  queued: 'ok',
  drafted: 'ok',
  discrepancy: 'discrepancy',
  stored: 'stored',
  duplicate: 'stored',
};

/** Anything not explicitly successful is treated as a refusal for badge tone purposes. */
function mapAuditResult(result: string): AuditResult {
  return AUDIT_RESULT_MAP[result] ?? 'refused';
}

function pad(n: number): string {
  return n < 10 ? `0${n}` : `${n}`;
}

/** Local HH:MM:SS time string, matching the mock audit fixtures. */
export function formatClock(epochSeconds: number): string {
  const d = new Date(epochSeconds * 1000);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

/** "04:12 PM · 22 Sep 2026" — matches the mock case-header format. */
export function formatCaseEndedAt(epochSeconds: number): string {
  const d = new Date(epochSeconds * 1000);
  const hours = d.getHours();
  const suffix = hours >= 12 ? 'PM' : 'AM';
  const h12 = hours % 12 === 0 ? 12 : hours % 12;
  const time = `${pad(h12)}:${pad(d.getMinutes())} ${suffix}`;
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${time} · ${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`;
}

function parseDetail(detail: string | null): Record<string, unknown> {
  if (!detail) return {};
  try {
    const value = JSON.parse(detail);
    return value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

/** Compact one-line rendering for the audit table, tolerant of missing detail. */
function renderAuditDetail(event: AuditEventDto): string {
  const parsed = parseDetail(event.detail);
  const parts: string[] = [];
  const check = (parsed.check_result ?? null) as Record<string, unknown> | null;
  if (check && typeof check.say === 'string') parts.push(check.say);
  for (const key of ['review_ref', 'draft_ref', 'tier', 'reason'] as const) {
    const value = parsed[key];
    if (typeof value === 'string' || typeof value === 'number') parts.push(`${key}=${value}`);
  }
  if (parts.length === 0 && event.case_ref) parts.push(event.case_ref);
  return parts.join(' · ');
}

export function toAuditEntry(event: AuditEventDto): AuditEntry {
  return {
    time: formatClock(event.at),
    tool: event.action,
    detail: renderAuditDetail(event) || event.result,
    result: mapAuditResult(event.result),
  };
}

/** Best-effort mapper for ElevenLabs post-call transcript bodies. */
export function toTranscriptEntries(body: Record<string, unknown> | null): TranscriptEntry[] {
  if (!body) return [];
  const data = (body as { data?: unknown }).data;
  const source: unknown = Array.isArray((body as { transcript?: unknown }).transcript)
    ? (body as { transcript?: unknown }).transcript
    : data && typeof data === 'object'
      ? (data as { transcript?: unknown }).transcript
      : null;

  if (!Array.isArray(source)) return [];

  return source
    .map((raw): TranscriptEntry | null => {
      if (!raw || typeof raw !== 'object') return null;
      const row = raw as Record<string, unknown>;
      const role = typeof row.role === 'string' ? row.role.toLowerCase() : '';
      const who = role === 'agent' || role === 'assistant' ? 'Agent' : 'Worker';
      const text =
        (typeof row.message === 'string' && row.message) ||
        (typeof row.text === 'string' && row.text) ||
        '';
      const seconds =
        typeof row.time_in_call_secs === 'number'
          ? row.time_in_call_secs
          : typeof row.time === 'number'
            ? row.time
            : null;
      const time =
        seconds === null
          ? ''
          : `${pad(Math.floor(seconds / 60))}:${pad(Math.floor(seconds % 60))}`;
      const tool = typeof row.tool_name === 'string' ? row.tool_name : undefined;
      if (!text && !tool) return null;
      return { who, time, text, tool };
    })
    .filter((entry): entry is TranscriptEntry => entry !== null);
}

/** Notable milestones the specialist wants to see in the side-panel history. */
const HISTORY_ACTIONS: Record<string, (event: AuditEventDto, parsed: Record<string, unknown>) => string | null> = {
  draft_complaint: (_, parsed) =>
    typeof parsed.draft_ref === 'string' ? `Draft prepared · ${parsed.draft_ref}` : 'Draft prepared',
  send_to_review: (event, parsed) => {
    if (event.result !== 'queued') return null;
    const tier = typeof parsed.tier === 'string' ? parsed.tier : null;
    return tier ? `Sent to review · ${tier}` : 'Sent to review';
  },
  decision: (event, parsed) => {
    const ref = typeof parsed.review_ref === 'string' ? parsed.review_ref : '';
    return `Decision ${event.result}${ref ? ` · ${ref}` : ''}`;
  },
  post_call_webhook: () => 'Transcript stored',
  verify_session: (event) => (event.result === 'verified' ? 'Caller verified' : null),
};

export function toCaseHistory(events: AuditEventDto[]): CaseHistoryEntry[] {
  return events.flatMap((event) => {
    const build = HISTORY_ACTIONS[event.action];
    if (!build) return [];
    const parsed = parseDetail(event.detail);
    const label = build(event, parsed);
    return label ? [{ time: formatClock(event.at), event: label }] : [];
  });
}

function flattenVerifiedFindings(draft: DraftDto | null): VerifiedFindingDto[] {
  if (!draft?.body?.verified_findings) return [];
  return draft.body.verified_findings.flatMap((group) => group.findings ?? []);
}

function pickRule(findings: VerifiedFindingDto[]): { id: string; summary: string | null } | null {
  for (const finding of findings) {
    if (finding.rule_id) {
      return { id: finding.rule_id, summary: finding.detail ?? null };
    }
  }
  return null;
}

function toBool(value: number | boolean | null | undefined): boolean {
  if (typeof value === 'boolean') return value;
  return Boolean(value);
}

/** Latest agent-side event marks when the case was effectively finished. */
function latestAgentAt(events: AuditEventDto[]): number | null {
  for (let i = events.length - 1; i >= 0; i -= 1) {
    const e = events[i];
    if (e.actor === 'agent') return e.at;
  }
  return null;
}

function transcriptStoredAt(events: AuditEventDto[]): number | null {
  for (const e of events) {
    if (e.action === 'post_call_webhook') return e.at;
  }
  return null;
}

function draftConfirmedAt(events: AuditEventDto[]): number | null {
  for (const e of events) {
    if (e.action === 'draft_complaint' && e.result === 'drafted') return e.at;
  }
  return null;
}

export function toCaseView(response: ReviewCaseResponse): CaseView {
  const audit = (response.audit ?? []).map(toAuditEntry);
  const verifiedFindings = flattenVerifiedFindings(response.draft);
  const endedAt = latestAgentAt(response.audit ?? []);
  const storedAt = transcriptStoredAt(response.audit ?? []);
  const confirmedAt = draftConfirmedAt(response.audit ?? []);

  const detail: CaseDetail = {
    reviewRef: response.review.review_ref,
    tier: mapTier(response.review.tier),
    title: response.review.summary || 'Case review',
    caseRef: response.review.case_ref,
    // Worker id isn't surfaced by /review/{ref}; the conversation id is the
    // closest identifier we have and keeps the header meaningful.
    workerId: response.review.conversation_id,
    employer: '—',
    endedAt: endedAt ? formatCaseEndedAt(endedAt) : '—',
    transcriptPending: !response.review.transcript_ready,
    transcriptStoredAt: storedAt ? formatClock(storedAt) : '',
    draftRef: response.draft?.draft_ref ?? '—',
    draftConfirmedAt: confirmedAt ? formatClock(confirmedAt) : '',
  };

  return {
    reviewRef: response.review.review_ref,
    raw: response,
    detail,
    allegations: response.allegations ?? [],
    verifiedFindings,
    draft: response.draft
      ? {
          ...response.draft,
          worker_confirmed: toBool(response.draft.worker_confirmed),
          filed: toBool(response.draft.filed),
        }
      : null,
    draftBody: response.draft?.body ?? null,
    transcript: toTranscriptEntries(response.transcript),
    audit,
    caseHistory: toCaseHistory(response.audit ?? []),
    rule: pickRule(verifiedFindings),
  };
}

/** `GET /review/{review_ref}`: full case pack for the specialist screen. */
export async function getReviewCase(reviewRef: string, signal?: AbortSignal): Promise<CaseView> {
  if (!reviewRef) {
    throw new ApiError('http', 'A review reference is required.', 400);
  }
  const data = await apiGet<ReviewCaseResponse>(`/review/${encodeURIComponent(reviewRef)}`, {
    signal,
    headers: reviewerAuthHeader(),
  });

  if (!data || !data.ok || !data.review) {
    throw new ApiError('parse', 'The review service returned an unexpected response.');
  }

  return toCaseView(data);
}
