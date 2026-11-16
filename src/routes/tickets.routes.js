const { Router } = require('express');
const ticketsController = require('../controllers/tickets.controller');
const { requireAuth } = require('../middleware/auth');

const router = Router();

router.post('/purchase', requireAuth, ticketsController.purchase);
router.get('/me', requireAuth, ticketsController.listMine);

module.exports = router;
