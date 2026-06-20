const express = require('express');
const cors = require('cors');
const morgan = require('morgan');

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());
app.use(morgan('dev'));

// --- METRICAS PROMETHEUS SIN DEPENDENCIAS ---
const requestCounts = {};
const requestDurations = {};

app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    const method = req.method;
    const route = req.route ? req.route.path : req.path;
    const status = res.statusCode;
    
    // Omitir endpoint de métricas para no inflar los contadores
    if (route === '/metrics') return;

    const key = `method="${method}",route="${route}",status="${status}"`;
    requestCounts[key] = (requestCounts[key] || 0) + 1;
    requestDurations[key] = (requestDurations[key] || 0) + duration;
  });
  next();
});

app.get('/metrics', (req, res) => {
  let output = '';
  output += '# HELP http_requests_total Total number of HTTP requests\n';
  output += '# TYPE http_requests_total counter\n';
  for (const [key, count] of Object.entries(requestCounts)) {
    output += `http_requests_total{service="inventory-service",${key}} ${count}\n`;
  }
  
  output += '\n# HELP http_request_duration_ms Total request duration in milliseconds\n';
  output += '# TYPE http_request_duration_ms counter\n';
  for (const [key, duration] of Object.entries(requestDurations)) {
    output += `http_request_duration_ms{service="inventory-service",${key}} ${duration}\n`;
  }
  
  res.set('Content-Type', 'text/plain; version=0.0.4; charset=utf-8');
  res.end(output);
});

// --- SWAGGER UI VIA CDN ---
const path = require('path');

app.get('/swagger.json', (req, res) => {
  res.sendFile(path.join(__dirname, 'swagger.json'));
});

app.get('/docs', (req, res) => {
  const html = `
  <!DOCTYPE html>
  <html lang="en">
  <head>
    <meta charset="UTF-8">
    <title>Inventory Service - API Docs</title>
    <link rel="stylesheet" type="text/css" href="https://unpkg.com/swagger-ui-dist@5.9.0/swagger-ui.css" />
    <style>
      html { box-sizing: border-box; overflow-y: scroll; }
      *, *:before, *:after { box-sizing: inherit; }
      body { margin:0; background: #fafafa; }
    </style>
  </head>
  <body>
    <div id="swagger-ui"></div>
    <script src="https://unpkg.com/swagger-ui-dist@5.9.0/swagger-ui-bundle.js" charset="UTF-8"></script>
    <script src="https://unpkg.com/swagger-ui-dist@5.9.0/swagger-ui-standalone-preset.js" charset="UTF-8"></script>
    <script>
      window.onload = function() {
        window.ui = SwaggerUIBundle({
          url: "/swagger.json",
          dom_id: '#swagger-ui',
          deepLinking: true,
          presets: [
            SwaggerUIBundle.presets.apis,
            SwaggerUIStandalonePreset
          ],
          layout: "BaseLayout"
        });
      };
    </script>
  </body>
  </html>`;
  res.send(html);
});

// Base de datos en memoria para propósitos didácticos
let products = [
  { id: 'P1', name: 'Laptop Pro 15"', price: 1200.00, stock: 5 },
  { id: 'P2', name: 'Smartphone AMOLED', price: 600.00, stock: 10 },
  { id: 'P3', name: 'Auriculares Noise Cancelling', price: 150.00, stock: 15 }
];

let reservations = {};

// GET /products - Obtener catálogo
app.get('/products', (req, res) => {
  res.json(products);
});

// POST /inventory/reserve - Reservar stock
app.post('/inventory/reserve', (req, res) => {
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
});

// POST /inventory/release - Liberar reserva (Compensación)
app.post('/inventory/release', (req, res) => {
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
});

app.listen(PORT, () => {
  console.log(`[Inventory Service] Corriendo en puerto ${PORT}`);
});
