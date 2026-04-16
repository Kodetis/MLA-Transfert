// src/components/MessageDisplay.tsx
// Receive page for encrypted text messages.
// Reads fragment from window.location.hash, imports key, decrypts, displays message.
// No server interaction — everything happens client-side.

import { useEffect, useState } from 'react';
import {
  importKey,
  decryptMessage,
  parseMessageFragment,
} from '../lib/crypto';

type Status = 'decrypting' | 'done' | 'error' | 'invalid';

export default function MessageDisplay() {
  const [status, setStatus] = useState<Status>('decrypting');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const hash = window.location.hash;
        const parsed = parseMessageFragment(hash);

        if (!parsed) {
          setStatus('invalid');
          return;
        }

        const key = await importKey(parsed.keyB64url);
        const plaintext = await decryptMessage(
          { iv: parsed.iv, ciphertext: parsed.ciphertext },
          key,
        );

        setMessage(plaintext);
        setStatus('done');
      } catch {
        setError('Impossible de déchiffrer le message. Le lien est peut-être incomplet ou corrompu.');
        setStatus('error');
      }
    })();
  }, []);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(message);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      // clipboard unavailable — user can still select text manually
    }
  };

  if (status === 'decrypting') {
    return (
      <div className="text-center py-12 space-y-3 animate-fade-in">
        <div
          className="w-8 h-8 rounded-full border-2 border-t-transparent mx-auto animate-spin"
          style={{ borderColor: 'var(--accent)' }}
          role="status"
          aria-label="Déchiffrement en cours"
        />
        <p className="text-sm" style={{ color: 'var(--text-2)' }}>Déchiffrement…</p>
      </div>
    );
  }

  if (status === 'invalid') {
    return (
      <div className="text-center py-12 space-y-4 animate-fade-in">
        <p className="text-lg font-semibold" style={{ color: 'var(--coral)' }}>Lien invalide</p>
        <p className="text-sm max-w-sm mx-auto" style={{ color: 'var(--text-2)' }}>
          Ce lien ne contient pas de message chiffré valide. Vérifiez que vous avez copié le lien en entier, y compris la partie après le <code>#</code>.
        </p>
        <a href="/" className="btn-secondary inline-block">Accueil</a>
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div className="text-center py-12 space-y-4 animate-fade-in">
        <p className="text-lg font-semibold" style={{ color: 'var(--coral)' }}>Déchiffrement impossible</p>
        <p className="text-sm max-w-sm mx-auto" style={{ color: 'var(--text-2)' }}>{error}</p>
        <a href="/" className="btn-secondary inline-block">Accueil</a>
      </div>
    );
  }

  // status === 'done'
  return (
    <div className="space-y-5 max-w-xl mx-auto animate-slide-up">

      {/* Success badge */}
      <p className="text-sm font-medium flex items-center gap-2" style={{ color: 'var(--success)' }}>
        <svg aria-hidden="true" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        Message déchiffré avec succès
      </p>

      {/* Message display */}
      <div className="relative">
        <textarea
          readOnly
          value={message}
          rows={6}
          aria-label="Message déchiffré"
          className="input-field w-full resize-none font-mono text-sm select-all"
          style={{ minHeight: '140px' }}
          onFocus={(e) => e.currentTarget.select()}
        />
      </div>

      {/* Copy button */}
      <button onClick={handleCopy} className="btn-primary">
        {copied ? (
          <>
            <svg aria-hidden="true" className="w-4 h-4 inline mr-1.5" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
            </svg>
            Copié !
          </>
        ) : (
          'Copier le message'
        )}
      </button>

      {/* Privacy notice */}
      <p className="text-xs" style={{ color: 'var(--text-3)' }}>
        Ce message a été déchiffré localement dans votre navigateur. Aucune donnée n'a transité par nos serveurs.
      </p>

    </div>
  );
}
