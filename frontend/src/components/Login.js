import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { saveSession } from '../utils/authStorage';
import './Login.css';

export default function Login() {
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error,    setError]    = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    try {
      const res = await fetch('/api/auth/login', {
        method : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body   : JSON.stringify({ username, password })
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.message || 'Login failed');
      } else {
        // persist into tab‑local storage keyed by username
        saveSession(data.user.username, data.token, data.user);
        // lift to parent state if onLogin provided
        if (typeof onLogin === 'function') onLogin(data.token, data.user, data.user.username);
        // 🚀 jump to that user’s dashboard route
        navigate(`/u/${data.user.username}/dashboard`, { replace: true });
      }
    } catch (err) {
      console.error(err);
      setError('Login request failed');
    }
  };  

  return (
    <main className="auth-container">
      <div className="auth-blob" aria-hidden />

      <form className="auth-card" onSubmit={handleSubmit}>
        <h1 className="auth-title">Welcome Back</h1>

        <label className="auth-field">
          <span>Username</span>
          <input
            type="text"
            value={username}
            onChange={e => setUsername(e.target.value)}
            required
          />
        </label>

        <label className="auth-field">
          <span>Password</span>
          <input
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            required
          />
        </label>

        {error && <p className="auth-error">{error}</p>}

        <button type="submit" className="auth-btn auth-btn--primary">
          Log In
        </button>

        <p className="auth-switch">
          No account? <Link to="/register">Register</Link>
        </p>
      </form>

      <footer className="auth-footer">
        © {new Date().getFullYear()} Order Book Sim
      </footer>
    </main>
  );
}
