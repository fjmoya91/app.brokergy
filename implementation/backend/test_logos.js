const supabase = require('./services/supabaseClient'); 

async function run() { 
  const {data} = await supabase.from('prescriptores').select('*'); 
  const {data: u} = await supabase.from('usuarios').select('*'); 
  console.log(data.map(d => ({ razon_social: d.razon_social, representante: d.representante_legal_id, id_empresa: d.id_empresa }))); 
  console.log(u.map(us => ({ nombre: us.nombre, id_usuario: us.id_usuario, email: us.email, rol: us.id_rol })));
} 

run();
