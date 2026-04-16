// src/components/MessageInput.tsx
// Send form for encrypted text messages.
// Encrypts via Web Crypto API (AES-256-GCM), encodes result in URL fragment.
// Zero server interaction — the link IS the message.

import { useEffect, useState } from 'react';
import ShareLink from './ShareLink';
import {
  generateMessageKey,
  encryptMessage,
  buildMessageFragment,
} from '../lib/crypto';

const MAX_CHARS = 1100;

export default function MessageInput() {
  const [text, setText] = useState('');
  const [status, setStatus] = useState<'idle' | 'encrypting' | 'done' | 'error'>('idle');
  const [shareLink, setShareLink] = useState('');
  const [error, setError] = useState('');

  const remaining = MAX_CHARS - text.length;
  const isOverLimit = remaining < 0;

  // Auto-copy link when done
  useEffect(() => {
    if (status === 'done' && shareLink) {
      navigator.clipboard.writeText(shareLink).catch(() => {});
    }
  }, [status, shareLink]);

  const handleReset = () => {
    setText('');
    setStatus('idle');
    setShareLink('');
    setError('');
  };

  const handleEncrypt = async () => {
    if (!text.trim() || isOverLimit) return;
    try {
      setStatus('encrypting');
      setError('');

      const key = await generateMessageKey();
      const encrypted = await encryptMessage(text, key);
      const fragment = await buildMessageFragment(encrypted, key);

      const base =
        (import.meta.env.PUBLIC_BASE_URL as string | undefined)?.replace(/\/$/, '') ??
        window.location.origin;
      setShareLink(`${base}/m#${fragment}`);
      setStatus('done');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur de chiffrement');
      setStatus('error');
    }
  };

  return (
    <div className="space-y-5 max-w-xl mx-auto">

      {/* Textarea */}
      <div className="space-y-1.5">
        <label
          htmlFor="message-input"
          className="section-label block"
        >
          Votre message secret
        </label>
        <textarea
          id="message-input"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Mot de passe, token API, note confidentielle…"
          rows={5}
          maxLength={MAX_CHARS + 50}
          disabled={status === 'encrypting' || status === 'done'}
          aria-describedby="char-counter"
          className="input-field w-full resize-none font-mono text-sm"
          style={{ minHeight: '120px' }}
        />
        {/* Character counter */}
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

      {/* Warning: zero-storage nature */}
      <p className="text-xs rounded-lg px-4 py-3" style={{ background: 'var(--bg-surface)', color: 'var(--text-2)' }}>
        Le lien généré <strong>est</strong> le message chiffré — aucune donnée n'est stockée sur nos serveurs.
        Quiconque possède le lien peut lire le message.
      </p>

      {/* Error */}
      {error && (
        <p
          className="text-sm flex items-center gap-2 animate-fade-in"
          style={{ color: 'var(--coral)' }}
          role="alert"
        >
          <svg aria-hidden="true" className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
          </svg>
          {error}
        </p>
      )}

      {/* Share link */}
      {status === 'done' && shareLink && (
        <>
          <ShareLink link={shareLink} autoCopied />
          <button onClick={handleReset} className="btn-secondary">
            Nouveau message
          </button>
        </>
      )}

      {/* Encrypt button */}
      {status !== 'done' && (
        <button
          onClick={handleEncrypt}
          disabled={!text.trim() || isOverLimit || status === 'encrypting'}
          className="btn-primary"
        >
          {status === 'encrypting' ? 'Chiffrement…' : 'Chiffrer le message'}
        </button>
      )}

    </div>
  );
}
