const axios = require('axios');
const SERVICES = require('../config/services');

// Historial de trazas del ESB
let esbTraceLogs = [];

// GET /api/esb-logs
const getEsbLogs = (req, res) => {
  res.json(esbTraceLogs);
};

// GET /api/catalog - Enrutamiento + Mediación
const getCatalog = async (req, res) => {
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
};

// GET /api/notifications
const getNotifications = async (req, res) => {
  try {
    const response = await axios.get(`${SERVICES.notification}/notifications`);
    res.json(response.data);
  } catch (error) {
    res.status(502).json({ 
      success: false, 
      message: 'ESB Error: Servicio de Notificaciones no disponible.' 
    });
  }
};

// POST /api/checkout - ORQUESTRACIÓN TRANSACCIONAL (SAGA PATTERN)
const checkout = async (req, res) => {
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

  // --- PASO 1 SAGA: RESERVA EN INVENTARIO ---
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

    // Alerta de stock insuficiente
    try {
      await axios.post(`${SERVICES.notification}/notifications/send`, {
        to: email,
        subject: 'Fallo en tu Compra - Stock Insuficiente',
        body: `Lo sentimos, no pudimos procesar tu compra debido a: ${errorMsg}`
      });
    } catch (err) {
      console.error('[ESB Warning] Falló envío de notificación de error de stock');
    }

    esbTraceLogs.unshift({
      timestamp: new Date().toISOString(),
      event: 'Checkout Fallido (Inventario)',
      traceId,
      steps
    });

    return res.status(400).json({
      success: false,
      message: `Error de Inventario: ${errorMsg}`,
      steps
    });
  }

  // --- PASO 2 SAGA: PROCESAR COBRO ---
  try {
    addStep('Llamada Pagos', 'pending', 'Procesando pago en Servicio de Pagos...');
    
    // Obtener precio unitario para calcular el monto
    const productsRes = await axios.get(`${SERVICES.inventory}/products`);
    const product = productsRes.data.find(p => p.id === productId);
    const amount = product ? product.price * quantity : 0;

    const paymentRes = await axios.post(`${SERVICES.payment}/payments/charge`, {
      amount,
      cardNumber
    });

    transactionId = paymentRes.data.transactionId;
    addStep('Cobro Pago', 'success', `Pago aprobado con éxito. Transacción ID: ${transactionId}`);

    // --- PASO 3 SAGA: ENVIAR EMAIL DE CONFIRMACIÓN ---
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

    esbTraceLogs.unshift({
      timestamp: new Date().toISOString(),
      event: 'Checkout Exitoso',
      traceId,
      steps
    });

    return res.json({
      success: true,
      message: 'Compra completada con éxito.',
      details: { reservationId, transactionId, notificationId },
      steps
    });

  } catch (error) {
    // --- TRANSACCIÓN DE COMPENSACIÓN SAGA (ROLLBACK) ---
    const errorMsg = error.response?.data?.reason || error.message;
    addStep('Cobro Pago', 'failed', `El pago fue declinado: ${errorMsg}`);

    addStep('Compensación Inventario', 'pending', `Liberando stock reservado (Reserva ID: ${reservationId})...`);
    try {
      await axios.post(`${SERVICES.inventory}/inventory/release`, { reservationId });
      addStep('Compensación Inventario', 'success', `Reserva ${reservationId} liberada exitosamente en Inventario.`);
    } catch (compError) {
      addStep('Compensación Inventario', 'failed', `CRÍTICO: No se pudo liberar reserva ${reservationId}: ${compError.message}`);
    }

    // Alerta de pago cancelado
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

    esbTraceLogs.unshift({
      timestamp: new Date().toISOString(),
      event: 'Checkout Fallido (Pago)',
      traceId,
      steps
    });

    return res.status(402).json({
      success: false,
      message: `Error de Pago: ${errorMsg}. Transacción compensada.`,
      steps
    });
  }
};

module.exports = {
  getEsbLogs,
  getCatalog,
  getNotifications,
  checkout
};
