// src/components/MessageInput.tsx
// Send form for encrypted text messages.
// Supports optional password protection (Argon2id) and configurable TTL.
// Sends encrypted blob to worker KV — key stays client-side only.

import { useEffect, useState } from 'react';
import ShareLink from './ShareLink';
import {
  generateMessageKey,
  generateSalt,
  deriveKeyFromPassword,
  encryptMessage,
  exportKey,
  toBase64Url,
} from '../lib/crypto';
import { postMessage } from '../lib/api';

const MAX_CHARS = 1100;

type TtlHours = 1 | 7 | 24;

const TTL_OPTIONS: { value: TtlHours; label: string }[] = [
  { value: 1, label: '1 heure' },
  { value: 7, label: '7 heures' },
  { value: 24, label: '24 heures' },
];

export default function MessageInput() {
  const [text, setText] = useState('');
  const [ttl, setTtl] = useState<TtlHours>(7);
  const [usePassword, setUsePassword] = useState(false);
  const [password, setPassword] = useState('');
  const [status, setStatus] = useState<'idle' | 'encrypting' | 'done' | 'error'>('idle');
  const [shareLink, setShareLink] = useState('');
  const [error, setError] = useState('');
  const [autoCopied, setAutoCopied] = useState(false);

  const remaining = MAX_CHARS - text.length;
  const isOverLimit = remaining < 0;

  useEffect(() => {
    if (status === 'done' && shareLink) {
      navigator.clipboard.writeText(shareLink)
        .then(() => setAutoCopied(true))
        .catch(() => setAutoCopied(false));
    }
  }, [status, shareLink]);

  const handleReset = () => {
    setText('');
    setPassword('');
    setUsePassword(false);
    setTtl(7);
    setStatus('idle');
    setShareLink('');
    setError('');
    setAutoCopied(false);
  };

  const handleEncrypt = async () => {
    if (!text.trim() || isOverLimit) return;
    if (usePassword && !password.trim()) return;

    try {
      setStatus('encrypting');
      setError('');

      let key;
      let saltB64: string | undefined;

      if (usePassword) {
        const salt = generateSalt();
        saltB64 = toBase64Url(salt);
        key = await deriveKeyFromPassword(password, salt);
      } else {
        key = await generateMessageKey();
      }

      const encrypted = await encryptMessage(text, key);

      const { id } = await postMessage({
        ciphertext: toBase64Url(encrypted.ciphertext),
        iv: toBase64Url(encrypted.iv),
        salt: saltB64,
        has_password: usePassword,
        ttl_hours: ttl,
      });

      const base = window.location.origin;

      if (usePassword) {
        setShareLink(`${base}/m/${id}`);
      } else {
        const keyB64 = await exportKey(key);
        setShareLink(`${base}/m/${id}#${keyB64}`);
      }

      setStatus('done');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur de chiffrement');
      setStatus('error');
    }
  };

  const disabled = status === 'encrypting' || status === 'done';

  return (
    <div className="space-y-5 max-w-xl mx-auto">

      {/* Textarea */}
      <div className="space-y-1.5">
        <label htmlFor="message-input" className="section-label block">
          Votre message secret
        </label>
        <textarea
          id="message-input"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Mot de passe, token API, note confidentielle…"
          rows={5}
          maxLength={MAX_CHARS + 50}
          disabled={disabled}
          aria-describedby="char-counter"
          className="input-field w-full resize-none font-mono text-sm"
          style={{ minHeight: '120px' }}
        />
        <div
          id="char-counter"
          className="text-xs text-right"
          style={{ color: isOverLimit ? 'var(--coral)' : remaining <= 100 ? 'var(--warn)' : 'var(--text-3)' }}
          aria-live="polite"
        >
          {isOverLimit
            ? `${Math.abs(remaining)} caractères en trop`
            : `${remaining} caractères restants`}
        </div>
      </div>

      {/* TTL selector */}
      <div className="space-y-1.5">
        <span className="section-label block">Durée de conservation</span>
        <div className="flex gap-2" role="group" aria-label="Durée de conservation">
          {TTL_OPTIONS.map(({ value, label }) => (
            <button
              key={value}
              type="button"
              onClick={() => setTtl(value)}
              disabled={disabled}
              aria-pressed={ttl === value}
              className={`flex-1 py-1.5 px-3 rounded-lg text-sm font-medium border transition-all ${
                ttl === value
                  ? 'border-transparent text-white'
                  : 'bg-transparent'
              }`}
              style={
                ttl === value
                  ? { background: 'var(--accent-dark)', borderColor: 'var(--accent-dark)' }
                  : { border: '1px solid var(--border)', color: 'var(--text-2)' }
              }
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Password toggle */}
      <div className="space-y-2">
        <label className="flex items-center gap-2 cursor-pointer select-none" style={{ color: 'var(--text-2)' }}>
          <input
            type="checkbox"
            checked={usePassword}
            onChange={(e) => setUsePassword(e.target.checked)}
            disabled={disabled}
            className="rounded"
          />
          <span className="text-sm">Protéger par mot de passe</span>
        </label>

        {usePassword && (
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Mot de passe (partagez-le séparément)"
            disabled={disabled}
            aria-label="Mot de passe de protection"
            className="input-field w-full text-sm"
            autoComplete="new-password"
          />
        )}
      </div>

      {/* Info notice */}
      <p className="text-xs rounded-lg px-4 py-3" style={{ background: 'var(--bg-surface)', color: 'var(--text-2)' }}>
        {usePassword
          ? 'Le message est chiffré avec votre mot de passe. Le serveur ne stocke que des octets chiffrés.'
          : 'La clé est dans le lien — quiconque le reçoit peut lire le message. Partagez-le avec soin.'}
      </p>

      {/* Error */}
      {error && (
        <p className="text-sm flex items-center gap-2 animate-fade-in" style={{ color: 'var(--coral)' }} role="alert">
          <svg aria-hidden="true" className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
          </svg>
          {error}
        </p>
      )}

      {/* Share link */}
      {status === 'done' && shareLink && (
        <>
          {usePassword && (
            <p className="text-xs font-medium" style={{ color: 'var(--warn)' }}>
              Envoyez le mot de passe séparément du lien (canal différent).
            </p>
          )}
          <ShareLink link={shareLink} autoCopied={autoCopied} />
          <button type="button" onClick={handleReset} className="btn-secondary">
            Nouveau message
          </button>
        </>
      )}

      {/* Encrypt button */}
      {status !== 'done' && (
        <button
          type="button"
          onClick={handleEncrypt}
          disabled={!text.trim() || isOverLimit || status === 'encrypting' || (usePassword && !password.trim())}
          className="btn-primary"
        >
          {status === 'encrypting' ? 'Chiffrement…' : 'Chiffrer le message'}
        </button>
      )}

    </div>
  );
}
