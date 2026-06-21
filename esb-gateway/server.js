const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const axios = require('axios');

const app = express();
const PORT = process.env.PORT || 4000;

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
    if (route === '/metrics' || route === '/api/esb-logs') return;

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
    output += `http_requests_total{service="esb-gateway",${key}} ${count}\n`;
  }
  
  output += '\n# HELP http_request_duration_ms Total request duration in milliseconds\n';
  output += '# TYPE http_request_duration_ms counter\n';
  for (const [key, duration] of Object.entries(requestDurations)) {
    output += `http_request_duration_ms{service="esb-gateway",${key}} ${duration}\n`;
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
    <title>ESB Gateway - API Docs</title>
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



// --- SERVICE REGISTRY (Registro de Servicios en el ESB) ---
// El ESB abstrae las direcciones reales de los servicios (Transparencia de localización)
const SERVICES = {
  inventory: process.env.INVENTORY_SERVICE_URL || 'http://localhost:3001',
  payment: process.env.PAYMENT_SERVICE_URL || 'http://localhost:3002',
  notification: process.env.NOTIFICATION_SERVICE_URL || 'http://localhost:3003'
};

// Historial de trazas de integración del ESB para fines didácticos
let esbTraceLogs = [];

// Ruta para obtener logs del bus
app.get('/api/esb-logs', (req, res) => {
  res.json(esbTraceLogs);
});

// GET /api/catalog - Enrutamiento del catálogo con mediación de datos
app.get('/api/catalog', async (req, res) => {
  const logEntry = {
    timestamp: new Date().toISOString(),
    event: 'Mediación Catálogo',
    details: 'Solicitud de catálogo recibida de cliente. Enrutando a Servicio de Inventario.'
  };
  esbTraceLogs.unshift(logEntry);

  try {
    const response = await axios.get(`${SERVICES.inventory}/products`);
    res.json(response.data);
  } catch (error) {
    console.error('[ESB Error] No se pudo conectar con el Servicio de Inventario:', error.message);
    res.status(502).json({ 
      success: false, 
      message: 'ESB Error: Servicio de Inventario no disponible.' 
    });
  }
});

// GET /api/notifications - Enrutamiento de notificaciones (Passthrough)
app.get('/api/notifications', async (req, res) => {
  try {
    const response = await axios.get(`${SERVICES.notification}/notifications`);
    res.json(response.data);
  } catch (error) {
    res.status(502).json({ 
      success: false, 
      message: 'ESB Error: Servicio de Notificaciones no disponible.' 
    });
  }
});

// POST /api/checkout - ORQUESTRACIÓN TRANSACCIONAL (Saga Pattern)
app.post('/api/checkout', async (req, res) => {
  const { productId, quantity, email, cardNumber } = req.body;
  const traceId = 'trace-' + Math.floor(100000 + Math.random() * 900000);
  const steps = [];

  const addStep = (name, status, details) => {
    steps.push({ name, status, details, time: new Date().toLocaleTimeString() });
    console.log(`[ESB Orchestration] [${traceId}] ${name} -> ${status} (${details})`);
  };

  addStep('Inicio Checkout', 'success', `Iniciando checkout para producto ${productId}, cantidad: ${quantity}`);

  let reservationId = null;
  let transactionId = null;
  let notificationId = null;

  // 1. LLAMADA AL CONTRATO 1: RESERVA DE INVENTARIO
  try {
    addStep('Llamada Inventario', 'pending', 'Reservando stock en Servicio de Inventario...');
    const inventoryRes = await axios.post(`${SERVICES.inventory}/inventory/reserve`, {
      productId,
      quantity
    });

    reservationId = inventoryRes.data.reservationId;
    addStep('Reserva Inventario', 'success', `Stock reservado con éxito. Reserva ID: ${reservationId}`);
  } catch (error) {
    const errorMsg = error.response?.data?.message || error.message;
    addStep('Reserva Inventario', 'failed', `Fallo al reservar stock: ${errorMsg}`);

    // Notificación de Fallo de Stock
    try {
      await axios.post(`${SERVICES.notification}/notifications/send`, {
        to: email,
        subject: 'Fallo en tu Compra - Stock Insuficiente',
        body: `Lo sentimos, no pudimos procesar tu compra debido a: ${errorMsg}`
      });
    } catch (err) {
      console.error('[ESB Warning] Falló envío de notificación de error de stock');
    }

    const logEntry = {
      timestamp: new Date().toISOString(),
      event: 'Checkout Fallido (Inventario)',
      traceId,
      steps
    };
    esbTraceLogs.unshift(logEntry);

    return res.status(400).json({
      success: false,
      message: `Error de Inventario: ${errorMsg}`,
      steps
    });
  }

  // 2. LLAMADA AL CONTRATO 2: PROCESAMIENTO DE PAGO
  try {
    addStep('Llamada Pagos', 'pending', 'Procesando pago en Servicio de Pagos...');
    // Simulamos calcular el total de la compra obteniendo el producto
    const productsRes = await axios.get(`${SERVICES.inventory}/products`);
    const product = productsRes.data.find(p => p.id === productId);
    const amount = product ? product.price * quantity : 0;

    const paymentRes = await axios.post(`${SERVICES.payment}/payments/charge`, {
      amount,
      cardNumber
    });

    transactionId = paymentRes.data.transactionId;
    addStep('Cobro Pago', 'success', `Pago aprobado con éxito. Transacción ID: ${transactionId}`);

    // 3. LLAMADA AL CONTRATO 3: ENVÍO DE NOTIFICACIÓN DE ÉXITO
    try {
      addStep('Llamada Notificación', 'pending', 'Enviando confirmación de compra...');
      const notifRes = await axios.post(`${SERVICES.notification}/notifications/send`, {
        to: email,
        subject: 'Confirmación de Compra - Éxito',
        body: `¡Gracias por tu compra! Tu transacción ${transactionId} fue procesada por $${amount}. Reserva asociada: ${reservationId}.`
      });
      notificationId = notifRes.data.notificationId;
      addStep('Envío Notificación', 'success', `Confirmación de email enviada. Notificación ID: ${notificationId}`);
    } catch (err) {
      addStep('Envío Notificación', 'warning', `Servicio de Notificación falló: ${err.message}. La orden se completó igualmente.`);
    }

    const logEntry = {
      timestamp: new Date().toISOString(),
      event: 'Checkout Exitoso',
      traceId,
      steps
    };
    esbTraceLogs.unshift(logEntry);

    return res.json({
      success: true,
      message: 'Compra completada con éxito.',
      details: { reservationId, transactionId, notificationId },
      steps
    });

  } catch (error) {
    // EL PAGO FALLÓ - ACTIVAR COMPENSACIÓN (SAGA ROLLBACK)
    const errorMsg = error.response?.data?.reason || error.message;
    addStep('Cobro Pago', 'failed', `El pago fue declinado: ${errorMsg}`);

    // --- TRANSACCIÓN DE COMPENSACIÓN ---
    addStep('Compensación Inventario', 'pending', `Liberando stock reservado (Reserva ID: ${reservationId})...`);
    try {
      await axios.post(`${SERVICES.inventory}/inventory/release`, { reservationId });
      addStep('Compensación Inventario', 'success', `Reserva ${reservationId} liberada exitosamente en Inventario.`);
    } catch (compError) {
      addStep('Compensación Inventario', 'failed', `CRÍTICO: No se pudo liberar reserva ${reservationId}: ${compError.message}`);
    }

    // Notificación de Fallo de Pago
    try {
      addStep('Llamada Notificación', 'pending', 'Enviando email de alerta de pago...');
      const notifRes = await axios.post(`${SERVICES.notification}/notifications/send`, {
        to: email,
        subject: 'Fallo en tu Pago - Compra Cancelada',
        body: `Tu pago fue rechazado por: ${errorMsg}. Se ha cancelado la orden y liberado el stock.`
      });
      notificationId = notifRes.data.notificationId;
      addStep('Envío Notificación', 'success', `Alerta de email enviada. Notificación ID: ${notificationId}`);
    } catch (err) {
      addStep('Envío Notificación', 'warning', `Servicio de Notificación falló al alertar: ${err.message}`);
    }

    const logEntry = {
      timestamp: new Date().toISOString(),
      event: 'Checkout Fallido (Pago)',
      traceId,
      steps
    };
    esbTraceLogs.unshift(logEntry);

    return res.status(402).json({
      success: false,
      message: `Error de Pago: ${errorMsg}. Transacción compensada.`,
      steps
    });
  }
});

app.listen(PORT, () => {
  console.log(`[ESB Gateway] Corriendo en puerto ${PORT}`);
});
