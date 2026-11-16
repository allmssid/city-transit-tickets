const { Router } = require('express');
const ticketTypesController = require('../controllers/ticketTypes.controller');

const router = Router();

router.get('/', ticketTypesController.list);
router.get('/:id', ticketTypesController.getById);

module.exports = router;
