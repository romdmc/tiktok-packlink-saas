import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';

export default function Dashboard() {
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [status, setStatus] = useState(null);
  const [packlinkKey, setPacklinkKey] = useState('');

  useEffect(() => {
    const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
    if (!token) {
      router.push('/login');
      return;
    }
    async function fetchData() {
      const headers = { Authorization: 'Bearer ' + token };
      try {
        const meRes = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/me`, { headers });
        const me = await meRes.json();
        if (me.id) {
          setUser(me);
        } else {
          localStorage.removeItem('token');
          router.push('/login');
        }
        const statusRes = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/setup/status`, { headers });
        const st = await statusRes.json();
        setStatus(st);
      } catch (err) {
        console.error(err);
      }
    }
    fetchData();
  }, [router]);

  async function saveSetup() {
    const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
    if (!token) return;
    const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/setup/save`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
      body: JSON.stringify({ packlinkApiKey: packlinkKey, automationEnabled: status?.automation_enabled })
    });
    const data = await res.json();
    setStatus((prev) => ({ ...prev, automation_enabled: data.automation_enabled, packlink_connected: data.packlink_connected }));
    alert('Clé Packlink enregistrée');
  }

  async function toggleAutomation() {
    const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
    if (!token) return;
    const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/automation/toggle`, {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + token }
    });
    const data = await res.json();
    setStatus((prev) => ({ ...prev, automation_enabled: data.automation_enabled }));
  }

  async function connectTikTok() {
    const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
    if (!token) return;
    const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/auth/tiktok`, { headers: { Authorization: 'Bearer ' + token } });
    const data = await res.json();
    if (data.url) {
      window.open(data.url, '_blank');
    } else {
      alert('Impossible de générer l\'URL TikTok');
    }
  }

  async function subscribe() {
    const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
    if (!token) return;
    const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/billing/create-session`, {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + token }
    });
    const data = await res.json();
    if (data.url) {
      window.location.href = data.url;
    } else {
      alert('Erreur lors de la création de la session de paiement');
    }
  }

  function logout() {
    localStorage.removeItem('token');
    router.push('/login');
  }

  return (
    <div style={{ padding: '2rem' }}>
      <h1>Tableau de bord</h1>
      {user && <p>Bienvenue {user.email}!</p>}
      {status && (
        <div style={{ marginTop: '1rem' }}>
          <p>TikTok: {status.tiktok_connected ? 'Connecté' : 'Non connecté'}</p>
          <p>Packlink: {status.packlink_connected ? 'Connecté' : 'Non connecté'}</p>
          <p>Automatisation: {status.automation_enabled ? 'Activée' : 'Désactivée'}</p>
        </div>
      )}
      <div style={{ marginTop: '1rem' }}>
        <button onClick={connectTikTok} style={{ marginBottom: '0.5rem' }}>
          Connecter TikTok
        </button>
        <br />
        <input
          type="text"
          value={packlinkKey}
          onChange={(e) => setPacklinkKey(e.target.value)}
          placeholder="Clé API Packlink"
          style={{ marginBottom: '0.5rem', padding: '0.5rem' }}
        />
        <button onClick={saveSetup} style={{ marginBottom: '0.5rem' }}>
          Enregistrer Packlink
        </button>
        <br />
        <button onClick={toggleAutomation} style={{ marginBottom: '0.5rem' }}>
          {status?.automation_enabled ? 'Désactiver' : 'Activer'} l'automatisation
        </button>
        <br />
        <button onClick={subscribe} style={{ marginBottom: '0.5rem' }}>
          Souscrire (abonnement + usage)
        </button>
        <br />
        <button onClick={logout} style={{ marginTop: '1rem' }}>
          Se déconnecter
        </button>
      </div>
    </div>
  );
}
