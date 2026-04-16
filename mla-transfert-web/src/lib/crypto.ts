// src/lib/crypto.ts
// AES-256-GCM client-side encryption via Web Crypto API.
// No server-side key storage — key is either in the URL fragment (no password)
// or derived client-side via PBKDF2-SHA256 from user password (password-protected).
//
// Password derivation: PBKDF2-SHA256, 600,000 iterations (NIST SP 800-132 / OWASP 2023).
// Note: Argon2id would be stronger (memory-hard) but requires WASM which is incompatible
// with @astrojs/cloudflare post-build processing. PBKDF2 is the Web Crypto API native fallback.

const ALGO = { name: 'AES-GCM', length: 256 } as const;

// -- Encoding helpers -------------------------------------------------------

export function toBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

export function fromBase64Url(b64url: string): Uint8Array {
  const b64 = b64url.replace(/-/g, '+').replace(/_/g, '/');
  const padded = b64.padEnd(b64.length + ((4 - (b64.length % 4)) % 4), '=');
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

// -- Key management ---------------------------------------------------------

export async function generateMessageKey(): Promise<CryptoKey> {
  return crypto.subtle.generateKey(ALGO, true, ['encrypt', 'decrypt']);
}

export async function exportKey(key: CryptoKey): Promise<string> {
  const raw = await crypto.subtle.exportKey('raw', key);
  return toBase64Url(new Uint8Array(raw));
}

export async function importKey(b64url: string): Promise<CryptoKey> {
  const raw = fromBase64Url(b64url);
  return crypto.subtle.importKey('raw', raw, ALGO, false, ['decrypt']);
}

// -- Argon2id key derivation ------------------------------------------------

/** Generate a random 16-byte salt for Argon2id. */
export function generateSalt(): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(16));
}

/**
 * Derive an AES-256 key from a password using PBKDF2-SHA256.
 * 600,000 iterations (OWASP 2023 / NIST SP 800-132 recommendation).
 * The derived key is non-extractable (cannot be exported from the browser).
 * Pure Web Crypto API — no WASM, no dependencies.
 */
export async function deriveKeyFromPassword(
  password: string,
  salt: Uint8Array,
): Promise<CryptoKey> {
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveKey'],
  );
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: 600_000, hash: 'SHA-256' },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

// -- Encrypt ----------------------------------------------------------------

export interface EncryptedMessage {
  iv: Uint8Array;         // 12 bytes GCM nonce
  ciphertext: Uint8Array; // plaintext + 16-byte GCM tag (WebCrypto appends tag)
}

export async function encryptMessage(
  plaintext: string,
  key: CryptoKey,
): Promise<EncryptedMessage> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(plaintext);
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt({ name: 'AES-GCM', iv, tagLength: 128 }, key, encoded),
  );
  return { iv, ciphertext };
}

// -- Fragment encoding/decoding (legacy — used by MessageDisplay until Task 6) ------

export interface ParsedFragment {
  keyB64url: string;
  iv: Uint8Array;
  ciphertext: Uint8Array;
}

export async function buildMessageFragment(
  encrypted: EncryptedMessage,
  key: CryptoKey,
): Promise<string> {
  const keyB64 = await exportKey(key);
  const ivB64 = toBase64Url(encrypted.iv);
  const encB64 = toBase64Url(encrypted.ciphertext);
  return `${keyB64}.${ivB64}.${encB64}`;
}

export function parseMessageFragment(hash: string): ParsedFragment | null {
  const raw = hash.startsWith('#') ? hash.slice(1) : hash;
  const parts = raw.split('.');
  if (parts.length !== 3) return null;
  const [keyB64url, ivB64url, encB64url] = parts;
  if (!keyB64url || !ivB64url || !encB64url) return null;
  try {
    return {
      keyB64url,
      iv: fromBase64Url(ivB64url),
      ciphertext: fromBase64Url(encB64url),
    };
  } catch {
    return null;
  }
}

// -- Decrypt ----------------------------------------------------------------

export async function decryptMessage(
  encrypted: EncryptedMessage,
  key: CryptoKey,
): Promise<string> {
  const plain = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: encrypted.iv, tagLength: 128 },
    key,
    encrypted.ciphertext,
  );
  return new TextDecoder().decode(plain);
}
