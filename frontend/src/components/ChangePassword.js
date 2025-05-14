import React, { useState } from 'react';
import './Dashboard.css';

function ChangePassword({ token, onBack }) {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword,     setNewPassword]     = useState('');
  const [confirm,         setConfirm]         = useState('');
  const [msg,             setMsg]             = useState('');
  const [err,             setErr]             = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErr(''); setMsg('');
    if (newPassword !== confirm) { setErr('New passwords do not match'); return; }

    try {
      const res  = await fetch('http://localhost:5000/api/auth/change-password', {
        method:'POST',
        headers:{ 'Content-Type':'application/json', Authorization:'Bearer '+token },
        body: JSON.stringify({ currentPassword, newPassword })
      });
      const data = await res.json();
      if (!res.ok) setErr(data.message || 'Password change failed');
      else {
        setMsg('Password reset successfully!');
        setCurrentPassword(''); setNewPassword(''); setConfirm('');
      }
    } catch { setErr('Network error'); }
  };

  return (
    <div className="page-shell">
      <div className="page-blob"></div>

      <div className="page-card page-card--narrow">
        <h2 className="text-2xl font-bold text-center">Change&nbsp;Password</h2>

        <form onSubmit={handleSubmit} className="flex flex-col gap-5 mt-6">
          <div className="field-row">
            <label htmlFor="curr">Current&nbsp;Password</label>
            <input
              id="curr" type="password" autoComplete="current-password"
              value={currentPassword}
              onChange={e=>setCurrentPassword(e.target.value)} required
            />
          </div>

          <div className="field-row">
            <label htmlFor="new">New&nbsp;Password</label>
            <input
              id="new" type="password" autoComplete="new-password"
              value={newPassword}
              onChange={e=>setNewPassword(e.target.value)} required
            />
          </div>

          <div className="field-row">
            <label htmlFor="conf">Confirm&nbsp;Password</label>
            <input
              id="conf" type="password"
              value={confirm}
              onChange={e=>setConfirm(e.target.value)} required
            />
          </div>

          {err && <p style={{color:'#ff7d73'}}>{err}</p>}
          {msg && <p style={{color:'#6dffb4'}}>{msg}</p>}

          <div className="flex gap-4 justify-center mt-2">
            <button type="submit" className="btn-lite">Change</button>
            <button type="button" className="btn-lite" onClick={onBack}>Back</button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default ChangePassword;
