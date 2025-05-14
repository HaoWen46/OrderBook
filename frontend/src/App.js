import React from 'react';
import {
  BrowserRouter as Router,
  Routes,
  Route,
  Navigate,
  useParams,
} from 'react-router-dom';
import LandingPage from './components/LandingPage';
import Login       from './components/Login';
import Register    from './components/Register';
import Dashboard   from './components/Dashboard';
import NotFound    from './components/NotFound';
import RecentTradesPage from './components/RecentTradesPage';
import { loadSession, clearSession } from './utils/authStorage';

// gate that injects the right token/user for /u/:username/*
function UserGate() {
  const { username }   = useParams();
  const { token, user } = loadSession(username || '');

  if (!token) return <Navigate to="/login" replace />;

  const handleLogout = () => {
    clearSession(username);
    window.location.href = '/login';
  };

  return <Dashboard token={token} user={user} onLogout={handleLogout} />;
}

export default function App() {
  return (
    <Router>
      <Routes>
        <Route path="/"               element={<LandingPage />} />
        <Route path="/login"          element={<Login />} />
        <Route path="/register"       element={<Register />} />

        {/* user‑scoped routes */}
        <Route path="/u/:username"               element={<Navigate to="dashboard" replace />} />
        <Route path="/u/:username/dashboard"     element={<UserGate />} />
        <Route path="/u/:username/symbol/:symbolId/recent_trade" element={<RecentTradesPage />} />

        <Route path="*" element={<NotFound />} />
      </Routes>
    </Router>
  );
}
