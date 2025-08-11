import { useEffect } from 'react';
import { useRouter } from 'next/router';

export default function Home() {
  const router = useRouter();
  useEffect(() => {
    const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
    if (token) {
      router.push('/dashboard');
    }
  }, [router]);
  return (
    <div style={{ padding: '2rem' }}>
      <h1>TikTok → Packlink SaaS</h1>
      <p>Connectez votre boutique TikTok Shop et générez automatiquement des étiquettes avec Packlink PRO.</p>
      <div style={{ marginTop: '1rem' }}>
        <a href="/signup" style={{ marginRight: '1rem' }}>S'inscrire</a>
        <a href="/login">Se connecter</a>
      </div>
    </div>
  );
}
