const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const ESB_URL = process.env.ESB_URL || 'http://localhost:4000';

app.use(cors());
app.use(express.json());
app.use(morgan('dev'));

// Servir archivos estáticos
app.use(express.static(path.join(__dirname, 'public')));

// Endpoint de configuración para el frontend
app.get('/config', (req, res) => {
  res.json({ esbUrl: ESB_URL });
});

app.listen(PORT, () => {
  console.log(`[Client App] Corriendo en puerto ${PORT}`);
});
