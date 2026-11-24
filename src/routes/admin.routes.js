const { Router } = require('express');
const adminController = require('../controllers/admin.controller');
const { requireAuth, requireAdmin } = require('../middleware/auth');

const router = Router();

// Wszystkie trasy /api/admin/* tylko dla zalogowanego administratora
router.use(requireAuth, requireAdmin);

// Rodzaje biletów (cennik)
router.get('/ticket-types', adminController.listTicketTypes);
router.post('/ticket-types', adminController.createTicketType);
router.patch('/ticket-types/:id', adminController.updateTicketType);
router.patch('/ticket-types/:id/status', adminController.setTicketTypeStatus);

// Sprzedaż
router.get('/tickets', adminController.listTickets);
router.get('/stats', adminController.stats);

module.exports = router;
