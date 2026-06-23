const express = require('express');
const router = express.Router();
const controller = require('../controllers/inventory');

router.get('/products', controller.getProducts);
router.post('/inventory/reserve', controller.reserveStock);
router.post('/inventory/release', controller.releaseStock);

module.exports = router;
