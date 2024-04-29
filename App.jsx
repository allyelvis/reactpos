import React, { useState } from 'react';

const RestaurantManagement = () => {
  const [orders, setOrders] = useState([]);

  const addOrder = (order) => {
    setOrders([...orders, order]);
  };

  return (
    <div>
      <h1>Restaurant Management System</h1>
      <OrderForm addOrder={addOrder} />
      <OrderList orders={orders} />
    </div>
  );
};

const OrderForm = ({ addOrder }) => {
  const [customerName, setCustomerName] = useState('');
  const [menuItem, setMenuItem] = useState('');
  const [quantity, setQuantity] = useState(1);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!customerName || !menuItem || quantity <= 0) return;
    const order = { customerName, menuItem, quantity };
    addOrder(order);
    setCustomerName('');
    setMenuItem('');
    setQuantity(1);
  };

  return (
    <form onSubmit={handleSubmit}>
      <input
        type="text"
        placeholder="Customer Name"
        value={customerName}
        onChange={(e) => setCustomerName(e.target.value)}
      />
      <input
        type="text"
        placeholder="Menu Item"
        value={menuItem}
        onChange={(e) => setMenuItem(e.target.value)}
      />
      <input
        type="number"
        min="1"
        placeholder="Quantity"
        value={quantity}
        onChange={(e) => setQuantity(parseInt(e.target.value))}
      />
      <button type="submit">Add Order</button>
    </form>
  );
};

const OrderList = ({ orders }) => {
  return (
    <div>
      <h2>Orders:</h2>
      <ul>
        {orders.map((order, index) => (
          <li key={index}>
            {order.customerName} ordered {order.quantity} of {order.menuItem}
          </li>
        ))}
      </ul>
    </div>
  );
};

export default RestaurantManagement;