import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import ChangePassword from './ChangePassword';
import OrderBook from './OrderBook';
import OrderForm from './OrderForm';
import './Dashboard.css';

/**
 * Dashboard – full‑fat version with:           
 *  • live book & trades for the currently‑selected symbol
 *  • basic wallet / open‑orders list
 *  • (manager‑only) add / mint / burn / delete stock symbols                                           
 */
function Dashboard({ token, user, onLogout }) {
  /* ---------------- state ---------------- */
  const [symbols, setSymbols]           = useState([]);          // all trading symbols
  const [currentSymbolId, setCurrentSymbolId] = useState('');   // string for <select>
  const [buyOrders, setBuyOrders]       = useState([]);
  const [sellOrders, setSellOrders]     = useState([]);
  const [lastPrice, setLastPrice]       = useState(null);
  const [priceDirection, setPriceDirection] = useState('same'); // up / down / same
  const [userData, setUserData]         = useState(user || {});
  const [userOrders, setUserOrders]     = useState([]);
  const [view, setView]                 = useState('dashboard');

  /* ---- manager admin form state ---- */
  const [newSymbol, setNewSymbol]       = useState('');
  const [issueSymbolId, setIssueSymbolId] = useState('');
  const [issueQty, setIssueQty]         = useState('');
  const [burnSymbolId, setBurnSymbolId] = useState('');
  const [burnQty, setBurnQty]           = useState('');

  /* ------------ initial load ------------ */
  useEffect(() => {
    const initData = async () => {
      try {
        const resSymbols  = await fetch('http://localhost:5000/api/symbols',   { headers:{ Authorization:'Bearer '+token }});
        const resUser     = await fetch('http://localhost:5000/api/user/me',   { headers:{ Authorization:'Bearer '+token }});
        const resMyOrders = await fetch('http://localhost:5000/api/orders/my', { headers:{ Authorization:'Bearer '+token }});

        const symPayload  = await resSymbols.json();
        const symList     = symPayload.symbols || symPayload; // handle {symbols:[...]} or raw []
        const profile     = await resUser.json();
        const myOrders    = await resMyOrders.json();

        if (symList.length) {
          setSymbols(symList);
          setCurrentSymbolId((prev) => prev || String(symList[0].id));
        }
        if (profile.user)    setUserData(profile.user);
        if (myOrders.orders) setUserOrders(myOrders.orders);
      } catch (err) { console.error('init data fail', err); }
    };
    initData();
  }, [token]);

  /* ------------ live polling ------------ */
  useEffect(() => {
    if (!currentSymbolId) return;
    let ignore = false;

    const fetchMarket = async () => {
      try {
        const resBook   = await fetch(`http://localhost:5000/api/orders/book/${currentSymbolId}`,   { headers:{ Authorization:'Bearer '+token }});
        const resTrades = await fetch(`http://localhost:5000/api/orders/trades/${currentSymbolId}`, { headers:{ Authorization:'Bearer '+token }});
        const bookData   = await resBook.json();
        const tradesData = await resTrades.json();
        if (ignore) return;

        setBuyOrders(bookData.buyOrders   || []);
        setSellOrders(bookData.sellOrders || []);
        setLastPrice(bookData.lastPrice);
        setPriceDirection(bookData.priceDirection || 'same');
        setTrades(tradesData.trades || []);

        // push latest price into symbols array so other components can see it
        setSymbols(prev => prev.map(sym =>
          sym.id === Number(currentSymbolId) ? { ...sym, last_price: bookData.lastPrice } : sym
        ));
      } catch (err) { console.error('poll fail', err); }
    };

    fetchMarket();
    const id = setInterval(fetchMarket, 5_000);
    return () => { ignore = true; clearInterval(id); };
  }, [currentSymbolId, token]);

  /* -------------- helpers -------------- */
  const refreshUser = async () => {
    try {
      const resUser     = await fetch('http://localhost:5000/api/user/me',   { headers:{ Authorization:'Bearer '+token }});
      const resMyOrders = await fetch('http://localhost:5000/api/orders/my', { headers:{ Authorization:'Bearer '+token }});
      const profile = await resUser.json();
      const orders  = await resMyOrders.json();
      if (profile.user)  setUserData(profile.user);
      if (orders.orders) setUserOrders(orders.orders);
    } catch (err) { console.error('refresh fail', err); }
  };

  const handleDeleteAccount = async () => {
    if (!window.confirm('This will permanently delete your account and all associated data. Are you sure?')) return;
    try {
      const res = await fetch('http://localhost:5000/api/user/me', {
        method: 'DELETE',
        headers: { Authorization: 'Bearer ' + token }
      });
      const data = await res.json();
      if (!res.ok) {
        alert(data.message || 'Failed to delete account');
        return;
      }
      alert('Your account has been deleted.');
      onLogout();
    } catch (err) {
      console.error('Account deletion failed', err);
      alert('Server error trying to delete account.');
    }
  };

  /* ---------- admin actions ---------- */
  const handleAddSymbol = async (e) => {
    e.preventDefault();
    if (!newSymbol) return;
    try {
      const res = await fetch('http://localhost:5000/api/symbols', {
        method:'POST',
        headers:{ 'Content-Type':'application/json', Authorization:'Bearer '+token },
        body: JSON.stringify({ symbol:newSymbol })
      });
      const data = await res.json();
      if (!res.ok) { alert(data.message || 'add fail'); return; }
      setSymbols(prev => [...prev, data.symbol || data]);
      setNewSymbol('');
    } catch (err) { console.error('add symbol', err); }
  };

  const handleDeleteSymbol = async (id) => {
    if (!window.confirm('Delete this stock symbol?')) return;
    try {
      const res  = await fetch(`http://localhost:5000/api/symbols/${id}`, {
        method:'DELETE', headers:{ Authorization:'Bearer '+token }
      });
      const data = await res.json();
      if (!res.ok) { alert(data.message||'delete fail'); return; }
      setSymbols(prev => prev.filter(s => s.id !== id));
      if (String(id) === currentSymbolId) {
        const fallback = symbols.find(s => s.id !== id);
        setCurrentSymbolId(fallback ? String(fallback.id) : '');
      }
    } catch (err) { console.error('delete fail', err); }
  };

  const handleIssue = async (e) => {
    e.preventDefault();
    if(!issueSymbolId||!issueQty) return;
    try {
      const res = await fetch(`http://localhost:5000/api/symbols/${issueSymbolId}/issue`,{
        method:'POST',
        headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},
        body:JSON.stringify({quantity:Number(issueQty)})
      });
      const data=await res.json();
      alert(data.message||'Mint done');
      setIssueQty('');
      refreshUser();
    } catch (err) { console.error('issue fail', err); }
  };

  const handleBurn = async (e) => {
    e.preventDefault();
    if(!burnSymbolId||!burnQty) return;
    try {
      const res = await fetch(`http://localhost:5000/api/symbols/${burnSymbolId}/burn`,{
        method:'POST',
        headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},
        body:JSON.stringify({quantity:Number(burnQty)})
      });
      const data=await res.json();
      alert(data.message||'Burn done');
      setBurnQty('');
      refreshUser();
    } catch (err) { console.error('burn fail', err); }
  };

  const cancelOrder = async (id) => {
    if (!window.confirm('Cancel this order?')) return;
    try {
      const res  = await fetch(`http://localhost:5000/api/orders/${id}`, { method:'DELETE', headers:{ Authorization:'Bearer '+token }});
      const data = await res.json();
      if (!res.ok) { alert(data.message||'cancel fail'); return; }
      refreshUser();
    } catch (err) { console.error('cancel fail', err); }
  };

  /* ---------------- render ---------------- */
  const currentSym = symbols.find(s => String(s.id) === currentSymbolId);

  if (view === 'changePass') {
    return <ChangePassword token={token} onBack={() => setView('dashboard')} />;
  }

  return (
    <div className="page-shell">
      <div className="page-blob"></div>
      <div className="page-card">
        {/* ----- header ----- */}
        <header className="flex justify-between items-center">
          <div>
            <strong>Welcome, {userData.username}</strong> ({userData.role})<br/>
            Cash&nbsp;Balance:&nbsp;${Number(userData.cash_balance||0).toFixed(2)}
          </div>
          <div className="flex gap-2">
            <Link to={`/u/${userData.username}/assessment`}>
              <button className="btn-lite">Risk Assessment</button>
            </Link>
            <button className="btn-lite" onClick={() => setView('changePass')}>Change PW</button>
            <button className="btn-lite" onClick={handleDeleteAccount}>Delete Account</button>
            <button className="btn-lite" onClick={onLogout}>Logout</button>
          </div>
        </header>

        <hr style={{opacity:.2}}/>

        {/* ----- symbol picker ----- */}
        <section className="flex flex-wrap items-center gap-4">
          <label>
            Select Symbol:&nbsp;
            <select
              value={currentSymbolId}
              onChange={e=> setCurrentSymbolId(e.target.value)}
            >
              {symbols.map(s=> (
                <option key={s.id} value={String(s.id)}>{s.symbol}</option>
              ))}
            </select>
          </label>

          {lastPrice !== null && (
            <span>
              Last&nbsp;Price:&nbsp;
              <span className={
                priceDirection==='up'   ? 'price-up' :
                priceDirection==='down' ? 'price-down' : ''
              }>
                {lastPrice}
              </span>
            </span>
          )}
        </section>

        {/* ----- grid main ----- */}
        <div className="grid md:grid-cols-2 gap-8">
          {/* left – order book & recent trades link */}
          <div>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'baseline' }}>
              <h3 className="font-semibold text-xl">
                Order Book {currentSym ? `(${currentSym.symbol})` : ''}
              </h3>
              {currentSym && (
                <Link
                  to={`/u/${userData.username}/symbol/${currentSym.id}/recent_trade`}
                  style={{ color:'#818cf8', fontSize:'0.85rem' }}
                >
                  View Recent Trades →
                </Link>
              )}
            </div>
            <OrderBook buyOrders={buyOrders} sellOrders={sellOrders} />
          </div>

          {/* right – forms & lists */}
          <div className="flex flex-col gap-8">
            <section>
              <h3 className="font-semibold text-xl mb-2">
                Place Order {currentSym ? `(${currentSym.symbol})` : ''}
              </h3>
              {currentSymbolId
                ? <OrderForm
                    symbolId={Number(currentSymbolId)}  /* simply pass the stock id */
                    token={token}
                    onOrderPlaced={refreshUser}
                  />
                : <p>No symbol selected.</p>
              }
            </section>

            <section>
              <h3 className="font-semibold text-xl mb-2">Your Positions</h3>
              {userData.positions?.length
                ? <ul>{userData.positions.map(p=>(
                    <li key={p.symbol_id}>{p.symbol}: {p.quantity}</li>
                  ))}</ul>
                : <p>No positions.</p>
              }
            </section>

            <section>
              <h3 className="font-semibold text-xl mb-2">Your Open Orders</h3>
              {userOrders.length
                ? <ul>{userOrders.map(o=>(
                    <li key={o.id} className="flex items-center gap-3">
                      {o.symbol}&nbsp;–&nbsp;{o.side.toUpperCase()} {o.quantity} @ ${o.price}
                      <button
                        className="btn-lite"
                        style={{backgroundColor:'#e64646'}}
                        onClick={()=>cancelOrder(o.id)}
                      >
                        Cancel
                      </button>
                    </li>
                  ))}</ul>
                : <p>No open orders.</p>
              }
            </section>

            {userData.role==='manager' && (
              <section>
                <h3 className="font-semibold text-xl mb-2">Admin – Manage Stocks</h3>

                {/* create */}
                <form onSubmit={handleAddSymbol} className="flex gap-3 mb-4">
                  <input
                    placeholder="New Symbol"
                    value={newSymbol}
                    onChange={e=>setNewSymbol(e.target.value.toUpperCase())}
                    required
                  />
                  <button className="btn-lite" type="submit">Add</button>
                </form>

                {/* mint */}
                <form onSubmit={handleIssue} className="flex flex-wrap items-center gap-3 mb-4">
                  <select value={issueSymbolId} onChange={e=>setIssueSymbolId(e.target.value)} required>
                    <option value="">--Stock--</option>
                    {symbols.map(s=>(
                      <option key={s.id} value={s.id}>{s.symbol}</option>
                    ))}
                  </select>
                  <input
                    type="number" min="1" max="1000000"
                    placeholder="Qty"
                    value={issueQty}
                    onChange={e=>setIssueQty(e.target.value)}
                  />
                  <button className="btn-lite" type="submit">Mint</button>
                </form>

                {/* burn */}
                <form onSubmit={handleBurn} className="flex flex-wrap items-center gap-3">
                  <select value={burnSymbolId} onChange={e=>setBurnSymbolId(e.target.value)} required>
                    <option value="">--Stock--</option>
                    {userData.positions?.filter(p=>p.quantity>0 && symbols.find(s=>s.id===p.symbol_id))
                      .map(p=>(
                        <option key={p.symbol_id} value={p.symbol_id}>
                          {p.symbol} (own {p.quantity})
                        </option>
                    ))}
                  </select>
                  <input
                    type="number" min="1"
                    placeholder="Qty"
                    value={burnQty}
                    onChange={e=>setBurnQty(e.target.value)}
                  />
                  <button className="btn-lite" type="submit">Burn</button>
                </form>

                {/* list stocks */}
                <ul className="mt-4">
                  {symbols.map(s => (
                    <li key={s.id} className="flex items-center gap-2">
                      <span style={{ minWidth: '8em', fontFamily: 'monospace', paddingRight: '1em' }}>{s.symbol}</span>
                      <button className="btn-lite" onClick={() => handleDeleteSymbol(s.id)}>Delete</button>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </div>{/* right col */}
        </div>{/* grid */}
      </div>{/* card */}
    </div>
  );
}

export default Dashboard;
