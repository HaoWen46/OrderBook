import React from 'react';

const MAX_ROWS = 10;
const DASH = '—';

function padSide(orders, isBuy) {
  // copy → sort → slice → pad to length 10
  const sorted = [...orders].sort((a, b) =>
    isBuy ? b.price - a.price /* BUY: high→low */ : a.price - b.price /* SELL: low→high */
  );
  const trimmed = sorted.slice(0, MAX_ROWS);
  while (trimmed.length < MAX_ROWS) trimmed.push(null); // null = blank row
  return trimmed;
}

export default function OrderBook({ buyOrders, sellOrders }) {
  const buyRows  = padSide(buyOrders,  true);
  const sellRows = padSide(sellOrders, false);

  const cellStyle = { textAlign: 'center', padding: '2px 6px' };

  return (
    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
      {/* BUY side */}
      <div style={{ width: '45%' }}>
        <h4>Buy Orders</h4>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={cellStyle}>Price</th>
              <th style={cellStyle}>Qty</th>
            </tr>
          </thead>
          <tbody>
            {buyRows.map((row, idx) => (
              <tr key={idx}>
                <td style={cellStyle}>{row ? row.price    : DASH}</td>
                <td style={cellStyle}>{row ? row.quantity : DASH}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* SELL side */}
      <div style={{ width: '45%' }}>
        <h4>Sell Orders</h4>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={cellStyle}>Price</th>
              <th style={cellStyle}>Qty</th>
            </tr>
          </thead>
          <tbody>
            {sellRows.map((row, idx) => (
              <tr key={idx}>
                <td style={cellStyle}>{row ? row.price    : DASH}</td>
                <td style={cellStyle}>{row ? row.quantity : DASH}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
