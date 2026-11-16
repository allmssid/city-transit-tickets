const { Router } = require('express');

const router = Router();

router.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

router.use('/auth', require('./auth.routes'));
// Tu dopinamy kolejne moduły, np.:
router.use('/ticket-types', require('./ticketTypes.routes'));
router.use('/tickets', require('./tickets.routes'));
// router.use('/admin', require('./admin.routes'));

module.exports = router;
