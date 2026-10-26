// ─── pdfjsCarga — pdf.js listo para el visor (se importa al abrir el visor) ──
// El trabajador, con import ESTÁTICO de `?url`, como FirmarConCertificadoModal: con
// `import('…?url')` dinámico, Vite en desarrollo sirve el fichero tal cual y
// `default` llega vacío («Invalid `workerSrc` type»).
// `pdfjs-dist/web/pdf_viewer.mjs` lee pdf.js de `globalThis.pdfjsLib` al cargarse:
// se deja puesto aquí, antes de que VisorPdf lo importe.
import * as pdfjs from 'pdfjs-dist';
import trabajador from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

pdfjs.GlobalWorkerOptions.workerSrc = trabajador;
globalThis.pdfjsLib = pdfjs;

export { pdfjs };
