import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { loadSession } from '../utils/authStorage';
import './Dashboard.css'; // ← pull in the same gradient & buttons

export default function RecentTradesPage() {
  const { username, symbolId }  = useParams();
  const { token }               = loadSession(username || '');
  const [symbol, setSymbol]     = useState('');
  const [trades, setTrades]     = useState([]);

  useEffect(() => {
    let down = false;
    (async () => {
      try {
        const [bookRes, tradeRes] = await Promise.all([
          fetch(`http://localhost:5000/api/orders/book/${symbolId}`,   { headers:{ Authorization: 'Bearer ' + token } }),
          fetch(`http://localhost:5000/api/orders/trades/${symbolId}`, { headers:{ Authorization: 'Bearer ' + token } })
        ]);
        const book   = await bookRes.json();
        const tData  = await tradeRes.json();
        if (down) return;
        setSymbol(book.symbol || '');
        setTrades(tData.trades || []);
      } catch (e) { console.error('fetch trades', e); }
    })();
    return () => { down = true; };
  }, [symbolId, token]);

  return (
    <div className="page-shell">
      <div className="page-blob"></div>

      {/* centred glass card (narrow) */}
      <div className="page-card page-card--narrow">

        <h2 style={{ marginTop: 0 }}>Recent Trades – {symbol}</h2>

        <table>
          <thead>
            <tr><th>Price</th><th>Qty</th><th>Time</th></tr>
          </thead>
          <tbody>
            {trades.length ? trades.map((t, i) => (
              <tr key={i}>
                <td>{t.price}</td>
                <td>{t.quantity}</td>
                <td>{new Date(t.timestamp).toLocaleString()}</td>
              </tr>
            )) : (
              <tr><td colSpan="3" style={{ textAlign: 'center' }}>No trades yet</td></tr>
            )}
          </tbody>
        </table>

        <div style={{ textAlign: 'center', marginTop: '1.5rem' }}>
          <Link to={`/u/${username}/dashboard`} className="btn-lite">
            ‹ Back to Dashboard
          </Link>
        </div>
      </div>
    </div>
  );
}
