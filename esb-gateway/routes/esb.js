const express = require('express');
const router = express.Router();
const controller = require('../controllers/esb');

router.get('/api/esb-logs', controller.getEsbLogs);
router.get('/api/catalog', controller.getCatalog);
router.get('/api/notifications', controller.getNotifications);
router.post('/api/checkout', controller.checkout);

module.exports = router;
