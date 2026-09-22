import type { BadgeTone } from '@/components/ui';
import type { AuditResult, Tier } from '@/types';

export const TIER_BADGE_TONE: Record<Tier, BadgeTone> = {
  T2: 'danger',
  T1: 'warning',
  T0: 'neutral',
};

export const TIER_LONG_LABEL: Record<Tier, string> = {
  T2: 'TIER 2 · MANDATORY QUALIFIED',
  T1: 'TIER 1',
  T0: 'TIER 0',
};

export const AUDIT_RESULT_TONE: Record<AuditResult, BadgeTone> = {
  ok: 'success',
  stored: 'success',
  discrepancy: 'warning',
  refused: 'danger',
};
