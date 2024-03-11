import React, { useState } from 'react';
 
/**
 * RestaurantSystemManagementPOS Component
 *
 * @description
 * This component represents the interface for a Restaurant System Management Point of Sale (POS).
 * It includes features for managing orders, tables, and menu items.
 *
 * @returns {JSX.Element}
 * A React Element representing the POS interface.
 */
function RestaurantSystemManagementPOS() {
  const [orders, setOrders] = useState([]);
  const [selectedTable, setSelectedTable] = useState(null);
  const [menuItems, setMenuItems] = useState([
    { id: 1, name: 'Burger', price: 10.99 },
    { id: 2, name: 'Pizza', price: 12.99 },
    { id: 3, name: 'Salad', price: 8.99 },
  ]);
 
  /**
   * handleAddToOrder
   *
   * @description
   * A function to add a menu item to the current order.
   *
   * @param {Object} menuItem - The menu item object to add to the order.
   */
  const handleAddToOrder = (menuItem) => {
    const newOrder = {
      id: orders.length + 1,
      table: selectedTable,
      item: menuItem,
    };
    setOrders([...orders, newOrder]);
  };
 
  /**
   * handleTableSelection
   *
   * @description
   * A function to handle the selection of a table.
   *
   * @param {number} tableNumber - The number of the selected table.
   */
  const handleTableSelection = (tableNumber) => {
    setSelectedTable(tableNumber);
  };
 
  /**
   * JSX Return
   *
   * @description
   * The JSX code that represents the UI of the RestaurantSystemManagementPOS component.
   *
   * @returns {JSX.Element}
   */
  return (
    <div className="RestaurantSystemManagementPOS">
      <h1>Restaurant POS System</h1>
      <div className="tables">
        <h2>Tables</h2>
        <ul>
          <li onClick={() => handleTableSelection(1)}>Table 1</li>
          <li onClick={() => handleTableSelection(2)}>Table 2</li>
          <li onClick={() => handleTableSelection(3)}>Table 3</li>
        </ul>
      </div>
      <div className="menu">
        <h2>Menu</h2>
        <ul>
          {menuItems.map((menuItem) => (
            <li key={menuItem.id}>
              {menuItem.name} - ${menuItem.price}
              <button onClick={() => handleAddToOrder(menuItem)}>Add</button>
            </li>
          ))}
        </ul>
      </div>
      <div className="orders">
        <h2>Orders</h2>
        {orders.length > 0 ? (
          <ul>
            {orders.map((order) => (
              <li key={order.id}>
                Table {order.table}: {order.item.name} - ${order.item.price}
              </li>
            ))}
          </ul>
        ) : (
          <p>No orders yet</p>
        )}
      </div>
    </div>
  );
}
 
