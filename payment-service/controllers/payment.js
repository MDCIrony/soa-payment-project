// POST /payments/charge
const chargePayment = (req, res) => {
  const { amount, cardNumber } = req.body;

  console.log(`[Payment] Intentando procesar cobro de $${amount} a la tarjeta ${cardNumber}`);

  if (!amount || !cardNumber) {
    return res.status(400).json({ status: 'failed', reason: 'Datos de pago incompletos.' });
  }

  // Regla didáctica para forzar fallos de pago y probar compensación SOA
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
};

module.exports = {
  chargePayment
};
