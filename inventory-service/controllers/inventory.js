// Base de datos en memoria
let products = [
  { id: 'P1', name: 'Laptop Pro 15"', price: 1200.00, stock: 5 },
  { id: 'P2', name: 'Smartphone AMOLED', price: 600.00, stock: 10 },
  { id: 'P3', name: 'Auriculares Noise Cancelling', price: 150.00, stock: 15 }
];

let reservations = {};

// GET /products
const getProducts = (req, res) => {
  res.json(products);
};

// POST /inventory/reserve
const reserveStock = (req, res) => {
  const { productId, quantity } = req.body;
  const qty = parseInt(quantity);

  if (!productId || isNaN(qty) || qty <= 0) {
    return res.status(400).json({ status: 'failed', message: 'Datos de reserva inválidos.' });
  }

  const product = products.find(p => p.id === productId);
  if (!product) {
    return res.status(404).json({ status: 'failed', message: 'Producto no encontrado.' });
  }

  if (product.stock < qty) {
    return res.status(400).json({ 
      status: 'failed', 
      message: `Stock insuficiente. Disponible: ${product.stock}, Solicitado: ${qty}` 
    });
  }

  // Reservar stock
  product.stock -= qty;
  const reservationId = 'res-' + Math.random().toString(36).substr(2, 9);
  reservations[reservationId] = { productId, quantity: qty };

  console.log(`[Inventory] Stock reservado: ${qty} de ${product.name} (Reserva ID: ${reservationId})`);
  
  res.json({
    status: 'reserved',
    reservationId
  });
};

// POST /inventory/release
const releaseStock = (req, res) => {
  const { reservationId } = req.body;

  if (!reservationId || !reservations[reservationId]) {
    return res.status(404).json({ status: 'failed', message: 'Reserva no encontrada.' });
  }

  const reservation = reservations[reservationId];
  const product = products.find(p => p.id === reservation.productId);

  if (product) {
    product.stock += reservation.quantity;
    console.log(`[Inventory] Stock liberado para ${product.name}: +${reservation.quantity}`);
  }

  delete reservations[reservationId];

  res.json({
    status: 'released',
    reservationId
  });
};

module.exports = {
  getProducts,
  reserveStock,
  releaseStock
};
