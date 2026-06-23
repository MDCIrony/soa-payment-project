const SERVICES = {
  inventory: process.env.INVENTORY_SERVICE_URL || 'http://localhost:3001',
  payment: process.env.PAYMENT_SERVICE_URL || 'http://localhost:3002',
  notification: process.env.NOTIFICATION_SERVICE_URL || 'http://localhost:3003'
};

module.exports = SERVICES;
