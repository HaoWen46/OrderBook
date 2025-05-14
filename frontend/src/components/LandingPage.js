import React from 'react';
import { Link } from 'react-router-dom';
import './LandingPage.css';      // make sure this is in the same folder or adjust path

export default function LandingPage() {
  return (
    <main className="lp-container">
      {/* decorative animated blob */}
      <div className="lp-blob" aria-hidden />

      <section className="lp-card">
        <h1 className="lp-title">Order&nbsp;Book&nbsp;Simulator</h1>
        <p className="lp-sub">
          Play with limit &amp; market orders, short‑selling and weekly options in
          a sandbox exchange.
        </p>

        <div className="lp-actions">
          <Link to="/login"    className="lp-btn lp-btn--primary">Log In</Link>
          <Link to="/register" className="lp-btn">Register</Link>
        </div>
      </section>

      <footer className="lp-footer">
        © {new Date().getFullYear()} Order Book Sim
      </footer>
    </main>
  );
}
