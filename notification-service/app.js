const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const path = require('path');
const { metricsCollector, metricsExporter } = require('./middlewares/metrics');
const { setupSwagger } = require('./middlewares/swagger');
const notificationRoutes = require('./routes/notification');

const app = express();

// Middlewares estándar
app.use(cors());
app.use(express.json());
app.use(morgan('dev'));

// Middleware de métricas para Prometheus
app.use(metricsCollector);

// Endpoint de métricas
app.get('/metrics', metricsExporter('notification-service'));

// Configuración de documentación OpenAPI (Swagger)
setupSwagger(app, 'Notification Service - API Docs', path.join(__dirname, 'swagger.json'));

// Rutas de negocio
app.use('/', notificationRoutes);

module.exports = app;
