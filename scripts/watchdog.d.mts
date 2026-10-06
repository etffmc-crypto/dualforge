type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;
export interface CheckResult {
  check: 'site' | 'release' | 'ci';
  ok: boolean;
  skipped?: boolean;
  details: string;
  tag?: string;
  verifiedAsset?: string;
}
export interface WatchdogDeps {
  fetch: FetchLike;
  repo: string;
  token?: string | undefined;
  pagesUrl?: string | undefined;
  verifiedAsset?: string | null;
  now?: () => string;
}
export const LABEL: string;
export const BOT_LOGIN: string;
export const CHECKS: string[];
export const REOPEN_DAYS: number;
export const MAX_DETAILS: number;
export function issueTitle(check: string): string;
export function parseLatestYml(text: string): {
  version?: string;
  path?: string;
  sha512?: string;
  size?: number;
};
export function hashFromSums(text: string, name: string): string | null;
export function assetKey(exe: { id: number; updated_at: string; digest?: string | null }): string;
export function sanitizeDetails(text: string): string;
export function issueBody(result: CheckResult, now: string): string;
export function checkSite(fetch: FetchLike, url: string): Promise<CheckResult>;
export function checkRelease(d: WatchdogDeps): Promise<CheckResult>;
export function checkCi(d: WatchdogDeps): Promise<CheckResult>;
export function syncIssues(d: WatchdogDeps, results: CheckResult[]): Promise<string[]>;
export function runWatchdog(
  d: WatchdogDeps,
): Promise<{ results: CheckResult[]; verifiedAsset: string | null }>;
export function main(
  env?: Record<string, string | undefined>,
  fetch?: FetchLike,
  log?: (s: string) => void,
): Promise<number>;
