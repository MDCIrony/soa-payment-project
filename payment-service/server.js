const express = require('express');
const cors = require('cors');
const morgan = require('morgan');

const app = express();
const PORT = process.env.PORT || 3002;

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
    output += `http_requests_total{service="payment-service",${key}} ${count}\n`;
  }
  
  output += '\n# HELP http_request_duration_ms Total request duration in milliseconds\n';
  output += '# TYPE http_request_duration_ms counter\n';
  for (const [key, duration] of Object.entries(requestDurations)) {
    output += `http_request_duration_ms{service="payment-service",${key}} ${duration}\n`;
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
    <title>Payment Service - API Docs</title>
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



// POST /payments/charge - Procesar cobro
app.post('/payments/charge', (req, res) => {
  const { amount, cardNumber } = req.body;

  console.log(`[Payment] Intentando procesar cobro de $${amount} a la tarjeta ${cardNumber}`);

  if (!amount || !cardNumber) {
    return res.status(400).json({ status: 'failed', reason: 'Datos de pago incompletos.' });
  }

  // Regla didáctica para forzar fallos de pago y probar compensación SOA
  // Si el número de tarjeta empieza con '4000', se declina.
  if (cardNumber.startsWith('4000')) {
    console.log('[Payment] Pago rechazado: Fondos insuficientes (Simulación)');
    return res.status(402).json({
      status: 'declined',
      reason: 'Fondos insuficientes (Tarjeta de simulación de fallo)'
    });
  }

  const transactionId = 'tx-' + Math.floor(100000 + Math.random() * 900000);
  console.log(`[Payment] Pago aprobado. Transacción: ${transactionId}`);

  res.json({
    status: 'approved',
    transactionId
  });
});

app.listen(PORT, () => {
  console.log(`[Payment Service] Corriendo en puerto ${PORT}`);
});
