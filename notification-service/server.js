const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const path = require('path');
const { metricsCollector, metricsExporter } = require('./middlewares/metrics');
const notificationRoutes = require('./routes/notification');

const app = express();
const PORT = process.env.PORT || 3003;

// Middlewares estándar
app.use(cors());
app.use(express.json());
app.use(morgan('dev'));

// Middleware de métricas para Prometheus
app.use(metricsCollector);

// Endpoint de métricas
app.get('/metrics', metricsExporter('notification-service'));

// Endpoint de Swagger Docs
app.get('/swagger.json', (req, res) => {
  res.sendFile(path.join(__dirname, 'swagger.json'));
});

app.get('/docs', (req, res) => {
  res.send(getSwaggerHtml('Notification Service - API Docs', '/swagger.json'));
});

// Rutas de negocio
app.use('/', notificationRoutes);

// Servidor
app.listen(PORT, () => {
  console.log(`[Notification Service] Corriendo en puerto ${PORT}`);
});

// Helper para inyectar Swagger UI por CDN
function getSwaggerHtml(title, swaggerUrl) {
  return `
  <!DOCTYPE html>
  <html lang="en">
  <head>
    <meta charset="UTF-8">
    <title>${title}</title>
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
          url: "${swaggerUrl}",
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
}
