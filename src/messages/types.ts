export type FailureReason = 'auth_blocked' | 'timeout' | 'structure_changed' | 'unknown';

export interface FailedUrl {
  url: string;
  hash: string;
  error: string;
  reason: FailureReason;
  timestamp: number;
}

/** 從 error 訊息推斷失敗原因 */
export function classifyFailureReason(error: string): FailureReason {
  const msg = error.toLowerCase();
  if (/403|401|login|auth|forbidden|unauthorized/.test(msg)) return 'auth_blocked';
  if (/timeout|etimedout|timed out/.test(msg)) return 'timeout';
  if (/cannot read|undefined|null|typeerror|is not a function/.test(msg)) return 'structure_changed';
  return 'unknown';
}

export interface BotStats {
  urls: number;
  saved: number;
  errors: number;
  recent: string[];
  failedUrls: FailedUrl[];
}
