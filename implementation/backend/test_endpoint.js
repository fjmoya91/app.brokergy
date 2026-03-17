const express = require('express');
const app = express();
const supabase = require('./services/supabaseClient');

app.get('/test', async (req, res) => {
    // mock user
    const id_usuario = '71ec2c50-c735-4b95-8064-3ee96be4235f';
    const { data: isPrescriptor, error: presErr } = await supabase
        .from('prescriptores')
        .select('id_empresa, razon_social, logo_empresa')
        .eq('representante_legal_id', id_usuario)
        .maybeSingle();
        
    res.json({ presErr, isPrescriptor: isPrescriptor ? { ...isPrescriptor, logo_empresa_length: isPrescriptor.logo_empresa?.length } : null });
});

app.listen(3333, () => console.log('Test server on 3333'));
