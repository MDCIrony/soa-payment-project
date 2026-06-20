const express = require('express');
const cors = require('cors');
const morgan = require('morgan');

const app = express();
const PORT = process.env.PORT || 3003;

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
    output += `http_requests_total{service="notification-service",${key}} ${count}\n`;
  }
  
  output += '\n# HELP http_request_duration_ms Total request duration in milliseconds\n';
  output += '# TYPE http_request_duration_ms counter\n';
  for (const [key, duration] of Object.entries(requestDurations)) {
    output += `http_request_duration_ms{service="notification-service",${key}} ${duration}\n`;
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
    <title>Notification Service - API Docs</title>
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



// Lista en memoria de notificaciones enviadas
let sentNotifications = [];

// POST /notifications/send - Enviar notificación
app.post('/notifications/send', (req, res) => {
  const { to, subject, body } = req.body;

  if (!to || !subject || !body) {
    return res.status(400).json({ status: 'failed', reason: 'Datos de notificación incompletos.' });
  }

  const notificationId = 'not-' + Math.floor(100000 + Math.random() * 900000);
  const notification = {
    id: notificationId,
    to,
    subject,
    body,
    timestamp: new Date().toISOString()
  };

  sentNotifications.unshift(notification);
  console.log(`[Notification] Enviado a ${to} | Asunto: ${subject}`);
  console.log(`[Notification] Contenido: "${body}"`);

  res.json({
    status: 'sent',
    notificationId
  });
});

// GET /notifications - Historial (Para fines de visualización en el Cliente)
app.get('/notifications', (req, res) => {
  res.json(sentNotifications);
});

app.listen(PORT, () => {
  console.log(`[Notification Service] Corriendo en puerto ${PORT}`);
});
