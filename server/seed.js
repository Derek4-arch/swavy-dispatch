/* SAMPLE demo data for a brand-new database: areas, zones, sample prices, demo accounts and a few orders.
   Everything here is made up for testing. Prices are SAMPLE prices: change them on the admin page. */
'use strict';

const AREAS = [
  // Lagos (map: lagoon runs across the middle-bottom)
  ['Ikeja', 'Lagos', 4, 44, 20], ['Magodo', 'Lagos', 4, 58, 9], ['Gbagada', 'Lagos', 4, 40, 37],
  ['Yaba', 'Lagos', 3, 44, 54], ['Surulere', 'Lagos', 3, 29, 57], ['Festac', 'Lagos', 5, 9, 62],
  ['Ikoyi', 'Lagos', 1, 57, 75], ['Victoria Island', 'Lagos', 1, 47, 84], ['Lekki', 'Lagos', 1, 71, 81], ['Ajah', 'Lagos', 2, 92, 83],
  // Abuja
  ['Kubwa', 'Abuja', 3, 16, 10], ['Gwarinpa', 'Abuja', 2, 28, 26], ['Jabi', 'Abuja', 2, 42, 44], ['Maitama', 'Abuja', 1, 60, 34],
  ['Wuse', 'Abuja', 1, 55, 50], ['Garki', 'Abuja', 1, 60, 64], ['Asokoro', 'Abuja', 1, 78, 66], ['Lugbe', 'Abuja', 3, 28, 86]
];
const ZONES = [
  ['Lagos', 1, 'Island (VI, Ikoyi, Lekki)'], ['Lagos', 2, 'Ajah side'], ['Lagos', 3, 'Mainland (Yaba, Surulere)'], ['Lagos', 4, 'Ikeja side (Ikeja, Gbagada, Magodo)'], ['Lagos', 5, 'Festac side'],
  ['Abuja', 1, 'Central (Wuse, Maitama, Garki, Asokoro)'], ['Abuja', 2, 'Jabi & Gwarinpa'], ['Abuja', 3, 'Outskirts (Kubwa, Lugbe)']
];
// SAMPLE zone-to-zone prices for a small package (naira).
const PRICES = {
  Lagos: { '1-1': 2000, '1-2': 3000, '1-3': 3500, '1-4': 4500, '1-5': 5500, '2-2': 2000, '2-3': 4500, '2-4': 5500, '2-5': 6500, '3-3': 1800, '3-4': 3000, '3-5': 3500, '4-4': 2000, '4-5': 4500, '5-5': 1800 },
  Abuja: { '1-1': 1500, '1-2': 2500, '1-3': 4000, '2-2': 1500, '2-3': 3000, '3-3': 2000 }
};

module.exports = function seed(db, app, core, withDemo) {
  db.tx(() => {
    for (const a of AREAS) db.run('INSERT OR IGNORE INTO areas (name, city, zone, x, y) VALUES (?,?,?,?,?)', ...a);
    for (const z of ZONES) db.run('INSERT OR IGNORE INTO zones (city, zone, name) VALUES (?,?,?)', ...z);
    for (const [city, m] of Object.entries(PRICES)) for (const [k, v] of Object.entries(m)) { const [z1, z2] = k.split('-').map(Number); db.run('INSERT OR IGNORE INTO zone_prices (city, z1, z2, amount) VALUES (?,?,?,?)', city, z1, z2, v); }
  });
  if (!withDemo || db.get('SELECT COUNT(*) n FROM users').n > 0) return false;

  const t = Date.now();
  const user = (role, name, email, phone, area) => {
    const { salt, hash } = core.hashPassword('swavy123');
    const a = app.area(area);
    return Number(db.run('INSERT INTO users (role, name, email, phone, city, area, pass_salt, pass_hash, is_sample, created_at) VALUES (?,?,?,?,?,?,?,?,1,?)', role, name, email, core.normPhone(phone), a.city, a.name, salt, hash, t).lastInsertRowid);
  };
  const rider = (name, email, phone, area, plate, bike, verified, online, photo) => {
    const id = user('rider', name, email, phone, area); const a = app.area(area);
    db.run('INSERT INTO riders (user_id, plate, bike, photo, verified, online, x, y, rating_sum, rating_n) VALUES (?,?,?,?,?,?,?,?,?,?)', id, plate, bike, photo, verified, online, a.x, a.y, verified ? 46 : 0, verified ? 10 : 0);
    return id;
  };
  db.tx(() => {
    const cust = user('customer', 'Tolu Adeyemi (sample)', 'customer@swavy.ng', '08031234567', 'Yaba');
    const r1 = rider('Musa Ibrahim (sample)', 'rider@swavy.ng', '08051112222', 'Yaba', 'LSR-482KJ', 'Bajaj Boxer 150, red', 1, 1, '/img/sample/rider-1.svg');
    rider('Emeka Obi (sample)', 'rider2@swavy.ng', '08062223333', 'Lekki', 'EPE-219AA', 'TVS HLX 125, black', 1, 1, '/img/sample/rider-2.svg');
    rider('Sani Bello (sample)', 'rider3@swavy.ng', '08073334444', 'Ikeja', 'KJA-551XT', 'Honda Ace 125, blue', 0, 0, '/img/sample/rider-3.svg');
    rider('Aisha Yusuf (sample)', 'rider.abuja@swavy.ng', '08084445555', 'Wuse', 'ABJ-104GW', 'Bajaj Boxer 150, black', 1, 1, '/img/sample/rider-4.svg');
    user('customer', 'Ngozi Eze (sample)', 'customer.abuja@swavy.ng', '08095556666', 'Wuse');

    const mk = (b, ago, pay) => {
      const q = app.quote(b);
      const id = Number(db.run(`INSERT INTO orders (code, token, customer_id, source, sender_name, sender_phone, city, pickup_area, pickup_addr, drop_area, drop_addr, size, item, receiver_name, receiver_phone, express, price, pay, paid, collect_amount, collect_status, delivery_code, is_sample, created_at, updated_at)
        VALUES (?,?,?,'web',?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,1,?,?)`, core.ref('SWD'), core.token(12), cust, 'Tolu Adeyemi (sample)', '2348031234567', q.city, q.pickupArea, b.pickupAddr, q.dropArea, b.dropAddr, q.size, b.item, b.receiverName, core.normPhone(b.receiverPhone),
        q.express ? 1 : 0, q.price, pay, 0, b.collect || 0, b.collect ? 'pending' : 'none', core.code4(), t - ago, t - ago).lastInsertRowid);
      db.run('INSERT INTO order_events (order_id, status, text, at) VALUES (?,?,?,?)', id, 'pending', `Order booked. Looking for a rider near ${q.pickupArea}.`, t - ago);
      return id;
    };
    // Two delivered yesterday/today for rider 1 (shows earnings + cash to remit), plus open jobs waiting for riders.
    const d1 = mk({ pickupArea: 'Yaba', pickupAddr: '12 Herbert Macaulay Way', dropArea: 'Surulere', dropAddr: '4 Bode Thomas St', size: 'small', item: 'Documents', receiverName: 'Kemi', receiverPhone: '08020000001' }, 5 * 3600e3, 'cash_delivery');
    const d2 = mk({ pickupArea: 'Yaba', pickupAddr: 'Tejuosho Market, shop 22', dropArea: 'Ikoyi', dropAddr: '7 Bourdillon Rd', size: 'medium', item: 'Shoes (sample order)', receiverName: 'Femi', receiverPhone: '08020000002', collect: 25000 }, 3 * 3600e3, 'transfer');
    for (const [id, ago] of [[d1, 4 * 3600e3], [d2, 2 * 3600e3]]) {
      db.run("UPDATE orders SET rider_id = ?, status = 'delivered', paid = 1, delivered_at = ?, updated_at = ?, collect_status = CASE WHEN collect_amount > 0 THEN 'collected' ELSE 'none' END, rating = 5 WHERE id = ?", r1, t - ago, t - ago, id);
      db.run('INSERT INTO order_events (order_id, status, text, at) VALUES (?,?,?,?)', id, 'delivered', 'Delivered with the receiver\'s code', t - ago);
    }
    mk({ pickupArea: 'Yaba', pickupAddr: 'Unilag main gate', dropArea: 'Lekki', dropAddr: 'Admiralty Way, Phase 1', size: 'small', item: 'Laptop charger', receiverName: 'Dayo', receiverPhone: '08020000003' }, 20 * 60e3, 'cash_pickup');
    mk({ pickupArea: 'Surulere', pickupAddr: '30 Adeniran Ogunsanya', dropArea: 'Gbagada', dropAddr: 'Phase 2, Gbagada', size: 'large', item: 'Carton of drinks', receiverName: 'Uche', receiverPhone: '08020000004', express: true }, 8 * 60e3, 'cash_delivery');
  });
  return true;
};
