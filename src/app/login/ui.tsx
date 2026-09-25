'use client';
import { useState } from 'react';
import { ArrowRight, Sparkles } from 'lucide-react';
export default function Login() {
  const [email, setEmail] = useState('admin@lapredigital.local');
  const [password, setPassword] = useState('Demo1234!');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  async function submit(e: React.FormEvent) {
    e.preventDefault(); setLoading(true); setError('');
    try { const response = await fetch('/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) }); const data = await response.json(); if (!response.ok) throw new Error(data.error); location.href = '/'; }
    catch (err) { setError(String(err)); setLoading(false); }
  }
  return <main className="login-page"><div className="login-art"><div className="brand brand-light"><span className="brand-mark">LP</span><span>LaPreDigital <b>AMP</b></span></div><div><p className="eyebrow light">INTELIGENCIA COMERCIAL Y ACADÉMICA</p><h1>Cada estudiante tiene una historia.<br />Acompáñala mejor.</h1><p>Orquesta agentes, entiende el embudo IMPULSE y da seguimiento a cada oportunidad desde un solo lugar.</p></div><div className="art-orbs"><span/><span/><span/></div></div><div className="login-panel"><div className="login-card"><div className="login-icon"><Sparkles size={26}/></div><p className="eyebrow">BIENVENIDO DE NUEVO</p><h2>Ingresa a tu plataforma</h2><p className="muted">Accede a tu espacio de operaciones.</p><form onSubmit={submit}><label>Correo electrónico<input value={email} onChange={e => setEmail(e.target.value)} type="email" required /></label><label>Contraseña<input value={password} onChange={e => setPassword(e.target.value)} type="password" required /></label>{error && <p className="error">{error}</p>}<button className="button primary wide" disabled={loading}>{loading ? 'Ingresando...' : 'Ingresar'} <ArrowRight size={17}/></button></form><p className="login-note">Demo local: admin@lapredigital.local · Demo1234!</p></div></div></main>;
}
