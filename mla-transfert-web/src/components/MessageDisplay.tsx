// src/components/MessageDisplay.tsx
// Receive page for encrypted text messages.
// Fetches encrypted blob from worker KV via GET /api/message/:id.
// Without password: imports AES key from URL fragment (#key).
// With password: prompts for password, derives key via PBKDF2-SHA256.
// All decryption happens client-side — server never sees plaintext or key.

import { useEffect, useState } from 'react';
import {
  importKey,
  deriveKeyFromPassword,
  decryptMessage,
  fromBase64Url,
} from '../lib/crypto';
import { getMessage } from '../lib/api';

type Status = 'loading' | 'needs_password' | 'decrypting' | 'done' | 'error' | 'expired' | 'invalid';

interface Props {
  id: string;
}

export default function MessageDisplay({ id }: Props) {
  const [status, setStatus] = useState<Status>('loading');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const [password, setPassword] = useState('');
  const [blob, setBlob] = useState<{ ciphertext: string; iv: string; salt?: string } | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const data = await getMessage(id);

        if (!data.has_password) {
          const fragment = window.location.hash.slice(1);
          if (!fragment) {
            setStatus('invalid');
            return;
          }
          await decryptAndShow(data.ciphertext, data.iv, fragment);
        } else {
          setBlob({ ciphertext: data.ciphertext, iv: data.iv, salt: data.salt });
          setStatus('needs_password');
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : '';
        if (msg.includes('expiré') || msg.includes('introuvable')) {
          setStatus('expired');
        } else {
          setError(msg || 'Impossible de récupérer le message.');
          setStatus('error');
        }
      }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function decryptAndShow(
    ciphertextB64: string,
    ivB64: string,
    keyOrPassword: string,
    isPassword = false,
    saltB64?: string,
  ) {
    setStatus('decrypting');
    try {
      let key;
      if (isPassword) {
        if (!saltB64) throw new Error('Salt manquant pour la dérivation de clé.');
        key = await deriveKeyFromPassword(keyOrPassword, fromBase64Url(saltB64));
      } else {
        key = await importKey(keyOrPassword);
      }

      const plaintext = await decryptMessage(
        { iv: fromBase64Url(ivB64), ciphertext: fromBase64Url(ciphertextB64) },
        key,
      );

      setMessage(plaintext);
      setStatus('done');
    } catch {
      setError('Mot de passe incorrect ou lien corrompu.');
      setStatus('error');
    }
  }

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!blob || !password.trim()) return;
    await decryptAndShow(blob.ciphertext, blob.iv, password, true, blob.salt);
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(message);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      // clipboard unavailable — user can select text manually
    }
  };

  if (status === 'loading' || status === 'decrypting') {
    return (
      <div className="text-center py-12 space-y-3 animate-fade-in">
        <div
          className="w-8 h-8 rounded-full border-2 border-t-transparent mx-auto animate-spin"
          style={{ borderColor: 'var(--accent)' }}
          role="status"
          aria-label={status === 'loading' ? 'Chargement en cours' : 'Déchiffrement en cours'}
        />
        <p className="text-sm" style={{ color: 'var(--text-2)' }}>
          {status === 'loading' ? 'Chargement…' : 'Déchiffrement…'}
        </p>
      </div>
    );
  }

  if (status === 'needs_password') {
    return (
      <div className="max-w-sm mx-auto space-y-5 animate-slide-up">
        <p className="text-sm font-medium" style={{ color: 'var(--text-1)' }}>
          Ce message est protégé par mot de passe.
        </p>
        <form onSubmit={handlePasswordSubmit} className="space-y-4">
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Entrez le mot de passe"
            autoFocus
            className="input-field w-full text-sm"
            aria-label="Mot de passe de déchiffrement"
            autoComplete="current-password"
          />
          <button
            type="submit"
            disabled={!password.trim()}
            className="btn-primary w-full"
          >
            Déchiffrer
          </button>
        </form>
      </div>
    );
  }

  if (status === 'expired') {
    return (
      <div className="text-center py-12 space-y-4 animate-fade-in">
        <p className="text-lg font-semibold" style={{ color: 'var(--coral)' }}>Message expiré</p>
        <p className="text-sm max-w-sm mx-auto" style={{ color: 'var(--text-2)' }}>
          Ce message a dépassé sa durée de conservation. Demandez à l'expéditeur de vous envoyer un nouveau lien.
        </p>
        <a href="/" className="btn-secondary inline-block">Accueil</a>
      </div>
    );
  }

  if (status === 'invalid') {
    return (
      <div className="text-center py-12 space-y-4 animate-fade-in">
        <p className="text-lg font-semibold" style={{ color: 'var(--coral)' }}>Lien invalide</p>
        <p className="text-sm max-w-sm mx-auto" style={{ color: 'var(--text-2)' }}>
          Ce lien ne contient pas de clé de déchiffrement. Vérifiez que vous avez copié le lien en entier, y compris la partie après le <code>#</code>.
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

  return (
    <div className="space-y-5 max-w-xl mx-auto animate-slide-up">
      <p className="text-sm font-medium flex items-center gap-2" style={{ color: 'var(--success)' }}>
        <svg aria-hidden="true" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        Message déchiffré avec succès
      </p>

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

      <button type="button" onClick={handleCopy} className="btn-primary">
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

      <p className="text-xs" style={{ color: 'var(--text-3)' }}>
        Ce n'est pas une promesse — c'est une contrainte cryptographique. Même nous ne pouvons pas lire ce message.
      </p>
    </div>
  );
}
