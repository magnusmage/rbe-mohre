import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/services/http/apiClient';
import { stubFetch } from '@/test/mocks/browserApis';
import {
  DECISION_CODE,
  formatAgo,
  formatCaseEndedAt,
  formatClock,
  getReviewCase,
  getReviewQueue,
  mapTier,
  postReviewDecision,
  toAuditEntry,
  toCaseHistory,
  toCaseView,
  toQueueCase,
  toTranscriptEntries,
  type AuditEventDto,
  type ReviewCaseResponse,
  type ReviewQueueItemDto,
} from './reviewApi';

const NOW = Date.parse('2026-09-24T12:00:00Z');

function dto(overrides: Partial<ReviewQueueItemDto> = {}): ReviewQueueItemDto {
  return {
    review_ref: 'RV-1790167201-0001',
    case_ref: 'LAB-1001',
    conversation_id: 'regression-1790167131-29363',
    tier: 'tier_0_standard_review',
    summary: 'Regression test: July wage shortfall',
    decision: null,
    decided_by: null,
    decided_at: null,
    at: NOW / 1000 - 120,
    transcript_ready: false,
    ...overrides,
  };
}

afterEach(() => {
  vi.useRealTimers();
});

describe('mapTier', () => {
  it('maps each backend tier code to its short frontend code', () => {
    expect(mapTier('tier_0_standard_review')).toBe('T0');
    expect(mapTier('tier_1_priority_review')).toBe('T1');
    expect(mapTier('tier_2_mandatory_human')).toBe('T2');
  });

  it('falls back to T0 for an unknown tier string', () => {
    expect(mapTier('tier_9_martian')).toBe('T0');
  });
});

describe('formatAgo', () => {
  it('renders sub-minute ages as "just now"', () => {
    expect(formatAgo(NOW / 1000 - 30, NOW)).toBe('just now');
  });
  it('renders minutes, hours and days', () => {
    expect(formatAgo(NOW / 1000 - 5 * 60, NOW)).toBe('5 min ago');
    expect(formatAgo(NOW / 1000 - 3 * 60 * 60, NOW)).toBe('3 hr ago');
    expect(formatAgo(NOW / 1000 - 2 * 24 * 60 * 60, NOW)).toBe('2 d ago');
  });
});

describe('toQueueCase', () => {
  it('normalises a dto into the shape the UI consumes', () => {
    const item = toQueueCase(
      dto({ tier: 'tier_2_mandatory_human', transcript_ready: false, summary: 'Contested deduction' }),
      NOW,
    );
    expect(item).toMatchObject({
      ref: 'RV-1790167201-0001',
      tier: 'T2',
      title: 'Contested deduction',
      worker: 'LAB-1001',
      ago: '2 min ago',
      locked: true,
    });
    expect(item.raw.conversation_id).toBe('regression-1790167131-29363');
  });

  it('marks transcript_ready=true as unlocked', () => {
    const item = toQueueCase(dto({ transcript_ready: true }), NOW);
    expect(item.locked).toBe(false);
  });
});

describe('getReviewQueue', () => {
  it('sends GET /review/queue with the reviewer bearer token', async () => {
    const { calls } = stubFetch({ body: { items: [] } });

    await getReviewQueue();

    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe('http://api.test/review/queue');
    const headers = calls[0].init?.headers as Record<string, string>;
    expect(headers.Authorization).toBe('Bearer test-reviewer-token');
  });

  it('returns mapped queue cases in payload order', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    stubFetch({
      body: {
        items: [
          dto({ review_ref: 'RV-1', tier: 'tier_2_mandatory_human' }),
          dto({ review_ref: 'RV-2', tier: 'tier_1_priority_review' }),
        ],
      },
    });

    const items = await getReviewQueue();

    expect(items.map((i) => [i.ref, i.tier])).toEqual([
      ['RV-1', 'T2'],
      ['RV-2', 'T1'],
    ]);
  });

  it('rejects with a parse ApiError when the shape is invalid', async () => {
    stubFetch({ body: { not_items: [] } });

    await expect(getReviewQueue()).rejects.toBeInstanceOf(ApiError);
  });

  it('propagates HTTP errors from the client', async () => {
    stubFetch({ status: 401, body: { detail: 'unauthorised' } });

    await expect(getReviewQueue()).rejects.toMatchObject({ kind: 'http', status: 401 });
  });
});

// ---------------------------------------------------------------------------
// Case-detail mappers
// ---------------------------------------------------------------------------

describe('formatClock / formatCaseEndedAt', () => {
  it('pads hours, minutes, seconds', () => {
    const epoch = Date.parse('2026-07-04T03:05:09') / 1000;
    expect(formatClock(epoch)).toBe('03:05:09');
    expect(formatCaseEndedAt(epoch)).toContain('AM');
    expect(formatCaseEndedAt(epoch)).toContain('4 Jul 2026');
  });

  it('handles PM and 12-hour boundaries', () => {
    const epoch = Date.parse('2026-07-04T00:00:00') / 1000;
    expect(formatCaseEndedAt(epoch)).toMatch(/12:00 AM/);
    const noon = Date.parse('2026-07-04T12:00:00') / 1000;
    expect(formatCaseEndedAt(noon)).toMatch(/12:00 PM/);
  });
});

describe('toAuditEntry', () => {
  const baseEvent: AuditEventDto = {
    id: 1,
    at: 1790157523,
    actor: 'agent',
    action: 'verify_session',
    conversation_id: 'c1',
    case_ref: 'LAB-1001',
    result: 'verified',
    detail: null,
  };

  it('maps common results to tones and falls back to the case_ref for detail', () => {
    const entry = toAuditEntry(baseEvent);
    expect(entry.tool).toBe('verify_session');
    expect(entry.result).toBe('ok');
    expect(entry.detail).toBe('LAB-1001');
  });

  it('renders a check_result "say" line when available', () => {
    const entry = toAuditEntry({
      ...baseEvent,
      action: 'check_wage',
      result: 'discrepancy',
      detail: JSON.stringify({
        tier: 'tier_0_standard_review',
        check_result: { say: 'Wage shortfall of AED 1000.' },
      }),
    });
    expect(entry.result).toBe('discrepancy');
    expect(entry.detail).toContain('Wage shortfall');
    expect(entry.detail).toContain('tier=tier_0_standard_review');
  });

  it('classifies unknown results as refusals', () => {
    const entry = toAuditEntry({ ...baseEvent, result: 'weird_state' });
    expect(entry.result).toBe('refused');
  });

  it('tolerates malformed detail JSON', () => {
    const entry = toAuditEntry({ ...baseEvent, detail: '{not json' });
    expect(entry.detail).toBe('LAB-1001');
  });
});

describe('toCaseHistory', () => {
  it('captures draft, review, decision, transcript and verification milestones', () => {
    const events: AuditEventDto[] = [
      { id: 1, at: 1, actor: 'agent', action: 'verify_session', conversation_id: 'c', case_ref: 'r', result: 'verified', detail: null },
      { id: 2, at: 2, actor: 'agent', action: 'send_to_review', conversation_id: 'c', case_ref: 'r', result: 'queued', detail: JSON.stringify({ tier: 'tier_2_mandatory_human' }) },
      { id: 3, at: 3, actor: 'agent', action: 'send_to_review', conversation_id: 'c', case_ref: 'r', result: 'already_queued', detail: null },
      { id: 4, at: 4, actor: 'agent', action: 'draft_complaint', conversation_id: 'c', case_ref: 'r', result: 'drafted', detail: JSON.stringify({ draft_ref: 'DR-1' }) },
      { id: 5, at: 5, actor: 'reviewer', action: 'decision', conversation_id: 'c', case_ref: 'r', result: 'uphold_information', detail: JSON.stringify({ review_ref: 'RV-1' }) },
      { id: 6, at: 6, actor: 'system', action: 'post_call_webhook', conversation_id: 'c', case_ref: 'r', result: 'stored', detail: null },
      { id: 7, at: 7, actor: 'agent', action: 'irrelevant', conversation_id: 'c', case_ref: 'r', result: 'ok', detail: null },
    ];
    const history = toCaseHistory(events);
    expect(history.map((h) => h.event)).toEqual([
      'Caller verified',
      'Sent to review · tier_2_mandatory_human',
      'Draft prepared · DR-1',
      'Decision uphold_information · RV-1',
      'Transcript stored',
    ]);
  });
});

describe('toTranscriptEntries', () => {
  it('returns [] for null bodies and unknown shapes', () => {
    expect(toTranscriptEntries(null)).toEqual([]);
    expect(toTranscriptEntries({ foo: 'bar' })).toEqual([]);
    expect(toTranscriptEntries({ data: { transcript: 'nope' } })).toEqual([]);
  });

  it('maps common ElevenLabs shapes', () => {
    const entries = toTranscriptEntries({
      data: {
        transcript: [
          { role: 'agent', message: 'Hello', time_in_call_secs: 4 },
          { role: 'user', text: 'Hi', time_in_call_secs: 12 },
          { role: 'agent', tool_name: 'check_wage', time_in_call_secs: 65 },
          { role: 'user' }, // ignored: no text, no tool
        ],
      },
    });
    expect(entries).toEqual([
      { who: 'Agent', time: '00:04', text: 'Hello', tool: undefined },
      { who: 'Worker', time: '00:12', text: 'Hi', tool: undefined },
      { who: 'Agent', time: '01:05', text: '', tool: 'check_wage' },
    ]);
  });

  it('accepts a top-level transcript array', () => {
    const entries = toTranscriptEntries({ transcript: [{ role: 'assistant', message: 'Hi' }] });
    expect(entries).toEqual([{ who: 'Agent', time: '', text: 'Hi', tool: undefined }]);
  });
});

const CASE_FIXTURE: ReviewCaseResponse = {
  ok: true,
  review: {
    review_ref: 'RV-1',
    case_ref: 'LAB-1001',
    conversation_id: 'c1',
    tier: 'tier_0_standard_review',
    summary: 'A case',
    decision: null,
    decided_by: null,
    decided_at: null,
    transcript_ready: false,
  },
  package: { allegations: [] },
  allegations: [{ period: '2026-07', statement: 'not me', at: 1 }],
  draft: {
    draft_ref: 'DR-1',
    case_ref: 'LAB-1001',
    worker_confirmed: 1,
    filed: 0,
    at: 100,
    body: {
      summary: 'sum',
      verified_findings: [
        {
          action: 'check_wage',
          check: 'wage',
          status: 'discrepancy',
          findings: [{ code: 'WAGE_SHORTFALL', rule_id: 'CONTRACT-VS-WPS', detail: 'x', verified: true }],
        },
      ],
    },
  },
  transcript: null,
  audit: [
    { id: 1, at: 200, actor: 'agent', action: 'draft_complaint', conversation_id: 'c1', case_ref: 'LAB-1001', result: 'drafted', detail: JSON.stringify({ draft_ref: 'DR-1' }) },
    { id: 2, at: 300, actor: 'agent', action: 'send_to_review', conversation_id: 'c1', case_ref: 'LAB-1001', result: 'queued', detail: JSON.stringify({ tier: 'tier_0_standard_review' }) },
  ],
};

describe('toCaseView', () => {
  it('builds a UI-ready view with detail, findings, rule and history', () => {
    const view = toCaseView(CASE_FIXTURE);
    expect(view.detail.reviewRef).toBe('RV-1');
    expect(view.detail.tier).toBe('T0');
    expect(view.detail.transcriptPending).toBe(true);
    expect(view.detail.transcriptStoredAt).toBe('');
    expect(view.detail.draftRef).toBe('DR-1');
    expect(view.detail.draftConfirmedAt).not.toBe('');
    expect(view.verifiedFindings).toHaveLength(1);
    expect(view.rule).toEqual({ id: 'CONTRACT-VS-WPS', summary: 'x' });
    expect(view.allegations).toHaveLength(1);
    expect(view.caseHistory.length).toBeGreaterThan(0);
    expect(view.draft?.worker_confirmed).toBe(true);
    expect(view.draft?.filed).toBe(false);
  });

  it('renders sensible defaults when the case pack is bare', () => {
    const view = toCaseView({
      ok: true,
      review: { ...CASE_FIXTURE.review, transcript_ready: true, summary: '' },
      package: {},
      allegations: [],
      draft: null,
      transcript: null,
      audit: [],
    });
    expect(view.detail.title).toBe('Case review');
    expect(view.detail.draftRef).toBe('—');
    expect(view.detail.endedAt).toBe('—');
    expect(view.rule).toBeNull();
    expect(view.verifiedFindings).toEqual([]);
    expect(view.caseHistory).toEqual([]);
  });
});

describe('getReviewCase', () => {
  it('sends the reviewer bearer token to the case endpoint', async () => {
    const { calls } = stubFetch({ body: CASE_FIXTURE });

    await getReviewCase('RV-1');

    expect(calls[0].url).toBe('http://api.test/review/RV-1');
    expect((calls[0].init?.headers as Record<string, string>).Authorization).toBe('Bearer test-reviewer-token');
  });

  it('encodes ref characters that need escaping in the URL', async () => {
    const { calls } = stubFetch({ body: CASE_FIXTURE });
    await getReviewCase('RV with space');
    expect(calls[0].url).toBe('http://api.test/review/RV%20with%20space');
  });

  it('rejects with a 400 ApiError when called with an empty ref', async () => {
    await expect(getReviewCase('')).rejects.toMatchObject({ kind: 'http', status: 400 });
  });

  it('rejects with a parse ApiError when the response lacks `ok` or `review`', async () => {
    stubFetch({ body: { ok: false } });
    await expect(getReviewCase('RV-1')).rejects.toMatchObject({ kind: 'parse' });
  });

  it('propagates 404 from the server', async () => {
    stubFetch({ status: 404, body: { detail: 'not_found' } });
    await expect(getReviewCase('RV-nope')).rejects.toMatchObject({ kind: 'http', status: 404 });
  });
});

describe('DECISION_CODE', () => {
  it('maps every frontend key to a valid backend registry code', () => {
    expect(DECISION_CODE).toEqual({
      uphold: 'uphold_information',
      open: 'open_complaint',
      refer: 'refer',
      more: 'request_more',
    });
  });
});

describe('postReviewDecision', () => {
  const REF = 'RV-1';
  const body = { decision: 'uphold_information', reviewer: 'Fatima Al Marri' };

  it('POSTs the decision + reviewer with the bearer token and token query param', async () => {
    const { calls } = stubFetch({ body: { ok: true, decision: 'uphold_information' } });

    await postReviewDecision(REF, body);

    expect(calls).toHaveLength(1);
    expect(calls[0].init?.method).toBe('POST');
    expect(calls[0].url).toBe(`http://api.test/review/${REF}/decision?token=test-reviewer-token`);
    const headers = calls[0].init?.headers as Record<string, string>;
    expect(headers.Authorization).toBe('Bearer test-reviewer-token');
    expect(JSON.parse(calls[0].init?.body as string)).toEqual(body);
  });

  it('trims decision and reviewer before sending', async () => {
    const { calls } = stubFetch({ body: { ok: true, decision: 'refer' } });

    await postReviewDecision(REF, { decision: '  refer  ', reviewer: '  Fatima  ' });

    expect(JSON.parse(calls[0].init?.body as string)).toEqual({ decision: 'refer', reviewer: 'Fatima' });
  });

  it('rejects an empty review ref before hitting the network', async () => {
    const { calls } = stubFetch({ body: {} });
    await expect(postReviewDecision('', body)).rejects.toMatchObject({ status: 400 });
    expect(calls.length).toBe(0);
  });

  it('rejects empty decision / reviewer before hitting the network', async () => {
    const { calls } = stubFetch({ body: {} });
    await expect(postReviewDecision(REF, { decision: '', reviewer: 'x' })).rejects.toMatchObject({ status: 400 });
    await expect(postReviewDecision(REF, { decision: 'x', reviewer: '' })).rejects.toMatchObject({ status: 400 });
    expect(calls.length).toBe(0);
  });

  it('turns a non-ok body into an ApiError', async () => {
    stubFetch({ body: { ok: false, error: 'already_decided' } });
    await expect(postReviewDecision(REF, body)).rejects.toMatchObject({
      kind: 'http',
      message: 'already_decided',
    });
  });

  it('propagates 409 transcript_pending', async () => {
    stubFetch({ status: 409, body: { detail: 'transcript_pending' } });
    await expect(postReviewDecision(REF, body)).rejects.toMatchObject({ kind: 'http', status: 409 });
  });
});
