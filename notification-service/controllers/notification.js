// Lista en memoria de notificaciones enviadas
let sentNotifications = [];

// POST /notifications/send
const sendNotification = (req, res) => {
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
};

// GET /notifications
const getNotifications = (req, res) => {
  res.json(sentNotifications);
};

module.exports = {
  sendNotification,
  getNotifications
};
