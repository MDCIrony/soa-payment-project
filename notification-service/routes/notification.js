const express = require('express');
const router = express.Router();
const controller = require('../controllers/notification');

router.post('/notifications/send', controller.sendNotification);
router.get('/notifications', controller.getNotifications);

module.exports = router;
