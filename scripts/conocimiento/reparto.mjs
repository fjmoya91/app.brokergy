// Reparto del CLAUDE.md antiguo (un solo fichero de 1,1 MB) en los tres niveles de
// docs/conocimiento/README.md. Lo usa `node scripts/conocimiento.mjs migrar`.
//
// Todo se reparte por TEXTO (título de la sección, número de la regla), nunca por nº de línea:
// el CLAUDE.md sigue cambiando mientras se prepara la migración y la tabla tiene que valer para
// la versión que haya el día que se aplique. Lo que no esté en la tabla PARA la migración.

const B = 'implementation/backend';
const F = 'implementation/frontend/src';

// ── ÁREAS ────────────────────────────────────────────────────────────────────────────────────
// Cada área = una carpeta docs/conocimiento/<área>/ (nivel 3) + .claude/rules/<área>.md (nivel 2),
// que Claude Code carga solo cuando se lee o edita un fichero que case con `paths`.
// `general` no tiene regla: lo que hay que saber siempre está en el CLAUDE.md raíz.
export const AREAS = {
    general: {
        titulo: 'General — estado, despliegue, skills, arquitectura de ficheros y variables de entorno',
        paths: null,
    },
    'transversal-backend': {
        titulo: 'Backend — lo que vale para CUALQUIER ruta o servicio',
        resumen: 'Guardianes de las rutas, Supabase (JSONB, listados, escrituras atómicas) y BD caída.',
        paths: [`${B}/**`],
    },
    'transversal-frontend': {
        titulo: 'Frontend — lo que vale para CUALQUIER pantalla',
        resumen: 'Hooks de React (lo vigila el build), overlays con portal, menú lateral, tema y desplegables.',
        paths: [`${F}/**`, 'implementation/frontend/scripts/**'],
    },
    catastro: {
        titulo: 'Catastro — WAF, endpoints WCF JSON, búsqueda por coordenadas, OCR de la referencia, fachada',
        paths: [
            `${B}/services/catastro*.js`, `${B}/routes/catastro.js`, `${B}/services/neighborService.js`,
            `${F}/**/Catastro*.jsx`, `${F}/utils/{direccionCatastral,traerDireccionCatastral}.js`,
            `${F}/components/ParcelaCard.jsx`,
        ],
    },
    whatsapp: {
        titulo: 'WhatsApp — sesión, entrega (ACK), adjuntos, etiquetas, agenda y bot de clientes',
        paths: [
            `${B}/services/{whatsapp*,bot*}.js`, `${B}/routes/whatsapp.js`,
            `${B}/utils/{adjuntoWhatsapp,nombreContactoCliente}.js`, `${B}/scripts/*{bot,whatsapp}*`,
            `${F}/features/whatsapp/**`, `${F}/components/WhatsappEtiquetas.jsx`,
            `${F}/features/expedientes/components/ChatWhatsappVinculo.jsx`,
        ],
    },
    'claude-automatizacion': {
        titulo: 'Claude y automatización — asistente por WhatsApp, llave de Claude, hooks y scripts de mantenimiento',
        paths: [
            `${B}/scripts/{asistente_*,claude_propuesta}.*`, 'implementation/asistente/**',
            `${B}/services/asistenteCanal.js`, '.claude/hooks/**', 'scripts/{skills,conocimiento}.mjs',
            'scripts/conocimiento/**',
        ],
    },
    oportunidades: {
        titulo: 'Oportunidades — estados, IDs, funnel, nueva simulación, aceptación y alta desde WhatsApp',
        paths: [
            `${B}/routes/{oportunidades,landing}.js`, `${B}/services/leadService.js`,
            `${B}/utils/{estadoOportunidad,altaOportunidad}.js`, `${B}/scripts/alta_oportunidad*.js`,
            `${F}/features/landing/**`, `${F}/features/public/**`, `${F}/features/cee/CeePrevioGate.jsx`,
            `${F}/features/cee/{ceeExtract,ceeAvisos}.js`,
            `${F}/features/expedientes/logic/{fotovoltaica,confirmacionCliente}.js`,
            `${F}/features/calculator/views/**`, `${F}/features/calculator/components/CalculatorForm.jsx`,
        ],
    },
    propuesta: {
        titulo: 'Propuesta — versiones, envío programado, presupuesto estimado/leído, portada, comisión y enlace de aceptación',
        paths: [
            `${B}/services/{propuesta*,leadMessages}.js`, `${B}/routes/pdf.js`,
            `${F}/features/calculator/components/{ProposalModal,ProgramarEnvioPanel,ResultsPanel,SaveOpportunityModal}.jsx`,
            `${F}/features/calculator/logic/{presupuestoEstimado,presupuestoLeido,guardarOportunidad,programarEnvio,comisionPartner,mensajeAceptacion}.js`,
        ],
    },
    calculo: {
        titulo: 'Cálculo y fichas — RES060/080/093, TER100/173, SCOP, C_b, D_ACS, CEE que manda, precio CAE, bloques',
        paths: [
            `${F}/features/calculator/logic/{calculation,xmlCeeParser,xmlCeeV30,coberturaGeneradores,ceeSeed,tipoInmueble}.js`,
            `${F}/features/expedientes/logic/{terciario,demandaAcs,ceeFases,emisores,fichaTer173,demandaPropuesta}.js`,
            `${B}/utils/{fichas,precioCae,scopRedondeo,fincaInputs}.js`,
            `${B}/services/{expedienteFinancialsNode,climateService}.js`, `${B}/services/cee/xmlCeeV30.js`,
            `${F}/features/expedientes/components/InstalacionModule.jsx`,
        ],
    },
    documentos: {
        titulo: 'Documentos oficiales — CIFO, fichas e impresos, Anexo I, Convenio de Cesión, hitos, rechazo y re-firma',
        paths: [
            `${F}/features/expedientes/logic/{cifoDoc,calcCifo,cifoFechas,hitosActuacion,fichasFormulario,anexoIFormulario,fichaRes060Html,fichaRes093Html,fichaTer100Html,fichaTer173,res080Doc,signBoxes,fuentesDoc,requerimientoFirma,fichasTecnicas,cedentes,usePlacaScopAcs}.js`,
            `${F}/features/expedientes/utils/{docGenerators,docContacts}.js`,
            `${F}/features/expedientes/components/{Certificado*,Ficha*,AnexoI*,EnviarAnexos*,Documentacion*,HitosActuacion*,PlacaScopAcs*,CesionManuscrita*,ValidationModal,DocumentoOficial*,FormatoDocumento*,Subvenciones*}.jsx`,
            `${B}/services/{cifoService,formularioOficialService,pdfService,placaScopAcs,aclaracionFechasService,convenioCae,certClienteData}.js`,
            `${B}/utils/{docValidacion,mergeDocumentacion,dniAnexo,instaladorFirmante}.js`,
            `${B}/scripts/check_*.mjs`, `${B}/plantillas/**`,
        ],
    },
    firma: {
        titulo: 'Firma — Autofirma, firma a mano con el móvil, QR, integridad de la firma',
        paths: [
            `${F}/features/firma/**`, `${B}/services/firmaMovil.js`, `${B}/routes/afirmaStorage.js`,
            `${B}/utils/{firmasPdf,dniAnexo}.js`, `${F}/features/expedientes/logic/signBoxes.js`,
            `${F}/features/expedientes/components/FirmarConCertificadoModal.jsx`,
        ],
    },
    'instalador-rite': {
        titulo: 'Instalador y RITE — envío conjunto, re-firma del CIFO, lectura del certificado RITE, memoria y estancias',
        paths: [
            `${B}/services/rite*.js`, `${B}/utils/{riteValidation,instaladorFirmante}.js`,
            `${F}/features/expedientes/logic/{instaladorPendientes,localesRite}.js`,
            `${F}/features/expedientes/components/{EnviarBorradorRite*,LocalesRite*,MemoriaRite*}.jsx`,
            'implementation/rite-generator/**',
        ],
    },
    'placas-catalogos': {
        titulo: 'Placas y catálogos — lectura de placas, nº de serie, aerotermia (EPREL, conjuntos), ventanas, fichas técnicas',
        paths: [
            `${B}/services/{placa*,catalogoFichas,fichaConsolidada,fichaEprelMerge,fichaTecnicaSlot}.js`,
            `${B}/utils/serieDePlaca.js`, `${B}/routes/{aerotermia,ventanas}.js`,
            `${F}/features/expedientes/logic/{acsCatalogo,aerotermiaUnits,aerotermiaOpciones,ventanasCatalogo,fichaConsolidable}.js`,
            `${F}/features/{ventanas,aerotermia}/**`, `${F}/features/calculator/components/LeerPlacaModal.jsx`,
            `${F}/features/expedientes/components/{LeerPlacas*,EprelAcs*,ConsolidarFicha*,InstalacionModule,GuardarEnCatalogo*}.jsx`,
            `${F}/components/SearchableSelect.jsx`, 'skills/alta-aerotermia/**',
        ],
    },
    cee: {
        titulo: 'Módulo CEE — encargo al técnico, subida, revisión, visto bueno, presentación en el Registro, IRPF, Agente IA',
        paths: [
            `${F}/features/cee/**`, `${F}/features/encargo/**`,
            `${F}/features/expedientes/components/{CeeModule,CeeDocumentsGrid,EncargoCertificadorModal,EncargoAgenteIa*,AgenteIa*,TecnicoPicker,RevisionCee*,PreRevisionCee*,BorradorCee*,EncargarPresentacion*,GuiaIrpf*,CeeAnteriorCliente,DemandaPropuesta*,MensajeEditable,ConfirmadoPorCliente,Ce3xAyudas*}.jsx`,
            `${F}/features/expedientes/logic/{irpfEpnr,guiaIrpf,borradorCee}.js`,
            `${B}/services/cee/{revision*,radiografiaCee,cargarRevision,subidaCeePublica}.js`,
            `${B}/services/{ceeUploadService,ceeFirmaService,borradorCeeService,presentacionCeeService,encargoTecnico,agenteIa,registroCeeOcrService,guiaIrpfService,ceeOcrService,revisionPendienteNotifier,certificadorLookup}.js`,
            `${B}/utils/{ceeFechas,materialCee,objetivoEncargo,combustibleCaldera}.js`,
            `${B}/routes/{guiaIrpfRutas,presentacionCeeRutas,ceeOcr}.js`,
            `${B}/scripts/{revisar_cee,agente_ia,probar_pre_revision}*.js`,
        ],
    },
    'envolvente-ce3x': {
        titulo: 'Envolvente y CE3X — plano, motor, .cex inicial/final, medidas de mejora, croquis, 2.3/3.1, PVGIS, skills CEE',
        paths: [
            'implementation/cee-engine/**', `${F}/features/cee-envolvente/**`,
            `${B}/services/{ceeEnvolventeCex,paredFotoService,paredOcrService,croquisMovil,pvgisService,videoEnvolventeService}.js`,
            `${B}/services/cee/{cexAPdf,croquisCee,ceeFinalDesdeMedida,previstoRes080,revisionPlano}.js`,
            `${B}/routes/{ceeEnvolvente,pvgis}.js`, `${B}/scripts/{cee_inicial,cee_final,cex_a_pdf}*`,
            `${B}/utils/{videoEnvolvente,loDibujadoAMano,streetView}.js`,
            `${F}/features/expedientes/logic/{ce3xFinal,ce3xTextos,produccionFv}.js`,
            `${F}/features/expedientes/components/ProduccionFotovoltaica.jsx`,
            `${F}/utils/{construcciones,numeroDecimal}.js`, `${F}/components/CampoDecimal.jsx`,
            'skills/{generar-cee-inicial,generar-cee-final}/**',
        ],
    },
    'cee-directos': {
        titulo: 'CEE directos — el segundo negocio: alta, encargo, entrega, oferta y factura',
        paths: [
            `${F}/features/cee-directo/**`, `${B}/routes/ceeDirectos.js`,
            `${B}/services/{ceeDirecto*,ceeOferta*,ceeFactura*,facturaSheetService}.js`,
            `${B}/utils/ceeDirectoEstados.js`, `${B}/scripts/*cee_directo*`,
        ],
    },
    lotes: {
        titulo: 'Lotes y Sujeto Obligado — verificación, OCR de sus PDF, anexos MITECO, paquete ZIP, firmados, peticiones, factura',
        paths: [
            `${F}/features/lotes/**`, `${B}/routes/lotes.js`,
            `${B}/services/{lote*,anexoActuacionService,solicitudCaeService,envioGestorService,firmadosSo,tarifasVerificacion,facturaContabilidad,marwenService}.js`,
            `${B}/utils/{zipStore,codigosCae,consultaLotes,ceeEcoFields}.js`,
        ],
    },
    seguimiento: {
        titulo: 'Seguimiento — parte diario, radar de bloques, enlaces de acción y envío en bloque',
        paths: [
            `${F}/features/seguimiento/**`, `${B}/routes/{seguimiento,acciones}.js`,
            `${B}/services/{seguimiento*,recordatorios,revisionPendienteNotifier}.js`,
            `${B}/utils/{accionToken,materialCee}.js`,
        ],
    },
    clientes: {
        titulo: 'Clientes y partners — fichas, propietarios y cedentes, contactos comercial/técnico, cobro y venta cruzada',
        paths: [
            `${F}/features/{clientes,cobro}/**`, `${F}/features/admin/views/{PrescriptoresList,PrescriptorDetailModal}.jsx`,
            `${B}/routes/{clientes,prescriptores}.js`,
            `${B}/services/{notifyContacts,cobroService,clientesRelaciones,whatsappClientesSync}.js`,
            `${B}/utils/{normalization,justificanteBancario}.js`,
            `${F}/features/expedientes/utils/docContacts.js`, `${F}/features/expedientes/components/ContactoPickRow.jsx`,
            `${F}/utils/{tiposEmpresa,contactoCliente}.js`, `${F}/features/expedientes/logic/cedentes.js`,
        ],
    },
    expedientes: {
        titulo: 'Expedientes — ciclo de vida, listado y columnas, rechazo, carpetas de Drive por estado',
        paths: [
            `${F}/features/expedientes/views/**`,
            `${F}/features/expedientes/logic/{expedientesColumnas,rechazoExpediente,rangoFecha,expedienteTaxonomia}.js*`,
            `${F}/features/expedientes/components/{ColumnasPicker,TablaExpedientesHead,RechazoExpediente*,EstadoRechazado}.jsx`,
            `${B}/services/{driveFolders,expedienteFolderSync,expedienteService}.js`,
            `${B}/utils/expedienteEstados.js`, `${B}/scripts/expedientes_*`,
        ],
    },
    'documentacion-fotos': {
        titulo: 'Documentación y fotos — DocsManager, alcance, subida en tanda, buzón, ventanas, fotos del WhatsApp, Anexo Fotográfico',
        paths: [
            `${F}/features/docs/**`,
            `${B}/services/{reformaUploadService,docsAlcance,uploadNotifier,clasificarFotosService,whatsappMedia,portalService,anexoFotografico*}.js`,
            `${F}/features/calculator/components/DocsAdminModal.jsx`,
            `${F}/features/expedientes/components/AnexoFotografico*.jsx`, `${B}/routes/portal.js`,
        ],
    },
    facturas: {
        titulo: 'Facturas — OCR e incidencias de las facturas de obra, PDF único, facturación del certificador',
        paths: [
            `${B}/services/{facturaOcrService,facturaIncidencias,facturaAutoOcr,facturasCombineService,certificadorFacturacion}.js`,
            `${B}/routes/facturaOcr.js`, `${B}/utils/agruparFacturas.js`,
            `${F}/features/admin/**/*{Facturacion,facturaCertificador}*`,
            `${F}/features/expedientes/components/DocumentacionModule.jsx`, // el modal FACTURAS DE LA OBRA vive aquí
        ],
    },
    infra: {
        titulo: 'Infraestructura — Gemini (nivel de pago), lectores con IA, Drive, email y servidor',
        paths: [
            `${B}/services/*Ocr*.js`, `${B}/services/{googleService,driveService,emailService}.js`,
            `${B}/server.js`, 'docker-compose*.yml', 'scripts/deploy.sh',
        ],
    },
};

// ── SECCIONES «## » → área ───────────────────────────────────────────────────────────────────
// Se casa por el PRINCIPIO del título (sin las almohadillas). Una sección que no case con
// ninguna PARA la migración: hay que decidir a qué área va.
export const SECCIONES = [
    ['Estado Actual del Proyecto', 'general'],
    ['⚠️ Regla de oro de desarrollo', 'general'],
    ['⚠️ Skills: UNA sola fuente', 'general'],
    ['Módulo Lifecycle de Expedientes', 'expedientes'],
    ['Módulo Documentación Fotográfica', 'documentacion-fotos'],
    ['Ficha TER100', 'calculo'],
    ['Ficha TER173', 'calculo'],
    ['Precio CAE al cliente', 'calculo'],
    ['Carpetas de Drive por estado', 'expedientes'],
    ['Facturación del certificador', 'facturas'],
    ['Parte diario de seguimiento', 'seguimiento'],
    ['Nueva simulación con CEE inicial y final', 'oportunidades'],
    ['Ahorro RES080 — método SIMPLIFICADO', 'calculo'],
    ['Convenio de Cesión — se firma ANTES', 'documentos'],
    ['Facturas de la obra — OCR', 'facturas'],
    ['El CIFO en PDF', 'documentos'],
    ['HITOS DE LA ACTUACIÓN', 'documentos'],
    ['El módulo CEE del expediente, en el MÓVIL', 'cee'],
    ['CEE directos — el segundo negocio', 'cee-directos'],
    ['Versiones de la PROPUESTA', 'propuesta'],
    ['PROGRAMAR el envío de una propuesta', 'propuesta'],
    ['Alta de OPORTUNIDAD desde WhatsApp', 'oportunidades'],
    ['El AGENTE IA, un certificador más', 'cee'],
    ['El ASISTENTE de Fran por WhatsApp', 'claude-automatizacion'],
    ['Bot de WhatsApp', 'whatsapp'],
    ['La API de Gemini va en NIVEL DE PAGO', 'infra'],
    ['El menú lateral', 'transversal-frontend'],
    ['Al instalador se le pide TODO de una vez', 'instalador-rite'],
    ['El Certificado RITE se LEE al subirlo', 'instalador-rite'],
    ['La FECHA DE REGISTRO del CEE', 'cee'],
    ['La PLACA de la caldera se lee con IA', 'placas-catalogos'],
    ['Las TRES placas de la obra', 'placas-catalogos'],
    ['El Nº DE SERIE de una placa', 'placas-catalogos'],
    ['Quién EJECUTA la obra y quién FIRMA', 'documentos'],
    ['Deducción del IRPF', 'cee'],
    ['La GUÍA de la deducción del IRPF', 'cee'],
    ['Las cifras del lote se LEEN', 'lotes'],
    ['El ANEXO del MITECO por actuación', 'lotes'],
    ['El PAQUETE de cada actuación', 'lotes'],
    ['El ZIP que se sube a beCAE', 'lotes'],
    ['Pedirle cosas al SUJETO OBLIGADO', 'lotes'],
    ['Presupuesto ESTIMADO', 'propuesta'],
    ['La D_ACS por LITROS/DÍA', 'calculo'],
    ['El CEE que MANDA', 'calculo'],
    ['Un REQUERIMIENTO vuelve a pedir la firma', 'documentos'],
    ['La firma A MANO se hace CON EL MÓVIL', 'firma'],
    ['DESHACER en la envolvente', 'envolvente-ce3x'],
    ['¿Tienes placas solares?', 'oportunidades'],
    ['Al ACEPTAR, el cliente confirma', 'oportunidades'],
    ['Confirmación de cobro', 'clientes'],
    ['El CATÁLOGO DE VENTANAS', 'placas-catalogos'],
    ['La ficha del catálogo cuando son VARIOS papeles', 'placas-catalogos'],
    ['La cartera de instaladores, etiquetada sola', 'whatsapp'],
    ['Un mensaje con el RELOJ no está enviado', 'whatsapp'],
    ['Las FICHAS y el ANEXO I se RELLENAN', 'documentos'],
    ['Al encargar el CEE, el CLIENTE también se entera', 'cee'],
    ['El aviso lo recibe el COMERCIAL o el TÉCNICO', 'clientes'],
    ['BLOQUES de viviendas', 'calculo'],
    ['El COSTE DEL INFORME DE VERIFICACIÓN', 'calculo'],
    ['Las TARIFAS del verificador', 'lotes'],
    ['El mismo vecino volviendo al funnel', 'oportunidades'],
    ['El plano de la envolvente', 'envolvente-ce3x'],
    ['El `.cex` de la envolvente', 'envolvente-ce3x'],
    ['La medida de mejora de una HIBRIDACIÓN', 'envolvente-ce3x'],
    ['Qué PLANTAS se miden', 'envolvente-ce3x'],
    ['El ACS que hace OTRA máquina', 'envolvente-ce3x'],
    ['Los administrativos se CORRIGEN', 'envolvente-ce3x'],
    ['Un certificador FIRMA como persona', 'envolvente-ce3x'],
    ['Lo que el CERTIFICADOR no tiene que ver', 'envolvente-ce3x'],
    ['Un CONJUNTO resuelve el ACS solo', 'placas-catalogos'],
    ['PRESENTAR el CEE en el Registro', 'cee'],
    ['Una vivienda puede tener DOS propietarios', 'clientes'],
    ['El listado de expedientes: las columnas', 'expedientes'],
    ['La FOTO REAL de cada cerramiento', 'envolvente-ce3x'],
    ['Autofirma no falla igual', 'firma'],
    ['Lo que el FLAG esconde', 'documentos'],
    ['La envolvente vale también para los CEE DIRECTOS', 'envolvente-ce3x'],
    ['Los PUENTES TÉRMICOS se miran', 'envolvente-ce3x'],
    ['Una EDIFICACIÓN entera se quita', 'envolvente-ce3x'],
    ['Un GARAJE dentro de la casa', 'envolvente-ce3x'],
    ['La PLACA de la unidad exterior, dentro del certificado', 'documentos'],
    ['El botón que metía su propio EVENTO', 'envolvente-ce3x'],
    ['Una firma que se VE no siempre CUBRE', 'firma'],
    ['Lo que se REFORMA en la envolvente', 'envolvente-ce3x'],
    ['Quién FIRMA por el SUJETO OBLIGADO', 'lotes'],
    ['El gestor de FOTOGRAFÍAS', 'documentacion-fotos'],
    ['REVISAR el CEE que entrega el certificador', 'cee'],
    ['La envolvente en TERCIARIO', 'envolvente-ce3x'],
    ['GENERAR el CEE inicial desde las fotos', 'envolvente-ce3x'],
    ['La PÁGINA DEL ENCARGO del técnico', 'cee'],
    ['CE3X 2.3 y 3.1', 'envolvente-ce3x'],
    ['AUTOCONSUMO con PVGIS', 'envolvente-ce3x'],
    ['Reglas Críticas — No Romper', 'general'], // solo la cabecera: las reglas van por número
    ['Arquitectura de Ficheros Clave', 'general'],
    ['Patrón de Modales (Clientes y Prescriptores)', 'clientes'],
    ['Módulo Prescriptores — Novedades', 'clientes'],
    ['Variables de Entorno Requeridas', 'general'],
    ['Documentación Adicional', 'general'],
];

// ── SUBSECCIONES «### » que van a OTRA área que su sección ───────────────────────────────────
// Por el principio del título; cada entrada tiene que casar con UNA sola subsección.
// Son trozos que, con los meses, quedaron escritos debajo de la sección que no era.
export const SUBSECCIONES = [
    ['Módulos implementados y estables', 'general'],
    ['Módulo Documentos — Novedades', 'documentos'],
    ['Módulo WhatsApp — Novedades', 'whatsapp'],
    ['Módulo Catastro — Cambios profundos', 'catastro'],
    ['Aviso de CEE entregados y sin revisar', 'seguimiento'],
    ['Etiquetas de WhatsApp desde la app', 'whatsapp'],
    ['Lo que WhatsApp rompió', 'whatsapp'],
    ['Lo que llega con el backend PARADO', 'whatsapp'],
    ['Coste medido (2026-08-25)', 'whatsapp'],
    ['Escalado', 'whatsapp'],
    ['Cómo se prueba SIN gastar mensajes', 'whatsapp'],
    ['Rutas y esquema', 'whatsapp'],
    ['La PLACA la lee también el CERTIFICADOR', 'placas-catalogos'],
    ['Y si se está en el ORDENADOR, la firma se pasa al MÓVIL', 'firma'],
    ['Y llega al CEE: la pestaña, el encargo y la envolvente', 'envolvente-ce3x'],
    ['El Anexo Fotográfico de un RES080 ve la ENVOLVENTE', 'documentacion-fotos'],
    ['Y con el plano por fin traído, la ventana se caía entera', 'transversal-frontend'],
    ['Para el CERTIFICADO o para el EXPEDIENTE', 'documentacion-fotos'],
    ['El bloque del parte: sin las fotos, no hay certificado', 'documentacion-fotos'],
    ['El botón «Fotos» del expediente abre', 'documentacion-fotos'],
    ['El buzón, medido', 'documentacion-fotos'],
    ['Medio minuto de espera no puede ser una pantalla quieta', 'documentacion-fotos'],
    ['Y el desplegable se leía BLANCO SOBRE BLANCO', 'transversal-frontend'],
];

// ── REGLAS NUMERADAS → área ──────────────────────────────────────────────────────────────────
// [número, área] o [número, área, principio del texto en negrita] cuando el número está repetido
// (42, 43, 92 y 103 existen dos veces en el original y así se conservan).
export const REGLAS = [
    ['1', 'expedientes'], ['2', 'oportunidades'], ['3', 'oportunidades'], ['3.b', 'calculo'],
    ['4', 'documentos'], ['5', 'propuesta'], ['6', 'transversal-backend'], ['7', 'documentos'],
    ['8', 'calculo'], ['8.b', 'calculo'], ['8.c', 'documentos'], ['8.d', 'calculo'], ['8.e', 'calculo'],
    ['8.f', 'calculo'], ['9', 'clientes'], ['10', 'clientes'], ['11', 'cee'],
    ['12', 'documentos'], ['12.b', 'documentos'], ['12.c', 'placas-catalogos'], ['12.d', 'calculo'],
    ['12.e', 'documentos'], ['12.f', 'calculo'],
    ['13', 'whatsapp'], ['14', 'whatsapp'], ['15', 'catastro'], ['16', 'catastro'], ['17', 'catastro'],
    ['18', 'documentacion-fotos'], ['19', 'documentacion-fotos'], ['20', 'documentacion-fotos'],
    ['21', 'transversal-backend'], ['22', 'transversal-backend'], ['22.b', 'firma'],
    ['23', 'documentos'], ['24', 'documentos'], ['25', 'propuesta'], ['25.b', 'documentos'],
    ['26', 'whatsapp'], ['26.b', 'documentos'],
    ['27', 'instalador-rite'], ['27.b', 'instalador-rite'], ['27.c', 'cee'], ['27.d', 'placas-catalogos'],
    ['27.e', 'placas-catalogos'], ['27.f', 'placas-catalogos'],
    ['28', 'lotes'], ['29', 'lotes'], ['29.b', 'transversal-frontend'], ['29.c', 'lotes'],
    ['29.d', 'transversal-frontend'], ['30', 'lotes'], ['31', 'propuesta'], ['32', 'calculo'],
    ['33', 'documentos'], ['34', 'firma'], ['35', 'oportunidades'], ['36', 'clientes'],
    ['37', 'placas-catalogos'], ['37.b', 'placas-catalogos'], ['38', 'transversal-backend'],
    ['39', 'whatsapp'], ['39.b', 'whatsapp'], ['40', 'lotes'], ['41', 'documentos'],
    ['42', 'cee', 'Al encargar el CEE'], ['42', 'calculo', 'TER173 es la TER100'], ['42.b', 'calculo'],
    ['43', 'calculo', 'El precio CAE al cliente'], ['43', 'whatsapp', 'La cartera de INSTALADORES'],
    ['44', 'clientes'], ['44.b', 'propuesta'], ['45', 'calculo'], ['46', 'calculo'], ['47', 'oportunidades'],
    ['48', 'envolvente-ce3x'], ['48.b', 'envolvente-ce3x'], ['48.c', 'envolvente-ce3x'],
    ['48.d', 'envolvente-ce3x'], ['48.e', 'envolvente-ce3x'], ['48.f', 'envolvente-ce3x'],
    ['48.g', 'envolvente-ce3x'], ['48.h', 'envolvente-ce3x'], ['48.i', 'envolvente-ce3x'],
    ['48.j', 'envolvente-ce3x'], ['48.k', 'envolvente-ce3x'],
    ['49', 'placas-catalogos'], ['50', 'envolvente-ce3x'], ['51', 'lotes'], ['52', 'cee'],
    ['53', 'expedientes'], ['54', 'envolvente-ce3x'], ['55', 'firma'], ['56', 'documentos'],
    ['57', 'placas-catalogos'], ['58', 'placas-catalogos'], ['58.b', 'placas-catalogos'],
    ['59', 'clientes'], ['60', 'documentos'], ['61', 'envolvente-ce3x'], ['62', 'transversal-frontend'],
    ['63', 'firma'], ['64', 'envolvente-ce3x'], ['65', 'propuesta'], ['66', 'envolvente-ce3x'],
    ['67', 'lotes'], ['68', 'documentacion-fotos'], ['68.b', 'documentacion-fotos'],
    ['68.c', 'documentacion-fotos'], ['69', 'cee'], ['70', 'envolvente-ce3x'], ['71', 'placas-catalogos'],
    ['72', 'envolvente-ce3x'], ['73', 'clientes'], ['74', 'instalador-rite'], ['75', 'envolvente-ce3x'],
    ['76', 'expedientes'], ['77', 'envolvente-ce3x'], ['78', 'envolvente-ce3x'], ['79', 'envolvente-ce3x'],
    ['80', 'cee'], ['81', 'propuesta'], ['82', 'oportunidades'], ['83', 'envolvente-ce3x'],
    ['84', 'oportunidades'], ['85', 'propuesta'], ['86', 'envolvente-ce3x'], ['87', 'envolvente-ce3x'],
    ['88', 'envolvente-ce3x'], ['89', 'envolvente-ce3x'], ['90', 'cee'], ['91', 'envolvente-ce3x'],
    ['92', 'envolvente-ce3x', 'El CEE FINAL de un RES060/RES093'], ['92', 'cee', 'El técnico tiene UNA página'],
    ['93', 'documentos'], ['94', 'whatsapp'], ['95', 'envolvente-ce3x'], ['96', 'envolvente-ce3x'],
    ['97', 'cee'], ['98', 'cee'], ['99', 'oportunidades'], ['100', 'propuesta'], ['101', 'cee'],
    ['102', 'transversal-backend'], ['103', 'lotes', 'El CERTIFICADO CAE emitido'],
    ['103', 'claude-automatizacion', 'La LLAVE DE CLAUDE'], ['104', 'lotes'],
    ['105', 'envolvente-ce3x'], ['106', 'envolvente-ce3x'], ['107', 'cee'], ['108', 'envolvente-ce3x'],
    ['109', 'envolvente-ce3x'], ['110', 'envolvente-ce3x'], ['111', 'calculo'], ['112', 'envolvente-ce3x'],
    ['113', 'claude-automatizacion'], ['114', 'documentos'], ['115', 'envolvente-ce3x'], ['116', 'cee'],
    ['117', 'envolvente-ce3x'], ['118', 'placas-catalogos'], ['119', 'envolvente-ce3x'],
    ['120', 'placas-catalogos'],
];

// Secciones que se parten en un documento por subsección «###» si pasan de este tamaño:
// leer 55 KB para consultar un detalle es justo lo que se quiere evitar.
export const PARTIR_DESDE_BYTES = 16 * 1024;
