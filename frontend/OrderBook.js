import React, { useEffect, useState } from 'react';
import axios from 'axios';

export default function OrderBook() {
  const [orders, setOrders] = useState([]);

  useEffect(() => {
    axios.get('http://localhost:3001/orders').then((res) => {
      setOrders(res.data);
    });
  }, []);

  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold mb-4">📚 Order Book</h1>
      <div className="grid grid-cols-2 gap-4">
        {/* Buy orders - green */}
        <div>
          <h2 className="text-xl text-green-600 font-semibold">Buy Orders (Bids)</h2>
          {orders
            .filter(order => order.type === 'buy')
            .map((order) => (
              <div key={order.id} className="bg-green-100 p-2 rounded my-2">
                Price: {order.price}, Quantity: {order.quantity}
              </div>
            ))}
        </div>

        {/* Sell orders - red */}
        <div>
          <h2 className="text-xl text-red-600 font-semibold">Sell Orders (Asks)</h2>
          {orders
            .filter(order => order.type === 'sell')
            .map((order) => (
              <div key={order.id} className="bg-red-100 p-2 rounded my-2">
                Price: {order.price}, Quantity: {order.quantity}
              </div>
            ))}
        </div>
      </div>
    </div>
  );
}
