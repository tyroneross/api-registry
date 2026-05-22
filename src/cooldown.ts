/**
 * Package-install cooldown verdict.
 *
 * Mirrors build-loop's 7-day open-source install cooldown: a package whose
 * latest version was published < 7 days ago is treated as not-yet-trusted
 * (supply-chain dwell time). `author_owned` services — those matched by the
 * scopes/projects listed in the runtime owned.json config — are exempt.
 *
 * Pure function so it is unit-testable without a DB or network.
 */
import type { Service } from './types.ts';

export const COOLDOWN_DAYS = 7;

export interface CooldownVerdict {
  install_blocked: boolean;
  reason: string | null;
  /** Age in days of the latest release; null when the release date is unknown. */
  release_age_days: number | null;
  author_owned: boolean;
}

/**
 * Resolve the cooldown verdict for a service.
 *
 * - author_owned: always exempt -> install_blocked: false.
 * - latest_version_released_at unknown: cannot prove freshness -> not blocked
 *   (fail-open; the registry never had the date, so don't punish the user).
 * - released < COOLDOWN_DAYS ago AND not author_owned -> install_blocked: true.
 */
export function cooldownVerdict(svc: Pick<Service,
  'author_owned' | 'latest_version' | 'latest_version_released_at'>,
  thresholdDays = COOLDOWN_DAYS,
): CooldownVerdict {
  if (svc.author_owned) {
    return {
      install_blocked: false,
      reason: null,
      release_age_days: ageDays(svc.latest_version_released_at),
      author_owned: true,
    };
  }

  const age = ageDays(svc.latest_version_released_at);
  if (age === null) {
    return {
      install_blocked: false,
      reason: null,
      release_age_days: null,
      author_owned: false,
    };
  }

  if (age < thresholdDays) {
    const v = svc.latest_version ?? 'latest';
    const days = Math.floor(age);
    return {
      install_blocked: true,
      reason: `${v} released ${days} day${days === 1 ? '' : 's'} ago, <${thresholdDays}d cooldown`,
      release_age_days: age,
      author_owned: false,
    };
  }

  return {
    install_blocked: false,
    reason: null,
    release_age_days: age,
    author_owned: false,
  };
}

/** Age in days since an ISO timestamp; null when missing/invalid. */
function ageDays(isoTimestamp: string | null | undefined): number | null {
  if (!isoTimestamp) return null;
  const t = new Date(isoTimestamp).getTime();
  if (Number.isNaN(t)) return null;
  return (Date.now() - t) / (1000 * 60 * 60 * 24);
}
