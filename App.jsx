import React, { useState, useEffect, useMemo } from 'react';
import { 
  Plus, ShoppingCart, ChefHat, User, CreditCard, 
  Clock, LayoutGrid, Utensils, RefreshCw, X, 
  ArrowLeft, MessageSquare, Edit2, Trash2, Save,
  Hash, Users, Layers, Settings, Globe, Percent, 
  DollarSign, TrendingUp, AlertTriangle, Package, Activity
} from 'lucide-react';
import { initializeApp } from "firebase/app";
import { 
  getAuth, signInAnonymously, onAuthStateChanged, signInWithCustomToken 
} from "firebase/auth";
import { 
  getFirestore, collection, doc, setDoc, addDoc, updateDoc, deleteDoc,
  onSnapshot, query, orderBy, serverTimestamp, writeBatch, getDoc,
  increment
} from "firebase/firestore";

// --- Firebase Configuration ---
const firebaseConfig = JSON.parse(__firebase_config);
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-pos-app';

// --- Constants ---
const ROLES = { WAITER: 'waiter', KITCHEN: 'kitchen', CUSTOMER: 'customer', ADMIN: 'admin' };
const ORDER_STATUS = { PENDING: 'pending', PREPARING: 'preparing', READY: 'ready', SERVED: 'served', PAID: 'paid' };
const COLLECTIONS = { TABLES: 'tables', MENU: 'menu_items', ORDERS: 'orders', SETTINGS: 'settings' };

const INITIAL_MENU = [
  { name: 'Margherita Pizza', price: 12, category: 'Main', available: true, stock: 50 },
  { name: 'Pepperoni Pizza', price: 15, category: 'Main', available: true, stock: 30 },
  { name: 'Caesar Salad', price: 10, category: 'Starters', available: true, stock: 20 },
  { name: 'Garlic Bread', price: 6, category: 'Starters', available: true, stock: 40 },
  { name: 'Cola', price: 3, category: 'Drinks', available: true, stock: 100 },
  { name: 'Tiramisu', price: 8, category: 'Dessert', available: true, stock: 15 },
];

const DEFAULT_SETTINGS = {
  restaurantName: "L'Ardoise Luxe",
  currency: "€",
  taxRate: 20,
  serviceCharge: 12.5,
  lowStockThreshold: 10
};

export default function App() {
  const [userRole, setUserRole] = useState(null);
  const [user, setUser] = useState(null);
  const [dbData, setDbData] = useState({ tables: [], menu: [], orders: [], settings: DEFAULT_SETTINGS });
  const [cart, setCart] = useState([]);

  useEffect(() => {
    const initAuth = async () => {
      try {
        if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
          await signInWithCustomToken(auth, __initial_auth_token);
        } else {
          await signInAnonymously(auth);
        }
      } catch (err) { console.error("Auth Error:", err); }
    };
    initAuth();
    const unsubscribe = onAuthStateChanged(auth, setUser);
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!user) return;
    const qOrders = query(collection(db, 'artifacts', appId, 'public', 'data', COLLECTIONS.ORDERS), orderBy('createdAt', 'desc'));
    const unsubs = [
      onSnapshot(collection(db, 'artifacts', appId, 'public', 'data', COLLECTIONS.TABLES), snap => 
        setDbData(p => ({ ...p, tables: snap.docs.map(d => ({id: d.id, ...d.data()})).sort((a,b)=>a.number-b.number) })), 
        (err) => console.error("Tables Stream Error:", err)),
      onSnapshot(collection(db, 'artifacts', appId, 'public', 'data', COLLECTIONS.MENU), snap => 
        setDbData(p => ({ ...p, menu: snap.docs.map(d => ({id: d.id, ...d.data()})) })),
        (err) => console.error("Menu Stream Error:", err)),
      onSnapshot(qOrders, snap => 
        setDbData(p => ({ ...p, orders: snap.docs.map(d => ({id: d.id, ...d.data()})) })),
        (err) => console.error("Orders Stream Error:", err)),
      onSnapshot(doc(db, 'artifacts', appId, 'public', 'data', COLLECTIONS.SETTINGS, 'config'), doc => {
        if (doc.exists()) {
            const data = doc.data();
            setDbData(p => ({ ...p, settings: { ...DEFAULT_SETTINGS, ...data } }));
        }
      })
    ];
    return () => unsubs.forEach(u => u());
  }, [user]);

  const actions = {
    cart,
    seedData: async () => {
      const batch = writeBatch(db);
      Array.from({ length: 8 }, (_, i) => ({ number: i + 1, status: 'free', currentOrderId: null }))
        .forEach(t => batch.set(doc(collection(db, 'artifacts', appId, 'public', 'data', COLLECTIONS.TABLES)), t));
      INITIAL_MENU.forEach(m => batch.set(doc(collection(db, 'artifacts', appId, 'public', 'data', COLLECTIONS.MENU)), m));
      batch.set(doc(db, 'artifacts', appId, 'public', 'data', COLLECTIONS.SETTINGS, 'config'), DEFAULT_SETTINGS);
      await batch.commit();
    },

    saveSettings: async (settings) => {
      const sanitized = {
          ...settings,
          taxRate: parseFloat(settings.taxRate) || 0,
          serviceCharge: parseFloat(settings.serviceCharge) || 0,
          lowStockThreshold: parseInt(settings.lowStockThreshold) || 0
      };
      await setDoc(doc(db, 'artifacts', appId, 'public', 'data', COLLECTIONS.SETTINGS, 'config'), sanitized);
    },

    saveMenuItem: async (item) => {
      const menuRef = collection(db, 'artifacts', appId, 'public', 'data', COLLECTIONS.MENU);
      const data = { ...item, stock: parseInt(item.stock) || 0, price: parseFloat(item.price) || 0 };
      item.id ? await updateDoc(doc(menuRef, item.id), data) : await addDoc(menuRef, { ...data, available: true });
    },
    
    deleteMenuItem: async (id) => await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', COLLECTIONS.MENU, id)),

    saveTable: async (table) => {
      const tableRef = collection(db, 'artifacts', appId, 'public', 'data', COLLECTIONS.TABLES);
      const data = { number: parseInt(table.number) || 0, status: table.status || 'free', currentOrderId: table.currentOrderId || null };
      table.id ? await updateDoc(doc(tableRef, table.id), data) : await addDoc(tableRef, data);
    },
    
    deleteTable: async (id) => await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', COLLECTIONS.TABLES, id)),

    addToCart: (item) => {
      const menuItem = dbData.menu.find(m => m.id === item.id);
      if (menuItem && menuItem.stock <= 0) return;
      setCart(p => [...p, { ...item, status: ORDER_STATUS.PENDING }]);
    },
    removeFromCart: (i) => setCart(p => p.filter((_, idx) => idx !== i)),
    clearCart: () => setCart([]),
    
    submitOrder: async (table) => {
      if (!user || cart.length === 0 || !table?.id) return;
      const subtotal = cart.reduce((s, i) => s + i.price, 0);
      const tax = (subtotal * dbData.settings.taxRate) / 100;
      const service = (subtotal * dbData.settings.serviceCharge) / 100;
      
      const batch = writeBatch(db);
      const orderRef = doc(collection(db, 'artifacts', appId, 'public', 'data', COLLECTIONS.ORDERS));
      
      batch.set(orderRef, {
        tableId: table.id,
        status: ORDER_STATUS.PENDING,
        items: cart,
        createdAt: serverTimestamp(),
        subtotal,
        tax,
        serviceCharge: service,
        total: subtotal + tax + service
      });

      // Update table
      batch.update(doc(db, 'artifacts', appId, 'public', 'data', COLLECTIONS.TABLES, table.id), { status: 'occupied', currentOrderId: orderRef.id });

      // Inventory deduction
      cart.forEach(item => {
        if (item.id) {
          batch.update(doc(db, 'artifacts', appId, 'public', 'data', COLLECTIONS.MENU, item.id), {
            stock: increment(-1)
          });
        }
      });

      await batch.commit();
      setCart([]);
    },
    
    updateItemStatus: async (oid, idx, status) => {
      const order = dbData.orders.find(o => o.id === oid);
      if (!order) return;
      const newItems = [...order.items];
      const prevStatus = newItems[idx].status;
      newItems[idx].status = status;
      
      const updates = { items: newItems };
      if (status === ORDER_STATUS.READY) updates.readyAt = serverTimestamp();
      if (status === ORDER_STATUS.PREPARING && prevStatus === ORDER_STATUS.PENDING) updates.startedAt = serverTimestamp();
      
      await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', COLLECTIONS.ORDERS, oid), updates);
    },
    
    settleOrder: async (oid, tid) => {
      const batch = writeBatch(db);
      batch.update(doc(db, 'artifacts', appId, 'public', 'data', COLLECTIONS.ORDERS, oid), { status: ORDER_STATUS.PAID, paidAt: serverTimestamp() });
      batch.update(doc(db, 'artifacts', appId, 'public', 'data', COLLECTIONS.TABLES, tid), { status: 'free', currentOrderId: null });
      await batch.commit();
    }
  };

  if (!userRole) return <RoleSelection onSelect={setUserRole} settings={dbData.settings} />;
  
  const screens = {
    [ROLES.ADMIN]: <AdminDashboard dbData={dbData} actions={actions} onBack={() => setUserRole(null)} />,
    [ROLES.WAITER]: <WaiterPanel dbData={dbData} actions={actions} onBack={() => setUserRole(null)} />,
    [ROLES.KITCHEN]: <KDS dbData={dbData} actions={actions} onBack={() => setUserRole(null)} />,
    [ROLES.CUSTOMER]: <Storefront dbData={dbData} actions={actions} />
  };

  return screens[userRole] || null;
}

// --- ANALYTICS CHART COMPONENT ---

function Sparkline({ data, color = "#4F46E5" }) {
  if (!data || data.length < 2) return <div className="w-24 h-8 bg-slate-50 rounded-lg"></div>;
  const max = Math.max(...data);
  const min = Math.min(...data);
  const range = max - min || 1;
  const width = 100;
  const height = 30;
  const points = data.map((v, i) => `${(i / (data.length - 1)) * width},${height - ((v - min) / range) * height}`).join(' ');
  
  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="w-24 h-8 overflow-visible">
      <polyline fill="none" stroke={color} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" points={points} />
    </svg>
  );
}

// --- ADMIN DASHBOARD ---

function AdminDashboard({ dbData, actions, onBack }) {
  const [tab, setTab] = useState('insights');
  const [editingItem, setEditingItem] = useState(null);
  const [editingTable, setEditingTable] = useState(null);
  const [settingsForm, setSettingsForm] = useState({ ...dbData.settings });

  // Update local form state when dbData changes
  useEffect(() => {
    setSettingsForm({ ...dbData.settings });
  }, [dbData.settings]);

  const menu = dbData?.menu || [];
  const tables = dbData?.tables || [];
  const orders = dbData?.orders || [];

  const revenue = orders.filter(o => o.status === 'paid').reduce((s, o) => s + (o.total || 0), 0);
  const totalOrders = orders.length;
  const avgOrder = totalOrders ? revenue / totalOrders : 0;
  const hourlyRevenue = orders.slice(0, 10).map(o => o.total || 0).reverse();

  const handleSettingsSave = () => actions.saveSettings(settingsForm);

  return (
    <div className="min-h-screen bg-[#F8FAFC] flex flex-col font-sans text-slate-900">
      <Header title="Management Console" Icon={LayoutGrid} role="Admin Access" restaurantName={dbData.settings.restaurantName} />
      
      <div className="flex-1 max-w-7xl mx-auto w-full p-6 lg:p-10">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 mb-10">
          <div>
            <button onClick={onBack} className="flex items-center text-slate-400 hover:text-slate-800 transition-all font-bold text-sm mb-2 group">
              <ArrowLeft size={16} className="mr-2 group-hover:-translate-x-1 transition-transform" /> Sign Out
            </button>
            <h2 className="text-3xl font-black tracking-tight">Overview</h2>
          </div>
          <div className="flex bg-white rounded-2xl p-1 shadow-sm border border-slate-200">
            {[
              { id: 'insights', label: 'Insights', icon: Activity },
              { id: 'menu', label: 'Catalog', icon: Package },
              { id: 'tables', label: 'Floor', icon: Layers },
              { id: 'settings', label: 'System', icon: Settings }
            ].map(t => (
              <button 
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${tab === t.id ? 'bg-slate-900 text-white shadow-lg' : 'text-slate-400 hover:text-slate-600'}`}
              >
                <t.icon size={14} /> {t.label}
              </button>
            ))}
          </div>
        </div>

        {tab === 'insights' && (
          <div className="space-y-8 animate-fade-in">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <AdvancedStatCard label="Total Revenue" val={`${dbData.settings.currency}${revenue.toLocaleString()}`} trend={hourlyRevenue} color="#10B981" />
              <AdvancedStatCard label="Orders" val={totalOrders} trend={[5, 8, 12, 7, 10, 15, 12]} color="#3B82F6" />
              <AdvancedStatCard label="Avg. Check" val={`${dbData.settings.currency}${avgOrder.toFixed(2)}`} trend={[45, 42, 50, 48, 55, 52, 60]} color="#F59E0B" />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              <div className="bg-white p-8 rounded-[2.5rem] border border-slate-200 shadow-sm">
                <h3 className="text-xl font-black mb-6">Popular Items</h3>
                <div className="space-y-4">
                  {menu.slice(0, 5).map((item, i) => (
                    <div key={item.id} className="flex items-center justify-between">
                      <div className="flex items-center gap-4">
                        <span className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-xs font-black">{i+1}</span>
                        <span className="font-bold">{item.name}</span>
                      </div>
                      <span className="text-slate-400 font-mono text-sm">{Math.floor(Math.random() * 50) + 10} sold</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="bg-white p-8 rounded-[2.5rem] border border-slate-200 shadow-sm">
                <div className="flex justify-between items-center mb-6">
                  <h3 className="text-xl font-black">Stock Alerts</h3>
                  <AlertTriangle size={20} className="text-orange-500" />
                </div>
                <div className="space-y-4">
                  {menu.filter(m => m.stock < dbData.settings.lowStockThreshold).map(item => (
                    <div key={item.id} className="flex items-center justify-between p-4 bg-orange-50 rounded-2xl border border-orange-100">
                      <span className="font-bold text-orange-900">{item.name}</span>
                      <span className="px-3 py-1 bg-orange-200 rounded-lg text-[10px] font-black text-orange-800 uppercase">Only {item.stock} left</span>
                    </div>
                  ))}
                  {menu.filter(m => m.stock < dbData.settings.lowStockThreshold).length === 0 && (
                    <p className="text-slate-400 text-center py-8 font-bold italic">All inventory levels healthy.</p>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {tab === 'menu' && (
          <div className="space-y-6 animate-fade-in">
            <div className="flex justify-between items-center">
              <div>
                <h2 className="text-2xl font-black">Menu Catalog</h2>
                <p className="text-slate-400 text-sm font-medium">Manage dishes and inventory levels</p>
              </div>
              <button onClick={() => setEditingItem({ name: '', price: 0, category: 'Main', stock: 50 })} className="bg-indigo-600 text-white px-6 py-3 rounded-2xl font-black flex items-center gap-2 shadow-xl shadow-indigo-100 hover:bg-indigo-700 transition-all active:scale-95"><Plus size={18} /> New Item</button>
            </div>
            <div className="bg-white rounded-[2.5rem] border border-slate-200 shadow-sm overflow-hidden">
              <table className="w-full text-left">
                <thead className="bg-slate-50/50 text-[10px] uppercase font-black text-slate-400 border-b border-slate-100">
                  <tr>
                    <th className="px-8 py-5">Product Details</th>
                    <th className="px-8 py-5 text-center">Stock</th>
                    <th className="px-8 py-5">Price</th>
                    <th className="px-8 py-5 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {menu.map(item => (
                    <tr key={item.id} className="group hover:bg-slate-50/80 transition-all">
                      <td className="px-8 py-6">
                        <div className="font-black text-slate-800 text-lg leading-tight">{item.name}</div>
                        <div className="text-[10px] font-black uppercase text-slate-400 tracking-widest mt-1">{item.category}</div>
                      </td>
                      <td className="px-8 py-6 text-center">
                        <div className={`inline-block px-4 py-1.5 rounded-full text-xs font-black ${item.stock < dbData.settings.lowStockThreshold ? 'bg-red-100 text-red-600' : 'bg-slate-100 text-slate-600'}`}>
                          {item.stock}
                        </div>
                      </td>
                      <td className="px-8 py-6 font-mono font-black text-indigo-600">{dbData.settings.currency}{item.price.toFixed(2)}</td>
                      <td className="px-8 py-6 text-right">
                        <div className="flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button onClick={() => setEditingItem(item)} className="p-3 bg-white text-indigo-600 border border-slate-200 rounded-xl hover:bg-indigo-50 transition-colors"><Edit2 size={16}/></button>
                          <button onClick={() => actions.deleteMenuItem(item.id)} className="p-3 bg-white text-red-500 border border-slate-200 rounded-xl hover:bg-red-50 transition-colors"><Trash2 size={16}/></button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {tab === 'tables' && (
          <div className="space-y-6 animate-fade-in">
            <div className="flex justify-between items-center">
              <div>
                <h2 className="text-2xl font-black">Floor Map</h2>
                <p className="text-slate-400 text-sm font-medium">Table status and seating arrangements</p>
              </div>
              <button onClick={() => setEditingTable({ number: tables.length + 1 })} className="bg-emerald-600 text-white px-6 py-3 rounded-2xl font-black flex items-center gap-2 shadow-xl shadow-emerald-100 hover:bg-emerald-700 transition-all active:scale-95"><Plus size={18} /> New Table</button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              {tables.map(table => (
                <div key={table.id} className="bg-white p-6 rounded-[2.5rem] border border-slate-200 shadow-sm flex flex-col justify-between group hover:border-indigo-300 transition-all">
                  <div className="flex justify-between items-start">
                    <div className="w-14 h-14 bg-slate-900 rounded-2xl flex items-center justify-center text-white text-xl font-black shadow-lg">{table.number}</div>
                    <div className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest ${table.status === 'occupied' ? 'bg-rose-50 text-rose-600' : 'bg-emerald-50 text-emerald-600'}`}>
                      {table.status}
                    </div>
                  </div>
                  <div className="mt-8 flex justify-between items-center">
                    <p className="text-[10px] font-black uppercase text-slate-300">Management</p>
                    <div className="flex gap-2">
                      <button onClick={() => setEditingTable(table)} className="p-2.5 text-slate-400 hover:text-indigo-600 transition-all"><Edit2 size={16}/></button>
                      <button 
                        disabled={table.status === 'occupied'}
                        onClick={() => actions.deleteTable(table.id)} 
                        className="p-2.5 text-slate-400 hover:text-red-500 transition-all disabled:opacity-10"
                      >
                        <Trash2 size={16}/>
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {tab === 'settings' && (
          <div className="max-w-3xl mx-auto space-y-8 animate-fade-in">
             <div className="bg-white p-10 rounded-[3rem] border border-slate-200 shadow-sm">
                <h2 className="text-2xl font-black mb-10 flex items-center gap-3"><Settings className="text-indigo-600" /> System Configuration</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-x-10 gap-y-8">
                  <SettingsInput label="Establishment Name" Icon={Globe} value={settingsForm.restaurantName} onChange={v => setSettingsForm({...settingsForm, restaurantName: v})} />
                  <SettingsInput label="Local Currency" Icon={DollarSign} value={settingsForm.currency} onChange={v => setSettingsForm({...settingsForm, currency: v})} />
                  <SettingsInput label="VAT / Tax (%)" Icon={Percent} type="number" value={settingsForm.taxRate} onChange={v => setSettingsForm({...settingsForm, taxRate: v})} />
                  <SettingsInput label="Service Charge (%)" Icon={Percent} type="number" value={settingsForm.serviceCharge} onChange={v => setSettingsForm({...settingsForm, serviceCharge: v})} />
                  <SettingsInput label="Low Stock Warning" Icon={AlertTriangle} type="number" value={settingsForm.lowStockThreshold} onChange={v => setSettingsForm({...settingsForm, lowStockThreshold: v})} />
                </div>
                <div className="mt-12 pt-8 border-t border-slate-100 flex gap-4">
                  <button onClick={handleSettingsSave} className="flex-1 bg-slate-900 text-white py-5 rounded-2xl font-black hover:bg-black transition-all shadow-xl active:scale-[0.98]">SAVE CHANGES</button>
                  <button onClick={() => actions.seedData()} className="px-8 bg-rose-50 text-rose-600 border border-rose-100 rounded-2xl font-black hover:bg-rose-100 transition-all">SYSTEM RESET</button>
                </div>
             </div>
          </div>
        )}
      </div>

      {editingItem && <MenuModal item={editingItem} currency={dbData.settings.currency} onClose={() => setEditingItem(null)} onSave={(d) => { actions.saveMenuItem(d); setEditingItem(null); }} />}
      {editingTable && <TableModal table={editingTable} onClose={() => setEditingTable(null)} onSave={(d) => { actions.saveTable(d); setEditingTable(null); }} />}
    </div>
  );
}

// --- SUBCOMPONENTS ---

function AdvancedStatCard({ label, val, trend, color }) {
  return (
    <div className="bg-white p-8 rounded-[2.5rem] border border-slate-200 shadow-sm flex items-end justify-between overflow-hidden relative">
      <div>
        <p className="text-[10px] font-black uppercase text-slate-400 tracking-widest mb-1">{label}</p>
        <p className="text-4xl font-black text-slate-900 tracking-tighter">{val}</p>
      </div>
      <div className="flex flex-col items-end gap-2">
        <Sparkline data={trend} color={color} />
        <span className="text-[10px] font-bold text-slate-300 uppercase">Live Pulse</span>
      </div>
    </div>
  );
}

function SettingsInput({ label, Icon, value, onChange, type = "text" }) {
  // Defensive check for NaN or null values
  const displayValue = value === null || value === undefined || isNaN(value) && type === 'number' ? '' : value;

  return (
    <div className="space-y-2">
      <label className="text-[10px] font-black uppercase text-slate-400 ml-4 tracking-widest">{label}</label>
      <div className="relative group">
        <Icon className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-300 group-focus-within:text-indigo-500 transition-colors" size={18} />
        <input 
          type={type} 
          className="w-full bg-slate-50 border-2 border-slate-50 focus:border-indigo-500 focus:bg-white rounded-2xl p-4 pl-12 outline-none font-bold transition-all shadow-inner" 
          value={displayValue} 
          onChange={e => onChange(e.target.value)} 
        />
      </div>
    </div>
  );
}

function TableModal({ table, onClose, onSave }) {
  const [num, setNum] = useState(table.number || "");
  return (
    <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-md z-[100] flex items-center justify-center p-6">
      <div className="bg-white rounded-[3rem] w-full max-w-sm overflow-hidden shadow-2xl animate-scale-in">
        <div className="p-10">
          <div className="w-16 h-16 bg-emerald-50 text-emerald-600 rounded-3xl flex items-center justify-center mb-6"><Hash size={32}/></div>
          <h3 className="text-3xl font-black mb-2 tracking-tight">{table.id ? 'Modify Table' : 'New Table'}</h3>
          <p className="text-slate-400 text-xs font-bold uppercase tracking-widest mb-8">Establish floor presence</p>
          <div className="space-y-1">
            <label className="text-[10px] font-black uppercase text-slate-400 ml-4">Identifier Number</label>
            <input 
              type="number" 
              className="w-full bg-slate-50 border-2 border-transparent focus:border-emerald-500 focus:bg-white rounded-[1.5rem] p-6 outline-none font-black text-3xl transition-all shadow-inner"
              value={num}
              onChange={e => setNum(e.target.value)}
              placeholder="01"
              autoFocus
            />
          </div>
        </div>
        <div className="flex border-t border-slate-100 p-4 gap-4">
          <button onClick={onClose} className="flex-1 p-5 font-black text-slate-400 hover:text-slate-900 transition-all uppercase tracking-widest text-xs">Cancel</button>
          <button onClick={() => onSave({...table, number: num})} className="flex-1 bg-emerald-600 text-white p-5 rounded-2xl font-black hover:bg-emerald-700 transition-all uppercase tracking-widest text-xs shadow-lg shadow-emerald-100">Establish</button>
        </div>
      </div>
    </div>
  );
}

function MenuModal({ item, onClose, onSave, currency }) {
  const [form, setForm] = useState({ ...item });
  return (
    <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-md z-[100] flex items-center justify-center p-6">
      <div className="bg-white rounded-[3rem] w-full max-w-md overflow-hidden shadow-2xl animate-scale-in">
        <div className="p-10">
          <h3 className="text-3xl font-black mb-8 tracking-tight">{item.id ? 'Edit Item' : 'Create Dish'}</h3>
          <div className="space-y-6">
            <div className="space-y-2">
               <label className="text-[10px] font-black uppercase text-slate-400 ml-4">Product Identity</label>
               <input type="text" className="w-full bg-slate-50 border-2 border-transparent focus:border-indigo-500 focus:bg-white rounded-2xl p-5 outline-none font-bold transition-all shadow-inner" value={form.name} onChange={e => setForm({...form, name: e.target.value})} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                 <label className="text-[10px] font-black uppercase text-slate-400 ml-4">Department</label>
                 <select className="w-full bg-slate-50 border-2 border-transparent focus:border-indigo-500 focus:bg-white rounded-2xl p-5 outline-none font-bold transition-all appearance-none shadow-inner" value={form.category} onChange={e => setForm({...form, category: e.target.value})}>
                    <option>Main</option><option>Starters</option><option>Drinks</option><option>Dessert</option>
                 </select>
              </div>
              <div className="space-y-2">
                 <label className="text-[10px] font-black uppercase text-slate-400 ml-4">Valuation ({currency})</label>
                 <input type="number" step="0.01" className="w-full bg-slate-50 border-2 border-transparent focus:border-indigo-500 focus:bg-white rounded-2xl p-5 outline-none font-bold transition-all shadow-inner" value={form.price || ''} onChange={e => setForm({...form, price: e.target.value})} />
              </div>
            </div>
            <div className="space-y-2">
                 <label className="text-[10px] font-black uppercase text-slate-400 ml-4">Initial Stock Count</label>
                 <div className="relative">
                    <Package className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-300" size={20} />
                    <input type="number" className="w-full bg-slate-50 border-2 border-transparent focus:border-indigo-500 focus:bg-white rounded-2xl p-5 pl-14 outline-none font-bold transition-all shadow-inner" value={form.stock || ''} onChange={e => setForm({...form, stock: e.target.value})} />
                 </div>
            </div>
          </div>
        </div>
        <div className="flex border-t border-slate-100 p-4 gap-4">
          <button onClick={onClose} className="flex-1 p-5 font-black text-slate-400 hover:text-slate-900 transition-all text-xs uppercase tracking-widest">Abort</button>
          <button onClick={() => onSave(form)} className="flex-1 bg-indigo-600 text-white p-5 rounded-2xl font-black hover:bg-indigo-700 transition-all text-xs uppercase tracking-widest shadow-lg shadow-indigo-100">Commit Item</button>
        </div>
      </div>
    </div>
  );
}

// --- STAFF INTERFACE ---

function WaiterPanel({ dbData, actions, onBack }) {
  const [selTable, setSelTable] = useState(null);
  const [view, setView] = useState('tables');
  const [noteModal, setNoteModal] = useState(null);
  const orders = dbData?.orders || [];
  const tables = dbData?.tables || [];
  const menu = dbData?.menu || [];
  const activeOrder = orders.find(o => o.id === selTable?.currentOrderId);

  return (
    <div className="h-screen flex flex-col bg-[#F1F5F9] overflow-hidden text-slate-900">
      <Header title="Staff Terminal" Icon={User} role="Service Desk" restaurantName={dbData.settings.restaurantName} />
      
      <div className="bg-white border-b px-8 py-3 flex items-center justify-between">
         <div className="flex gap-4">
            <button onClick={() => setView('tables')} className={`px-6 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${view === 'tables' ? 'bg-slate-900 text-white shadow-md' : 'text-slate-400 hover:text-slate-600'}`}>Tables</button>
            <button onClick={() => setView('history')} className={`px-6 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${view === 'history' ? 'bg-slate-900 text-white shadow-md' : 'text-slate-400 hover:text-slate-600'}`}>Past Orders</button>
         </div>
         <button onClick={onBack} className="p-3 text-slate-300 hover:text-red-500 transition-colors"><X size={20}/></button>
      </div>

      <div className="flex-1 flex overflow-hidden">
        <div className="flex-1 p-6 lg:p-10 overflow-y-auto">
          {view === 'tables' && (
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-6">
              {tables.map(t => (
                <TableCard key={t.id} table={t} isReady={orders.find(o=>o.id===t.currentOrderId)?.items.some(i=>i.status==='ready')} onClick={() => { setSelTable(t); setView(t.status==='free'?'menu':'checkout'); }} />
              ))}
            </div>
          )}
          {view === 'menu' && (
            <div className="space-y-8 animate-fade-in">
              <div className="flex justify-between items-center">
                <h2 className="text-3xl font-black">Table {selTable?.number} Menu</h2>
                <button onClick={()=>setView('tables')} className="text-slate-400 font-bold hover:text-slate-900 flex items-center gap-2"><ArrowLeft size={16}/> Back</button>
              </div>
              <MenuGrid items={menu} onAdd={setNoteModal} currency={dbData.settings.currency} lowStockThreshold={dbData.settings.lowStockThreshold} />
            </div>
          )}
          {view === 'checkout' && activeOrder && (
             <div className="animate-fade-in flex flex-col items-center">
                <OrderDetails order={activeOrder} table={selTable} currency={dbData.settings.currency} onAddMore={()=>setView('menu')} onSettle={()=>{actions.settleOrder(activeOrder.id, selTable.id); setView('tables');}} />
                <button onClick={()=>setView('tables')} className="mt-8 text-slate-400 font-bold hover:text-slate-800">Return to Floor Plan</button>
             </div>
          )}
          {view === 'history' && <div className="max-w-2xl mx-auto space-y-4">{orders.slice(0,25).map(o => <HistoryItem key={o.id} order={o} tables={tables} currency={dbData.settings.currency} />)}</div>}
        </div>
        
        {view === 'menu' && (
          <div className="w-96 bg-white border-l shadow-2xl flex flex-col p-8 animate-slide-in">
            <div className="flex justify-between items-center mb-10">
              <h2 className="text-2xl font-black tracking-tight">Active Ticket</h2>
              <span className="w-10 h-10 rounded-xl bg-slate-900 text-white flex items-center justify-center font-black">{selTable?.number}</span>
            </div>
            <CartList items={actions.cart} onRemove={actions.removeFromCart} currency={dbData.settings.currency} settings={dbData.settings} />
            <button 
              onClick={() => { actions.submitOrder(selTable); setView('tables'); }} 
              disabled={actions.cart.length === 0} 
              className="w-full bg-slate-900 text-white py-6 rounded-[2rem] font-black shadow-2xl shadow-slate-200 disabled:opacity-20 mt-8 hover:bg-black transition-all active:scale-95"
            >
              TRANSMIT KOT
            </button>
          </div>
        )}
      </div>
      {noteModal && <NoteModal item={noteModal} onClose={()=>setNoteModal(null)} onConfirm={(n)=>{actions.addToCart({...noteModal, note:n}); setNoteModal(null);}} />}
    </div>
  );
}

// --- KDS ---

function KDS({ dbData, actions, onBack }) {
  const orders = dbData?.orders || [];
  const tables = dbData?.tables || [];
  const active = orders.filter(o => o.status !== 'paid' && o.status !== 'served').sort((a,b)=>a.createdAt?.seconds - b.createdAt?.seconds);
  
  return (
    <div className="h-screen bg-[#0F172A] text-white flex flex-col font-sans">
       <div className="px-8 py-6 border-b border-slate-800 flex justify-between items-center">
          <div className="flex items-center gap-4">
            <div className="bg-slate-800 p-3 rounded-2xl"><ChefHat size={24} className="text-orange-500" /></div>
            <div>
              <h1 className="text-xl font-black">Kitchen Display System</h1>
              <p className="text-[10px] uppercase font-black tracking-[0.2em] text-slate-500">Culinary Queue</p>
            </div>
          </div>
          <div className="flex items-center gap-10">
            <div className="text-right">
               <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Active Load</p>
               <p className="text-2xl font-black text-orange-500">{active.length}</p>
            </div>
            <button onClick={onBack} className="p-3 bg-slate-800 rounded-2xl hover:bg-slate-700 transition-colors"><X size={20}/></button>
          </div>
       </div>
       <div className="flex-1 p-8 overflow-x-auto">
         <div className="flex gap-6 h-full min-w-max">
           {active.map(o => <KOTTicket key={o.id} order={o} tables={tables} onUpdateItemStatus={actions.updateItemStatus} />)}
           {active.length === 0 && (
             <div className="w-full flex flex-col items-center justify-center opacity-20 select-none">
                <ChefHat size={120} className="mb-6" />
                <h2 className="text-4xl font-black uppercase tracking-widest italic">Kitchen Clear</h2>
             </div>
           )}
         </div>
       </div>
    </div>
  );
}

// --- STOREFRONT (CUSTOMER SELF-SERVICE) ---

function Storefront({ dbData, actions }) {
  const [cartOpen, setCartOpen] = useState(false);
  const [note, setNote] = useState(null);
  const menu = dbData?.menu || [];
  const tables = dbData?.tables || [];
  
  const handleConfirmOrder = async () => {
    const table = tables.find(t => t.status === 'free') || tables[0];
    if (table) {
      await actions.submitOrder(table);
      setCartOpen(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#FAFAFA] flex flex-col">
      <header className="bg-white p-6 sticky top-0 z-40 border-b border-slate-100 flex justify-between items-center">
         <h1 className="text-3xl font-black tracking-tighter flex items-center gap-3">
           <div className="w-10 h-10 bg-slate-900 rounded-xl flex items-center justify-center text-white"><Utensils size={20}/></div>
           {dbData.settings.restaurantName}
         </h1>
         <button onClick={()=>setCartOpen(true)} className="flex items-center gap-3 bg-slate-900 text-white px-5 py-3 rounded-2xl font-black shadow-lg shadow-slate-200">
           <ShoppingCart size={18}/>
           <span>{actions.cart.length}</span>
         </button>
      </header>
      <div className="max-w-3xl mx-auto p-6 lg:p-12 w-full flex-1">
        <h2 className="text-4xl font-black mb-10 tracking-tight">Main Menu</h2>
        <MenuGrid items={menu} onAdd={setNote} currency={dbData.settings.currency} lowStockThreshold={dbData.settings.lowStockThreshold} />
      </div>
      {cartOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md z-[100] flex justify-end">
          <div className="w-full max-w-md bg-white h-full p-10 flex flex-col shadow-2xl animate-slide-in">
            <div className="flex justify-between items-center mb-10">
              <h2 className="text-3xl font-black tracking-tight">Your Order</h2>
              <button onClick={()=>setCartOpen(false)} className="p-3 bg-slate-50 rounded-full hover:bg-slate-100 transition-colors"><X/></button>
            </div>
            <CartList items={actions.cart} onRemove={actions.removeFromCart} currency={dbData.settings.currency} settings={dbData.settings} />
            <button onClick={handleConfirmOrder} className="w-full bg-slate-900 text-white py-6 rounded-[2.5rem] font-black mt-8 shadow-2xl active:scale-95 transition-all text-xl">Confirm & Pay</button>
          </div>
        </div>
      )}
      {note && <NoteModal item={note} onClose={()=>setNote(null)} onConfirm={(n)=>{actions.addToCart({...note, note:n}); setNote(null);}} />}
    </div>
  );
}

// --- SHARED COMPONENTS ---

function Header({ title, Icon, role, theme, restaurantName }) {
  return (
    <header className={`px-8 py-6 border-b flex justify-between items-center ${theme === 'dark' ? 'bg-slate-900 text-white border-slate-800' : 'bg-white border-slate-100'}`}>
      <div className="flex items-center gap-5">
        <div className={`p-4 rounded-[1.25rem] shadow-sm ${theme==='dark'?'bg-slate-800':'bg-slate-50 text-slate-900'}`}>{Icon && <Icon size={24} />}</div>
        <div>
          <h1 className="text-xl font-black tracking-tight">{title}</h1>
          <span className="text-[10px] uppercase font-black opacity-30 tracking-[0.2em]">{role}</span>
        </div>
      </div>
      <div className="text-right">
        <span className="text-sm font-black opacity-50 uppercase tracking-tighter">{restaurantName}</span>
      </div>
    </header>
  );
}

function RoleSelection({ onSelect, settings }) {
  const cards = [
    { role: ROLES.WAITER, Icon: User, label: "Staff", color: "from-blue-600 to-blue-700" },
    { role: ROLES.KITCHEN, Icon: ChefHat, label: "Kitchen", color: "from-orange-600 to-orange-700" },
    { role: ROLES.CUSTOMER, Icon: Utensils, label: "Guest", color: "from-emerald-600 to-emerald-700" },
    { role: ROLES.ADMIN, Icon: LayoutGrid, label: "Admin", color: "from-slate-800 to-slate-900" },
  ];
  return (
    <div className="min-h-screen bg-[#F1F5F9] flex flex-col items-center justify-center p-8">
      <div className="text-center mb-16 animate-fade-in">
        <h1 className="text-6xl font-black tracking-tighter text-slate-900 mb-4">{settings.restaurantName}</h1>
        <div className="inline-block px-6 py-2 bg-white rounded-full shadow-sm border border-slate-200">
           <p className="text-slate-400 font-black uppercase tracking-widest text-[10px]">Ecosystem Operating Terminal</p>
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8 w-full max-w-7xl">
        {cards.map((c, idx) => (
          <button 
            key={c.role} 
            onClick={() => onSelect(c.role)} 
            style={{ animationDelay: `${idx * 0.1}s` }}
            className={`bg-gradient-to-br ${c.color} p-12 rounded-[3.5rem] flex flex-col items-center text-white shadow-2xl hover:scale-105 hover:-translate-y-2 transition-all group animate-fade-in`}
          >
            <div className="mb-8 bg-white/20 p-6 rounded-[2rem] group-hover:rotate-12 transition-transform shadow-inner"><c.Icon size={48}/></div>
            <span className="text-3xl font-black uppercase tracking-tighter">{c.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function TableCard({ table, isReady, onClick }) {
  const occ = table.status !== 'free';
  return (
    <button onClick={onClick} className={`relative p-8 rounded-[3rem] border-2 transition-all h-44 flex flex-col justify-between items-start group ${occ ? 'bg-white border-transparent shadow-xl shadow-slate-200' : 'bg-slate-50 border-slate-200/50 border-dashed hover:border-indigo-400 hover:bg-white hover:shadow-xl'}`}>
      <div className="flex justify-between w-full items-center">
        <span className="text-4xl font-black text-slate-900 tracking-tighter group-hover:scale-110 transition-transform">{table.number}</span>
        {isReady && <div className="flex gap-1"><span className="w-3 h-3 bg-orange-500 rounded-full animate-ping"></span><span className="w-3 h-3 bg-orange-500 rounded-full"></span></div>}
      </div>
      <div className="flex flex-col gap-2 w-full">
         <span className={`text-[10px] w-fit font-black uppercase tracking-widest px-3 py-1.5 rounded-full ${occ ? 'bg-rose-50 text-rose-600' : 'bg-emerald-50 text-emerald-600'}`}>{table.status}</span>
      </div>
    </button>
  );
}

function MenuGrid({ items, onAdd, currency, lowStockThreshold }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 gap-6">
      {items.map(item => (
        <div key={item.id} className={`bg-white p-6 rounded-[2.5rem] border border-slate-100 flex justify-between items-center group transition-all hover:shadow-lg ${item.stock <= 0 ? 'opacity-50 grayscale' : ''}`}>
          <div className="flex flex-col gap-1">
            <h4 className="font-black text-xl text-slate-900 tracking-tight">{item.name}</h4>
            <div className="flex items-center gap-3">
               <span className="text-sm font-black text-indigo-600 font-mono">{currency}{item.price.toFixed(2)}</span>
               {item.stock < lowStockThreshold && item.stock > 0 && <span className="text-[9px] font-black uppercase text-orange-500 bg-orange-50 px-2 py-0.5 rounded-full">LOW: {item.stock}</span>}
               {item.stock <= 0 && <span className="text-[9px] font-black uppercase text-rose-500 bg-rose-50 px-2 py-0.5 rounded-full">SOLD OUT</span>}
            </div>
          </div>
          <button 
            onClick={() => onAdd(item)} 
            disabled={item.stock <= 0}
            className="bg-slate-100 text-slate-900 p-4 rounded-3xl group-hover:bg-slate-900 group-hover:text-white transition-all active:scale-90 disabled:opacity-0"
          >
            <Plus size={24}/>
          </button>
        </div>
      ))}
    </div>
  );
}

function CartList({ items, onRemove, currency, settings }) {
  const subtotal = items.reduce((s, i) => s + i.price, 0);
  const tax = (subtotal * settings.taxRate) / 100;
  const service = (subtotal * settings.serviceCharge) / 100;
  const total = subtotal + tax + service;

  return (
    <div className="flex-1 overflow-y-auto space-y-6">
      <div className="space-y-4">
        {items.map((item, idx) => (
          <div key={idx} className="flex justify-between items-start animate-fade-in bg-slate-50 p-4 rounded-2xl relative group">
            <div className="flex-1">
               <h5 className="font-black text-slate-900">{item.name}</h5>
               {item.note && <p className="text-[11px] text-indigo-500 font-bold italic mt-1 bg-indigo-50 px-2 py-1 rounded-lg">“{item.note}”</p>}
            </div>
            <div className="flex items-center gap-4">
               <span className="text-sm font-mono font-black">{currency}{item.price.toFixed(2)}</span>
               <button onClick={() => onRemove(idx)} className="p-2 text-slate-300 hover:text-rose-500 transition-colors"><X size={16}/></button>
            </div>
          </div>
        ))}
      </div>
      {items.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20 text-slate-300">
           <ShoppingCart size={64} strokeWidth={1} className="mb-4" />
           <p className="font-black uppercase tracking-widest text-xs">Waiting for selection</p>
        </div>
      )}
      {items.length > 0 && (
        <div className="pt-8 border-t-2 border-slate-50 border-dashed space-y-3">
          <div className="flex justify-between items-center text-xs font-black text-slate-400 uppercase tracking-widest"><span>Subtotal</span><span>{currency}{subtotal.toFixed(2)}</span></div>
          <div className="flex justify-between items-center text-xs font-black text-slate-400 uppercase tracking-widest"><span>Tax ({settings.taxRate}%)</span><span>{currency}{tax.toFixed(2)}</span></div>
          <div className="flex justify-between items-center text-xs font-black text-slate-400 uppercase tracking-widest"><span>Gratuity ({settings.serviceCharge}%)</span><span>{currency}{service.toFixed(2)}</span></div>
          <div className="flex justify-between items-center pt-4"><span className="text-sm font-black uppercase text-slate-400 tracking-tighter">Total Due</span><span className="text-4xl font-black text-slate-900 tracking-tighter">{currency}{total.toFixed(2)}</span></div>
        </div>
      )}
    </div>
  );
}

function OrderDetails({ order, table, onAddMore, onSettle, currency }) {
  return (
    <div className="w-full max-w-xl bg-white rounded-[3.5rem] border border-slate-100 shadow-2xl overflow-hidden flex flex-col">
      <div className="p-12 bg-slate-50/50 border-b flex justify-between items-center">
        <div><h2 className="text-5xl font-black tracking-tighter">Table {table?.number}</h2><p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mt-2">Check Settlement</p></div>
        <button onClick={onAddMore} className="bg-white px-8 py-4 rounded-[1.5rem] font-black border border-slate-200 shadow-sm hover:bg-slate-100 transition-all">+ Add Item</button>
      </div>
      <div className="p-12 space-y-6 max-h-96 overflow-y-auto">
        {order.items.map((item, idx) => (
          <div key={idx} className="flex justify-between items-center pb-4 border-b border-slate-50 last:border-0">
            <div><h5 className="font-black text-slate-900">{item.name}</h5><p className="text-[10px] uppercase font-black text-indigo-500 tracking-widest">{item.status}</p></div>
            <span className="font-mono font-black text-lg">{currency}{item.price.toFixed(2)}</span>
          </div>
        ))}
      </div>
      <div className="p-12 bg-slate-50 border-t space-y-3">
        <div className="flex justify-between text-xs font-black text-slate-400 uppercase"><span>Tax & Service</span><span>{currency}{(order.tax + (order.serviceCharge||0)).toFixed(2)}</span></div>
        <div className="flex justify-between items-center pt-4 mb-10"><span className="text-xs font-black uppercase tracking-widest text-slate-400">Grand Total</span><span className="text-5xl font-black text-slate-900 tracking-tighter">{currency}{order.total.toFixed(2)}</span></div>
        <button onClick={onSettle} className="w-full bg-slate-900 text-white py-8 rounded-[2.5rem] font-black shadow-2xl hover:bg-black transition-all flex items-center justify-center gap-4 text-xl tracking-tight active:scale-95"><CreditCard size={28}/> COMPLETE SETTLEMENT</button>
      </div>
    </div>
  );
}

function KOTTicket({ order, tables, onUpdateItemStatus }) {
  const table = tables.find(t => t.id === order.tableId);
  const timeSince = (ts) => {
    if (!ts) return '';
    const diff = Math.floor((Date.now() - ts.seconds * 1000) / 60000);
    return diff > 0 ? `${diff}m` : 'Just now';
  };

  return (
    <div className="w-96 bg-slate-800/50 backdrop-blur-md rounded-[3rem] border border-slate-700 flex flex-col shadow-2xl overflow-hidden h-full">
      <div className="p-8 bg-slate-700/50 border-b border-slate-700 flex justify-between items-center">
        <div>
          <h3 className="text-3xl font-black tracking-tighter">TBL {table?.number}</h3>
          <div className="flex items-center gap-2 mt-1">
             <Clock size={12} className="text-slate-500" />
             <span className="text-[10px] font-black text-slate-500 uppercase">{timeSince(order.createdAt)} ago</span>
          </div>
        </div>
        <span className="px-4 py-2 bg-slate-800 rounded-2xl text-[10px] font-black text-slate-400">#{order.id.slice(-4)}</span>
      </div>
      <div className="flex-1 p-6 space-y-4 overflow-y-auto">
        {order.items.map((item, idx) => (
          <button 
            key={idx} 
            onClick={() => {
              const flow = { pending: 'preparing', preparing: 'ready', ready: 'served', served: 'served' };
              onUpdateItemStatus(order.id, idx, flow[item.status]);
            }}
            className={`w-full text-left p-5 rounded-3xl border-2 transition-all flex flex-col gap-2 ${item.status === 'ready' ? 'bg-emerald-600 border-emerald-400 shadow-lg shadow-emerald-900/20' : item.status === 'preparing' ? 'bg-indigo-600 border-indigo-400 shadow-lg shadow-indigo-900/20' : item.status === 'served' ? 'opacity-20 border-transparent grayscale' : 'bg-slate-700/50 border-slate-600'}`}
          >
            <div className="flex justify-between items-center font-black text-lg">
              <span className="tracking-tight">{item.name}</span>
              <span className="text-[9px] uppercase tracking-widest bg-black/20 px-2 py-1 rounded-lg">{item.status}</span>
            </div>
            {item.note && <div className="text-[11px] text-white/70 bg-black/20 p-3 rounded-2xl italic font-medium leading-relaxed">"{item.note}"</div>}
          </button>
        ))}
      </div>
      <div className="p-6 bg-slate-800/80 border-t border-slate-700">
         <div className="flex justify-between items-center">
            <span className="text-[10px] font-black uppercase text-slate-500 tracking-widest">Total Items</span>
            <span className="text-xl font-black">{order.items.length}</span>
         </div>
      </div>
    </div>
  );
}

function NoteModal({ item, onClose, onConfirm }) {
  const [note, setNote] = useState("");
  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md z-[100] flex items-center justify-center p-6">
      <div className="bg-white rounded-[3.5rem] w-full max-w-sm overflow-hidden shadow-2xl animate-scale-in">
        <div className="p-12">
          <div className="w-16 h-16 bg-slate-50 rounded-[1.5rem] flex items-center justify-center mb-8"><MessageSquare size={32} className="text-slate-400" /></div>
          <h3 className="text-3xl font-black mb-2 tracking-tight">{item.name}</h3>
          <p className="text-slate-400 text-xs font-bold uppercase tracking-widest mb-8">Special culinary notes</p>
          <textarea autoFocus className="w-full border-2 border-slate-50 bg-slate-50 rounded-[2rem] p-6 focus:bg-white focus:border-indigo-500 outline-none transition-all h-40 resize-none font-bold text-slate-700 shadow-inner text-lg" placeholder="No onions, extra spicy..." value={note} onChange={e => setNote(e.target.value)} />
        </div>
        <div className="flex border-t border-slate-100 p-4 gap-4">
          <button onClick={onClose} className="flex-1 p-6 font-black text-slate-400 hover:text-slate-900 transition-all uppercase tracking-widest text-xs">Skip</button>
          <button onClick={() => onConfirm(note)} className="flex-1 bg-indigo-600 text-white p-6 rounded-[1.75rem] font-black hover:bg-indigo-700 transition-all uppercase tracking-widest text-xs shadow-lg shadow-indigo-100">Confirm</button>
        </div>
      </div>
    </div>
  );
}

function HistoryItem({ order, tables, currency }) {
  const table = (tables || []).find(t => t.id === order.tableId);
  return (
    <div className="bg-white p-6 rounded-[2.5rem] border border-slate-100 flex justify-between items-center shadow-sm hover:shadow-md transition-shadow group">
      <div className="flex items-center gap-6">
        <div className="w-16 h-16 rounded-[1.5rem] bg-slate-900 text-white flex items-center justify-center text-2xl font-black shadow-lg shadow-slate-200 group-hover:rotate-6 transition-transform">{table?.number || '?'}</div>
        <div>
          <h5 className="font-black text-lg">Transaction #{order.id.slice(-4)}</h5>
          <p className="text-[10px] font-black text-slate-300 uppercase tracking-widest">{new Date(order.createdAt?.seconds * 1000).toLocaleTimeString()}</p>
        </div>
      </div>
      <div className="text-right">
        <div className="text-2xl font-black text-slate-900 tracking-tighter">{currency}{(order.total || 0).toFixed(2)}</div>
        <div className="text-[10px] font-black text-emerald-500 bg-emerald-50 px-2 py-0.5 rounded-full inline-block uppercase tracking-widest mt-1">{order.status}</div>
      </div>
    </div>
  );
}

// Global Styles
const style = document.createElement('style');
style.textContent = `
  @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap');
  
  body {
    font-family: 'Plus Jakarta Sans', sans-serif;
    -webkit-font-smoothing: antialiased;
  }

  @keyframes fade-in { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: translateY(0); } }
  @keyframes scale-in { from { transform: scale(0.94); opacity: 0; } to { transform: scale(1); opacity: 1; } }
  @keyframes slide-in { from { transform: translateX(100%); } to { transform: translateX(0); } }
  
  .animate-fade-in { animation: fade-in 0.4s cubic-bezier(0.16, 1, 0.3, 1) forwards; }
  .animate-scale-in { animation: scale-in 0.4s cubic-bezier(0.16, 1, 0.3, 1) forwards; }
  .animate-slide-in { animation: slide-in 0.5s cubic-bezier(0.16, 1, 0.3, 1) forwards; }
  
  ::-webkit-scrollbar { width: 6px; }
  ::-webkit-scrollbar-track { background: transparent; }
  ::-webkit-scrollbar-thumb { background: #E2E8F0; border-radius: 10px; }
  ::-webkit-scrollbar-thumb:hover { background: #CBD5E1; }
`;
document.head.appendChild(style);
