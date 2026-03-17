const express = require('express');
const app = express();
const supabase = require('./services/supabaseClient');
const { requireAuth } = require('./middleware/auth');

app.get('/test_me', requireAuth, (req, res) => {
    res.json(req.user);
});

app.listen(3334, () => console.log('Test server on 3334'));
