const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');

router.get('/me', requireAuth, (req, res) => {
    // Si no hay req.user validado por el middleware (no token o token inválido)
    if (!req.user) {
        return res.status(401).json({ error: 'No autorizado' });
    }
    // req.user ya viene enriquecido desde Supabase por nuestro middleware auth.js
    res.json(req.user);
});

module.exports = router;
