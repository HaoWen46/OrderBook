import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import './Register.css';

export default function Register() {
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error,    setError]    = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    try {
      const res  = await fetch('http://localhost:5000/api/auth/register', {
        method : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body   : JSON.stringify({ username, password })
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.message || 'Registration failed');
      } else {
        alert('Registration successful! Please log in.');
        navigate('/login', { replace: true });
      }
    } catch (err) {
      console.error(err);
      setError('Registration request failed');
    }
  };

  return (
    <main className="auth-container">
      <div className="auth-blob" aria-hidden />

      <form className="auth-card" onSubmit={handleSubmit}>
        <h1 className="auth-title">Create Account</h1>

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
          Register
        </button>

        <p className="auth-switch">
          Already registered? <Link to="/login">Log In</Link>
        </p>
      </form>

      <footer className="auth-footer">
        © {new Date().getFullYear()} Order Book Sim
      </footer>
    </main>
  );
}
