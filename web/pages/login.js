import { useState } from 'react';
import { useRouter } from 'next/router';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const router = useRouter();

  async function handleSubmit(e) {
    e.preventDefault();
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });
      const data = await res.json();
      if (data.token) {
        if (typeof window !== 'undefined') {
          localStorage.setItem('token', data.token);
        }
        router.push('/dashboard');
      } else {
        alert(data.error || 'Connexion échouée');
      }
    } catch (err) {
      alert('Erreur lors de la connexion');
    }
  }

  return (
    <div style={{ padding: '2rem' }}>
      <h1>Connexion</h1>
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', maxWidth: '300px' }}>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Email"
          required
          style={{ marginBottom: '0.5rem', padding: '0.5rem' }}
        />
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Mot de passe"
          required
          style={{ marginBottom: '0.5rem', padding: '0.5rem' }}
        />
        <button type="submit" style={{ padding: '0.5rem' }}>Se connecter</button>
      </form>
      <p style={{ marginTop: '1rem' }}>
        Pas de compte? <a href="/signup">S'inscrire</a>
      </p>
    </div>
  );
}
