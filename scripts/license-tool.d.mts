export const DEFAULT_KEY_PATH: string;
export const FOUNDER_KEY_SOURCE: string;
export const PREFIX: string;
export const DOMAIN: string;
export interface FounderPayload {
  v: 1;
  id: string;
  kind: 'founder' | 'review';
  name: string;
  issuedAt: string;
  expiresAt: string | null;
  note: string;
}
export function validPayload(p: unknown): boolean;
export function builtInPublicKey(source?: string): string;
export function publicKeyOf(privatePem: string): string;
export function keygen(path?: string): string;
export function signKey(payload: object, privatePem: string): string;
export function verifyKey(
  text: string,
  publicKeyB64: string,
  now?: number,
): { ok: boolean; payload?: FounderPayload; error?: string };
export function issue(o: {
  name: string;
  kind: string;
  expires?: string;
  note?: string;
  keyPath?: string;
  publicKeyB64?: string;
  now?: Date;
}): { line: string; payload: FounderPayload };
export function main(argv: string[], out?: (line: string) => void): number;
