const express = require('express');
const router = express.Router();
const controller = require('../controllers/payment');

router.post('/payments/charge', controller.chargePayment);

module.exports = router;
