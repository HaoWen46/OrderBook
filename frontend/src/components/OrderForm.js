import React, { useState, useEffect } from 'react';

function OrderForm({ symbolId, token, onOrderPlaced }) {
  const [side, setSide] = useState('buy');
  const [price, setPrice] = useState('');
  const [quantity, setQuantity] = useState('');
  const [error, setError] = useState('');
  const [orderType, setOrderType] = useState('limit');



  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!symbolId || !side || !quantity || !orderType) {
      setError('Missing required fields.');
      return;
    }

    if (orderType === 'limit' && (!price || parseFloat(price) <= 0)) {
      setError('Price must be greater than 0 for limit orders.');
      return;
    }

    // Determine which symbol (stock) to use for the order
    let tradeSymbolId = symbolIdId;
    try {
      const res = await fetch('http://localhost:5000/api/orders', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + token
        },
        body: JSON.stringify({
          symbol_id: tradeSymbolId,
          side: side,
          type: orderType,
          price: orderType === 'limit' ? parseFloat(price) : null,
          quantity: parseInt(quantity)
        })
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.message || 'Order placement failed');
      } else {
        let feedback = 'Order placed';
        if (data.orderStatus === 'FILLED') feedback = 'Order executed immediately';
        else if (data.orderStatus === 'PARTIAL') feedback = 'Order partially filled';
        alert(feedback);
        // Clear form fields
        setPrice('');
        setQuantity('');
        setOrderType('limit');
        // Notify parent to refresh data (balances, orders, etc.)
        onOrderPlaced();
      }
    } catch (err) {
      console.error('Order placement error', err);
      setError('Order request failed');
    }
  };
  /* ① Add this style block (or put it in your CSS file) */
  const rowStyle = {
    display: 'flex',
    alignItems: 'center',
    marginBottom: '0.5em',
  };
  const labelStyle = {
    width: '90px',       // fixed label column
    textAlign: 'right',
    paddingRight: '1em', // breathing room
  };

  /* ② Updated JSX */
  return (
    <form onSubmit={handleSubmit} style={{ maxWidth: 300 }}>
      <div style={rowStyle}>
        <label htmlFor="side" style={labelStyle}>Side:</label>
        <select id="side" value={side} onChange={e => setSide(e.target.value)}>
          <option value="buy">Buy</option>
          <option value="sell">Sell</option>
        </select>
      </div>

      <div style={rowStyle}>
        <label htmlFor="orderType" style={labelStyle}>Order Type:</label>
        <select id="orderType" value={orderType} onChange={e => setOrderType(e.target.value)}>
          <option value="limit">Limit</option>
          <option value="market">Market</option>
        </select>
      </div>

      {orderType === 'limit' && (
        <div style={rowStyle}>
          <label htmlFor="price" style={labelStyle}>Price:</label>
          <input
            id="price"
            type="number"
            step="0.01"
            value={price}
            onChange={e => setPrice(e.target.value)}
            required
          />
        </div>
      )}

      <div style={rowStyle}>
        <label htmlFor="quantity" style={labelStyle}>Quantity:</label>
        <input
          id="quantity"
          type="number"
          step="1"
          value={quantity}
          onChange={e => setQuantity(e.target.value)}
          required
        />
      </div>

      {error && <p style={{ color: 'red' }}>{error}</p>}

      <button className="btn-lite" type="submit" style={{ marginTop: '1em' }}>Submit Order</button>
    </form>
  );
}

export default OrderForm;
