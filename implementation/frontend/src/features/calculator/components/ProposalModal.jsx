import React, { useRef, useState, useEffect, useLayoutEffect, useCallback, useMemo } from 'react';
import axios from 'axios';
import { useModal } from '../../../context/ModalContext';
import { useAuth } from '../../../context/AuthContext';
import AppConfirm from '../../../components/AppConfirm';
import { EnviarPropuestaModal } from './EnviarPropuestaModal';
import { computeCeeComparison } from '../logic/ceeComparison';
import { postEmail } from '../../../utils/emailFallback';

const APP_URL = import.meta.env.VITE_APP_URL || window.location.origin;

// Logo circular de Brokergy del co-branding de la portada — el mismo que usan el
// resto de documentos generados (res080Doc.js, CertificadoRes080Modal.jsx).
const BROKERGY_LOGO_PATH = '/logo-brokergy-circular.png';

const baseCss = `
        .prop-wrapper {
            transform-origin: top center;
            /* Se aplicará scale mediante style inline */
        }

        .prop-wrapper-inner {
            --orange: #FF6D00;
            --orange-dark: #E65100;
            --orange-light: #FFF8ED;
            --green: #00C853;
            --green-dark: #008135;
            --green-light: #EDF7ED;
            --dark: #08090C;
            --dark-mid: #13151A;
            --g800: #171717;
            --g700: #262626;
            --g600: #404040;
            --g500: #737373;
            --g400: #A3A3A3;
            --g300: #D4D4D4;
            --g200: #E5E5E5;
            --g100: #F5F5F5;
            --g50: #FAFAFA;
            --white: #FFFFFF;
            --red: #EF4444;
            --red-light: #FEF2F2;
            --yellow: #FFA000;
            --yellow-light: #FFFBEB;

            font-family: 'Inter', ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, "Noto Sans", sans-serif;
            color: var(--g700);
            background: #DEE1E6;
            -webkit-font-smoothing: antialiased;
            line-height: 1.55;
            text-align: left;
            width: 794px; /* Ancho fijo A4 a 96 DPI */
            margin: 0 auto;
        }

        .prop-wrapper-inner * {
            box-sizing: border-box;
        }

        .prop-page {
            width: 794px; /* Cambiado de 210mm a px para escalado preciso */
            height: 1123px; /* Cambiado de 297mm a px */
            margin: 0 auto;
            background: var(--white);
            color: var(--g700);
            position: relative;
            overflow: hidden;
            page-break-after: always;
            break-after: page;
            box-shadow: 0 4px 40px rgba(0,0,0,0.1);
            margin-bottom: 24px;
        }

        .prop-page:first-child { margin-top: 24px; }
        .prop-page:last-child { page-break-after: avoid; break-after: avoid; }
        /* Caja de contenido de cada página. 48px = margen del diseño original. */
        .prop-pb { padding: 0 48px; }

        /* ── Huecos elásticos de la portada ─────────────────────────────────
           La portada es una hoja A4 de altura FIJA con contenido muy variable.
           Estos son los espacios que se estiran o encogen para que el contenido
           llene la hoja exactamente (ver ajustarPortada): son MÁRGENES, así que
           al tocarlos no cambia la altura intrínseca de nada y la cuenta sale
           clavada a la primera medición. El valor de aquí es el de reposo. */
        .prop-page {
            --e-top: 20px;
            --e-h1sub: 7px;
            --e-cobrand: 12px;
            --e-kpis: 16px;
            --e-meta: 10px;
            --e-sec: 12px;
            --e-nsm: 10px;
            --e-row: 13px;
            --e-cta: 13px;
        }

        /* ── Barra superior negra ───────────────────────────────────────────── */
        .prop-bar { background: var(--dark); padding: 16px 48px; display: flex; justify-content: space-between; align-items: center; }
        .prop-bar-slim { padding: 14px 48px; }
        .prop-bar-logo { font-size: 19px; font-weight: 900; color: var(--white); letter-spacing: 3px; line-height: 1; }
        .prop-bar-slim .prop-bar-logo { font-size: 16px; letter-spacing: 2.6px; }
        .prop-bar-logo span { color: var(--orange); }
        .prop-bar-tag { color: rgba(255,255,255,0.45); font-size: 8px; letter-spacing: 2.6px; text-transform: uppercase; font-weight: 700; margin-top: 5px; }
        .prop-bar-meta { text-align: right; color: rgba(255,255,255,0.5); font-size: 9.5px; line-height: 1.6; }
        .prop-bar-num { color: var(--orange); font-weight: 800; letter-spacing: 1.4px; text-transform: uppercase; }
        .prop-bar-page { color: rgba(255,255,255,0.42); font-size: 8.5px; letter-spacing: 2px; text-transform: uppercase; font-weight: 700; }

        /* ── Portada ────────────────────────────────────────────────────────── */
        .prop-eyebrow { font-size: 8.5px; font-weight: 800; letter-spacing: 2.4px; text-transform: uppercase; color: var(--orange-dark); }
        .prop-h1 { margin: 6px 0 0; padding: 0; font-size: 25px; font-weight: 800; color: var(--dark); letter-spacing: -0.7px; line-height: 1.22; }
        .prop-h1 em { font-style: normal; color: var(--orange); }
        .prop-h1sub { color: var(--g500); font-size: 11px; margin-top: var(--e-h1sub); }
        /* Bloque del desglose económico, separado de la ficha de datos. */
        .prop-sec { margin-top: var(--e-sec); }

        /* Co-branding con el instalador/prescriptor. El chip es blanco porque no
           controlamos lo que sube el partner (PNG transparente, logo oscuro, logo
           con fondo propio). El nombre se escribe SIEMPRE: hay instaladores sin
           logo subido y el chip vacío no decía con quién se colabora. */
        .prop-cobrand { margin-top: var(--e-cobrand); border: 1px solid var(--g200); border-radius: 12px; padding: 11px 18px; display: flex; align-items: center; gap: 22px; background: var(--g50); }
        /* A la misma altura que el chip del instalador: la tarjeta no crece. */
        .prop-cobrand-logo { width: 92px; height: 92px; flex: none; }
        .prop-cobrand-logo img { width: 100%; height: 100%; object-fit: contain; display: block; }
        .prop-cobrand-x { font-size: 20px; color: var(--g300); font-weight: 300; }
        /* Sin recuadro blanco: el logo del partner va suelto sobre la tarjeta. */
        .prop-cochip { width: 168px; height: 92px; flex: none; display: flex; align-items: center; justify-content: center; }
        .prop-cochip img { max-width: 168px; max-height: 92px; object-fit: contain; display: block; }
        .prop-cobrand-txt { flex: 1; min-width: 0; }
        .prop-cobrand-name { font-size: 17px; font-weight: 800; color: var(--dark); line-height: 1.2; letter-spacing: -0.2px; text-transform: uppercase; }
        .prop-cobrand-sub { font-size: 10.5px; color: var(--g500); margin-top: 4px; line-height: 1.5; }
        /* Sin instalador asociado la tarjeta no se queda coja: capta uno. */
        .prop-cobrand-cta { flex: 1; min-width: 0; }
        .prop-cobrand-cta .t { font-size: 13px; font-weight: 800; color: var(--dark); letter-spacing: -0.2px; margin: 0 0 4px; }
        .prop-cobrand-cta .d { font-size: 10px; color: var(--g600); line-height: 1.55; margin: 0; }
        .prop-cobrand-cta .d + .d { margin-top: 4px; }
        .prop-cobrand-cta .d b { color: var(--dark); font-weight: 800; }
        .prop-cobrand-cta a { color: var(--orange-dark); font-weight: 700; text-decoration: none; }

        /* Trío de indicadores: ayuda total · % cubierto · inversión neta */
        .prop-kpis { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 12px; margin-top: var(--e-kpis); }
        .prop-kpi { border: 1px solid var(--g200); border-top: 4px solid var(--g300); border-radius: 10px; padding: 12px; }
        .prop-kpi.ky { border-top-color: var(--yellow); }
        .prop-kpi.kg { border-top-color: var(--green); display: flex; align-items: center; gap: 14px; }
        .prop-kpi.ko { border-top-color: var(--orange); background: var(--dark); }
        .prop-kpi.ki { border-top-color: var(--green); background: var(--green-light); }
        /* Sin coste de obra el trío se queda en una o dos tarjetas. */
        .prop-kpis.k1 { grid-template-columns: 1fr; }
        .prop-kpis.k2 { grid-template-columns: 1fr 1fr; }
        .prop-kpi-v.hip { color: var(--green-dark); font-size: 26px; }
        .prop-kpi-l { font-size: 8px; font-weight: 800; letter-spacing: 1.8px; text-transform: uppercase; color: var(--g400); }
        .prop-kpi.ko .prop-kpi-l { color: rgba(255,255,255,0.45); }
        .prop-kpi-v { font-size: 32px; font-weight: 900; color: var(--dark); letter-spacing: -1.2px; margin-top: 6px; white-space: nowrap; }
        .prop-kpi.ko .prop-kpi-v { color: var(--orange); }
        .prop-compact .prop-kpi-v { font-size: 28px; }
        .prop-kpi-n { font-size: 9.5px; color: var(--g500); margin-top: 2px; }
        .prop-kpi.ko .prop-kpi-n { color: rgba(255,255,255,0.45); }
        .prop-kpi-pl { font-size: 10.5px; color: var(--g600); line-height: 1.4; margin-top: 3px; }
        .prop-donut { width: 66px; height: 66px; flex: none; border-radius: 50%; display: flex; align-items: center; justify-content: center; }
        .prop-donut-in { width: 48px; height: 48px; border-radius: 50%; background: var(--white); display: flex; align-items: center; justify-content: center; font-size: 14px; font-weight: 900; color: var(--green-dark); }

        /* Cabecera de datos: cliente · referencia catastral · dirección */
        .prop-meta { display: grid; grid-template-columns: 1fr 1.4fr 2.4fr; gap: 18px; margin-top: var(--e-meta); padding: 8px 0; border-top: 1px solid var(--g200); border-bottom: 1px solid var(--g200); }
        .prop-meta-l { font-size: 7px; text-transform: uppercase; letter-spacing: 1.4px; color: var(--g400); font-weight: 800; }
        .prop-meta-v { font-weight: 700; font-size: 11.5px; color: var(--dark); line-height: 1.3; overflow-wrap: break-word; }

        /* ── Secciones numeradas ────────────────────────────────────────────── */
        .prop-stag { display: inline-flex; align-items: center; gap: 7px; margin-bottom: 6px; }
        .prop-sn { width: 18px; height: 18px; background: var(--orange); color: var(--white); border-radius: 50%; display: inline-flex; align-items: center; justify-content: center; font-size: 9px; font-weight: 800; line-height: 1; flex: none; }
        .prop-st { font-size: 8.5px; text-transform: uppercase; letter-spacing: 2px; font-weight: 800; color: var(--orange-dark); }
        .prop-stitle { font-size: 18px; color: var(--dark); font-weight: 800; letter-spacing: -0.3px; line-height: 1.25; }
        .prop-compact .prop-stag { margin-bottom: 4px; }
        .prop-compact .prop-stitle { font-size: 16px; }
        .prop-sintro { color: var(--g500); font-size: 11px; margin: 5px 0 10px; line-height: 1.6; padding: 0; }
        .prop-compact .prop-sintro { font-size: 10.5px; margin: 4px 0 8px; line-height: 1.5; }

        /* ── Tabla de desglose económico ────────────────────────────────────── */
        .prop-ftable { border-radius: 10px; overflow: hidden; border: 1px solid var(--g200); }
        .prop-ftable-title {
            font-size: 9.5px; font-weight: 900; color: var(--dark); text-transform: uppercase;
            letter-spacing: 0.8px; margin-bottom: 8px; padding-left: 2px; display: flex; align-items: center; gap: 6px; min-height: 28px; line-height: 1.2;
        }
        .prop-ftable-title i { width: 12px; height: 12px; border-radius: 3px; display: inline-block; }
        .prop-fgrid { display: flex; gap: 16px; align-items: flex-start; }
        .prop-fcol { flex: 1; min-width: 0; }
        .prop-fth { background: var(--g100); padding: 8px 20px; display: flex; justify-content: space-between; }
        .prop-fth span { color: var(--g500); font-weight: 800; font-size: 9px; text-transform: uppercase; letter-spacing: 1.5px; }
        .prop-ftr { display: flex; justify-content: space-between; align-items: center; gap: 14px; padding: var(--e-row) 20px; border-bottom: 1px solid var(--g100); }
        .prop-ftr:last-child { border-bottom: none; }
        .prop-ftr .prop-fl { font-size: 12.5px; color: var(--g700); }
        .prop-ftr .prop-fl small { color: var(--g400); font-size: 10.5px; }
        .prop-ftr .prop-fv { font-weight: 800; font-size: 15px; text-align: right; white-space: nowrap; }
        .prop-ftr .prop-fv.grn { color: var(--green-dark); }
        .prop-compact .prop-ftr .prop-fl { font-size: 11.5px; }
        .prop-compact .prop-ftr .prop-fv { font-size: 14px; }
        /* Resumen dentro de la tabla. Solo se usa en la comparativa a dos columnas:
           en la propuesta de una sola opción esos tres datos van en el trío de KPIs. */
        .prop-ftaids { background: var(--yellow-light); padding: 10px 20px; display: flex; justify-content: space-between; align-items: center; gap: 10px; border-top: 1px solid var(--g200); }
        .prop-ftaids .prop-fl { font-weight: 800; font-size: 9.5px; text-transform: uppercase; letter-spacing: 0.8px; color: var(--g800); }
        .prop-ftaids .prop-fv { font-weight: 900; font-size: 18px; color: var(--g800); white-space: nowrap; }
        .prop-ftpct { background: var(--green-light); padding: 9px 20px; display: flex; justify-content: space-between; align-items: center; gap: 10px; }
        .prop-ftpct .prop-fl { font-weight: 800; font-size: 9.5px; text-transform: uppercase; letter-spacing: 0.5px; color: var(--green-dark); }
        .prop-ftpct .prop-fv { font-weight: 900; font-size: 16px; color: var(--green-dark); white-space: nowrap; }
        .prop-ftfin { background: var(--dark); padding: 12px 20px; display: flex; justify-content: space-between; align-items: center; gap: 10px; }
        .prop-ftfin .prop-fl { color: var(--white); font-weight: 800; font-size: 11px; text-transform: uppercase; letter-spacing: 0.8px; }
        .prop-ftfin .prop-fv { color: var(--orange); font-weight: 900; font-size: 22px; white-space: nowrap; }

        /* Hipótesis de la deducción cuando no se muestra el coste de la obra. */
        .prop-hip { margin-top: 10px; border: 1px solid var(--g200); border-top: 4px solid var(--green); border-radius: 10px; padding: 12px 16px; background: var(--green-light); }
        .prop-hip h4 { margin: 0 0 5px; padding: 0; font-size: 11px; font-weight: 800; color: var(--dark); letter-spacing: -0.1px; }
        .prop-hip p { margin: 0; padding: 0; font-size: 10px; color: var(--g600); line-height: 1.55; }
        .prop-hip p + p { margin-top: 5px; }
        .prop-hip strong { color: var(--dark); }
        .prop-nsm { margin-top: var(--e-nsm); display: flex; flex-direction: column; gap: 2px; }
        .prop-nsm p { font-size: 9.5px; color: var(--g400); line-height: 1.5; margin: 0; }
        .prop-compact .prop-nsm p { font-size: 8.5px; line-height: 1.4; }
        .prop-nsm p b { color: var(--g600); }
        .prop-avl { text-align: center; font-size: 8.5px; text-transform: uppercase; letter-spacing: 1px; font-weight: 700; color: var(--g400); margin-top: 7px; padding-top: 7px; border-top: 1px solid var(--g200); }
        .prop-compact .prop-avl { margin-top: 5px; padding-top: 5px; font-size: 8px; }

        /* ── Llamada a la acción (pie de portada y de condiciones) ──────────── */
        .prop-cta { background: linear-gradient(145deg, var(--dark) 0%, var(--dark-mid) 100%); padding: var(--e-cta) 48px; text-align: center; position: absolute; bottom: 0; left: 0; right: 0; }
        .prop-cta h3 { color: var(--white); font-size: 15px; font-weight: 800; margin: 0; padding: 0; }
        .prop-csub { color: rgba(255,255,255,0.45); font-size: 10.5px; margin: 2px 0 9px; padding: 0; }
        .prop-cta-btn { display: inline-flex; align-items: center; gap: 12px; background: var(--orange); color: var(--white); font-weight: 800; font-size: 14px; padding: 11px 18px 11px 26px; border-radius: 50px; text-decoration: none; line-height: 1; box-shadow: 0 6px 18px rgba(255,109,0,0.35); border-bottom: 3px solid var(--orange-dark); }
        .prop-cta-arrow { width: 26px; height: 26px; border-radius: 50%; background: var(--white); color: var(--orange); display: inline-flex; align-items: center; justify-content: center; font-size: 14px; font-weight: 900; line-height: 1; }
        .prop-cfn { color: rgba(255,255,255,0.45); font-size: 8.5px; margin: 8px 0 0; line-height: 1.5; }
        .prop-cfn strong { color: var(--white); }
        .prop-cfn-url { color: var(--orange); text-decoration: underline; }
        .prop-cfn-min { color: rgba(255,255,255,0.25); font-size: 8px; }

        .prop-mfoot { position: absolute; bottom: 0; left: 0; right: 0; padding: 7px 48px; display: flex; justify-content: space-between; font-size: 8px; color: var(--g400); border-top: 1px solid var(--g200); background: var(--white); }
        .prop-mfoot a { color: var(--orange-dark); text-decoration: none; font-weight: 600; }

        /* ── Bloques explicativos ───────────────────────────────────────────── */
        .prop-ebox { border: 1px solid var(--g200); border-top: 4px solid var(--g300); border-radius: 10px; padding: 11px 16px; margin-bottom: 8px; background: var(--white); }
        .prop-ebox.dk { border-top-color: var(--dark); }
        .prop-ebox.ora { border-top-color: var(--orange); background: var(--orange-light); }
        .prop-ebox.grn { border-top-color: var(--green); background: var(--green-light); }
        .prop-ebox h4 { margin: 0 0 5px; padding: 0; font-size: 10.5px; font-weight: 800; color: var(--dark); text-transform: uppercase; letter-spacing: 0.4px; }
        .prop-ebox p { margin: 0; padding: 0; font-size: 10px; color: var(--g600); line-height: 1.5; }
        .prop-ebox p + p { margin-top: 5px; }

        .prop-agrid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin-top: 9px; }
        .prop-ac { border: 1px solid var(--g200); border-top: 3px solid var(--g300); border-radius: 10px; padding: 10px 8px; text-align: center; }
        .prop-ac.grn { border-top-color: var(--green); }
        .prop-ac.ora { border-top-color: var(--orange); }
        .prop-ai { font-size: 20px; line-height: 1.2; }
        .prop-at { font-size: 9.5px; font-weight: 800; color: var(--dark); margin-top: 3px; }
        .prop-as { font-size: 8.5px; color: var(--g500); line-height: 1.35; margin-top: 2px; }
        .prop-sdiv { height: 1px; background: var(--g200); margin: 11px 0; }

        /* IRPF: requisitos a la izquierda, ejemplo de prorrateo a la derecha */
        .prop-irpf { display: grid; grid-template-columns: 1.55fr 1fr; gap: 12px; align-items: start; }
        .prop-ibox-wrap { border: 1px solid var(--g200); border-radius: 10px; padding: 11px; }
        .prop-ibox-title { font-size: 9.5px; font-weight: 800; color: var(--dark); margin: 0 0 8px; text-transform: uppercase; letter-spacing: 0.4px; }
        .prop-irow { display: flex; flex-direction: column; gap: 9px; }
        .prop-ibox { display: flex; justify-content: space-between; align-items: center; background: var(--green-light); border-radius: 7px; padding: 8px 12px; }
        .prop-iy { font-size: 10px; color: var(--g600); font-weight: 600; }
        .prop-ia { font-size: 16px; font-weight: 800; color: var(--green-dark); white-space: nowrap; }
        .prop-inote { font-size: 8.5px; color: var(--g400); font-style: italic; margin: 7px 0 0; line-height: 1.4; }

        /* Proceso en 7 pasos */
        .prop-srow { display: grid; grid-template-columns: repeat(7, 1fr); gap: 6px; margin-top: 9px; }
        .prop-ps { border: 1px solid var(--g200); border-radius: 9px; padding: 8px 5px; text-align: center; }
        .prop-pn { width: 24px; height: 24px; border-radius: 50%; background: var(--orange); color: var(--white); font-weight: 800; font-size: 9.5px; display: inline-flex; align-items: center; justify-content: center; margin-bottom: 5px; line-height: 1; }
        .prop-ps:nth-child(even) .prop-pn { background: var(--green); }
        .prop-pt { font-size: 8px; font-weight: 800; color: var(--dark); text-transform: uppercase; }
        .prop-pd { font-size: 7.5px; color: var(--g500); line-height: 1.3; margin-top: 1px; }

        /* ── Checklist de documentación ─────────────────────────────────────── */
        .prop-dcols { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; align-items: start; }
        .prop-dcol { border: 1px solid var(--g200); border-top: 4px solid var(--orange); border-radius: 10px; padding: 20px; }
        .prop-dcol.gr { border-top-color: var(--green); }
        .prop-dph { font-size: 12px; font-weight: 800; color: var(--dark); text-transform: uppercase; letter-spacing: 0.6px; }
        .prop-dintro { font-size: 10px; color: var(--g500); margin: 8px 0 0; line-height: 1.55; }
        .prop-dgt { font-size: 9.5px; font-weight: 800; color: var(--g600); text-transform: uppercase; letter-spacing: 0.4px; margin: 16px 0 8px; }
        .prop-dl { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 9px; }
        .prop-dl li { font-size: 11px; color: var(--g700); padding: 0 0 0 17px; position: relative; line-height: 1.5; }
        .prop-dl li::before { content: ''; position: absolute; left: 0; top: 3px; width: 10px; height: 10px; border: 1.5px solid var(--g300); border-radius: 2px; }
        .prop-dl li.s { padding-left: 32px; font-size: 10px; color: var(--g600); }
        .prop-dl li.s::before { left: 15px; width: 7px; height: 7px; border-radius: 50%; top: 4px; }
        .prop-dsend { background: var(--green-light); border: 1px solid rgba(0,200,83,0.16); border-radius: 8px; padding: 16px 18px; margin-top: 24px; }
        .prop-dsend p { margin: 0; padding: 0; }
        .prop-dsend .t { font-size: 9.5px; font-weight: 800; color: var(--green-dark); margin-bottom: 3px; }
        .prop-dsend .d { font-size: 9.5px; color: var(--g600); line-height: 1.5; }
        .prop-dsend-btn { display: inline-flex; align-items: center; gap: 9px; margin-top: 10px; background: var(--green-dark); color: var(--white); font-weight: 800; font-size: 10.5px; padding: 8px 12px 8px 16px; border-radius: 50px; text-decoration: none; line-height: 1; letter-spacing: 0.3px; }
        .prop-dsend-btn span.a { width: 18px; height: 18px; border-radius: 50%; background: var(--white); color: var(--green-dark); display: inline-flex; align-items: center; justify-content: center; font-size: 11px; font-weight: 900; line-height: 1; }

        .prop-tipbar { background: var(--yellow-light); border: 1px solid var(--g200); border-top: 4px solid var(--yellow); border-radius: 10px; padding: 18px 20px; margin-top: 26px; }
        .prop-tipbar h5 { margin: 0 0 4px; padding: 0; font-size: 9.5px; font-weight: 800; color: var(--g800); text-transform: uppercase; letter-spacing: 0.4px; }
        .prop-tipbar p { margin: 0; padding: 0; font-size: 9.5px; color: var(--g600); line-height: 1.55; }
        .prop-upsell { border: 1px solid var(--g200); border-top: 4px solid var(--orange); border-radius: 10px; padding: 20px 22px; margin-top: 16px; display: flex; gap: 18px; align-items: center; background: var(--orange-light); }
        .prop-upsell .ico { font-size: 32px; flex-shrink: 0; }
        .prop-upsell .t { font-size: 10.5px; font-weight: 800; color: var(--dark); margin: 0 0 3px; }
        .prop-upsell .d { font-size: 10px; color: var(--g600); line-height: 1.55; margin: 0; }

        /* ── Cláusulas ──────────────────────────────────────────────────────── */
        .prop-cl-box { border: 1px solid var(--g200); border-top: 4px solid var(--g300); border-radius: 10px; padding: 11px 16px; margin-bottom: 8px; background: var(--white); }
        .prop-cl-box.ora { border-top-color: var(--orange); }
        .prop-cl-box.grn { border-top-color: var(--green); }
        .prop-cl-box.red { border-top-color: var(--red); }
        .prop-cl-box h4 { margin: 0 0 3px; padding: 0; font-size: 9.5px; font-weight: 800; color: var(--dark); text-transform: uppercase; letter-spacing: 0.4px; }
        .prop-cl-box.red h4 { color: var(--red); }
        .prop-cl-box p { margin: 0; padding: 0; font-size: 10.5px; color: var(--g600); line-height: 1.55; }
        .prop-cl2 { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
        .prop-cgrid { margin-top: 10px; border: 1px solid var(--g200); border-radius: 8px; overflow: hidden; }
        .prop-crow { display: flex; justify-content: space-between; gap: 16px; padding: 6px 14px; font-size: 10.5px; border-bottom: 1px solid var(--g100); }
        .prop-crow:last-child { border-bottom: none; }
        .prop-crow strong { white-space: nowrap; }
        .prop-crow.ctot { background: var(--g100); font-weight: 700; padding: 7px 14px; font-size: 11px; }
        .prop-crow.ctot span:last-child { white-space: nowrap; }
        .prop-crow em { font-style: normal; color: var(--green-dark); font-weight: 700; }
        .prop-crow s { color: var(--g400); font-weight: 400; }
        .prop-cnet { background: var(--green-light); border: 1px solid rgba(0,200,83,0.25); border-radius: 8px; display: flex; justify-content: space-between; align-items: center; gap: 10px; padding: 9px 14px; margin-top: 7px; }
        .prop-cnet-l { font-size: 11px; font-weight: 800; color: var(--green-dark); }
        .prop-cnet-v { font-size: 17px; font-weight: 900; color: var(--green-dark); white-space: nowrap; }
        /* Comparativa: los dos netos en paralelo. Uno debajo del otro se comía
           los 24px de holgura que tiene esta página y desbordaba sobre el pie. */
        .prop-cnet2 { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-top: 7px; }
        .prop-cnet2 .prop-cnet { margin-top: 0; flex-direction: column; align-items: flex-start; gap: 1px; padding: 7px 12px; }
        .prop-cnet2 .prop-cnet-l { font-size: 9.5px; }
        .prop-cnet2 .prop-cnet-v { font-size: 15px; }
        .prop-cnote { margin: 5px 0 0; font-size: 9px; color: var(--g500); font-style: italic; }
        .prop-ptable { background: var(--red-light); border: 1px solid rgba(239,68,68,0.14); border-radius: 8px; overflow: hidden; margin-top: 10px; }
        .prop-pthead { background: rgba(239,68,68,0.06); padding: 7px 14px; font-size: 8.5px; font-weight: 800; color: var(--red); text-transform: uppercase; letter-spacing: 0.5px; }
        .prop-ptrow { display: flex; justify-content: space-between; gap: 16px; padding: 6px 14px; font-size: 10.5px; border-bottom: 1px dashed rgba(239,68,68,0.12); }
        .prop-ptrow:last-child { border-bottom: none; }
        .prop-pl { color: var(--g600); }
        .prop-pv { font-weight: 700; color: var(--red); white-space: nowrap; }
        .prop-ptrow.ptt { border-top: 1.5px solid rgba(239,68,68,0.18); border-bottom: none; padding: 7px 14px; font-weight: 700; }
        .prop-ptrow.ptt .prop-pv { font-weight: 800; font-size: 12px; }

        /* ── Portada compacta ───────────────────────────────────────────────
           La portada es una página de altura FIJA cuyo contenido varía mucho:
           fotovoltaica, ITP, impuestos del CAE, un propietario o cuatro, la
           comparativa de CEE, las dos columnas de la comparativa de reforma y
           la tabla de ahorro anual. Cuando el contenido no cabe se aplica esta
           variante (ver el ajuste de la portada), que aprieta el interlineado sin tocar
           la jerarquía ni recortar información. */
        /* Último recurso, solo si estirar/encoger los huecos no basta: baja el
           reposo de cada hueco y aprieta tipografías. Hace falta para la
           comparativa a dos columnas con ahorro anual, que se pasa >200px. */
        .prop-compact {
            --e-top: 16px;
            --e-h1sub: 5px;
            --e-cobrand: 8px;
            --e-kpis: 10px;
            --e-meta: 8px;
            --e-sec: 9px;
            --e-nsm: 6px;
            --e-row: 8px;
            --e-cta: 10px;
        }
        .prop-compact .prop-h1 { font-size: 21px; }
        .prop-compact .prop-h1sub { font-size: 10px; }
        .prop-compact .prop-cobrand { padding: 7px 16px; gap: 16px; }
        .prop-compact .prop-avl { margin-top: 4px; padding-top: 4px; }
        .prop-compact .prop-cobrand-logo { width: 72px; height: 72px; }
        .prop-compact .prop-cobrand-cta .t { font-size: 11.5px; margin-bottom: 3px; }
        .prop-compact .prop-cobrand-cta .d { font-size: 9px; line-height: 1.45; }
        .prop-compact .prop-cobrand-cta .d + .d { margin-top: 3px; }
        .prop-compact .prop-cochip { width: 132px; height: 72px; }
        .prop-compact .prop-cochip img { max-width: 120px; max-height: 60px; }
        .prop-compact .prop-cobrand-name { font-size: 15px; }
        .prop-compact .prop-cobrand-sub { font-size: 9.5px; margin-top: 2px; }
        .prop-compact .prop-kpis { gap: 10px; }
        .prop-compact .prop-kpi { padding: 9px 10px; }
        .prop-compact .prop-kpi-v { font-size: 26px; margin-top: 4px; }
        .prop-compact .prop-donut { width: 56px; height: 56px; }
        .prop-compact .prop-donut-in { width: 40px; height: 40px; font-size: 12px; }
        .prop-compact .prop-meta { padding: 6px 0; }
        .prop-compact .prop-ftable-title { min-height: 20px; margin-bottom: 6px; }
        .prop-compact .prop-fth { padding: 7px 18px; }
        .prop-compact .prop-ftaids, .prop-compact .prop-ftpct { padding: 7px 18px; }
        .prop-compact .prop-ftfin { padding: 9px 18px; }
        .prop-compact .prop-ftaids .prop-fv { font-size: 16px; }
        .prop-compact .prop-ftpct .prop-fv { font-size: 14px; }
        .prop-compact .prop-ftfin .prop-fv { font-size: 19px; }
        .prop-compact .prop-cta h3 { font-size: 14px; }
        .prop-compact .prop-csub { font-size: 10px; margin: 2px 0 7px; }
        .prop-compact .prop-cta-btn { font-size: 13px; padding: 9px 16px 9px 22px; }
        .prop-compact .prop-cta-arrow { width: 23px; height: 23px; font-size: 13px; }
        .prop-compact .prop-cfn { margin-top: 6px; }

        /* En pantalla las páginas se separan 24px y llevan sombra para que se lean
           como hojas sueltas. Al imprimir (puppeteer usa media print) esos márgenes
           sobran: los 24px de la última hoja empujaban una página EN BLANCO al final
           del PDF que se envía al cliente. */
        @media print {
            .prop-page { margin: 0 !important; box-shadow: none !important; }
        }
    `;


const formatNumber = (val) => {
    const num = typeof val === 'number' ? val : parseFloat(val);
    if (num === null || num === undefined || isNaN(num)) return '0';
    return new Intl.NumberFormat('es-ES', {
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
        useGrouping: true
    }).format(Math.round(num));
};

// El backend guarda el presupuesto en Drive con este nombre exacto y versiona el
// anterior añadiéndole "_old" (ver POST /api/oportunidades/:id/anexos).
const BUDGET_LABEL = 'PRESUPUESTO DE LA INSTALACIÓN';

// En una reforma la obra la presupuestan partidas distintas (a menudo gremios
// distintos): la aerotermia por un lado y cada mejora de envolvente por otro.
// Cada una tiene su propio hueco, y su fichero se distingue por el sufijo.
// AEROTERMIA conserva el nombre de siempre para no romper lo ya subido.
const BUDGET_SLOTS = [
    { key: 'AEROTERMIA', label: 'Aerotermia', input: null },
    { key: 'VENTANAS', label: 'Ventanas', input: 'reformaVentanas' },
    { key: 'CUBIERTA', label: 'Cubierta', input: 'reformaCubierta' },
    { key: 'SUELO', label: 'Suelo', input: 'reformaSuelo' },
    { key: 'FACHADA', label: 'Fachada', input: 'reformaParedes' },
];
const budgetFileLabel = (slot) => (!slot || slot === 'AEROTERMIA') ? BUDGET_LABEL : `${BUDGET_LABEL}_${slot}`;

const stripExt = (name) => (name || '').replace(/\.[^.]+$/, '').trim();
// Devuelve el slot al que pertenece un fichero de Drive, o null si no es presupuesto.
const budgetSlotOfFileName = (name) => {
    const n = stripExt(name).toUpperCase();
    if (n === BUDGET_LABEL) return 'AEROTERMIA';
    const s = BUDGET_SLOTS.find(x => x.key !== 'AEROTERMIA' && n === `${BUDGET_LABEL}_${x.key}`);
    return s ? s.key : null;
};
const isBudgetFileName = (name) => !!budgetSlotOfFileName(name);
// Cubre tanto "…INSTALACIÓN_old" como "…INSTALACIÓN_VENTANAS_old".
const isBudgetOldFileName = (name) => {
    const n = stripExt(name).toUpperCase();
    return n.startsWith(BUDGET_LABEL) && n.endsWith('_OLD');
};

export function ProposalModal({ isOpen, onClose, result, inputs, onSaveRequest }) {
    const { showAlert, showConfirm } = useModal();
    const { user } = useAuth();
    const proposalRef = useRef(null);
    const containerRef = useRef(null);
    const page1Ref = useRef(null);
    // ── Ajuste de la portada ────────────────────────────────────────────────
    // Hoja A4 de altura FIJA con contenido muy variable (filas opcionales de la
    // tabla, co-branding, comparativa a dos columnas, ahorro anual). Se mide en
    // reposo y se reparte la diferencia entre unos pocos huecos elásticos, de
    // forma que el contenido llene la hoja exactamente: ni desborda sobre el pie
    // negro ni deja un agujero blanco encima.
    //
    // Antes esto era un interruptor "compacto" que recortaba ~226px de golpe: una
    // propuesta que se pasaba por 2px se llevaba el paquete entero y acababa con
    // 224px en blanco al final. El compacto sigue existiendo, pero solo como
    // último recurso cuando estirar/encoger no alcanza.
    //
    // `pass`: 0 = pendiente de medir · 1 = medir ya en compacto · 2 = fijado.
    // Nunca vuelve atrás, así que no hay bucle de medición. Los estilos van en el
    // DOM, de modo que el PDF hereda exactamente la misma portada que la vista.
    const [fit, setFit] = useState({ pass: 0, compact: false, vars: null, reposo: null });
    const [fontsReady, setFontsReady] = useState(false);
    const [brokergyLogo, setBrokergyLogo] = useState(`${APP_URL}${BROKERGY_LOGO_PATH}`);
    // Enlace público de subida (/subir-docs/:uuid?token=) — el MISMO que se le
    // manda al cliente por WhatsApp para pedirle las fotos.
    const [uploadLink, setUploadLink] = useState(null);
    const [generating, setGenerating] = useState(false);
    const [savingToDrive, setSavingToDrive] = useState(false);
    const [scale, setScale] = useState(1);
    const [sendingEmail, setSendingEmail] = useState(false);
    const [sendingWhatsapp, setSendingWhatsapp] = useState(false);
    const [confirmConfig, setConfirmConfig] = useState(null);
    const [recipientChoice, setRecipientChoice] = useState(false);
    const [waStep, setWaStep] = useState(0);          // 0=selección, 1=preview/edición
    const [waMessages, setWaMessages] = useState({}); // { mode: texto editado }
    const [waActiveTab, setWaActiveTab] = useState(null);

    // -- ANEXOS STATE --
    const [isAnexosOpen, setIsAnexosOpen] = useState(false);
    const [anexoPosition, setAnexoPosition] = useState('after');
    const [attachments, setAttachments] = useState([]);
    const [loadingAnnexes, setLoadingAnnexes] = useState(false);
    const [isGlobalDragging, setIsGlobalDragging] = useState(false);
    // Qué hueco de presupuesto tiene el fichero encima (o null). Uno por partida.
    const [budgetDragSlot, setBudgetDragSlot] = useState(null);
    const [draggedIndex, setDraggedIndex] = useState(null);

    // Cargar anexos desde Drive al abrir el modal
    useEffect(() => {
        const fetchAnnexes = async () => {
            if (!isOpen || !inputs?.id_oportunidad) return;

            setLoadingAnnexes(true);
            try {
                // 1. Obtener lista de archivos en la carpeta "0. PRESUPUESTO"
                const driveFolderId = inputs?.drive_folder_id;
                const resp = await axios.get(`/api/oportunidades/${inputs.id_oportunidad || 'unknown'}/anexos${driveFolderId ? `?driveFolderId=${driveFolderId}` : ''}`);
                // El backend versiona el presupuesto anterior como "..._old.pdf" y lo deja
                // en la misma carpeta: no es un anexo, no debe entrar en la propuesta.
                const driveFiles = (resp.data || []).filter(f => f.name !== 'test.txt' && !isBudgetOldFileName(f.name));

                if (driveFiles && driveFiles.length > 0) {
                    const loadedAttachments = [];

                    for (const file of driveFiles) {
                        // 2. Descargar contenido de cada archivo
                        const fileResp = await axios.get(`/api/oportunidades/${inputs.id_oportunidad}/anexos/${file.id}`, { responseType: 'arraybuffer' });
                        const blob = new Blob([fileResp.data], { type: file.mimeType });

                        const reader = new FileReader();
                        const dataUrl = await new Promise((resolve) => {
                            reader.onloadend = () => resolve(reader.result);
                            reader.readAsDataURL(blob);
                        });

                        const isPdf = file.mimeType === 'application/pdf';
                        let finalData = [dataUrl];

                        if (isPdf) {
                            finalData = await convertPdfToImages(dataUrl);
                        }

                        // El presupuesto llega de Drive con su nombre de fichero
                        // ("PRESUPUESTO DE LA INSTALACIÓN.pdf"): hay que reconocerlo para
                        // que caiga en su slot y no en "otros anexos".
                        const budgetSlot = budgetSlotOfFileName(file.name);
                        const isBudget = !!budgetSlot;

                        loadedAttachments.push({
                            id: file.id,
                            label: isBudget ? budgetFileLabel(budgetSlot) : file.name,
                            file: { name: file.name, data: finalData, type: file.mimeType },
                            isDrive: true,
                            isBudget,
                            budgetSlot,
                            isOther: !isBudget
                        });
                    }

                    // El presupuesto va siempre el primero (portada).
                    // Presupuestos delante, y entre ellos en el orden de las partidas.
                    const ordenSlot = a => (a.isBudget ? BUDGET_SLOTS.findIndex(x => x.key === a.budgetSlot) : 99);
                    loadedAttachments.sort((a, b) => ordenSlot(a) - ordenSlot(b));
                    setAttachments(loadedAttachments);
                }
            } catch (err) {
                console.error('Error cargando anexos desde Drive:', err);
            } finally {
                setLoadingAnnexes(false);
            }
        };

        fetchAnnexes();
    }, [isOpen, inputs?.id_oportunidad]);

    const displayId = inputs?.id_oportunidad || 'Simulación';
    // Para URLs seguras y no predecibles, usamos el UUID de la base de datos si existe
    const urlId = inputs?.id_uuid || displayId;

    // Estado para cachear datos del partner al abrir el modal
    const [partnerInfo, setPartnerInfo] = useState(null);
    const [instaladorInfo, setInstaladorInfo] = useState(null);
    const [clienteInfo, setClienteInfo] = useState(null);
    const [recipientSelections, setRecipientSelections] = useState(new Set());
    const [emailChoice, setEmailChoice] = useState(false);
    const [enviarOpen, setEnviarOpen] = useState(false); // popup unificado de envío (homogéneo con anexos)
    const [includeCeeComp, setIncludeCeeComp] = useState(true); // incluir la comparativa CEE en PDF + mensaje
    const [emailSelections, setEmailSelections] = useState(new Set());
    const [manualContact, setManualContact] = useState({ name: '', phone: '', email: '' });


    // ── A QUIÉN nos dirigimos dentro de un partner/instalador ────────────────
    // La empresa no se saluda por su razón social ("¡Hola REFRIGERACIÓN RUIZ, SL!"):
    // se saluda al interlocutor dado de alta en `contactos_notificacion` (o al
    // contacto principal espejado en `nombre_contacto`). Es independiente del
    // toggle `contacto_notificaciones_activas`, que solo decide a qué email/tlf
    // se DIRIGEN los envíos, no cómo se llama a la persona.
    const contactoNotificacion = (p) => {
        const arr = Array.isArray(p?.contactos_notificacion) ? p.contactos_notificacion : [];
        const first = arr.find(c => (c?.nombre || '').trim());
        return (first?.nombre || p?.nombre_contacto || '').trim() || null;
    };

    // Cargar datos del partner cuando el modal se abre y hay prescriptor_id
    useEffect(() => {
        if (!isOpen) { setPartnerInfo(null); return; }
        const partnerId = inputs?.prescriptor_id;
        if (!partnerId) { setPartnerInfo(null); return; }

        axios.get(`/api/prescriptores/${partnerId}`)
            .then(res => {
                const p = res.data;
                const useContact = p.contacto_notificaciones_activas === true || p.contacto_notificaciones_activas === 'true';
                const org = p.acronimo || p.razon_social || 'Partner';
                const info = {
                    // `name` = a quién se saluda: el interlocutor si lo hay, si no la empresa.
                    name: contactoNotificacion(p) || org,
                    org,
                    phone: useContact ? (p.tlf_contacto || p.tlf) : (p.tlf || p.telefono || (Array.isArray(p.usuarios) ? p.usuarios[0]?.tlf : p.usuarios?.tlf) || null),
                    email: useContact ? (p.email_contacto || p.email) : (p.email || (Array.isArray(p.usuarios) ? p.usuarios[0]?.email : p.usuarios?.email) || null),
                    redirectionActive: useContact,
                    // Co-branding: siempre la EMPRESA, nunca el nombre del contacto
                    brand: p.acronimo || p.razon_social || null,
                    logo: p.logo_empresa || null,
                    cif: p.cif || null,
                    tipo: p.tipo_empresa || null
                };
                console.log('[PARTNER-DEBUG] Raw Data:', p);
                console.log('[PARTNER-DEBUG] Redirección activa:', useContact);
                console.log('[PARTNER-DEBUG] Final Info:', info);
                setPartnerInfo(info);
            })
            .catch(err => {
                console.warn('[PARTNER] No se pudo cargar partner por ID, intentando listado:', err.message);
                // Fallback: listar todos
                axios.get('/api/prescriptores')
                    .then(res2 => {
                        const found = res2.data?.find(p => p.id_empresa === partnerId || String(p.id_empresa) === String(partnerId));
                        if (found) {
                            const useContact = found.contacto_notificaciones_activas === true || found.contacto_notificaciones_activas === 'true';
                            setPartnerInfo({
                                name: contactoNotificacion(found) || found.acronimo || found.razon_social || 'Partner',
                                org: found.acronimo || found.razon_social || 'Partner',
                                phone: useContact ? (found.tlf_contacto || found.tlf) : (found.tlf || found.telefono || (Array.isArray(found.usuarios) ? found.usuarios[0]?.tlf : found.usuarios?.tlf) || null),
                                email: useContact ? (found.email_contacto || found.email) : (found.email || (Array.isArray(found.usuarios) ? found.usuarios[0]?.email : found.usuarios?.email) || null),
                                redirectionActive: useContact,
                                brand: found.acronimo || found.razon_social || null,
                                logo: found.logo_empresa || null,
                                cif: found.cif || null,
                                tipo: found.tipo_empresa || null
                            });
                            console.log('[PARTNER] Cargado desde listado:', found.acronimo || found.razon_social);
                        } else {
                            setPartnerInfo({ name: 'Partner', phone: null });
                        }
                    })
                    .catch(() => setPartnerInfo({ name: 'Partner', phone: null }));
            });
    }, [isOpen, inputs?.prescriptor_id]);

    useEffect(() => {
        if (!isOpen) { setInstaladorInfo(null); return; }
        const instId = inputs?.instalador_asociado_id;
        if (!instId) { setInstaladorInfo(null); return; }
        axios.get(`/api/prescriptores/${instId}`)
            .then(res => {
                const p = res.data;
                const uc = p.contacto_notificaciones_activas === true || p.contacto_notificaciones_activas === 'true';
                setInstaladorInfo({
                    name: contactoNotificacion(p) || p.acronimo || p.razon_social || 'Instalador',
                    org: p.acronimo || p.razon_social || 'Instalador',
                    phone: uc ? (p.tlf_contacto || p.tlf || p.telefono || null) : (p.tlf || p.telefono || null),
                    email: uc ? (p.email_contacto || p.email || null) : (p.email || null),
                    brand: p.acronimo || p.razon_social || null,
                    logo: p.logo_empresa || null,
                    cif: p.cif || null,
                    tipo: p.tipo_empresa || null
                });
            })
            .catch(() => setInstaladorInfo({ name: 'Instalador', phone: null, email: null }));
    }, [isOpen, inputs?.instalador_asociado_id]);

    // Co-branding de la propuesta: manda el instalador (es quien está delante del cliente);
    // si no hay, el prescriptor que originó la oportunidad.
    // Brokergy es un prescriptor más en la tabla (y tiene logo), pero no colabora consigo misma:
    // si el partner es Brokergy —o no hay partner— la propuesta sale como siempre, sin co-branding.
    const cobrand = useMemo(() => {
        const esBrokergy = (p) => {
            const cif = String(p?.cif || '').replace(/[\s.-]/g, '').toUpperCase();
            if (cif === 'B19350222') return true;
            return String(p?.brand || '').toLowerCase().includes('brokergy');
        };
        for (const src of [instaladorInfo, partnerInfo]) {
            if (!src || esBrokergy(src)) continue;
            if (src.logo || src.brand) {
                // No todo prescriptor con el que se co-marca ejecuta la obra: hay
                // distribuidores y otros colaboradores. Llamar "instalador" a quien
                // no lo es queda mal delante del cliente, así que solo se dice
                // cuando viene por el vínculo de instalador o su ficha lo declara.
                const esInstalador = src === instaladorInfo
                    || String(src.tipo || '').toUpperCase() === 'INSTALADOR';
                return { logo: src.logo || null, name: src.brand || null, esInstalador };
            }
        }
        return null;
    }, [instaladorInfo, partnerInfo]);

    useEffect(() => {
        if (!isOpen) { setClienteInfo(null); return; }
        const name = inputs?.referenciaCliente || 'Cliente';
        if (!inputs?.cliente_id) {
            const phoneFromInputs = inputs?.tlf_contacto || inputs?.tlf || inputs?.telefono || null;
            setClienteInfo({ name, phone: phoneFromInputs });
            return;
        }
        axios.get(`/api/clientes/${inputs.cliente_id}`)
            .then(res => {
                const c = res.data;
                const uc = c.notificaciones_contacto_activas === true;
                setClienteInfo({
                    name: (uc && c.persona_contacto_nombre) ? c.persona_contacto_nombre : (c.nombre_razon_social || name),
                    phone: (uc && c.persona_contacto_tlf) ? c.persona_contacto_tlf : (c.tlf || c.telefono || null),
                    email: (uc && c.persona_contacto_email) ? c.persona_contacto_email : (c.email || null),
                });

            })
            .catch(() => setClienteInfo({ name, phone: inputs?.tlf_contacto || inputs?.tlf || inputs?.telefono || null }));
    }, [isOpen, inputs?.cliente_id, inputs?.tlf_contacto, inputs?.tlf, inputs?.telefono, inputs?.referenciaCliente]);

    // Ajustar la escala de la vista previa para que quepa en el ancho disponible
    useEffect(() => {
        if (!isOpen) return;

        const updateScale = () => {
            if (containerRef.current) {
                // El ancho fijo de nuestro diseño de página A4 es approx 794px (210mm a 96dpi) 
                // pero a efectos prácticos podemos usar ofsetWidth del prop-wrapper o constante
                const pagePixelWidth = 794;
                // Restamos un poco de padding al contenedor para que no pegue a los bordes
                const availableWidth = containerRef.current.clientWidth - 32;

                if (availableWidth < pagePixelWidth) {
                    setScale(availableWidth / pagePixelWidth);
                } else {
                    setScale(1);
                }
            }
        };

        // Ejecutar inicialmente y en cada resize
        updateScale();
        // Un pequeño timeout para asegurar que el DOM ha renderizado el contenedor
        setTimeout(updateScale, 50);

        window.addEventListener('resize', updateScale);
        return () => window.removeEventListener('resize', updateScale);
    }, [isOpen, attachments.length]);

    // El PDF lo monta puppeteer en el backend a partir del HTML suelto, sin base
    // URL: una ruta relativa no resolvería. Se incrusta el logo en base64 y, si la
    // descarga falla, se queda la URL absoluta (lo que hacen los demás documentos).
    useEffect(() => {
        if (!isOpen) return;
        let cancelado = false;
        (async () => {
            try {
                const blob = await (await fetch(BROKERGY_LOGO_PATH)).blob();
                const dataUrl = await new Promise(res => {
                    const r = new FileReader();
                    r.onloadend = () => res(r.result);
                    r.readAsDataURL(blob);
                });
                if (!cancelado && typeof dataUrl === 'string' && dataUrl.startsWith('data:image')) {
                    setBrokergyLogo(dataUrl);
                }
            } catch (_) { /* se queda la URL absoluta */ }
        })();
        return () => { cancelado = true; };
    }, [isOpen]);

    // Enlace de subida para el botón de la página de documentación. Una simulación
    // sin guardar no tiene oportunidad —ni token—, así que el botón no sale.
    useEffect(() => {
        if (!isOpen || !inputs?.id_oportunidad) { setUploadLink(null); return; }
        let cancelado = false;
        axios.get(`/api/oportunidades/${inputs.id_oportunidad}/upload-link`)
            .then(r => { if (!cancelado) setUploadLink(r.data?.upload_link || null); })
            .catch(() => { if (!cancelado) setUploadLink(null); });
        return () => { cancelado = true; };
    }, [isOpen, inputs?.id_oportunidad]);

    // Medir antes de que las webfonts estén listas da métricas de la tipografía
    // de reserva y decide el ajuste sobre una portada que no es la definitiva.
    useEffect(() => {
        if (!isOpen) return;
        let cancelado = false;
        const listo = () => { if (!cancelado) setFontsReady(true); };
        if (document.fonts?.ready) document.fonts.ready.then(listo).catch(listo);
        else listo();
        return () => { cancelado = true; };
    }, [isOpen]);

    // Vuelta a reposo cuando cambia lo que ocupa la portada, para no arrastrar el
    // ajuste calculado para otra propuesta.
    useLayoutEffect(() => {
        setFit({ pass: 0, compact: false, vars: null, reposo: null });
    }, [isOpen, includeCeeComp, cobrand]);

    // Huecos que se estiran o encogen, en orden de aparición. `encoge` es la
    // fracción del valor de reposo que se puede quitar; `estira`, los píxeles
    // que se pueden añadir. `filas` marca el que se aplica al padding vertical
    // de cada fila de tabla (arriba y abajo).
    const HUECOS = [
        { v: '--e-top', encoge: 0.35, estira: 40 },
        { v: '--e-h1sub', encoge: 0.40, estira: 10 },
        { v: '--e-cobrand', encoge: 0.40, estira: 30 },
        { v: '--e-kpis', encoge: 0.40, estira: 26 },
        { v: '--e-meta', encoge: 0.40, estira: 24 },
        { v: '--e-sec', encoge: 0.40, estira: 26 },
        { v: '--e-nsm', encoge: 0.40, estira: 20 },
        { v: '--e-row', encoge: 0.35, estira: 16, filas: true },
        // El pie negro también respira: se come parte del hueco de abajo.
        { v: '--e-cta', encoge: 0.25, estira: 34, doble: true },
    ];
    const AIRE = 10;          // el contenido nunca roza el pie negro
    const TOLERANCIA = 14;    // sobra aceptable: por debajo, se da por bueno
    const MAX_PASADAS = 4;

    // Se mide en píxeles de maquetación (offsetTop / offsetHeight, no
    // getBoundingClientRect) porque la vista previa va dentro de un
    // `transform: scale()` y el rect vendría escalado.
    //
    // ITERATIVO a propósito, en vez de resolver la ecuación de una vez: en la
    // comparativa a dos columnas las filas de las DOS tablas cambian de alto
    // pero solo manda la columna más alta, así que un cálculo directo se pasa o
    // se queda corto. Medir → corregir → volver a medir no necesita saber nada
    // de la maquetación. Converge en 2-3 pasadas y está topado por MAX_PASADAS.
    useLayoutEffect(() => {
        if (!isOpen || !fontsReady || fit.pass >= MAX_PASADAS) return;
        const page = page1Ref.current;
        const body = page?.querySelector('.prop-pb');
        const cta = page?.querySelector('.prop-cta');
        if (!body || !cta) return;

        const sobra = cta.offsetTop - (body.offsetTop + body.offsetHeight) - AIRE;
        // Una portada que CABE no se toca: se queda exactamente como está. El
        // ajuste existe para rescatar la que se sale (muchas filas), no para
        // repartir el aire de la que ya va bien.
        //
        // La excepción es haber tenido que escalar al compacto: ése aprieta de
        // golpe y se pasa de frenada (medido: -93px de partida acababan en 136px
        // de hueco). Ahí sí se devuelve el sobrante a los huecos.
        if (sobra >= 0 && (!fit.compact || sobra <= TOLERANCIA)) {
            setFit(prev => ({ ...prev, pass: MAX_PASADAS }));
            return;
        }

        const estilo = getComputedStyle(page);
        const leer = () => Object.fromEntries(HUECOS.map(h => [h.v, parseFloat(estilo.getPropertyValue(h.v)) || 0]));
        const actual = leer();
        // El reposo se congela en la primera pasada: los topes son absolutos y
        // no se recalculan sobre unos valores ya movidos.
        const reposo = fit.reposo || actual;
        const nFilas = page.querySelectorAll('.prop-ftr').length;
        const veces = h => (h.filas ? nFilas * 2 : h.doble ? 2 : 1);
        const holgura = h => sobra >= 0
            ? (reposo[h.v] + h.estira) - actual[h.v]          // cuánto queda por estirar
            : actual[h.v] - reposo[h.v] * (1 - h.encoge);     // cuánto queda por encoger

        const margen = HUECOS.reduce((a, h) => a + Math.max(0, holgura(h)) * veces(h), 0);
        // Si apretando los huecos NO se llega, se escala ya al compacto en vez de
        // gastar pasadas en un apretón que no basta. El umbral no puede ser 0: el
        // redondeo a una décima deja una holgura residual de céntimas que,
        // multiplicada por las filas, nunca baja de cero — y el compacto no
        // llegaba a entrar nunca (medido: se quedaba a -197px de la comparativa
        // cargada). `vars: null` es imprescindible al escalar: los valores inline
        // ganan a las variables que redefine .prop-compact y lo dejarían sin efecto.
        if (margen < 1 || (sobra < 0 && -sobra > margen)) {
            if (sobra < 0 && !fit.compact) setFit({ pass: fit.pass + 1, compact: true, vars: null, reposo: null });
            else setFit(prev => ({ ...prev, pass: MAX_PASADAS }));
            return;
        }

        const t = Math.min(1, Math.abs(sobra) / margen);
        const vars = {};
        for (const h of HUECOS) {
            const delta = Math.max(0, holgura(h)) * t * (sobra >= 0 ? 1 : -1);
            vars[h.v] = `${Math.round((actual[h.v] + delta) * 10) / 10}px`;
        }
        setFit(prev => ({ pass: prev.pass + 1, compact: prev.compact, vars, reposo }));
    });

    // -- ANEXOS LOGIC --
    const loadPdfJs = () => {
        if (window.pdfjsLib) return Promise.resolve(window.pdfjsLib);
        return new Promise((resolve) => {
            const script = document.createElement('script');
            script.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
            script.onload = () => {
                window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
                resolve(window.pdfjsLib);
            };
            document.head.appendChild(script);
        });
    };

    const convertPdfToImages = async (dataUrl) => {
        try {
            console.log("[PDF] Iniciando conversión de PDF a imágenes...");
            const pdfjs = await loadPdfJs();
            
            // Convertir dataURL a Uint8Array para mayor compatibilidad con todas las versiones de PDF.js
            const base64 = dataUrl.split(',')[1];
            const binaryStr = atob(base64);
            const bytes = new Uint8Array(binaryStr.length);
            for (let i = 0; i < binaryStr.length; i++) {
                bytes[i] = binaryStr.charCodeAt(i);
            }
            
            const loadingTask = pdfjs.getDocument({ data: bytes });
            const pdf = await loadingTask.promise;
            const images = [];
            
            console.log(`[PDF] Documento cargado. Páginas: ${pdf.numPages}`);
            
            for (let i = 1; i <= pdf.numPages; i++) {
                const page = await pdf.getPage(i);
                // Usamos un factor de escala 2 para buena calidad en el PDF final
                const viewport = page.getViewport({ scale: 2 });
                const canvas = document.createElement('canvas');
                const context = canvas.getContext('2d');
                canvas.height = viewport.height;
                canvas.width = viewport.width;
                
                await page.render({ canvasContext: context, viewport }).promise;
                images.push(canvas.toDataURL('image/jpeg', 0.85)); // Un poco más de calidad
            }
            console.log("[PDF] Conversión completada con éxito.");
            return images;
        } catch (error) {
            console.error('[PDF] Error convirtiendo PDF:', error);
            return [];
        }
    };

    // Descarga un anexo ya guardado en Drive y lo convierte en páginas para la
    // vista previa. Drive es la fuente de verdad cuando la conversión local falla.
    const fetchDrivePages = async (fileId, mimeType) => {
        try {
            const fileResp = await axios.get(`/api/oportunidades/${inputs.id_oportunidad}/anexos/${fileId}`, { responseType: 'arraybuffer' });
            const blob = new Blob([fileResp.data], { type: mimeType });
            const dataUrl = await new Promise((resolve) => {
                const r = new FileReader();
                r.onloadend = () => resolve(r.result);
                r.readAsDataURL(blob);
            });
            return mimeType === 'application/pdf' ? await convertPdfToImages(dataUrl) : [dataUrl];
        } catch (err) {
            console.error('[Anexos] No se pudo reconstruir la vista previa desde Drive:', err);
            return [];
        }
    };

    const handleFileChange = async (targetIdOrIndex, file, isOther = false, isBudget = false, budgetSlot = null) => {
        if (!file) return;
        return new Promise((resolve) => {
            const reader = new FileReader();
            reader.onload = async (rev) => {
                const dataUrl = rev.target.result;
                const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
                const isImage = file.type.startsWith('image/');
                
                setGenerating(true);
                try {
                    // 1. Subir a Drive primero para persistencia
                    const uploadResp = await axios.post(`/api/oportunidades/${inputs.id_oportunidad || 'unknown'}/anexos`, {
                        fileName: file.name,
                        mimeType: file.type,
                        base64: dataUrl,
                        driveFolderId: inputs?.drive_folder_id,
                        isBudget,
                        budgetSlot: isBudget ? (budgetSlot || 'AEROTERMIA') : null
                    });

                    if (!uploadResp.data.success) throw new Error("Error al subir a Drive");

                    const driveFile = uploadResp.data.file;

                    // 2. Procesar para vista previa.
                    // OJO: el dataUrl local sigue siendo el ORIGINAL. Si era una imagen,
                    // el backend la convirtió a PDF, pero aquí todavía es un JPG/PNG: pasarlo
                    // por pdf.js reventaba y devolvía [] en silencio, así que el anexo se
                    // añadía con 0 páginas y no salía en la propuesta pese a estar en Drive.
                    // Una imagen ya es una "página": se usa tal cual.
                    let finalData = [dataUrl];
                    if (isPdf) {
                        finalData = await convertPdfToImages(dataUrl);
                    }

                    // Red de seguridad: si la rasterización falla (p.ej. pdf.js no cargó
                    // desde el CDN), reconstruimos las páginas desde el fichero ya
                    // guardado en Drive antes que dejar el anexo vacío.
                    if (!finalData.length && !isImage) {
                        finalData = await fetchDrivePages(driveFile.id, driveFile.mimeType);
                    }
                    if (!finalData.length) {
                        throw new Error('No se pudo generar la vista previa del documento.');
                    }

                    const newAttachment = {
                        id: driveFile.id,
                        label: isBudget ? budgetFileLabel(budgetSlot) : file.name,
                        file: { name: driveFile.name, data: finalData, type: driveFile.mimeType },
                        isOther: !isBudget,
                        isDrive: true,
                        isBudget,
                        budgetSlot: isBudget ? (budgetSlot || 'AEROTERMIA') : null
                    };

                    setAttachments(prev => {
                        // Solo sustituye el presupuesto DE SU PARTIDA: subir el de
                        // ventanas no puede llevarse por delante el de aerotermia.
                        const slot = budgetSlot || 'AEROTERMIA';
                        const filtered = isBudget
                            ? prev.filter(a => !(a.isBudget && (a.budgetSlot || 'AEROTERMIA') === slot))
                            : [...prev];
                        // Los presupuestos van delante (portada), los demás detrás.
                        return isBudget ? [newAttachment, ...filtered] : [...filtered, newAttachment];
                    });
                } catch (err) {
                    console.error("Error subiendo anexo:", err);
                    const errorMessage = err.response?.data?.message || err.response?.data?.error || err.message || "Error desconocido";
                    alert(`Error al subir el anexo: ${errorMessage}`);
                } finally {
                    setGenerating(false);
                    resolve();
                }
            };
            reader.readAsDataURL(file);
        });
    };

    const removeAttachment = async (index) => {
        const item = attachments[index];
        if (item && item.isDrive && item.id) {
            try {
                if (!item.id.toString().startsWith('temp_')) {
                    await axios.delete(`/api/oportunidades/${inputs.id_oportunidad}/anexos/${item.id}`);
                    console.log(`[Anexos] Archivo ${item.id} eliminado de Drive.`);
                }
            } catch (err) {
                console.error("Error al eliminar anexo de Drive:", err);
                alert("No se pudo eliminar el archivo de la nube, pero se quitará de la vista previa.");
            }
        }
        setAttachments(prev => prev.filter((_, i) => i !== index));
    };

    const reorderAttachments = (dragIdx, dropIdx) => {
        if (dragIdx === dropIdx) return;
        setAttachments(prev => {
            const copy = [...prev];
            const [moved] = copy.splice(dragIdx, 1);
            copy.splice(dropIdx, 0, moved);
            return copy;
        });
    };

    // Partidas con hueco propio de presupuesto: la aerotermia siempre, y cada
    // mejora de envolvente que esté activada en la reforma.
    const budgetSlotsActivos = useMemo(
        () => BUDGET_SLOTS.filter(s => !s.input || !!inputs?.[s.input]),
        [inputs?.reformaVentanas, inputs?.reformaCubierta, inputs?.reformaSuelo, inputs?.reformaParedes]
    );

    const AnexosModal = () => {
        const budgetDe = (slot) => attachments.find(a => a.isBudget && (a.budgetSlot || 'AEROTERMIA') === slot);
        const otherAttachments = attachments.filter(a => !a.isBudget);

        // Un hueco por partida: arrastrar o pulsar, y si ya hay fichero se
        // sustituye solo el de esa partida.
        const ZonaPresupuesto = ({ slot, label }) => {
            const adjunto = budgetDe(slot);
            const arrastrando = budgetDragSlot === slot;
            const elegir = () => {
                const input = document.createElement('input');
                input.type = 'file';
                input.accept = 'image/*,.pdf';
                input.onchange = (e) => handleFileChange(null, e.target.files[0], false, true, slot);
                input.click();
            };
            const dnd = {
                onDragOver: (e) => { e.preventDefault(); setBudgetDragSlot(slot); },
                onDragEnter: (e) => { e.preventDefault(); setBudgetDragSlot(slot); },
                onDragLeave: (e) => { e.preventDefault(); setBudgetDragSlot(s => (s === slot ? null : s)); },
                onDrop: (e) => {
                    e.preventDefault();
                    setBudgetDragSlot(null);
                    if (e.dataTransfer.files?.length > 0) handleFileChange(null, e.dataTransfer.files[0], false, true, slot);
                },
            };

            if (adjunto) {
                return (
                    <div {...dnd}
                        title={`Arrastra un PDF o imagen aquí para sustituir el presupuesto de ${label}`}
                        className={`group flex items-center justify-between p-4 rounded-2xl border transition-all duration-300 ${arrastrando ? 'bg-brand/10 border-brand' : 'bg-brand/5 border-brand/30'}`}>
                        <div className="flex items-center gap-4 pointer-events-none">
                            <div className="w-10 h-10 rounded-xl bg-brand/20 flex items-center justify-center text-brand shrink-0">
                                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                            </div>
                            <div className="flex flex-col gap-0.5 min-w-0">
                                <span className="text-[11px] font-black uppercase tracking-wider text-brand">{label}</span>
                                <span className="text-[9px] text-white/40 font-bold uppercase truncate">{adjunto.file.name}</span>
                            </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                            <button onClick={elegir}
                                className="p-2 text-white/20 hover:text-white hover:bg-white/5 rounded-lg transition-all" title="Sustituir presupuesto">
                                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                            </button>
                            <button onClick={() => removeAttachment(attachments.indexOf(adjunto))} className="p-2 text-red-500/40 hover:text-red-500 hover:bg-red-500/10 rounded-lg transition-all" title="Quitar">
                                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
                            </button>
                        </div>
                    </div>
                );
            }

            return (
                <button onClick={elegir} {...dnd}
                    className={`w-full p-5 border-2 border-dashed rounded-2xl flex flex-col items-center justify-center gap-1.5 transition-all group ${arrastrando ? 'border-brand bg-brand/5 scale-[1.02]' : 'border-white/5 bg-white/[0.02] hover:bg-brand/5 hover:border-brand/40'}`}>
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center transition-all pointer-events-none ${arrastrando ? 'bg-brand/20' : 'bg-white/5 group-hover:bg-brand/20'}`}>
                        <svg className={`w-5 h-5 ${arrastrando ? 'text-brand' : 'text-white/20 group-hover:text-brand'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4"/></svg>
                    </div>
                    <span className="text-[10px] font-black uppercase tracking-widest text-white/50 group-hover:text-white/80 pointer-events-none">{label}</span>
                    <span className="text-[9px] font-bold uppercase tracking-wider text-white/25 group-hover:text-white/40 pointer-events-none">
                        {arrastrando ? 'Suelta aquí' : 'Arrastra o pulsa'}
                    </span>
                </button>
            );
        };

        return (
            <div className="fixed inset-0 z-[300] flex items-center justify-center bg-black/95 backdrop-blur-xl" onClick={() => setIsAnexosOpen(false)}>
                <div className="bg-[#16181D] border border-white/10 rounded-3xl w-full max-w-2xl overflow-hidden shadow-[0_30px_60px_-15px_rgba(0,0,0,0.5)]"
                    onClick={e => e.stopPropagation()}>
                    <div className="px-8 py-5 border-b border-white/10 flex justify-between items-center bg-white/[0.02]">
                        <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-lg bg-brand/20 flex items-center justify-center">
                                <svg className="w-5 h-5 text-brand" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" /></svg>
                            </div>
                            <h3 className="text-white font-bold uppercase tracking-[0.2em] text-xs">Añadir Anexos</h3>
                        </div>
                        <button onClick={() => setIsAnexosOpen(false)} className="text-white/20 hover:text-white transition-colors"><svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/></svg></button>
                    </div>
                    
                    <div className="px-8 py-6 border-b border-white/10 bg-white/[0.01]">
                        <p className="text-white/50 text-sm mb-4">¿Dónde quieres situar los anexos?</p>
                        <div className="flex gap-4">
                            <label className={`flex-1 flex flex-col items-center gap-2 p-4 rounded-xl border cursor-pointer transition-all ${anexoPosition === 'before' ? 'border-brand bg-brand/10' : 'border-white/10 hover:border-white/30'}`}>
                                <input type="radio" name="position" className="hidden" checked={anexoPosition === 'before'} onChange={() => setAnexoPosition('before')} />
                                <span className={`text-sm font-bold ${anexoPosition === 'before' ? 'text-brand' : 'text-white/70'}`}>Antes de la Propuesta</span>
                                <span className="text-xs text-white/30 text-center">Útil para colocar el presupuesto como portada.</span>
                            </label>
                            <label className={`flex-1 flex flex-col items-center gap-2 p-4 rounded-xl border cursor-pointer transition-all ${anexoPosition === 'after' ? 'border-brand bg-brand/10' : 'border-white/10 hover:border-white/30'}`}>
                                <input type="radio" name="position" className="hidden" checked={anexoPosition === 'after'} onChange={() => setAnexoPosition('after')} />
                                <span className={`text-sm font-bold ${anexoPosition === 'after' ? 'text-brand' : 'text-white/70'}`}>Después de la Propuesta</span>
                                <span className="text-xs text-white/30 text-center">Útil para adjuntar documentación técnica al final.</span>
                            </label>
                        </div>
                    </div>

                    <div className="p-8 grid gap-4 max-h-[50vh] overflow-y-auto custom-scrollbar bg-gradient-to-b from-transparent to-black/20">
                        
                        {/* SECCIÓN PRESUPUESTO */}
                        <div className="mb-4">
                            <p className="text-white/30 text-[10px] uppercase font-bold tracking-widest mb-3">
                                {budgetSlotsActivos.length > 1 ? "Presupuestos del Instalador (por partida)" : "Presupuesto del Instalador"}
                            </p>
                            <div className={budgetSlotsActivos.length > 1 ? "grid grid-cols-1 sm:grid-cols-2 gap-3" : ""}>
                                {budgetSlotsActivos.map(s => (
                                    <ZonaPresupuesto key={s.key} slot={s.key} label={s.label} />
                                ))}
                            </div>
                        </div>

                        <div className="w-full h-px bg-white/5 my-2" />

                        <p className="text-white/30 text-[10px] uppercase font-bold tracking-widest mb-2">Otros Anexos (Documentación Técnica, etc.)</p>
                        
                        {otherAttachments.map((item, idx) => {
                            const globalIdx = attachments.indexOf(item);
                            return (
                                <div key={item.id} 
                                    draggable
                                    onDragStart={() => setDraggedIndex(globalIdx)}
                                    onDragOver={(e) => { 
                                        e.preventDefault(); 
                                        e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.08)'; 
                                    }}
                                    onDragLeave={(e) => { e.currentTarget.style.backgroundColor = ''; }}
                                    onDrop={(e) => { 
                                        e.preventDefault(); 
                                        e.currentTarget.style.backgroundColor = '';
                                        if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
                                            handleFileChange(null, e.dataTransfer.files[0], true);
                                        } else {
                                            reorderAttachments(draggedIndex, globalIdx); 
                                        }
                                    }}
                                    className={`group flex items-center justify-between p-4 bg-white/[0.03] rounded-2xl border transition-all duration-300 ${draggedIndex === globalIdx ? 'opacity-30' : 'opacity-100'} border-white/10 hover:border-white/20`}>
                                    
                                    <div className="flex items-center gap-4">
                                        <div className="cursor-grab active:cursor-grabbing text-white/5 hover:text-white/20 transition-colors">
                                            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20"><path d="M7 2a2 2 0 1 0 .001 4.001A2 2 0 0 0 7 2zm0 6a2 2 0 1 0 .001 4.001A2 2 0 0 0 7 8zm0 6a2 2 0 1 0 .001 4.001A2 2 0 0 0 7 14zm6-12a2 2 0 1 0 .001 4.001A2 2 0 0 0 13 2zm0 6a2 2 0 1 0 .001 4.001A2 2 0 0 0 13 8zm0 6a2 2 0 1 0 .001 4.001A2 2 0 0 0 13 14z" /></svg>
                                        </div>

                                        <div className="flex flex-col gap-1">
                                            <span className="text-[11px] font-bold uppercase tracking-wider text-white/70">{item.label}</span>
                                            <span className="text-[9px] text-white/30 font-bold flex items-center gap-1.5">
                                                {item.file.name} ({item.file.data.length} pág)
                                            </span>
                                        </div>
                                    </div>

                                    <button onClick={() => removeAttachment(globalIdx)} className="p-2.5 text-white/10 hover:text-red-500 hover:bg-red-500/10 rounded-xl transition-all"><svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg></button>
                                </div>
                            );
                        })}
                        
                        <div className="mt-4 flex flex-col items-center gap-4">
                            <div 
                                onDragOver={e => { e.preventDefault(); setIsGlobalDragging(true); }}
                                onDragLeave={() => setIsGlobalDragging(false)}
                                onDrop={e => {
                                    e.preventDefault();
                                    setIsGlobalDragging(false);
                                    if (e.dataTransfer.files.length > 0) {
                                        handleFileChange(null, e.dataTransfer.files[0], true);
                                    }
                                }}
                                className={`w-full py-8 border-2 border-dashed rounded-2xl flex flex-col items-center justify-center gap-2 transition-all ${isGlobalDragging ? 'border-brand bg-brand/5 scale-[1.02]' : 'border-white/5 bg-white/[0.01]'}`}
                            >
                                <svg className={`w-8 h-8 transition-transform ${isGlobalDragging ? 'scale-110 text-brand' : 'text-white/10'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"/></svg>
                                <p className="text-[10px] font-black uppercase tracking-widest text-white/20">Suelta otros archivos PDF/JPG aquí para anexar</p>
                            </div>

                            <button 
                                onClick={() => {
                                    const input = document.createElement('input');
                                    input.type = 'file';
                                    input.accept = 'image/*,.pdf';
                                    input.onchange = (e) => handleFileChange(null, e.target.files[0], true);
                                    input.click();
                                }}
                                className="flex items-center gap-2 px-6 py-3 bg-white/5 hover:bg-white/10 border border-white/10 text-white/50 text-[10px] font-black rounded-2xl transition-all uppercase tracking-[0.2em] shadow-xl"
                            >
                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M12 4v16m8-8H4"/></svg>
                                Explorar Otros Archivos
                            </button>
                        </div>
                    </div>
                    
                    <div className="p-6 bg-black/40 flex justify-end gap-3">
                        <button onClick={() => setIsAnexosOpen(false)} className="px-10 py-3 bg-brand text-black text-[11px] font-black rounded-2xl uppercase tracking-[0.2em] shadow-[0_10px_20px_-5px_rgba(242,166,64,0.3)] hover:scale-105 active:scale-95 transition-all">Aceptar</button>
                    </div>
                </div>
            </div>
        );
    };

    const renderAnexos = () => {
        if (!attachments || attachments.length === 0) return null;
        
        return attachments.map((item, itemIdx) => {
            if (!item.file || !item.file.data || !Array.isArray(item.file.data)) return null;
            
            return item.file.data.map((pageData, pIdx) => (
                <div 
                    key={`anexo-${itemIdx}-${pIdx}`} 
                    className="prop-page" 
                    style={{ 
                        padding: 0, 
                        margin: '0 auto 24px', 
                        position: 'relative', 
                        display: 'flex', 
                        alignItems: 'center', 
                        justifyContent: 'center', 
                        background: '#FFFFFF',
                        width: '794px',
                        height: '1123px',
                        overflow: 'hidden'
                    }}
                >
                    {/* Imagen del anexo */}
                    <img 
                        src={pageData} 
                        style={{ 
                            width: '100%', 
                            height: '100%', 
                            objectFit: 'contain',
                            display: 'block'
                        }} 
                        alt={`Anexo ${item.label} Pág ${pIdx + 1}`} 
                        onError={(e) => {
                            e.target.style.display = 'none';
                            e.target.parentElement.innerHTML += '<div style="color:red;font-weight:bold;">Error al cargar imagen de anexo</div>';
                        }}
                    />
                    
                    {/* Indicador de página (opcional, igual que el resto de la propuesta) */}
                    <div style={{ position: 'absolute', bottom: '30px', right: '44px', fontSize: '10px', color: '#999', fontWeight: 'bold' }}>
                        Documentación Adjunta • {item.label}
                    </div>
                </div>
            ));
        });
    };

    const proceedWithSend = useCallback(async (toPhoneInput, mode = 'CLIENTE', targetNameOverride = '') => {
        const toPhoneRaw = String(toPhoneInput || '');
        console.log('[WA-DEBUG] En función proceedWithSend para:', toPhoneRaw);
        
        setConfirmConfig({ 
            title: 'Preparando envío...', 
            message: `Generando propuesta en PDF y comprobando conexión para ${toPhoneRaw}. Por favor, espera...`, 
            confirmText: null, 
            cancelText: null 
        });

        setSendingWhatsapp(true);
        try {
            // 1. Limpiar y validar teléfono
            const toPhone = toPhoneRaw.replace(/[^0-9]/g, '');
            console.log('[WA-DEBUG] Teléfono limpio y listo:', toPhone);
            
            if (!toPhone || toPhone.length < 9) {
                 console.error('[WA-DEBUG] Teléfono inválido detectado:', toPhone);
                 setConfirmConfig({ 
                     title: 'Teléfono inválido', 
                     message: `❌ El número "${toPhoneRaw}" no es válido para WhatsApp.`, 
                     confirmText: 'Entendido', 
                     onConfirm: () => setConfirmConfig(null) 
                 });
                 setSendingWhatsapp(false);
                 return;
            }

            const targetName = targetNameOverride || inputs.referenciaCliente || (mode === 'PARTNER' ? 'Partner' : 'Cliente');
            try {
                const st = await axios.get('/api/whatsapp/status');
                if (!st.data?.ready) {
                    setConfirmConfig({ 
                        title: 'WhatsApp desconectado', 
                        message: `❌ WhatsApp no está conectado (estado: ${st.data?.state || 'desconocido'}).\n\n¿Quieres que intente conectar ahora?`, 
                        confirmText: 'Sí, conectar', 
                        cancelText: 'Cerrar',
                        onConfirm: async () => {
                            try {
                                setConfirmConfig({ title: 'Conectando...', message: 'Iniciando servicio de WhatsApp. Por favor, espera mientras establecemos el vínculo...', confirmText: null, cancelText: null });
                                await axios.post('/api/whatsapp/connect');
                                
                                // Iniciar bucle de comprobación (polling)
                                let attempts = 0;
                                let isConnected = false;
                                while (attempts < 8 && !isConnected) {
                                    await new Promise(r => setTimeout(r, 2500));
                                    try {
                                        const check = await axios.get('/api/whatsapp/status');
                                        if (check.data?.ready) {
                                            isConnected = true;
                                        }
                                        console.log(`[WA-POLL] Intento ${attempts + 1}: ${check.data?.state}`);
                                    } catch (e) {
                                        console.warn('[WA-POLL] Error en verificación intermedia');
                                    }
                                    attempts++;
                                }

                                if (isConnected) {
                                    setConfirmConfig({ 
                                        title: '¡WhatsApp Conectado!', 
                                        message: '✅ El servicio ya está activo y listo. Ya puedes realizar envíos de forma normal.\n\n¿Quieres continuar con el envío de esta propuesta?', 
                                        confirmText: 'Sí, enviar ahora', 
                                        cancelText: 'Cerrar',
                                        onConfirm: () => proceedWithSend(toPhoneRaw, mode, targetNameOverride) 
                                    });
                                } else {
                                    setConfirmConfig({ 
                                        title: 'Sigue desconectado', 
                                        message: 'No hemos podido confirmar la conexión automática. Por favor, ve a la sección de WhatsApp y escanea el código QR si es necesario.', 
                                        confirmText: 'Ir a WhatsApp', 
                                        onConfirm: () => { window.location.href = '/notificaciones'; },
                                        cancelText: 'Cerrar'
                                    });
                                }
                            } catch (err) {
                                console.error('[WA-DEBUG] Error reconectando:', err);
                                setConfirmConfig({ 
                                    title: 'Error de conexión', 
                                    message: `❌ No se pudo iniciar el servicio: ${err.response?.data?.error || err.message}`, 
                                    confirmText: 'Aceptar', 
                                    onConfirm: () => setConfirmConfig(null) 
                                });
                            }
                        }
                    });
                    setSendingWhatsapp(false);
                    return;
                }
            } catch (e) {
                setConfirmConfig({ 
                    title: 'Servicio no disponible', 
                    message: "❌ No se puede contactar con el servicio de WhatsApp. Revisa que estés logueado con permisos suficientes y el backend esté activo.", 
                    confirmText: 'Cerrar', 
                    onConfirm: () => setConfirmConfig(null) 
                });
                setSendingWhatsapp(false);
                return;
            }

            const element = proposalRef.current;
            if (!element) {
                // Reintentar hasta 10 veces con 200ms de espera (el modal puede tardar en renderizar)
                let retries = 0;
                while (!proposalRef.current && retries < 10) {
                    await new Promise(r => setTimeout(r, 200));
                    retries++;
                }
                if (!proposalRef.current) {
                    setConfirmConfig({ title: 'Error', message: "❌ No se encontró la propuesta en el DOM. Cierra y vuelve a abrir el modal.", confirmText: 'Aceptar', onConfirm: () => setConfirmConfig(null) });
                    setSendingWhatsapp(false);
                    return;
                }
            }
            const elForHtml = proposalRef.current;

            const fullHtml = `
                <!DOCTYPE html>
                <html>
                <head>
                    <meta charset="UTF-8">
                    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap" rel="stylesheet">
                    <style>
                        ${baseCss}
                        body { margin: 0; padding: 0; background: white; }
                        * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
                    </style>
                </head>
                <body>
                    <div class="prop-wrapper-inner">
                        ${elForHtml.innerHTML}
                    </div>
                </body>
                </html>
            `;

            const pdfResp = await axios.post('/api/pdf/generate', { html: fullHtml }, { timeout: 90000 });
            const pdfBase64 = pdfResp.data?.pdf;
            if (!pdfBase64) throw new Error(pdfResp.data?.message || 'No se pudo generar el PDF');

            setConfirmConfig({ title: 'Enviando...', message: `PDF generado con éxito. Entregando a WhatsApp para el número ${toPhone}...`, confirmText: null, cancelText: null });

            const f = result || {};
            const fAero = f.financials || {};
            const fReforma = f.financialsRes080 || {};
            
            const firstName = (targetName || '').split(/\s+/)[0] || '';
            const saludo = `¡Hola ${firstName || 'cliente'}!`;
            
            // Flags de tipo de propuesta
            const isReforma = !!inputs?.isReforma;
            const isOnlyReforma = isReforma && inputs?.comparativaReforma === false;
            const isBoth = isReforma && inputs?.comparativaReforma !== false;

            let caption = '';
            
            if (mode === 'PARTNER') {
                const partnerName = targetNameOverride || 'Partner';
                const clientNameForPartner = inputs.referenciaCliente || 'cliente';
                const fName = partnerName.split(/\s+/)[0];

                if (isOnlyReforma) {
                    caption = `¡Hola ${fName}! 👋\n\nTe adjunto la propuesta de ayudas diseñada para vuestro cliente ${clientNameForPartner} (Exp. ${displayId}), donde detallamos los ahorros y subvenciones que puede obtener por Reforma Energética:\n\n🔹 *A modo resumen:*\n\n*Bono Energético:* Gracias al ahorro energético que se produciría en la vivienda tras la reforma, el cliente podría obtener una ayuda de *${formatNumber(Math.round(fReforma.caeBonus || 0))} €* gestionada a través de BROKERGY.\n\nAdemás, si el cliente cumple los requisitos para acogerse a las deducciones en el IRPF por rehabilitación, el importe estimado de estas sería de *${formatNumber(Math.round(fReforma.irpfDeduction || 0))} €*. (Nosotros nos encargamos de toda la justificación técnica necesaria para que pueda solicitarlas con seguridad).\n\n💡 *Resumen total de las ayudas:* El cliente podría recuperar hasta *${formatNumber(Math.round(fReforma.totalAyuda || 0))} €* de su inversión en la reforma energética.\n\nPara avanzar con el proceso, los pasos serían:\n\n• Aceptar el presupuesto de instalación.\n• Aceptar la propuesta técnica adjunta en PDF. Es vital emitir y registrar el Certificado Energético Inicial antes de que pague ninguna factura de la obra para no perder el derecho a las deducciones fiscales.\n\nEl cliente puede firmar la aceptación pulsando en el botón *“✍️ FIRMAR Y ACEPTAR PROPUESTA”* del PDF o directamente aquí:\n🔗 ${APP_URL}/firma/${urlId}\n\nQuedo a vuestra disposición para cualquier duda.\n\nUn saludo,\nFran Moya · BROKERGY`;
                } else if (isBoth) {
                    caption = `¡Hola ${fName}! 👋\n\nTe adjunto la simulación de las ayudas para el proyecto de ${clientNameForPartner} (Exp. ${displayId}), presentando las siguientes opciones para su caso:\n\n🔹 *Opción 1: Instalando solo aerotermia*\nEl cliente podría obtener una ayuda directa de *${formatNumber(Math.round(fAero.caeBonus || 0))} €* gracias al Bono Energético BROKERGY. Si sumamos las deducciones del IRPF (*${formatNumber(Math.round(fAero.irpfDeduction || 0))} €*), podría alcanzar un total de hasta *${formatNumber(Math.round(fAero.totalAyuda || 0))} €*.\n\n🔹 *Opción 2: Aerotermia junto con mejora de la envolvente*\nEn este caso, la ayuda del Bono Energético BROKERGY asciende a *${formatNumber(Math.round(fReforma.caeBonus || 0))} €*. Sumando las deducciones del IRPF (*${formatNumber(Math.round(fReforma.irpfDeduction || 0))} €*), el total para el cliente podría llegar hasta los *${formatNumber(Math.round(fReforma.totalAyuda || 0))} €*.\n\nTe recordamos que para que el cliente pueda acogerse a las deducciones del IRPF debe contar con retenciones aplicables. Por nuestra parte, dejaremos toda la parte técnica preparada para que las pueda solicitar fácilmente.\n\nPara avanzar con el proceso, los pasos serían:\n\n• Aceptar vuestro presupuesto de instalación.\n• Aceptar la propuesta técnica que adjuntamos en PDF. Así podremos presentar el CEE Inicial antes de que se emita ninguna factura, evitando problemas en el trámite.\n\nEl cliente puede firmar la aceptación pulsando en el botón *“✍️ FIRMAR Y ACEPTAR PROPUESTA”* del PDF o bien a través de este enlace:\n🔗 ${APP_URL}/firma/${urlId}\n\nQuedo a vuestra disposición para cualquier duda o aclaración.\n\nUn saludo,\nFran Moya · BROKERGY`;
                } else {
                    caption = `¡Hola ${fName}! 👋\n\nTe adjunto la simulación de las ayudas para el expediente de ${clientNameForPartner} (Exp. ${displayId}), presentando las siguientes opciones para su caso:\n\n🔹 *A modo resumen:*\n\n*Opción 1:* Instalando el sistema de aerotermia, el cliente podría obtener una ayuda de *${formatNumber(Math.round(fAero.caeBonus || 0))} €* gracias al Bono Energético BROKERGY.\n\nAdemás, si el cliente puede acogerse a las deducciones en el IRPF por contar con retenciones aplicables y siempre que estén vigentes, el importe estimado de estas sería de *${formatNumber(Math.round(fAero.irpfDeduction || 0))} €*. (Nosotros dejaremos toda la parte técnica preparada para que las pueda solicitar).\n\n💡 *Resumen total de las ayudas:* El cliente podría obtener hasta *${formatNumber(Math.round(fAero.totalAyuda || 0))} €* combinando ambas opciones.\n\nPara avanzar, los siguientes pasos serían:\n\n• Aceptar el presupuesto del instalador.\n• Aceptar la propuesta que adjuntamos en PDF para que podamos planificar el trabajo y presentar cuanto antes el Certificado de Eficiencia Energética Inicial antes de que le emitan alguna factura, garantizando que el trámite siga su curso sin retrasos.\n\nEl cliente puede aceptar la propuesta pulsando sobre el botón *“✍️ FIRMAR Y ACEPTAR PROPUESTA”* en el PDF o bien accediendo a:\n🔗 ${APP_URL}/firma/${urlId}\n\nQuedo a vuestra disposición para cualquier duda o aclaración.\n\nUn saludo,\nFran Moya · BROKERGY`;
                }
            } else {
                if (isOnlyReforma) {
                    // CASE 1: SOLO REFORMA ENERGÉTICA (RES080)
                    caption = 
`${saludo}

Tal y como acordamos, te adjunto la simulación de las ayudas para tu expediente de Reforma Energética (Nº ${displayId}), donde detallamos los ahorros y subvenciones que puedes obtener:

🔹 *A modo resumen:*

*Bono Energético:* Gracias al ahorro energético que se produciría en tu vivienda tras la reforma, podrías obtener una ayuda de *${formatNumber(Math.round(fReforma.caeBonus || 0))} €* gestionada a través de BROKERGY.

Además, si cumples los requisitos para acogerte a las deducciones en el IRPF por rehabilitación, el importe estimado de estas sería de *${formatNumber(Math.round(fReforma.irpfDeduction || 0))} €*. (Nosotros nos encargamos de toda la justificación técnica necesaria para que puedas solicitarlas con seguridad).

💡 *Resumen total de las ayudas:* Podrías recuperar hasta *${formatNumber(Math.round(fReforma.totalAyuda || 0))} €* de tu inversión en la reforma energética.

Siguientes pasos:

• Revisar y aceptar la propuesta técnica adjunta en PDF.
• Es vital emitir y registrar el Certificado Energético Inicial antes de que pagues ninguna factura de la obra para no perder el derecho a las deducciones fiscales.

Puedes firmar la aceptación pulsando en el botón del PDF *“✍️ FIRMAR Y ACEPTAR PROPUESTA”* o directamente aquí: ${APP_URL}/firma/${urlId}

Quedo a tu disposición para cualquier duda.

Un saludo, Fran Moya

BROKERGY — Ingeniería Energética`;

            } else if (isBoth) {
                // CASE 2: COMPARATIVA (AEROTERMIA VS REFORMA) - TEXTO SOLICITADO POR USUARIO
                const bonoAero = Math.round(fAero.caeBonus || 0);
                const irpfAero = Math.round(fAero.irpfDeduction || 0);
                const totalAero = Math.round(fAero.totalAyuda || 0);
                
                const bonoReforma = Math.round(fReforma.caeBonus || 0);
                const irpfReforma = Math.round(fReforma.irpfDeduction || 0);
                const totalReforma = Math.round(fReforma.totalAyuda || 0);

                caption = 
`${saludo}

Tal y como acordamos, te adjunto la simulación de las ayudas para tu proyecto, presentando las siguientes opciones:

🔹 *Opción 1: Instalando solo aerotermia*
Podrías obtener una ayuda directa de *${formatNumber(bonoAero)} €* gracias al Bono Energético BROKERGY. Si sumamos las deducciones del IRPF (*${formatNumber(irpfAero)} €*), podrías alcanzar un total de hasta *${formatNumber(totalAero)} €*.

🔹 *Opción 2: Aerotermia junto con mejora de la envolvente (cambio de ventanas y/o aislamiento en muros o cubierta)*
En este caso, la ayuda del Bono Energético BROKERGY asciende a *${formatNumber(bonoReforma)} €*. Sumando las deducciones del IRPF (*${formatNumber(irpfReforma)} €*), el total podría llegar hasta los *${formatNumber(totalReforma)} €*.

Te recordamos que para acogerte a las deducciones del IRPF debes contar con retenciones aplicables y la normativa debe seguir vigente. Por nuestra parte, dejaremos toda la parte técnica preparada para que las puedas solicitar fácilmente.

Para avanzar con el proceso, los pasos serían:

• Aceptar el presupuesto del instalador.
• Aceptar la propuesta que te adjuntamos en PDF. Así podremos planificar el trabajo y presentar el Certificado de Eficiencia Energética Inicial antes de que os emitan alguna factura, evitando retrasos en el trámite.

Puedes aceptar el presupuesto pulsando sobre el botón *“✍️ FIRMAR Y ACEPTAR PROPUESTA”* en el PDF adjunto, o bien accediendo directamente desde aquí:
🔗 ${APP_URL}/firma/${urlId}

Quedo a tu disposición para cualquier duda o aclaración.

Un saludo,

Fran Moya
BROKERGY | Ingeniería Energética
https://brokergy.es/`;

            } else {
                // CASE 3: SOLO AEROTERMIA (Original)
                caption = 
`${saludo}

Tal y como acordamos, te adjunto la simulación de las ayudas para tu expediente (Nº ${displayId}), presentando las siguientes opciones para tu caso:

🔹 *A modo resumen:*

*Opción 1:* Instalando el sistema de aerotermia, podrías obtener una ayuda de *${formatNumber(Math.round(fAero.caeBonus || 0))} €* gracias al Bono Energético BROKERGY.

Además, si en tu caso puedes acogerte a las deducciones en el IRPF por contar con retenciones aplicables y siempre y cuando estén vigentes, el importe estimado de estas sería de *${formatNumber(Math.round(fAero.irpfDeduction || 0))} €*. (Nosotros dejaremos toda la parte técnica preparada para que las puedas solicitar).

💡 *Resumen total de las ayudas:* Podrías obtener hasta *${formatNumber(Math.round(fAero.totalAyuda || 0))} €* combinando ambas opciones.

En caso de conformidad, los siguientes pasos serían:

• Aceptar el presupuesto al instalador (si no lo has aceptado ya)
• Aceptar la propuesta que te adjuntamos en PDF para que podamos planificar el trabajo y presentar cuanto antes el Certificado de Eficiencia Energética Inicial antes de que os emitan alguna factura, para que el trámite pueda seguir su curso de manera ágil y sin retrasos.

El presupuesto lo puedes aceptar pulsando sobre el botón del PDF *“✍️ FIRMAR Y ACEPTAR PROPUESTA”* o bien directamente accediendo a ${APP_URL}/firma/${urlId}

Quedo a tu disposición para cualquier duda o aclaración.

Un saludo, Fran Moya

BROKERGY — Especialistas en Eficiencia Energética


info@brokergy.es · 623 926 179`;
                }
            }

            const baseFileName = inputs?.id_oportunidad || inputs?.rc || 'Propuesta';
            const safeName = baseFileName.toString().replace(/[^a-zA-Z0-9_\-]/g, '_');
            const filename = `Propuesta_Brokergy_${safeName}.pdf`;

            console.log('[WA-DEBUG] Intentando POST a /api/whatsapp/send-media para', toPhone);
            const sendResp = await axios.post('/api/whatsapp/send-media', {
                phone: toPhone,
                caption,
                media: { base64: pdfBase64, filename, mimetype: 'application/pdf' },
                asDocument: true,
            });

            console.log('[WA-DEBUG] Respuesta recibida:', sendResp.data);

            if (sendResp.data?.ok) {
                // AUTOMATIZACIÓN: Cambiar estado a ENVIADA al enviar por WhatsApp
                try {
                    await axios.patch(`/api/oportunidades/${inputs.id_oportunidad}/estado`, { nuevo_estado: 'ENVIADA' });
                    console.log(`[StatusUpdate] Oportunidad ${inputs.id_oportunidad} marcada como ENVIADA automáticamente.`);
                } catch (stErr) {
                    console.error('Error actualizando estado automático (WA):', stErr);
                }

                setConfirmConfig({ title: 'Enviado', message: `✅ Propuesta enviada correctamente a ${toPhone}`, confirmText: 'Genial', onConfirm: () => setConfirmConfig(null) });
            } else {
                throw new Error(sendResp.data?.error || 'Respuesta inesperada del servidor');
            }
        } catch (error) {
            console.error('[WA] Error sending WhatsApp:', error);
            setConfirmConfig({ title: 'Error', message: "❌ Error al enviar por WhatsApp: " + (error.response?.data?.error || error.message), confirmText: 'Aceptar', onConfirm: () => setConfirmConfig(null) });
        } finally {
            setSendingWhatsapp(false);
        }
    }, [inputs, result, displayId, urlId, proposalRef]);

    // Comparativa "con tu CEE vs. CEE nuevo BROKERGY" — solo si el cliente aportó CEE.
    const ceeComparisonRaw = useMemo(() => (inputs?.cee_previo ? computeCeeComparison(inputs) : null), [inputs]);

    // Si el CEE aportado y uno nuevo dan EL MISMO bono no hay nada que elegir, y
    // sacar la comparativa ("Con tu CEE: 1.795 € · con un CEE nuevo: 1.795 €")
    // solo confunde. Pasa cuando el certificado aportado arroja prácticamente
    // las mismas emisiones que nuestra estimación. A partir de aquí la propuesta
    // y los mensajes usan esta versión filtrada, no la cruda.
    const ceeComparison = useMemo(() => {
        if (!ceeComparisonRaw) return null;
        const conCee = Math.round(ceeComparisonRaw.conCee?.cae || 0);
        const nuevo = Math.round(ceeComparisonRaw.ceeNuevo?.cae || 0);
        return conCee === nuevo ? null : ceeComparisonRaw;
    }, [ceeComparisonRaw]);

    const buildCaption = useCallback((mode, targetName, opts = {}) => {
        const f = result || {};
        const fAero = f.financials || {};
        const fReforma = f.financialsRes080 || {};
        const isReforma = !!inputs?.isReforma;
        const isOnlyReforma = isReforma && inputs?.comparativaReforma === false;
        const isBoth = isReforma && inputs?.comparativaReforma !== false;

        // ── VARIANTE "CEE APORTADO": comparativa con tu CEE vs. un CEE nuevo BROKERGY ──
        if (opts.cee && ceeComparison) {
            const conCee = Math.round(ceeComparison.conCee?.cae || 0);
            const ceeNuevo = Math.round(ceeComparison.ceeNuevo?.cae || 0);
            const irpf = Math.round(ceeComparison.irpf || 0);
            const conCeeTotal = Math.round(ceeComparison.conCee?.total || 0);
            const ceeNuevoTotal = Math.round(ceeComparison.ceeNuevo?.total || 0);
            const explica = 'El Bono Energético CAE se calcula sobre el ahorro de energía que refleja el Certificado de Eficiencia Energética (CEE) inicial. Con el CEE que ya se tiene se parte de sus valores; si emitimos nosotros un CEE inicial nuevo antes de la obra, reflejamos el estado real de partida de la vivienda, lo que puede aumentar el ahorro certificado y, por tanto, el bono. La deducción del IRPF es la misma en ambos casos.';
            if (mode === 'PARTNER' || mode === 'INSTALADOR') {
                const clientNameForPartner = inputs?.referenciaCliente || 'cliente';
                const pName = (targetName || (mode === 'INSTALADOR' ? 'Instalador' : 'Partner')).split(/\s+/)[0];
                return `¡Hola ${pName}! 👋\n\nTe adjunto la simulación de las ayudas para ${clientNameForPartner} (Exp. ${displayId}). Como el cliente ya cuenta con un CEE inicial, hay dos opciones y decide él:\n\n🔹 *Opción A — Con el CEE aportado:*\nBono Energético CAE de *${formatNumber(conCee)} €*.\n\n🔹 *Opción B — Emitiendo un CEE inicial nuevo (BROKERGY):*\nBono Energético CAE de *${formatNumber(ceeNuevo)} €*.\n\n_¿Por qué la diferencia?_ ${explica}\n\nAdemás, si el cliente puede acogerse a las deducciones del IRPF (retenciones aplicables y normativa vigente), el importe estimado sería de *${formatNumber(irpf)} €*, igual en ambas opciones. Dejaremos toda la parte técnica preparada.\n\n💡 *Total de ayudas (bono + IRPF):*\n• Con su CEE: *${formatNumber(conCeeTotal)} €*\n• Con un CEE nuevo: *${formatNumber(ceeNuevoTotal)} €*\n\nPara avanzar, los pasos serían:\n\n• Aceptar el presupuesto de instalación.\n• Indicarnos si usamos el CEE existente o hacemos uno nuevo.\n• Aceptar la propuesta adjunta en PDF para presentar cuanto antes el CEE Inicial antes de que se emita ninguna factura, evitando retrasos.\n\nFirma de aceptación con el botón *"✍️ FIRMAR Y ACEPTAR PROPUESTA"* del PDF o aquí:\n🔗 ${APP_URL}/firma/${urlId}\n\nQuedo a vuestra disposición para cualquier duda.\n\nUn saludo,\nFran Moya · BROKERGY`;
            }
            const firstName = (targetName || '').split(/\s+/)[0] || '';
            const saludo = `¡Hola ${firstName || 'cliente'}!`;
            return `${saludo}\n\nTal y como acordamos, te adjunto la simulación de las ayudas para tu expediente (Nº ${displayId}). Como ya cuentas con un Certificado de Eficiencia Energética (CEE) inicial, te presento *dos opciones* para que elijas la que prefieras:\n\n🔹 *Opción A — Usando el CEE que nos has aportado:*\nEl Bono Energético CAE sería de *${formatNumber(conCee)} €*.\n\n🔹 *Opción B — Emitiendo nosotros un CEE inicial nuevo:*\nEl Bono Energético CAE sería de *${formatNumber(ceeNuevo)} €* gracias al Bono Energético BROKERGY.\n\n_¿Por qué la diferencia?_ ${explica.replace('ya se tiene', 'nos aportas').replace('la vivienda', 'tu vivienda')} *Tú eliges* qué opción usar.\n\nAdemás, si en tu caso puedes acogerte a las deducciones en el IRPF (por contar con retenciones aplicables y siempre que la normativa esté vigente), el importe estimado sería de *${formatNumber(irpf)} €*, *el mismo en ambas opciones*. Dejaremos toda la parte técnica preparada para que las puedas solicitar.\n\n💡 *Resumen total de las ayudas (bono + IRPF):*\n• Con tu CEE: *${formatNumber(conCeeTotal)} €*\n• Con un CEE nuevo: *${formatNumber(ceeNuevoTotal)} €*\n\nEn caso de conformidad, los siguientes pasos serían:\n\n• Aceptar el presupuesto al instalador (si no lo has aceptado ya).\n• Indicarnos si usamos el CEE existente o hacemos uno nuevo.\n• Aceptar la propuesta que te adjuntamos en PDF para que podamos planificar el trabajo y presentar cuanto antes el Certificado de Eficiencia Energética Inicial antes de que os emitan alguna factura, para que el trámite pueda seguir su curso de manera ágil y sin retrasos.\n\nEl presupuesto lo puedes aceptar pulsando sobre el botón del PDF *"✍️ FIRMAR Y ACEPTAR PROPUESTA"* o bien directamente accediendo a ${APP_URL}/firma/${urlId}\n\nQuedo a tu disposición para cualquier duda o aclaración.\n\nUn saludo, Fran Moya\n\nBROKERGY — Especialistas en Eficiencia Energética\n\n\ninfo@brokergy.es · 623 926 179`;
        }

        if (mode === 'PARTNER' || mode === 'INSTALADOR') {
            const clientNameForPartner = inputs?.referenciaCliente || 'cliente';
            const fName = (targetName || (mode === 'INSTALADOR' ? 'Instalador' : 'Partner')).split(/\s+/)[0];
            if (isOnlyReforma) {
                return `¡Hola ${fName}! 👋\n\nTe adjunto la propuesta de ayudas diseñada para vuestro cliente ${clientNameForPartner} (Exp. ${displayId}), donde detallamos los ahorros y subvenciones que puede obtener por Reforma Energética:\n\n🔹 *A modo resumen:*\n\n*Bono Energético:* Gracias al ahorro energético que se produciría en la vivienda tras la reforma, el cliente podría obtener una ayuda de *${formatNumber(Math.round(fReforma.caeBonus || 0))} €* gestionada a través de BROKERGY.\n\nAdemás, si el cliente cumple los requisitos para acogerse a las deducciones en el IRPF por rehabilitación, el importe estimado de estas sería de *${formatNumber(Math.round(fReforma.irpfDeduction || 0))} €*. (Nosotros nos encargamos de toda la justificación técnica necesaria para que pueda solicitarlas con seguridad).\n\n💡 *Resumen total de las ayudas:* El cliente podría recuperar hasta *${formatNumber(Math.round(fReforma.totalAyuda || 0))} €* de su inversión en la reforma energética.\n\nPara avanzar con el proceso, los pasos serían:\n\n• Aceptar el presupuesto de instalación.\n• Aceptar la propuesta técnica adjunta en PDF. Es vital emitir y registrar el Certificado Energético Inicial antes de que pague ninguna factura de la obra para no perder el derecho a las deducciones fiscales.\n\nEl cliente puede firmar la aceptación pulsando en el botón *"✍️ FIRMAR Y ACEPTAR PROPUESTA"* del PDF o directamente aquí:\n🔗 ${APP_URL}/firma/${urlId}\n\nQuedo a vuestra disposición para cualquier duda.\n\nUn saludo,\nFran Moya · BROKERGY`;
            } else if (isBoth) {
                return `¡Hola ${fName}! 👋\n\nTe adjunto la simulación de las ayudas para el proyecto de ${clientNameForPartner} (Exp. ${displayId}), presentando las siguientes opciones para su caso:\n\n🔹 *Opción 1: Instalando solo aerotermia*\nEl cliente podría obtener una ayuda directa de *${formatNumber(Math.round(fAero.caeBonus || 0))} €* gracias al Bono Energético BROKERGY. Si sumamos las deducciones del IRPF (*${formatNumber(Math.round(fAero.irpfDeduction || 0))} €*), podría alcanzar un total de hasta *${formatNumber(Math.round(fAero.totalAyuda || 0))} €*.\n\n🔹 *Opción 2: Aerotermia junto con mejora de la envolvente*\nEn este caso, la ayuda del Bono Energético BROKERGY asciende a *${formatNumber(Math.round(fReforma.caeBonus || 0))} €*. Sumando las deducciones del IRPF (*${formatNumber(Math.round(fReforma.irpfDeduction || 0))} €*), el total para el cliente podría llegar hasta los *${formatNumber(Math.round(fReforma.totalAyuda || 0))} €*.\n\nTe recordamos que para que el cliente pueda acogerse a las deducciones del IRPF debe contar con retenciones aplicables. Por nuestra parte, dejaremos toda la parte técnica preparada para que las pueda solicitar fácilmente.\n\nPara avanzar con el proceso, los pasos serían:\n\n• Aceptar vuestro presupuesto de instalación.\n• Aceptar la propuesta técnica que adjuntamos en PDF. Así podremos presentar el CEE Inicial antes de que se emita ninguna factura, evitando problemas en el trámite.\n\nEl cliente puede firmar la aceptación pulsando en el botón *"✍️ FIRMAR Y ACEPTAR PROPUESTA"* del PDF o bien a través de este enlace:\n🔗 ${APP_URL}/firma/${urlId}\n\nQuedo a vuestra disposición para cualquier duda o aclaración.\n\nUn saludo,\nFran Moya · BROKERGY`;
            } else {
                return `¡Hola ${fName}! 👋\n\nTe adjunto la simulación de las ayudas para el expediente de ${clientNameForPartner} (Exp. ${displayId}), presentando las siguientes opciones para su caso:\n\n🔹 *A modo resumen:*\n\n*Opción 1:* Instalando el sistema de aerotermia, el cliente podría obtener una ayuda de *${formatNumber(Math.round(fAero.caeBonus || 0))} €* gracias al Bono Energético BROKERGY.\n\nAdemás, si el cliente puede acogerse a las deducciones en el IRPF por contar con retenciones aplicables y siempre que estén vigentes, el importe estimado de estas sería de *${formatNumber(Math.round(fAero.irpfDeduction || 0))} €*. (Nosotros dejaremos toda la parte técnica preparada para que las pueda solicitar).\n\n💡 *Resumen total de las ayudas:* El cliente podría obtener hasta *${formatNumber(Math.round(fAero.totalAyuda || 0))} €* combinando ambas opciones.\n\nPara avanzar, los siguientes pasos serían:\n\n• Aceptar el presupuesto del instalador.\n• Aceptar la propuesta que adjuntamos en PDF para que podamos planificar el trabajo y presentar cuanto antes el Certificado de Eficiencia Energética Inicial antes de que le emitan alguna factura, garantizando que el trámite siga su curso sin retrasos.\n\nEl cliente puede aceptar la propuesta pulsando sobre el botón *"✍️ FIRMAR Y ACEPTAR PROPUESTA"* en el PDF o bien accediendo a:\n🔗 ${APP_URL}/firma/${urlId}\n\nQuedo a vuestra disposición para cualquier duda o aclaración.\n\nUn saludo,\nFran Moya · BROKERGY`;
            }
        } else {
            // CLIENTE
            const firstName = (targetName || '').split(/\s+/)[0] || '';
            const saludo = `¡Hola ${firstName || 'cliente'}!`;
            if (isOnlyReforma) {
                return `${saludo}\n\nTal y como acordamos, te adjunto la simulación de las ayudas para tu expediente de Reforma Energética (Nº ${displayId}), donde detallamos los ahorros y subvenciones que puedes obtener:\n\n🔹 *A modo resumen:*\n\n*Bono Energético:* Gracias al ahorro energético que se produciría en tu vivienda tras la reforma, podrías obtener una ayuda de *${formatNumber(Math.round(fReforma.caeBonus || 0))} €* gestionada a través de BROKERGY.\n\nAdemás, si cumples los requisitos para acogerte a las deducciones en el IRPF por rehabilitación, el importe estimado de estas sería de *${formatNumber(Math.round(fReforma.irpfDeduction || 0))} €*. (Nosotros nos encargamos de toda la justificación técnica necesaria para que puedas solicitarlas con seguridad).\n\n💡 *Resumen total de las ayudas:* Podrías recuperar hasta *${formatNumber(Math.round(fReforma.totalAyuda || 0))} €* de tu inversión en la reforma energética.\n\nSiguientes pasos:\n\n• Revisar y aceptar la propuesta técnica adjunta en PDF.\n• Es vital emitir y registrar el Certificado Energético Inicial antes de que pagues ninguna factura de la obra para no perder el derecho a las deducciones fiscales.\n\nPuedes firmar la aceptación pulsando en el botón del PDF *"✍️ FIRMAR Y ACEPTAR PROPUESTA"* o directamente aquí: ${APP_URL}/firma/${urlId}\n\nQuedo a tu disposición para cualquier duda.\n\nUn saludo, Fran Moya\n\nBROKERGY — Ingeniería Energética`;
            } else if (isBoth) {
                const bonoAero = Math.round(fAero.caeBonus || 0);
                const irpfAero = Math.round(fAero.irpfDeduction || 0);
                const totalAero = Math.round(fAero.totalAyuda || 0);
                const bonoReforma = Math.round(fReforma.caeBonus || 0);
                const irpfReforma = Math.round(fReforma.irpfDeduction || 0);
                const totalReforma = Math.round(fReforma.totalAyuda || 0);
                return `${saludo}\n\nTal y como acordamos, te adjunto la simulación de las ayudas para tu proyecto, presentando las siguientes opciones:\n\n🔹 *Opción 1: Instalando solo aerotermia*\nPodrías obtener una ayuda directa de *${formatNumber(bonoAero)} €* gracias al Bono Energético BROKERGY. Si sumamos las deducciones del IRPF (*${formatNumber(irpfAero)} €*), podrías alcanzar un total de hasta *${formatNumber(totalAero)} €*.\n\n🔹 *Opción 2: Aerotermia junto con mejora de la envolvente (cambio de ventanas y/o aislamiento en muros o cubierta)*\nEn este caso, la ayuda del Bono Energético BROKERGY asciende a *${formatNumber(bonoReforma)} €*. Sumando las deducciones del IRPF (*${formatNumber(irpfReforma)} €*), el total podría llegar hasta los *${formatNumber(totalReforma)} €*.\n\nTe recordamos que para acogerte a las deducciones del IRPF debes contar con retenciones aplicables y la normativa debe seguir vigente. Por nuestra parte, dejaremos toda la parte técnica preparada para que las puedas solicitar fácilmente.\n\nPara avanzar con el proceso, los pasos serían:\n\n• Aceptar el presupuesto del instalador.\n• Aceptar la propuesta que te adjuntamos en PDF. Así podremos planificar el trabajo y presentar el Certificado de Eficiencia Energética Inicial antes de que os emitan alguna factura, evitando retrasos en el trámite.\n\nPuedes aceptar el presupuesto pulsando sobre el botón *"✍️ FIRMAR Y ACEPTAR PROPUESTA"* en el PDF adjunto, o bien accediendo directamente desde aquí:\n🔗 ${APP_URL}/firma/${urlId}\n\nQuedo a tu disposición para cualquier duda o aclaración.\n\nUn saludo,\n\nFran Moya\nBROKERGY | Ingeniería Energética\nhttps://brokergy.es/`;
            } else {
                return `${saludo}\n\nTal y como acordamos, te adjunto la simulación de las ayudas para tu expediente (Nº ${displayId}), presentando las siguientes opciones para tu caso:\n\n🔹 *A modo resumen:*\n\n*Opción 1:* Instalando el sistema de aerotermia, podrías obtener una ayuda de *${formatNumber(Math.round(fAero.caeBonus || 0))} €* gracias al Bono Energético BROKERGY.\n\nAdemás, si en tu caso puedes acogerte a las deducciones en el IRPF por contar con retenciones aplicables y siempre y cuando estén vigentes, el importe estimado de estas sería de *${formatNumber(Math.round(fAero.irpfDeduction || 0))} €*. (Nosotros dejaremos toda la parte técnica preparada para que las puedas solicitar).\n\n💡 *Resumen total de las ayudas:* Podrías obtener hasta *${formatNumber(Math.round(fAero.totalAyuda || 0))} €* combinando ambas opciones.\n\nEn caso de conformidad, los siguientes pasos serían:\n\n• Aceptar el presupuesto al instalador (si no lo has aceptado ya)\n• Aceptar la propuesta que te adjuntamos en PDF para que podamos planificar el trabajo y presentar cuanto antes el Certificado de Eficiencia Energética Inicial antes de que os emitan alguna factura, para que el trámite pueda seguir su curso de manera ágil y sin retrasos.\n\nEl presupuesto lo puedes aceptar pulsando sobre el botón del PDF *"✍️ FIRMAR Y ACEPTAR PROPUESTA"* o bien directamente accediendo a ${APP_URL}/firma/${urlId}\n\nQuedo a tu disposición para cualquier duda o aclaración.\n\nUn saludo, Fran Moya\n\nBROKERGY — Especialistas en Eficiencia Energética\n\n\ninfo@brokergy.es · 623 926 179`;
            }
        }
    }, [inputs, result, displayId, urlId, ceeComparison]);

    const sendToMultiple = useCallback(async (selectedModes, customMessages = {}) => {
        setRecipientChoice(false);
        setSendingWhatsapp(true);

        // 1. Resolver datos de cada destinatario
        setConfirmConfig({ title: 'Preparando...', message: 'Resolviendo datos de contacto...', confirmText: null, cancelText: null });
        const recipients = [];
        for (const mode of selectedModes) {
            let phone = null, name = '';
            if (mode === 'CLIENTE') {
                if (clienteInfo) {
                    phone = clienteInfo.phone; name = clienteInfo.name;
                } else {
                    name = inputs?.referenciaCliente || 'Cliente';
                    if (inputs?.cliente_id) {
                        try {
                            const r = await axios.get(`/api/clientes/${inputs.cliente_id}`);
                            const c = r.data;
                            const uc = c.notificaciones_contacto_activas === true;
                            name = (uc && c.persona_contacto_nombre) ? c.persona_contacto_nombre : (c.nombre_razon_social || name);
                            phone = (uc && c.persona_contacto_tlf) ? c.persona_contacto_tlf : (c.tlf || c.telefono || null);
                        } catch (e) { console.warn('[WA] No se pudo obtener teléfono del cliente'); }
                    }
                    if (!phone) phone = inputs?.tlf_contacto || inputs?.tlf || inputs?.telefono || null;
                }
            } else if (mode === 'PARTNER') {
                if (partnerInfo) {
                    name = partnerInfo.name; phone = partnerInfo.phone;
                } else {
                    const pid = inputs?.prescriptor_id;
                    if (pid) {
                        try {
                            const r = await axios.get(`/api/prescriptores/${pid}`);
                            const p = r.data;
                            const uc = p.contacto_notificaciones_activas === true;
                            name = uc ? (p.nombre_contacto || p.acronimo || p.razon_social) : (p.acronimo || p.razon_social || 'Partner');
                            phone = uc ? (p.tlf_contacto || p.tlf) : (p.tlf || p.telefono || null);
                        } catch (e) { console.warn('[WA] No se pudo obtener teléfono del partner'); }
                    }
                }
            } else if (mode === 'INSTALADOR') {
                if (instaladorInfo) {
                    name = instaladorInfo.name; phone = instaladorInfo.phone;
                } else {
                    const iid = inputs?.instalador_asociado_id;
                    if (iid) {
                        try {
                            const r = await axios.get(`/api/prescriptores/${iid}`);
                            const p = r.data;
                            const uc = p.contacto_notificaciones_activas === true || p.contacto_notificaciones_activas === 'true';
                            name = uc ? (p.nombre_contacto || p.acronimo || p.razon_social || 'Instalador') : (p.acronimo || p.razon_social || 'Instalador');
                            phone = uc ? (p.tlf_contacto || p.tlf || p.telefono || null) : (p.tlf || p.telefono || null);
                        } catch (e) { console.warn('[WA] No se pudo obtener teléfono del instalador'); }
                    }
                }
            } else if (mode === 'OTRO') {
                name = manualContact.name || 'Otro contacto';
                phone = manualContact.phone || null;
            }
            recipients.push({ phone, mode, name });

        }

        // 2. Validar teléfonos
        const missing = recipients.filter(r => !r.phone || String(r.phone).replace(/\D/g, '').length < 9);
        if (missing.length > 0) {
            const msgList = missing.map(r => `• ${r.name || r.mode}: sin teléfono registrado`).join('\n');
            setConfirmConfig({ title: 'Faltan teléfonos', message: `❌ No se puede enviar a:\n${msgList}`, confirmText: 'Aceptar', onConfirm: () => { setConfirmConfig(null); setSendingWhatsapp(false); } });
            return;
        }

        // 3. Verificar estado de WhatsApp
        try {
            const st = await axios.get('/api/whatsapp/status');
            if (!st.data?.ready) {
                setConfirmConfig({ title: 'WhatsApp desconectado', message: `❌ WhatsApp no está conectado (estado: ${st.data?.state || 'desconocido'}).`, confirmText: 'Cerrar', onConfirm: () => { setConfirmConfig(null); setSendingWhatsapp(false); } });
                return;
            }
        } catch (e) {
            setConfirmConfig({ title: 'Servicio no disponible', message: '❌ No se puede contactar con el servicio de WhatsApp.', confirmText: 'Cerrar', onConfirm: () => { setConfirmConfig(null); setSendingWhatsapp(false); } });
            return;
        }

        // 4. Generar PDF una sola vez
        setConfirmConfig({ title: 'Generando PDF...', message: 'Preparando la propuesta para enviar...', confirmText: null, cancelText: null });
        let pdfBase64;
        try {
            let retries = 0;
            while (!proposalRef.current && retries < 10) { await new Promise(r => setTimeout(r, 200)); retries++; }
            const el = proposalRef.current;
            if (!el) throw new Error('No se puede acceder al contenido de la propuesta.');
            const fullHtml = `<!DOCTYPE html><html><head><meta charset="UTF-8"><link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap" rel="stylesheet"><style>${baseCss} body{margin:0;padding:0;background:white}*{-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important}</style></head><body><div class="prop-wrapper-inner">${el.innerHTML}</div></body></html>`;
            const r = await axios.post('/api/pdf/generate', { html: fullHtml }, { timeout: 90000 });
            pdfBase64 = r.data?.pdf;
            if (!pdfBase64) throw new Error(r.data?.message || 'No se pudo generar el PDF');
        } catch (e) {
            setConfirmConfig({ title: 'Error al generar PDF', message: '❌ ' + e.message, confirmText: 'Aceptar', onConfirm: () => { setConfirmConfig(null); setSendingWhatsapp(false); } });
            return;
        }

        const baseFileName = inputs?.id_oportunidad || inputs?.rc || 'Propuesta';
        const filename = `Propuesta_Brokergy_${baseFileName.toString().replace(/[^a-zA-Z0-9_\-]/g, '_')}.pdf`;

        // 5. Enviar a cada destinatario con su mensaje personalizado
        const results = [];
        for (let i = 0; i < recipients.length; i++) {
            const { phone, mode, name } = recipients[i];
            const toPhone = String(phone).replace(/[^0-9]/g, '');
            const caption = customMessages[mode] || buildCaption(mode, name);
            setConfirmConfig({ title: `Enviando ${i + 1}/${recipients.length}...`, message: `Entregando a ${name} (${toPhone})...`, confirmText: null, cancelText: null });
            try {
                const r = await axios.post('/api/whatsapp/send-media', { phone: toPhone, caption, media: { base64: pdfBase64, filename, mimetype: 'application/pdf' }, asDocument: true });
                results.push({ name, ok: r.data?.ok === true });
            } catch (e) {
                results.push({ name, ok: false, error: e.response?.data?.error || e.message });
            }
        }

        // 6. Marcar como ENVIADA si se envió al cliente con éxito
        if (selectedModes.includes('CLIENTE') && results.some(r => r.ok)) {
            try {
                await axios.patch(`/api/oportunidades/${inputs.id_oportunidad}/estado`, { nuevo_estado: 'ENVIADA' });
            } catch (e) { console.warn('[WA] No se pudo actualizar estado:', e.message); }
        }

        // 6. Log manual recipient in history
        if (selectedModes.includes('OTRO')) {
            const manualResult = results.find(r => r.mode === 'OTRO');
            if (manualResult?.ok) {
                try {
                    await axios.post(`/api/oportunidades/${inputs.id_oportunidad}/comentarios`, {
                        comentario: `[SISTEMA] Propuesta enviada por WhatsApp a contacto manual: ${manualContact.name || 'Sin nombre'} (${manualContact.phone})`
                    });
                } catch (e) { console.warn('[WA] No se pudo registrar en historial'); }
            }
        }


        // 7. Mostrar resultado final
        const allOk = results.every(r => r.ok);
        const summary = results.map(r => `${r.ok ? '✅' : '❌'} ${r.name}${!r.ok && r.error ? ': ' + r.error : ''}`).join('\n');
        setConfirmConfig({ title: allOk ? '¡Propuesta enviada!' : 'Resultado del envío', message: summary, confirmText: 'Aceptar', onConfirm: () => setConfirmConfig(null) });
        setSendingWhatsapp(false);
    }, [buildCaption, inputs, proposalRef, partnerInfo, instaladorInfo, clienteInfo]);

    const handleSendByWhatsapp = () => {
        setSendingWhatsapp(false);
        setRecipientSelections(new Set());
        setWaStep(0);
        setWaMessages({});
        setWaActiveTab(null);
        setRecipientChoice(true);
    };

    // ── Datos para el popup unificado de envío (EnviarPropuestaModal) ──────────
    const propCandidates = (() => {
        const list = [{
            mode: 'CLIENTE',
            label: clienteInfo?.name || inputs?.referenciaCliente || 'Cliente',
            sublabel: 'Cliente',
            email: clienteInfo?.email || inputs?.email_contacto || inputs?.email || '',
            phone: clienteInfo?.phone || inputs?.tlf_contacto || inputs?.tlf || inputs?.telefono || '',
        }];
        // `label` = la persona a la que se escribe (interlocutor de notificaciones);
        // `org` = la empresa, que se muestra debajo para no perder de vista quién es.
        if (partnerInfo) list.push({ mode: 'PARTNER', label: partnerInfo.name || 'Distribuidor', sublabel: 'Distribuidor', org: partnerInfo.org || '', email: partnerInfo.email || '', phone: partnerInfo.phone || '' });
        if (instaladorInfo) list.push({ mode: 'INSTALADOR', label: instaladorInfo.name || 'Instalador', sublabel: 'Instalador', org: instaladorInfo.org || '', email: instaladorInfo.email || '', phone: instaladorInfo.phone || '' });
        return list;
    })();

    const getProposalPdfHtml = () => {
        const el = proposalRef.current;
        if (!el) return '';
        return `<!DOCTYPE html><html><head><meta charset="UTF-8"><link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap" rel="stylesheet"><style>${baseCss} body{margin:0;padding:0;background:white}*{-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important}</style></head><body><div class="prop-wrapper-inner">${el.innerHTML}</div></body></html>`;
    };
    const getProposalEmailHtml = () => {
        const el = proposalRef.current;
        if (!el) return '';
        return `<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap" rel="stylesheet"><style>${baseCss} body{margin:0;padding:0;background:#e5e7eb;display:flex;justify-content:center;align-items:flex-start;min-height:100vh;font-family:'Inter',sans-serif;}*{-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important}.web-document-container{width:100%;min-height:1123px;background:white;margin:0;}@media screen{.web-document-container{max-width:794px;margin:40px auto;box-shadow:0 20px 25px -5px rgba(0,0,0,.1);border-radius:8px;overflow:hidden;}}@media print{body{background:white;display:block;}.web-document-container{margin:0;max-width:100%;width:100%;border-radius:0;}}</style></head><body><div class="web-document-container"><div class="prop-wrapper-inner">${el.innerHTML}</div></div></body></html>`;
    };
    const buildPropSummaryData = (mode) => {
        const f = result || {};
        const fAero = f.financials || {};
        const f80 = f.financialsRes080 || {};
        const isReforma = !!inputs?.isReforma;
        const isOnlyReforma = isReforma && inputs?.comparativaReforma === false;
        const isBoth = isReforma && inputs?.comparativaReforma !== false;
        const isB2B = mode === 'PARTNER' || mode === 'INSTALADOR';
        const clienteName = clienteInfo?.name || inputs?.referenciaCliente || '';
        return {
            id: displayId, urlId, mode,
            clienteName: isB2B ? clienteName : undefined,
            isReforma, isOnlyReforma, isBoth,
            caeBonus: `${formatNumber(Math.round(fAero.caeBonus || 0))} €`,
            irpfDeduction: `${formatNumber(Math.round(fAero.irpfDeduction || 0))} €`,
            totalAyuda: `${formatNumber(Math.round(fAero.totalAyuda || 0))} €`,
            fAero: { caeBonus: `${formatNumber(Math.round(fAero.caeBonus || 0))} €`, irpfDeduction: `${formatNumber(Math.round(fAero.irpfDeduction || 0))} €`, totalAyuda: `${formatNumber(Math.round(fAero.totalAyuda || 0))} €` },
            f80: isReforma ? { caeBonus: `${formatNumber(Math.round(f80.caeBonus || 0))} €`, irpfDeduction: `${formatNumber(Math.round(f80.irpfDeduction || 0))} €`, totalAyuda: `${formatNumber(Math.round(f80.totalAyuda || 0))} €` } : null,
            htmlTable: ''
        };
    };

    if (!isOpen || !result || !result.financials) return null;

    const handleDownloadPdf = async () => {
        setGenerating(true);
        try {
            const element = proposalRef.current;
            if (!element) {
                console.error("No se encontró el elemento de la propuesta.");
                return;
            }

            // Construir documento HTML completo autónomo con estilos base robustos
            const fullHtml = `
                <!DOCTYPE html>
                <html>
                <head>
                    <meta charset="UTF-8">
                    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap" rel="stylesheet">
                    <style>
                        ${baseCss}
                        body { margin: 0; padding: 0; background: white; }
                        * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
                    </style>
                </head>
                <body>
                    <div class="prop-wrapper-inner">
                        ${proposalRef.current.innerHTML}
                    </div>
                </body>
                </html>
            `;

            // Enviar al backend para generar PDF con Puppeteer
            const response = await axios.post('/api/pdf/generate',
                { html: fullHtml },
                { timeout: 90000 } // Más tiempo para evitar timeouts
            );

            if (!response.data || (!response.data.pdf && !response.data.error)) {
                throw new Error("Respuesta inválida del servidor.");
            }

            const { pdf: pdfBase64, error: serverError, message: serverMessage } = response.data;

            if (serverError || !pdfBase64) {
                throw new Error(serverMessage || 'Error desconocido en el servidor');
            }

            // Decodificar base64 a Blob
            const binaryStr = atob(pdfBase64);
            const bytes = new Uint8Array(binaryStr.length);
            for (let i = 0; i < binaryStr.length; i++) bytes[i] = binaryStr.charCodeAt(i);
            const blob = new Blob([bytes], { type: 'application/pdf' });

            // Descargar el PDF recibido
            const baseFileName = inputs?.id_oportunidad || inputs?.rc || 'Simulacion';
            const safeName = baseFileName.toString().replace(/[^a-zA-Z0-9_\-]/g, '_');
            const url = window.URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = `Propuesta_Brokergy_${safeName}.pdf`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            window.URL.revokeObjectURL(url);
        } catch (error) {
            console.error('Crash in handleDownloadPdf:', error);
            const msg = error.response?.data?.message || error.message || 'Error desconocido';
            setConfirmConfig({ title: 'Error', message: `❌ Error al generar el PDF: ${msg}`, confirmText: 'Aceptar', onConfirm: () => setConfirmConfig(null) });
        } finally {
            setGenerating(false);
        }
    };

    const f = result.financials;
    const discountCerts = result.discountCertificates || false;
    const date = new Date();
    const formattedDate = date.toLocaleDateString('es-ES');

    const validUntilDate = new Date();
    validUntilDate.setMonth(validUntilDate.getMonth() + 2);
    const formattedValidDate = validUntilDate.toLocaleDateString('es-ES');

    const totalPages = 4 + attachments.reduce((acc, a) => acc + (a.file?.data?.length || 0), 0);

    const f80 = result.financialsRes080;
    const isReforma = !!inputs?.isReforma;
    const isBoth = isReforma && inputs?.comparativaReforma !== false;
    const isOnlyReforma = isReforma && inputs?.comparativaReforma === false;

    // Costs - conditional on discount toggle
    const costeCEE = discountCerts ? 0 : 220;
    const costeTasas = discountCerts ? 0 : 32.78;
    const costeGestion = 0; // Always 100% DTO
    const totalDescuentoGestion = costeCEE + costeTasas + costeGestion;

    // El neto de la cláusula 2 sale del MISMO bono que se imprime en la portada.
    // Leía siempre `result.financials` (la rama de aerotermia), así que en una
    // propuesta de SOLO reforma imprimía el bono de la otra opción: 2.330 € de
    // neto frente a los 1.795 € de la tabla, y el cliente llamaba preguntando
    // cuál era el bueno (26RES080_OP46).
    const caeNetoDe = (fin) => Math.max(0, (fin?.caeBonus || 0) - totalDescuentoGestion);
    const caeNeto = caeNetoDe(isOnlyReforma ? (f80 || f) : f);

    // Etiquetas de IVA. Para empresa/autónomo en modo "Sin IVA" las cifras van en neto,
    // así que el presupuesto y el CAE deben rotularse como "(IVA NO INCLUIDO)".
    const ivaSuffix = (fin) => {
        const esEmpresa = fin && !fin.isParticular && fin.titularType !== 'particular';
        if (esEmpresa && !fin.includeIVA) return <small>(IVA NO INCLUIDO)</small>;
        return <small>(IVA INC.)</small>;
    };
    // El CAE solo lleva etiqueta cuando hay IVA en juego (empresa/autónomo).
    const ivaSuffixCae = (fin) => {
        const esEmpresa = fin && !fin.isParticular && fin.titularType !== 'particular';
        if (!esEmpresa) return '';
        return fin.includeIVA ? <small>(IVA INC.)</small> : <small>(IVA NO INCLUIDO)</small>;
    };
    // Annual savings data
    const annualSavings = result.annualSavings;
    const payback = result.payback;
    const showAnnualSavings = result.includeAnnualSavings && annualSavings;

    // URL de firma sin protocolo: en el pie del CTA se lee, no se pulsa.
    const signUrlPlain = `${APP_URL}/firma/${urlId}`.replace(/^https?:\/\//, '');

    // Propuesta SIN coste de obra: cuando aún no hay presupuesto, o la obra ya
    // está ejecutada y solo se quiere enseñar la ayuda a la que se puede optar.
    // El Bono CAE se calcula sobre el ahorro de energía certificado, así que no
    // depende del presupuesto y se puede dar cerrado; la deducción del IRPF sí
    // depende de él, y por eso pasa de cifra a hipótesis.
    const hideBudget = !!inputs?.hideBudget;

    // Trío de indicadores de la portada (ayuda total · % cubierto · inversión neta).
    // Solo se pinta cuando hay UNA opción: en la comparativa a dos columnas esos tres
    // datos siguen viviendo en el pie de cada tabla, que es donde se comparan.
    const renderKpis = (fin) => {
        if (!fin) return null;

        // Sin coste de obra no hay "% cubierto" ni "inversión neta" que enseñar:
        // los dos se calculan sobre el presupuesto. Queda el bono, que es la cifra
        // de la propuesta, y la deducción como horquilla.
        if (hideBudget) {
            const conIrpf = fin.irpfCap > 0;
            return (
                <div className={`prop-kpis ${conIrpf ? 'k2' : 'k1'}`}>
                    <div className="prop-kpi ko">
                        <div className="prop-kpi-l">Bono Energético CAE</div>
                        <div className="prop-kpi-v">{formatNumber(fin.caeBonus)} €</div>
                        <div className="prop-kpi-n">ayuda estimada para su actuación</div>
                    </div>
                    {conIrpf && (
                        <div className="prop-kpi ki">
                            <div className="prop-kpi-l">Deducción en el IRPF</div>
                            <div className="prop-kpi-v hip">hasta {formatNumber(fin.irpfCap)} €</div>
                            <div className="prop-kpi-n">por propietario · sujeta a requisitos</div>
                        </div>
                    )}
                </div>
            );
        }

        const inversion = (fin.presupuesto || 0) + (fin.presupuestoFotovoltaica || 0);
        const irpfTotal = fin.irpfCap > 0
            ? (fin.irpfDeductionPerOwner || fin.irpfDeduction || 0) * Math.max(1, fin.numOwners || 1)
            : 0;
        const pct = Math.max(0, Math.min(100, Math.round(fin.porcentajeCubierto || 0)));
        const desglose = [`CAE ${formatNumber(fin.caeBonus)} €`];
        if (irpfTotal > 0) desglose.push(`IRPF ${formatNumber(irpfTotal)} €`);

        return (
            <div className="prop-kpis">
                <div className="prop-kpi ky">
                    <div className="prop-kpi-l">Ayuda total estimada</div>
                    <div className="prop-kpi-v">{formatNumber(fin.totalBeneficioFiscal || fin.totalAyuda)} €</div>
                    <div className="prop-kpi-n">{desglose.join(' + ')}</div>
                </div>
                <div className="prop-kpi kg">
                    <div className="prop-donut" style={{ background: `conic-gradient(var(--green) 0 ${pct}%, var(--g200) ${pct}% 100%)` }}>
                        <div className="prop-donut-in">{pct}%</div>
                    </div>
                    <div>
                        <div className="prop-kpi-l">Cubierto</div>
                        <div className="prop-kpi-pl">de su inversión, gracias a las ayudas</div>
                    </div>
                </div>
                <div className="prop-kpi ko">
                    <div className="prop-kpi-l">Inversión neta final</div>
                    <div className="prop-kpi-v">{formatNumber(fin.costeFinal)} €</div>
                    <div className="prop-kpi-n">sobre {formatNumber(inversion)} € de inversión</div>
                </div>
            </div>
        );
    };

    // Pie negro con el botón de firma. Se repite en portada y en condiciones.
    const renderCta = (extraFine = null) => (
        <div className="prop-cta">
            <h3>¿Listo para empezar a ahorrar?</h3>
            <p className="prop-csub">Acepte esta propuesta y comenzaremos a trabajar en su expediente de inmediato.</p>
            <a href={`${APP_URL}/firma/${urlId}`} target="_blank" rel="noopener noreferrer" className="prop-cta-btn">
                <span>✍️&nbsp;&nbsp;PULSE AQUÍ PARA FIRMAR Y ACEPTAR</span>
                <span className="prop-cta-arrow">→</span>
            </a>
            <p className="prop-cfn">
                Al pulsar se abre un <strong>formulario online seguro</strong> para completar sus datos y firmar digitalmente · <span className="prop-cfn-url">{signUrlPlain}</span>
                <br /><span className="prop-cfn-min">Al firmar, acepta las condiciones descritas en este documento.{extraFine}</span>
            </p>
        </div>
    );

    // Pie de página corrido (páginas sin CTA).
    const renderFoot = () => (
        <div className="prop-mfoot">
            <span>BROKERGY — Soluciones Sostenibles para Eficiencia Energética, S.L.{cobrand?.name ? ` · en colaboración con ${cobrand.name}` : ''}</span>
            <span><a href="mailto:info@brokergy.es">info@brokergy.es</a> · <a href="tel:623926179">623 926 179</a> · <a href="https://www.brokergy.es">brokergy.es</a></span>
        </div>
    );

    const handleSendByEmail = () => {
        setSendingEmail(false);
        setEmailSelections(new Set());
        setEmailChoice(true);
    };

    const sendEmailToMultiple = useCallback(async (selectedModes) => {
        setEmailChoice(false);
        setSendingEmail(true);

        // 1. Resolver destinatarios
        setConfirmConfig({ title: 'Preparando...', message: 'Resolviendo datos de contacto...', confirmText: null, cancelText: null });
        const recipients = [];
        for (const mode of selectedModes) {
            let email = null, name = '';
            if (mode === 'CLIENTE') {
                email = clienteInfo?.email || inputs?.email_contacto || inputs?.email || null;
                name = clienteInfo?.name || inputs?.referenciaCliente || 'Cliente';
                if (!email && inputs?.cliente_id) {
                    try {
                        const r = await axios.get(`/api/clientes/${inputs.cliente_id}`);
                        const c = r.data;
                        const uc = c.notificaciones_contacto_activas === true;
                        name = (uc && c.persona_contacto_nombre) ? c.persona_contacto_nombre : (c.nombre_razon_social || name);
                        email = (uc && c.persona_contacto_email) ? c.persona_contacto_email : (c.email || null);
                    } catch (e) { console.warn('[Email] No se pudo obtener email del cliente'); }
                }

            } else if (mode === 'PARTNER') {
                email = partnerInfo?.email || null;
                name = partnerInfo?.name || 'Partner';
                if (!email && inputs?.prescriptor_id) {
                    try {
                        const r = await axios.get(`/api/prescriptores/${inputs.prescriptor_id}`);
                        const uc = r.data.contacto_notificaciones_activas === true;
                        name = uc ? (r.data.nombre_contacto || r.data.acronimo || r.data.razon_social) : (r.data.acronimo || r.data.razon_social || 'Partner');
                        email = uc ? (r.data.email_contacto || r.data.email) : (r.data.email || null);
                    } catch (e) { console.warn('[Email] No se pudo obtener email del partner'); }
                }
            } else if (mode === 'INSTALADOR') {
                email = instaladorInfo?.email || null;
                name = instaladorInfo?.name || 'Instalador';
                if (!email && inputs?.instalador_asociado_id) {
                    try {
                        const r = await axios.get(`/api/prescriptores/${inputs.instalador_asociado_id}`);
                        name = r.data.acronimo || r.data.razon_social || 'Instalador';
                        email = r.data.email || null;
                    } catch (e) { console.warn('[Email] No se pudo obtener email del instalador'); }
                }
            } else if (mode === 'OTRO') {
                name = manualContact.name || 'Otro contacto';
                email = manualContact.email || null;
            }
            recipients.push({ email, mode, name });

        }

        // 2. Validar emails
        const missing = recipients.filter(r => !r.email || !r.email.includes('@'));
        if (missing.length > 0) {
            const msgList = missing.map(r => `• ${r.name || r.mode}: sin email registrado`).join('\n');
            setConfirmConfig({ title: 'Faltan emails', message: `❌ No se puede enviar a:\n${msgList}`, confirmText: 'Aceptar', onConfirm: () => { setConfirmConfig(null); setSendingEmail(false); } });
            return;
        }

        // 3. Generar HTML de la propuesta (una vez)
        const element = proposalRef.current;
        if (!element) { setConfirmConfig({ title: 'Error', message: '❌ No se puede acceder al contenido de la propuesta.', confirmText: 'Aceptar', onConfirm: () => { setConfirmConfig(null); setSendingEmail(false); } }); return; }
        const fullHtml = `<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap" rel="stylesheet"><style>${baseCss} body{margin:0;padding:0;background:#e5e7eb;display:flex;justify-content:center;align-items:flex-start;min-height:100vh;font-family:'Inter',sans-serif;}*{-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important}.web-document-container{width:100%;min-height:1123px;background:white;margin:0;}@media screen{.web-document-container{max-width:794px;margin:40px auto;box-shadow:0 20px 25px -5px rgba(0,0,0,.1);border-radius:8px;overflow:hidden;}}@media print{body{background:white;display:block;}.web-document-container{margin:0;max-width:100%;width:100%;border-radius:0;}}</style></head><body><div class="web-document-container"><div class="prop-wrapper-inner">${element.innerHTML}</div></div></body></html>`;

        const f = result || {};
        const fAero = f.financials || {};
        const f80 = f.financialsRes080 || {};
        const isReforma = !!inputs?.isReforma;
        const isOnlyReforma = isReforma && inputs?.comparativaReforma === false;
        const isBoth = isReforma && inputs?.comparativaReforma !== false;
        const clienteName = clienteInfo?.name || inputs?.referenciaCliente || '';

        // 4. Enviar a cada destinatario
        const results = [];
        for (let i = 0; i < recipients.length; i++) {
            const { email, mode, name } = recipients[i];
            const isB2B = mode === 'PARTNER' || mode === 'INSTALADOR';
            setConfirmConfig({ title: `Enviando ${i + 1}/${recipients.length}...`, message: `Enviando a ${name} (${email})...`, confirmText: null, cancelText: null });
            try {
                const summaryData = {
                    id: displayId, urlId,
                    mode,
                    clienteName: isB2B ? clienteName : undefined,
                    isReforma, isOnlyReforma, isBoth,
                    caeBonus: `${formatNumber(Math.round(fAero.caeBonus || 0))} €`,
                    irpfDeduction: `${formatNumber(Math.round(fAero.irpfDeduction || 0))} €`,
                    totalAyuda: `${formatNumber(Math.round(fAero.totalAyuda || 0))} €`,
                    fAero: { caeBonus: `${formatNumber(Math.round(fAero.caeBonus || 0))} €`, irpfDeduction: `${formatNumber(Math.round(fAero.irpfDeduction || 0))} €`, totalAyuda: `${formatNumber(Math.round(fAero.totalAyuda || 0))} €` },
                    f80: isReforma ? { caeBonus: `${formatNumber(Math.round(f80.caeBonus || 0))} €`, irpfDeduction: `${formatNumber(Math.round(f80.irpfDeduction || 0))} €`, totalAyuda: `${formatNumber(Math.round(f80.totalAyuda || 0))} €` } : null,
                    htmlTable: ''
                };
                const r = await postEmail('/api/pdf/send-proposal', { html: fullHtml, to: email, userName: name, summaryData }, undefined, { timeout: 90000 });
                results.push({ name, ok: r.data?.success === true });
            } catch (e) {
                results.push({ name, ok: false, error: e.response?.data?.message || e.message });
            }
        }

        // 5. Marcar como ENVIADA si cliente recibió con éxito
        if (selectedModes.includes('CLIENTE') && results.some(r => r.ok)) {
            try { await axios.patch(`/api/oportunidades/${inputs.id_oportunidad}/estado`, { nuevo_estado: 'ENVIADA' }); } catch (e) { console.warn('[Email] No se pudo actualizar estado'); }
        }

        // 6. Log manual recipient in history
        if (selectedModes.includes('OTRO')) {
            const manualResult = results.find(r => r.name === (manualContact.name || 'Otro contacto'));
            if (manualResult?.ok) {
                try {
                    await axios.post(`/api/oportunidades/${inputs.id_oportunidad}/comentarios`, {
                        comentario: `[SISTEMA] Propuesta enviada por Email a contacto manual: ${manualContact.name || 'Sin nombre'} (${manualContact.email})`
                    });
                } catch (e) { console.warn('[Email] No se pudo registrar en historial'); }
            }
        }


        const allOk = results.every(r => r.ok);
        const summary = results.map(r => `${r.ok ? '✅' : '❌'} ${r.name}${!r.ok && r.error ? ': ' + r.error : ''}`).join('\n');
        setConfirmConfig({ title: allOk ? '¡Correos enviados!' : 'Resultado del envío', message: summary, confirmText: 'Aceptar', onConfirm: () => setConfirmConfig(null) });
        setSendingEmail(false);
    }, [inputs, result, displayId, urlId, proposalRef, clienteInfo, partnerInfo, instaladorInfo]);



    const handleSaveToDrive = async () => {
        if (!inputs.id_oportunidad || !inputs.drive_folder_id) {
            const confirmed = await showConfirm(
                "Para guardar en Google Drive, primero debes guardar el expediente del cliente en el sistema. ¿Deseas guardarlo ahora?",
                'Expediente no Guardado',
                'warning'
            );
            if (confirmed) {
                onSaveRequest();
            }
            return;
        }

        setSavingToDrive(true);
        try {
            const fullHtml = `
                <!DOCTYPE html>
                <html>
                <head>
                    <meta charset="UTF-8">
                    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap" rel="stylesheet">
                    <style>
                        ${baseCss}
                        body { margin: 0; padding: 0; background: white; }
                        * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
                    </style>
                </head>
                <body>
                    <div class="prop-wrapper-inner">
                        ${proposalRef.current.innerHTML}
                    </div>
                </body>
                </html>
            `;

            const fileName = `Propuesta_${inputs.id_oportunidad}_${inputs.referenciaCliente || 'Cliente'}.pdf`;
            const response = await axios.post('/api/pdf/save-to-drive', {
                html: fullHtml,
                folderId: inputs.drive_folder_id,
                fileName: fileName
            }, { timeout: 90000 });

            if (response.data.success) {
                showAlert("La propuesta ha sido generada y guardada correctamente en la carpeta de Drive del cliente.", "Guardado en Drive", "success");
            } else {
                throw new Error(response.data.message || "Respuesta fallida del servidor");
            }
        } catch (err) {
            console.error('Error saving to Drive:', err);
            const msg = err.response?.data?.message || err.message || 'Error desconocido';
            showAlert("No se pudo guardar la propuesta en Drive: " + msg, "Error de Guardado", "error");
        } finally {
            setSavingToDrive(false);
        }
    };


    return (
        // Sin cierre al clicar fuera: los popups hijos (envío, anexos, WhatsApp) se
        // montan DENTRO de este backdrop, así que cualquier clic dentro de ellos
        // burbujeaba hasta aquí y cerraba la vista previa entera. Solo cierran la X
        // y el botón Cerrar (mismo criterio que clientes/partners y los modales de envío).
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-bkg-deep/60 backdrop-blur-md animate-fade-in">
            <div className="bg-bkg-surface/95 backdrop-blur-2xl rounded-2xl max-w-6xl w-full h-[92vh] flex flex-col overflow-hidden border border-white/10 shadow-3xl relative">

                <div className="flex flex-wrap justify-between items-center gap-3 p-5 max-md:p-4 bg-white/[0.03] border-b border-white/[0.08] backdrop-blur-md">
                    <h3 className="text-white font-black text-base sm:text-xl flex items-center gap-3 tracking-tight">
                        <div className="w-10 h-10 rounded-xl bg-brand/10 flex items-center justify-center border border-brand/20 max-md:hidden">
                            <span className="text-brand text-xl">📄</span>
                        </div>
                        Vista Previa de Propuesta
                    </h3>
                    <div className="flex flex-wrap gap-2 sm:gap-3 justify-end max-md:w-full">
                        {/* Comparativa de CEE: se decide aquí, viéndola. Ocupa dos
                            líneas en la tabla más un párrafo en las notas, así que
                            en una propuesta cargada es lo primero que se quita.
                            Solo sale si hay comparativa que ofrecer (si el CEE
                            aportado y uno nuevo dan lo mismo, ni aparece). */}
                        {ceeComparison && (
                            <button
                                onClick={() => setIncludeCeeComp(v => !v)}
                                title={includeCeeComp
                                    ? 'Quitar de la propuesta la comparativa "con tu CEE / con un CEE nuevo"'
                                    : 'Mostrar en la propuesta la comparativa "con tu CEE / con un CEE nuevo"'}
                                className={`h-12 px-3 flex items-center gap-2 rounded-2xl border transition-all shrink-0 active:scale-95 ${
                                    includeCeeComp
                                        ? 'text-brand border-brand/40 bg-brand/10 hover:bg-brand/20'
                                        : 'text-white/30 border-transparent hover:text-white/60 hover:bg-white/5 hover:border-white/10'
                                }`}
                            >
                                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.6}>
                                    {includeCeeComp
                                        ? <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                                        : <path strokeLinecap="round" strokeLinejoin="round" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.477 0-8.268-2.943-9.542-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.542 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />}
                                </svg>
                                <span className="text-[10px] font-black uppercase tracking-wider whitespace-nowrap max-md:hidden">Opción CEE</span>
                            </button>
                        )}

                        {/* Botón AÑADIR ANEXOS */}
                        <button
                            onClick={() => setIsAnexosOpen(true)}
                            title="Añadir presupuesto u otros anexos"
                            className="text-white/40 hover:text-brand w-12 h-12 flex items-center justify-center transition-all hover:bg-white/5 rounded-2xl border border-transparent hover:border-white/10 shrink-0 group active:scale-90 relative"
                        >
                            <svg className="w-8 h-8 transition-transform group-hover:scale-110" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
                            </svg>
                            {attachments.length > 0 && (
                                <div className="absolute top-1 right-0 w-4 h-4 bg-brand text-black text-[9px] font-black rounded-full flex items-center justify-center shadow-md">
                                    {attachments.length}
                                </div>
                            )}
                        </button>

                        {/* Botón ENVIAR (unificado: Email + WhatsApp) — solo ADMIN */}
                        {user?.rol === 'ADMIN' && (
                        <button
                            onClick={() => setEnviarOpen(true)}
                            title="Enviar propuesta al cliente (Email / WhatsApp)"
                            className="text-white/40 hover:text-brand w-12 h-12 flex items-center justify-center transition-all hover:bg-white/5 rounded-2xl border border-transparent hover:border-white/10 shrink-0 group active:scale-90"
                        >
                            <div className="relative flex items-center justify-center group-hover:drop-shadow-[0_0_8px_rgba(255,109,0,0.3)]">
                                <svg className="w-8 h-8 transition-transform group-hover:rotate-12 group-hover:-translate-y-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.4}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                                </svg>
                                <div className="absolute top-0 -right-0.5 w-2.5 h-2.5 bg-brand rounded-full border border-dark animate-pulse shadow-[0_0_6px_rgba(255,109,0,0.5)]" />
                            </div>
                        </button>
                        )}

                        {/* Botón ARCHIVAR EN DRIVE (Carpeta + Flecha) - Solo ADMIN */}
                        {user?.rol === 'ADMIN' && (
                            <button
                                onClick={handleSaveToDrive}
                                disabled={savingToDrive}
                                title="Guardar propuesta en la carpeta Drive del cliente"
                                className="text-white/40 hover:text-brand w-12 h-12 flex items-center justify-center transition-all hover:bg-white/5 rounded-2xl border border-transparent hover:border-white/10 shrink-0 group active:scale-90"
                            >
                                {savingToDrive ? (
                                    <div className="w-6 h-6 border-2 border-brand/20 border-t-brand rounded-full animate-spin" />
                                ) : (
                                    <div className="relative flex items-center justify-center group-hover:drop-shadow-[0_0_8px_rgba(255,109,0,0.3)]">
                                        {/* Icono de Carpeta */}
                                        <svg className="w-9 h-9 transition-transform group-hover:-translate-y-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.2}>
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                                        </svg>
                                        {/* Flecha de descarga */}
                                        <div className="absolute inset-0 flex items-center justify-center pt-2">
                                            <svg className="w-3.5 h-3.5 text-brand animate-bounce-subtle" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                                                <path strokeLinecap="round" strokeLinejoin="round" d="M12 5v13m0 0l-4-4m4 4l4-4" />
                                            </svg>
                                        </div>
                                    </div>
                                )}
                            </button>
                        )}

                        <button
                            onClick={handleDownloadPdf}
                            disabled={generating}
                            className="bg-brand hover:scale-105 active:scale-95 text-black font-black px-5 sm:px-8 py-2.5 rounded-xl transition-all flex items-center gap-2 disabled:opacity-50 shadow-lg shadow-brand/20 max-md:flex-1 max-md:justify-center"
                        >
                            {generating ? 'Generando...' : 'Descargar PDF'}
                            {!generating && (
                                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                                </svg>
                            )}
                        </button>
                        <button
                            onClick={onClose}
                            className="text-white/20 hover:text-white p-3 rounded-full hover:bg-white/5 border border-white/0 hover:border-white/10 transition-all"
                        >
                            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                        </button>
                    </div>
                </div>

                <div ref={containerRef} className="flex-1 overflow-auto bg-neutral-900/50 p-4 sm:p-12 flex justify-center custom-scrollbar">

                    <div className="prop-wrapper" style={{ transform: `scale(${scale})`, transformOrigin: 'top center', marginBottom: scale < 1 ? `-${1123 * totalPages * (1 - scale)}px` : '0', height: `${1123 * totalPages + 100}px` }}>
                        <div ref={proposalRef} className="prop-wrapper-inner" style={{ fontFamily: 'var(--font-family)' }}>
                            <style dangerouslySetInnerHTML={{ __html: baseCss }} />

                            {anexoPosition === 'before' && renderAnexos()}

                            {/* <!-- PAGINA 1 --> */}
                            <div ref={page1Ref} className={`prop-page${fit.compact ? ' prop-compact' : ''}`} style={fit.vars || undefined}>
                                <div className="prop-bar">
                                    <div>
                                        <div className="prop-bar-logo">BROKER<span>GY</span></div>
                                        <div className="prop-bar-tag">Ingeniería energética</div>
                                    </div>
                                    <div className="prop-bar-meta">
                                        <span className="prop-bar-num">Propuesta Nº {displayId}</span><br />
                                        Fecha: {formattedDate} · Oferta válida hasta: {formattedValidDate}
                                    </div>
                                </div>

                                <div className="prop-pb" style={{ paddingTop: 'var(--e-top)' }}>
                                    <div className="prop-eyebrow">Propuesta de Bono Energético CAE</div>
                                    <h2 className="prop-h1">Propuesta de <em>Bono Energético CAE</em> y servicios de eficiencia energética</h2>
                                    <div className="prop-h1sub">Resumen personalizado de ayudas, subvenciones y deducciones fiscales</div>

                                    {/* Con instalador asociado la tarjeta es de co-branding; sin él, el
                                        hueco se usa para captarlo. La obra la ejecuta un instalador sí o
                                        sí, y cuanto antes hable con nosotros menos se atasca el CAE. */}
                                    <div className="prop-cobrand">
                                        <div className="prop-cobrand-logo"><img src={brokergyLogo} alt="BROKERGY" /></div>
                                        {cobrand ? (
                                            <>
                                                <div className="prop-cobrand-x">×</div>
                                                {cobrand.logo && <div className="prop-cochip"><img src={cobrand.logo} alt={cobrand.name || ''} /></div>}
                                                <div className="prop-cobrand-txt">
                                                    {cobrand.name && <div className="prop-cobrand-name">{cobrand.name}</div>}
                                                    <div className="prop-cobrand-sub">{cobrand.esInstalador ? 'Instalador colaborador' : 'Colaborador'} de la red BROKERGY · propuesta conjunta</div>
                                                </div>
                                            </>
                                        ) : (
                                            <div className="prop-cobrand-cta">
                                                <p className="t">¿Ya tiene instalador para la obra?</p>
                                                <p className="d"><b>Si aún no lo tiene</b>, encuéntrelo en nuestro Escaparate de Instaladores: profesionales que ya trabajan con BROKERGY y conocen el procedimiento del CAE — <a href="https://instaladores.brokergy.es/escaparate" target="_blank" rel="noopener noreferrer">instaladores.brokergy.es/escaparate</a></p>
                                                <p className="d"><b>Si ya cuenta con uno</b>, dígale que contacte con nosotros antes de empezar la obra: coordinamos con él la documentación técnica desde el primer día para que todo salga bien y su ayuda llegue completa.</p>
                                            </div>
                                        )}
                                    </div>

                                    {/* En la comparativa a dos columnas no hay un único "total": los KPIs
                                        se quedan en el pie de cada tabla para poder compararlos. */}
                                    {!isBoth && renderKpis(isOnlyReforma ? f80 : f)}

                                    <div className="prop-meta">
                                        <div><div className="prop-meta-l">Cliente</div><div className="prop-meta-v">{inputs?.referenciaCliente || 'Sin Asignar'}</div></div>
                                        <div><div className="prop-meta-l">Ref. Catastral</div><div className="prop-meta-v">{inputs?.rc || 'MANUAL'}</div></div>
                                        <div><div className="prop-meta-l">Dirección</div><div className="prop-meta-v">{inputs?.direccion || inputs?.address || '---'}</div></div>
                                    </div>

                                    <div className="prop-sec">
                                    <div className="prop-stag"><span className="prop-sn">1</span><span className="prop-st">Desglose</span></div>
                                    <div className="prop-stitle">Análisis de subvenciones y deducciones</div>
                                    <p className="prop-sintro">
                                        {hideBudget
                                            ? 'Hemos analizado su actuación de mejora energética y calculado la ayuda a la que puede optar. El Bono Energético CAE se calcula sobre el ahorro de energía certificado, no sobre el coste de la obra, por eso podemos darle el importe con independencia del presupuesto.'
                                            : isBoth
                                                ? 'Hemos comparado su inversión actual en aerotermia frente a una reforma energética integral. Aquí tiene el desglose de ambas opciones:'
                                                : isReforma
                                                    ? 'Hemos analizado su proyecto de reforma energética y calculado las ayudas máximas a las que puede acceder. Este es el desglose personalizado de su propuesta.'
                                                    : 'Hemos analizado su proyecto de mejora energética y calculado las ayudas máximas a las que puede acceder. Este es el desglose personalizado de su propuesta.'
                                        }
                                    </p>

                                    <div id="proposal-financial-capture" className={isBoth ? 'prop-fgrid' : ''}>
                                        {/* TABLA 1: AEROTERMIA (Siempre que no sea OnlyReforma) */}
                                        {!isOnlyReforma && (
                                            <div className={isBoth ? 'prop-fcol' : ''}>
                                                {isBoth && <div className="prop-ftable-title"><i style={{background:'var(--orange)'}}></i> OPCIÓN 1: AEROTERMIA</div>}
                                                    <div className="prop-ftable">
                                                        <div className="prop-fth"><span>Concepto</span><span>Importe</span></div>
                                                        {!hideBudget && <div className="prop-ftr"><span className="prop-fl">Inversión sustitución de caldera por aerotermia {ivaSuffix(f)}</span><span className="prop-fv">{formatNumber(f.presupuesto)} €</span></div>}
                                                        {!hideBudget && f.presupuestoFotovoltaica > 0 && (
                                                            <div className="prop-ftr"><span className="prop-fl">Instalación fotovoltaica {ivaSuffix(f)}</span><span className="prop-fv">{formatNumber(f.presupuestoFotovoltaica)} €</span></div>
                                                        )}
                                                        <div className="prop-ftr"><span className="prop-fl">Bono Energético CAE <small>(Ingreso Bruto)</small> {ivaSuffixCae(f)}{ceeComparison && includeCeeComp && !inputs?.isReforma && (<><br /><small style={{ color: 'var(--orange)', fontWeight: 700 }}>Con tu CEE: {formatNumber(Math.round(ceeComparison.conCee.cae))} € · con un CEE nuevo BROKERGY: {formatNumber(Math.round(ceeComparison.ceeNuevo.cae))} € (tú eliges)</small></>)}</span><span className="prop-fv grn">{hideBudget ? '' : '– '}{formatNumber(f.caeBonus)} €</span></div>

                                                        {f.irpfCaeAmount > 0 && (
                                                            <div className="prop-ftr">
                                                                <span className="prop-fl">Impuestos aplicables por cobro de ayuda CAE <small>(Estimado)</small></span>
                                                                <span className="prop-fv" style={{ color: 'var(--red)' }}>+ {formatNumber(f.irpfCaeAmount)} €</span>
                                                            </div>
                                                        )}

                                                    {f.caeMaintenanceCost > 0 && (
                                                        <div className="prop-ftr">
                                                            <span className="prop-fl">Gestión tramitación Expediente CAE</span>
                                                            <span className="prop-fv" style={{ color: 'var(--red)' }}>+ {formatNumber(f.caeMaintenanceCost)} €</span>
                                                        </div>
                                                    )}

                                                    {f.itpCost > 0 && (
                                                        <div className="prop-ftr">
                                                            <span className="prop-fl">Ajuste Fiscal: Notaría e ITP</span>
                                                            <span className="prop-fv" style={{ color: 'var(--red)' }}>+ {formatNumber(f.itpCost)} €</span>
                                                        </div>
                                                    )}

                                                    {!hideBudget && f.irpfCap > 0 && Array.from({ length: Math.max(1, f.numOwners || 1) }).map((_, index) => (
                                                        <div key={`owner-${index}`} className="prop-ftr">
                                                            <span className="prop-fl">Deducción en el IRPF Propietario {index + 1} <small>({f.irpfRate}%, Límite {formatNumber(f.irpfCap)} €)</small></span>
                                                            <span className="prop-fv grn">– {formatNumber(f.irpfDeductionPerOwner || f.irpfDeduction)} €</span>
                                                        </div>
                                                    ))}

                                                    {isBoth && !hideBudget && (
                                                        <>
                                                            <div className="prop-ftaids">
                                                                <span className="prop-fl">AYUDA TOTAL ESTIMADA</span>
                                                                <span className="prop-fv">{formatNumber(f.totalBeneficioFiscal || f.totalAyuda)} €</span>
                                                            </div>
                                                            <div className="prop-ftpct">
                                                                <span className="prop-fl">% CUBIERTO POR LAS AYUDAS</span>
                                                                <span className="prop-fv">{formatNumber(f.porcentajeCubierto)}%</span>
                                                            </div>
                                                            <div className="prop-ftfin">
                                                                <span className="prop-fl">INVERSIÓN NETA FINAL</span>
                                                                <span className="prop-fv">{formatNumber(f.costeFinal)} €</span>
                                                            </div>
                                                        </>
                                                    )}
                                                </div>
                                            </div>
                                        )}

                                        {/* TABLA 2: REFORMA (Si es Both o OnlyReforma) */}
                                        {(isBoth || isOnlyReforma) && f80 && (
                                            <div className={isBoth ? 'prop-fcol' : ''}>
                                                {isBoth && <div className="prop-ftable-title"><i style={{background:'var(--green)'}}></i> OPCIÓN 2: AEROTERMIA + REFORMA</div>}
                                                    <div className="prop-ftable">
                                                        <div className="prop-fth"><span>Concepto</span><span>Importe</span></div>
                                                        {!hideBudget && <div className="prop-ftr"><span className="prop-fl">Inversión Reforma de Vivienda + Aerotermia {ivaSuffix(f80)}</span><span className="prop-fv">{formatNumber(f80.presupuesto)} €</span></div>}
                                                        {!hideBudget && f80.presupuestoFotovoltaica > 0 && (
                                                            <div className="prop-ftr"><span className="prop-fl">Instalación fotovoltaica {ivaSuffix(f80)}</span><span className="prop-fv">{formatNumber(f80.presupuestoFotovoltaica)} €</span></div>
                                                        )}
                                                        <div className="prop-ftr"><span className="prop-fl">Bono Energético CAE <small>(Ingreso Bruto)</small> {ivaSuffixCae(f80)}{ceeComparison && includeCeeComp && inputs?.isReforma && (<><br /><small style={{ color: 'var(--orange)', fontWeight: 700 }}>Con tu CEE: {formatNumber(Math.round(ceeComparison.conCee.cae))} € · con un CEE nuevo BROKERGY: {formatNumber(Math.round(ceeComparison.ceeNuevo.cae))} € (tú eliges)</small></>)}</span><span className="prop-fv grn">{hideBudget ? '' : '– '}{formatNumber(f80.caeBonus)} €</span></div>
                                                        
                                                        {f80.irpfCaeAmount > 0 && (
                                                            <div className="prop-ftr">
                                                                <span className="prop-fl">Impuestos aplicables por cobro de ayuda CAE <small>(Estimado)</small></span>
                                                                <span className="prop-fv" style={{ color: 'var(--red)' }}>+ {formatNumber(f80.irpfCaeAmount)} €</span>
                                                            </div>
                                                        )}

                                                    {f80.caeMaintenanceCost > 0 && (
                                                        <div className="prop-ftr">
                                                            <span className="prop-fl">Gestión tramitación Expediente CAE</span>
                                                            <span className="prop-fv" style={{ color: 'var(--red)' }}>+ {formatNumber(f80.caeMaintenanceCost)} €</span>
                                                        </div>
                                                    )}

                                                    {f80.itpCost > 0 && (
                                                        <div className="prop-ftr">
                                                            <span className="prop-fl">Ajuste Fiscal: Notaría e ITP</span>
                                                            <span className="prop-fv" style={{ color: 'var(--red)' }}>+ {formatNumber(f80.itpCost)} €</span>
                                                        </div>
                                                    )}

                                                    {!hideBudget && f80.irpfCap > 0 && Array.from({ length: Math.max(1, f80.numOwners || 1) }).map((_, index) => (
                                                        <div key={`owner80-${index}`} className="prop-ftr">
                                                            <span className="prop-fl">Deducción en el IRPF Propietario {index + 1} <small>({f80.irpfRate}%, Límite {formatNumber(f80.irpfCap)} €)</small></span>
                                                            <span className="prop-fv grn">– {formatNumber(f80.irpfDeductionPerOwner || f80.irpfDeduction)} €</span>
                                                        </div>
                                                    ))}

                                                    {isBoth && !hideBudget && (
                                                        <>
                                                            <div className="prop-ftaids">
                                                                <span className="prop-fl">AYUDA TOTAL ESTIMADA</span>
                                                                <span className="prop-fv">{formatNumber(f80.totalBeneficioFiscal || f80.totalAyuda)} €</span>
                                                            </div>
                                                            <div className="prop-ftpct">
                                                                <span className="prop-fl">% CUBIERTO POR LAS AYUDAS</span>
                                                                <span className="prop-fv">{formatNumber(f80.porcentajeCubierto)}%</span>
                                                            </div>
                                                            <div className="prop-ftfin">
                                                                <span className="prop-fl">INVERSIÓN NETA FINAL</span>
                                                                <span className="prop-fv">{formatNumber(f80.costeFinal)} €</span>
                                                            </div>
                                                        </>
                                                    )}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                    {/* Sin coste de obra la deducción no se puede cifrar: depende del
                                        importe de la obra y de tener un CEE previo. Se explica la
                                        horquilla en vez de dar un número que no podríamos sostener. */}
                                    {hideBudget && f.irpfCap > 0 && (
                                        <div className="prop-hip">
                                            <h4>Además: deducción en el IRPF de hasta {formatNumber(f.irpfCap)} € por propietario</h4>
                                            <p>Como contribuyente del IRPF puede deducirse hasta el {f.irpfRate}% de la inversión en rehabilitación energética, con un máximo de <strong>{formatNumber(f.irpfCap)} € por cada propietario</strong> de la vivienda.</p>
                                            <p>No podemos concretar el importe en esta propuesta porque depende de dos cosas: de que exista un <strong>Certificado de Eficiencia Energética realizado y registrado ANTES de las obras</strong> y del <strong>importe final de la obra</strong>. En cuanto tengamos el presupuesto se lo calculamos exactamente.</p>
                                        </div>
                                    )}

                                    <div className="prop-nsm">
                                        {ceeComparison && includeCeeComp && (
                                            <p style={{ background: 'rgba(255,157,77,0.10)', borderLeft: '3px solid var(--orange)', padding: '6px 10px', borderRadius: '4px' }}><b>OPCIÓN CEE:</b> Has aportado un CEE inicial. Según cuál usemos, el Bono Energético y la ayuda total serían: <b>con tu CEE</b> {formatNumber(Math.round(ceeComparison.conCee.cae))} € de bono (ayuda total {formatNumber(Math.round(ceeComparison.conCee.total))} €); <b>con un CEE nuevo BROKERGY</b> {formatNumber(Math.round(ceeComparison.ceeNuevo.cae))} € de bono (ayuda total {formatNumber(Math.round(ceeComparison.ceeNuevo.total))} €). La deducción del IRPF es la misma en ambos casos. Elegirás qué CEE usar al aceptar la propuesta.</p>
                                        )}
                                        <p><b>NOTA 1:</b> La ayuda Bono Energético CAE está garantizada por Brokergy. El importe es una estimación técnica que se ajustará tras emitir los CEE inicial y final.</p>
                                        {f.irpfCap > 0 && (
                                            <p><b>NOTA 2:</b> Las deducciones en el IRPF no suponen un descuento directo, sino un derecho a deducción en la renta. El ahorro dependerá de la situación fiscal del contribuyente.</p>
                                        )}
                                        {hideBudget && (
                                            <p><b>NOTA {f.irpfCap > 0 ? '3' : '2'}:</b> Esta propuesta no recoge el coste de la obra. El importe del Bono Energético CAE no depende de él, así que se mantiene sea cual sea el presupuesto final de la instalación.</p>
                                        )}
                                        {showAnnualSavings && (
                                            <p><b>NOTA 3:</b> El análisis de ahorro anual es un cálculo teórico basado en datos climáticos zonales. Los resultados reales dependerán de los hábitos de uso.</p>
                                        )}
                                        <div className="prop-avl">Aviso: Los cálculos son estimaciones teóricas. Los consumos reales pueden variar.</div>
                                    </div>

                                    {showAnnualSavings && (
                                        <div className="prop-ftable" style={{ marginTop: '10px' }}>
                                            <div className="prop-fth"><span>Análisis de ahorro y rentabilidad</span><span>Importe</span></div>
                                            <div className="prop-ftr"><span className="prop-fl">Gasto aproximado actual con {annualSavings.fuelLabel}</span><span className="prop-fv" style={{ color: 'var(--red)' }}>{formatNumber(Math.round(annualSavings.costeActual))} €/año</span></div>
                                            <div className="prop-ftr"><span className="prop-fl">Gasto estimado con Aerotermia</span><span className="prop-fv grn">{formatNumber(Math.round(annualSavings.costeNuevo))} €/año</span></div>
                                            <div className="prop-ftpct"><span className="prop-fl">Ahorro económico anual</span><span className="prop-fv">{formatNumber(Math.round(annualSavings.ahorroAnual))} €</span></div>
                                            {payback && payback.paybackYears < 100 && (
                                                <div className="prop-ftfin"><span className="prop-fl">Plazo de amortización de la inversión</span><span className="prop-fv">{formatNumber(payback.paybackYears)} años</span></div>
                                            )}
                                        </div>
                                    )}
                                    </div>
                                </div>
                                {renderCta()}
                            </div>

                            {/* <!-- PAGINA 2 --> */}
                            <div className="prop-page">
                                <div className="prop-bar prop-bar-slim">
                                    <div className="prop-bar-logo">BROKER<span>GY</span></div>
                                    <div className="prop-bar-page">Propuesta Nº {displayId} · Página 2</div>
                                </div>
                                <div className="prop-pb" style={{ paddingTop: '18px' }}>
                                    <div className="prop-stag"><span className="prop-sn">2</span><span className="prop-st">Bono Energético CAE</span></div>
                                    <div className="prop-stitle">¿Qué son los Certificados de Ahorro Energético?</div>
                                    <p className="prop-sintro">Los CAE son un mecanismo regulado por el Ministerio para la Transición Ecológica y el Reto Demográfico (Real Decreto 36/2023) que premia económicamente las acciones de eficiencia energética realizadas en hogares y negocios.</p>

                                    <div className="prop-ebox dk">
                                        <h4>¿Cómo funcionan?</h4>
                                        <p>Cuando usted realiza una mejora que ahorra energía en su vivienda — como sustituir una caldera antigua por aerotermia, mejorar el aislamiento o cambiar ventanas — ese ahorro se puede cuantificar y convertir en un beneficio económico real a través de los Certificados de Ahorro Energético, dentro de un sistema oficial respaldado por el Gobierno de España.</p>
                                        <p>Las grandes empresas energéticas (llamadas "sujetos obligados") están obligadas por ley a comprar estos certificados. Sin embargo, <strong>solo adquieren CAE en grandes volúmenes</strong> y no negocian directamente con particulares. Además, el proceso requiere documentación técnica especializada, emisión de facturas específicas y una gestión administrativa compleja.</p>
                                    </div>

                                    <div className="prop-ebox ora">
                                        <h4>¿Por qué elegirnos? La solución BROKERGY</h4>
                                        <p>BROKERGY actúa como su intermediario especializado. Agrupamos su expediente con otros similares para crear paquetes atractivos para los grandes compradores, gestionamos toda la documentación técnica y administrativa, y negociamos directamente con los sujetos obligados para obtener el máximo precio por sus certificados.</p>
                                        <p><strong>Usted no tiene que preocuparse de nada:</strong> nosotros nos encargamos de todo el proceso de principio a fin, y usted solo necesita firmar dos documentos. Sin papeleo, sin complicaciones, y con la garantía de cobro.</p>
                                    </div>

                                    <div className="prop-agrid">
                                        <div className="prop-ac grn"><div className="prop-ai">🏆</div><div className="prop-at">100% de éxito</div><div className="prop-as">Todos los expedientes tramitados resueltos favorablemente</div></div>
                                        <div className="prop-ac"><div className="prop-ai">💸</div><div className="prop-at">Cobro 3-6 meses</div><div className="prop-as">Pago íntegro en plazo garantizado</div></div>
                                        <div className="prop-ac"><div className="prop-ai">📋</div><div className="prop-at">Solo 2 firmas</div><div className="prop-as">Mínima participación por su parte</div></div>
                                        <div className="prop-ac ora"><div className="prop-ai">🎯</div><div className="prop-at">Sin adelantos</div><div className="prop-as">Cobramos a éxito del expediente</div></div>
                                    </div>

                                    {f.irpfCap > 0 && (
                                        <>
                                            <div className="prop-sdiv"></div>

                                            <div className="prop-stag"><span className="prop-sn">3</span><span className="prop-st">Ahorro adicional</span></div>
                                            <div className="prop-stitle">Deducciones en el IRPF — Hasta un 60%</div>
                                            <p className="prop-sintro">Además del Bono Energético, como contribuyente del IRPF puede deducirse hasta el 60% de la inversión (límite 9.000 €) en su declaración de la renta.</p>
                                            <div className="prop-irpf">
                                                <div className="prop-ebox grn" style={{ marginBottom: 0 }}>
                                                    <h4>Requisitos principales</h4>
                                                    <p>Ser contribuyente del IRPF. Disponer de CEE antes y después de la actuación. No pagar en efectivo. Declarar en el ejercicio de la obra (ej: obras 2026 → renta 2027). Máximo deducible por año: 3.000 €; el exceso se prorratea en años siguientes.</p>
                                                    <p style={{ marginTop: '7px', borderTop: '1px solid rgba(0,200,83,0.15)', paddingTop: '7px', lineHeight: '1.55' }}>
                                                        <b>Ámbito subjetivo:</b> Únicamente podrán aplicar la deducción los contribuyentes <b>propietarios</b> de las viviendas. Quedan excluidos nudos propietarios, usufructuarios y arrendatarios.
                                                    </p>
                                                    <p style={{ marginTop: '5px', fontSize: '8.5px' }}>
                                                        <a href="https://sede.agenciatributaria.gob.es/Sede/ayuda/manuales-videos-folletos/manuales-practicos/irpf-2025/c16-deducciones-generales-cuota/deducciones-obras-mejora-eficiencia-energetica-viviendas/obras-rehabilitacion-energetica-edificios.html" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--green-dark)', textDecoration: 'none', fontWeight: '700' }}>
                                                            ➜ Ampliar información en la Sede Electrónica de la Agencia Tributaria
                                                        </a>
                                                    </p>
                                                </div>

                                                {(() => {
                                                    // Sin coste de obra no se puede dar la deducción calculada (sale del
                                                    // presupuesto): el ejemplo se plantea sobre el máximo deducible.
                                                    const deduction = hideBudget ? f.irpfCap : (f.irpfDeductionPerOwner || f.irpfDeduction);
                                                    const maxPerYear = 3000;
                                                    const baseYear = new Date().getFullYear() + 1;
                                                    const years = [];
                                                    let remaining = deduction;
                                                    while (remaining > 0 && years.length < 3) {
                                                        const amount = Math.min(remaining, maxPerYear);
                                                        years.push({ year: baseYear + years.length, amount });
                                                        remaining -= amount;
                                                    }
                                                    const prorrateo = deduction > maxPerYear;
                                                    return (
                                                        <div className="prop-ibox-wrap">
                                                            <p className="prop-ibox-title">{hideBudget ? `Ejemplo con la deducción máxima (${formatNumber(deduction)} €):` : `${prorrateo ? 'Ejemplo de prorrateo' : 'Ejemplo'} (deducción de ${formatNumber(deduction)} €):`}</p>
                                                            <div className="prop-irow">
                                                                {(prorrateo ? years : [{ year: baseYear, amount: deduction }]).map(y => (
                                                                    <div key={y.year} className="prop-ibox"><div className="prop-iy">Renta {y.year}</div><div className="prop-ia">{formatNumber(y.amount)} €</div></div>
                                                                ))}
                                                            </div>
                                                            {prorrateo && <p className="prop-inote">Cuando la vivienda es de propiedad compartida, los límites se aplican por contribuyente, pudiendo duplicarse la ayuda.</p>}
                                                        </div>
                                                    );
                                                })()}
                                            </div>
                                        </>
                                    )}

                                    <div className="prop-sdiv"></div>

                                    <div className="prop-stag"><span className="prop-sn">{f.irpfCap > 0 ? '4' : '3'}</span><span className="prop-st">Proceso</span></div>
                                    <div className="prop-stitle">Pasos para obtener su Bono Energético</div>
                                    <div className="prop-srow">
                                        <div className="prop-ps"><div className="prop-pn">01</div><div className="prop-pt">CEE Inicial</div><div className="prop-pd">Certificado antes de obra</div></div>
                                        <div className="prop-ps"><div className="prop-pn">02</div><div className="prop-pt">Reforma</div><div className="prop-pd">Mejora energética</div></div>
                                        <div className="prop-ps"><div className="prop-pn">03</div><div className="prop-pt">CEE Final</div><div className="prop-pd">Certificado posterior</div></div>
                                        <div className="prop-ps"><div className="prop-pn">04</div><div className="prop-pt">Facturas</div><div className="prop-pd">Recopilar facturas</div></div>
                                        <div className="prop-ps"><div className="prop-pn">05</div><div className="prop-pt">Expediente</div><div className="prop-pd">Tramitación CAE</div></div>
                                        <div className="prop-ps"><div className="prop-pn">06</div><div className="prop-pt">Justificación</div><div className="prop-pd">Verificación técnica</div></div>
                                        <div className="prop-ps"><div className="prop-pn">07</div><div className="prop-pt">Cobro</div><div className="prop-pd">Recepción importe</div></div>
                                    </div>
                                </div>
                                {renderFoot()}
                            </div>

                            {/* <!-- PAGINA 3 --> */}
                            <div className="prop-page">
                                <div className="prop-bar prop-bar-slim">
                                    <div className="prop-bar-logo">BROKER<span>GY</span></div>
                                    <div className="prop-bar-page">Propuesta Nº {displayId} · Página 3</div>
                                </div>
                                <div className="prop-pb" style={{ paddingTop: '30px' }}>
                                    <div className="prop-stag"><span className="prop-sn">5</span><span className="prop-st">Documentación</span></div>
                                    <div className="prop-stitle">¿Qué debe preparar para continuar?</div>
                                    <p className="prop-sintro" style={{ margin: '7px 0 20px' }}>Para agilizar la tramitación, necesitaremos la siguiente documentación. Puede enviarla por email o WhatsApp.</p>
                                    <div className="prop-dcols">
                                        <div className="prop-dcol">
                                            <div className="prop-dph">Antes de la obra</div>

                                            <div className="prop-dgt">📐 Documentación técnica de la vivienda</div>
                                            <ul className="prop-dl">
                                                <li>Planos (si existen) o croquis de la vivienda</li>
                                                <li>Fotografías de la caldera existente:</li>
                                                <li className="s">Vista general instalada</li>
                                                <li className="s">Placa de características totalmente legible</li>
                                                <li className="s">Si no está instalada: fotos del hueco donde estaba</li>
                                                <li>Fotografías del sistema de emisión:</li>
                                                <li className="s">Radiadores (al menos uno por estancia)</li>
                                                <li className="s">Suelo radiante (foto del cuadro/colector)</li>
                                            </ul>

                                            <div className="prop-dgt">🏠 Documentación de envolvente</div>
                                            <ul className="prop-dl">
                                                <li>Vídeo recorriendo la vivienda mostrando:</li>
                                                <li className="s">Ventanas, puertas y accesos a exteriores</li>
                                                <li className="s">Estancias y distribución general</li>
                                                <li>Fotos de todas las paredes exteriores (incl. patios):</li>
                                                <li className="s">Ventanas y puertas</li>
                                                <li className="s">Cerramientos singulares</li>
                                            </ul>

                                            <div className="prop-dgt">➕ Mejoras que pueden aumentar la ayuda</div>
                                            <ul className="prop-dl">
                                                <li>Si valora mejorar ventanas o añadir aislamiento:</li>
                                                <li className="s">Fotografías y/o vídeos de los elementos a sustituir</li>
                                                <li className="s">Presupuestos disponibles (ventanas, aislamiento…)</li>
                                            </ul>
                                        </div>
                                        <div className="prop-dcol gr">
                                            <div className="prop-dph">Después de la obra</div>
                                            <p className="prop-dintro">Una vez finalizada la instalación, debemos justificar técnicamente la actuación y emitir el CEE Final.</p>

                                            <div className="prop-dgt">📸 Documentación fotográfica</div>
                                            <ul className="prop-dl">
                                                <li>Fotos del desmontaje de la caldera antigua</li>
                                                <li>Fotos de la caldera antigua ya desmontada</li>
                                                <li>Fotos de la unidad exterior nueva:</li>
                                                <li className="s">Vista general instalada</li>
                                                <li className="s">Placa de características visible y legible</li>
                                                <li>Fotos de la unidad interior de ACS y/o depósitos de inercia, con sus placas identificativas</li>
                                            </ul>

                                            <div className="prop-dgt">📄 Documentación obligatoria</div>
                                            <ul className="prop-dl">
                                                <li>Todas las facturas de la instalación (materiales + mano de obra)</li>
                                                <li>Certificado RITE de la instalación térmica</li>
                                                <li>Si existen depósitos ACS, buffer o kits hidráulicos externos: fotos y placas identificativas</li>
                                            </ul>

                                            <div className="prop-dsend">
                                                <p className="t">📩 ¿Cómo enviar la documentación?</p>
                                                {uploadLink ? (
                                                    <p className="d">Lo más cómodo es subirla desde su enlace privado: la recibimos al instante y verá qué le falta en cada momento. También puede enviarla a <strong>info@brokergy.es</strong> o por WhatsApp al <strong>623 926 179</strong>. No es necesario enviarla toda de una vez.</p>
                                                ) : (
                                                    <p className="d">Puede enviar toda la documentación a <strong>info@brokergy.es</strong> o por WhatsApp al <strong>623 926 179</strong>. No es necesario enviarla toda de una vez; puede ir recopilándola progresivamente.</p>
                                                )}
                                                {/* Mismo enlace que se le manda por WhatsApp para pedirle las fotos
                                                    (/subir-docs/:uuid?token=). Sin oportunidad guardada no hay token:
                                                    entonces la caja se queda como estaba, solo con email y teléfono.
                                                    No se imprime la URL debajo, como sí hace el CTA de firma: esta
                                                    lleva un token de 32 caracteres que nadie va a teclear. */}
                                                {uploadLink && (
                                                    <a href={uploadLink} target="_blank" rel="noopener noreferrer" className="prop-dsend-btn">
                                                        <span>SUBIR MI DOCUMENTACIÓN AQUÍ</span>
                                                        <span className="a">→</span>
                                                    </a>
                                                )}
                                            </div>
                                        </div>
                                    </div>

                                    <div className="prop-tipbar">
                                        <h5>⚠️ Recomendaciones para evitar retrasos en el expediente</h5>
                                        <p>Las placas de características deben ser completamente legibles. Las fotos deben hacerse con buena luz y evitando reflejos. Si la caldera antigua se retira antes de contactarnos, es imprescindible documentar bien el hueco donde estaba ubicada. Se debe comprobar que el modelo de aerotermia coincide exactamente con el presupuesto inicial, ya que afecta directamente al cálculo del CAE.</p>
                                    </div>

                                    <div className="prop-upsell">
                                        <div className="ico">💡</div>
                                        <div>
                                            <p className="t">¿Sabía que puede aumentar considerablemente su ayuda?</p>
                                            <p className="d">Si además de la aerotermia tiene previsto mejorar las ventanas o el aislamiento térmico de su vivienda, el ahorro energético certificado será mayor, lo que se traduce en un <strong>importe CAE significativamente superior</strong>. Consúltenos sin compromiso y le realizaremos una nueva simulación incluyendo estas mejoras.</p>
                                        </div>
                                    </div>
                                </div>
                                {renderFoot()}
                            </div>

                            {/* <!-- PAGINA 4 --> */}
                            <div className="prop-page">
                                <div className="prop-bar prop-bar-slim">
                                    <div className="prop-bar-logo">BROKER<span>GY</span></div>
                                    <div className="prop-bar-page">Propuesta Nº {displayId} · Página 4</div>
                                </div>
                                <div className="prop-pb" style={{ paddingTop: '20px' }}>
                                    <div className="prop-stag"><span className="prop-sn">6</span><span className="prop-st">Condiciones</span></div>
                                    <div className="prop-stitle" style={{ marginBottom: '10px' }}>Condiciones del acuerdo y costes del servicio</div>

                                    <div className="prop-cl-box ora">
                                        <h4>Cláusula 1 — Objeto del acuerdo</h4>
                                        <p>BROKERGY se compromete a realizar los Certificados de Eficiencia Energética (inicial y final) y a gestionar íntegramente el expediente del Certificado de Ahorro Energético (CAE) asociado a la actuación de mejora energética del cliente.</p>
                                    </div>

                                    <div className="prop-cl-box grn">
                                        <h4>Cláusula 2 — Cobro a éxito y desglose de costes</h4>
                                        <p>El cliente no deberá realizar ningún pago anticipado. Los costes serán descontados directamente del importe obtenido por la venta de los CAE, una vez resuelto favorablemente:</p>
                                        <div className="prop-cgrid">
                                            <div className="prop-crow"><span>Certificados de Eficiencia Energética (inicial + final){discountCerts && <em> (PROMOCIÓN BROKERGY 100% DTO.)</em>}</span><strong>{discountCerts ? <><span style={{ color: 'var(--g400)', fontWeight: 'normal', fontSize: '10px', marginRight: '6px' }}>(Coste sin dto: 220,00 €)</span>0,00 €</> : '220,00 €'}</strong></div>
                                            <div className="prop-crow"><span>Tasas registro de certificados de eficiencia energética{discountCerts && <em> (PROMOCIÓN BROKERGY 100% DTO.)</em>}</span><strong>{discountCerts ? <><span style={{ color: 'var(--g400)', fontWeight: 'normal', fontSize: '10px', marginRight: '6px' }}>(Coste sin dto: 32,78 €)</span>0,00 €</> : '32,78 €'}</strong></div>
                                            <div className="prop-crow"><span>Gestión técnica y adm. expediente CAE <em>(PROMOCIÓN BROKERGY 100% DTO.)</em></span><strong><span style={{ color: 'var(--g400)', fontWeight: 'normal', fontSize: '10px', marginRight: '6px' }}>(Coste sin dto: 450,00 €)</span>0,00 €</strong></div>
                                            <div className="prop-crow prop-ctot"><span>Total a descontar del importe del CAE</span><span>{formatNumber(totalDescuentoGestion)} € + IVA</span></div>
                                        </div>
                                        {/* En la comparativa hay DOS bonos: un único neto no diría de
                                            cuál de las dos opciones es. */}
                                        {isBoth && f80 ? (
                                            <div className="prop-cnet2">
                                                <div className="prop-cnet">
                                                    <span className="prop-cnet-l">Neto opción 1: Aerotermia</span>
                                                    <span className="prop-cnet-v">{formatNumber(caeNetoDe(f))} €*</span>
                                                </div>
                                                <div className="prop-cnet">
                                                    <span className="prop-cnet-l">Neto opción 2: Aerotermia + Reforma</span>
                                                    <span className="prop-cnet-v">{formatNumber(caeNetoDe(f80))} €*</span>
                                                </div>
                                            </div>
                                        ) : (
                                            <div className="prop-cnet">
                                                <span className="prop-cnet-l">Importe CAE neto que recibirá el cliente</span>
                                                <span className="prop-cnet-v">{formatNumber(caeNeto)} €*</span>
                                            </div>
                                        )}
                                        <p className="prop-cnote">* Importe estimado resultante de descontar los costes de gestión del Bono Energético CAE.</p>
                                    </div>

                                    <div className="prop-cl-box">
                                        <h4>Cláusula 3 — Vinculación de servicios</h4>
                                        <p>La presente propuesta forma parte de una promoción vinculada a la realización de los CEE necesarios para la tramitación del expediente CAE. Los certificados emitidos por BROKERGY forman parte inseparable del mismo.</p>
                                    </div>

                                    <div className="prop-cl-box red">
                                        <h4>Cláusula 4 — Penalización por incumplimiento</h4>
                                        <p>Si los CEE son realizados por BROKERGY pero no se utilizan para gestionar el expediente CAE a través de BROKERGY —por causas ajenas a esta—, el cliente abonará en un máximo de 15 días naturales el importe total sin descuentos, en concepto de compensación:</p>
                                        <div className="prop-ptable">
                                            <div className="prop-pthead">Desglose de penalización por incumplimiento</div>
                                            <div className="prop-ptrow"><span className="prop-pl">Certificados de Eficiencia Energética (inicial + final)</span><span className="prop-pv">220,00 €</span></div>
                                            <div className="prop-ptrow"><span className="prop-pl">Tasas registro de certificados de eficiencia energética</span><span className="prop-pv">32,78 €</span></div>
                                            <div className="prop-ptrow"><span className="prop-pl">Gestión técnica y adm. expediente CAE (sin dto.)</span><span className="prop-pv">450,00 €</span></div>
                                            <div className="prop-ptrow ptt"><span className="prop-pl">Total penalización</span><span className="prop-pv">702,78 € + IVA</span></div>
                                        </div>
                                    </div>

                                    <div className="prop-cl2">
                                        <div className="prop-cl-box" style={{ marginBottom: 0 }}>
                                            <h4>Cláusula 5 — Vigencia de la oferta</h4>
                                            <p>Propuesta válida <strong>2 meses</strong> desde la fecha de emisión. El importe estimado del Bono Energético CAE se mantendrá hasta diciembre de 2026. Transcurrido el plazo sin aceptación expresa, la propuesta quedará sin efecto.</p>
                                        </div>

                                        <div className="prop-cl-box" style={{ marginBottom: 0 }}>
                                            <h4>Cláusula 6 — Protección de datos</h4>
                                            <p>BROKERGY tratará los datos personales conforme al RGPD y la LO 3/2018 exclusivamente para la gestión del expediente CAE. Derechos: info@brokergy.es.</p>
                                        </div>
                                    </div>
                                </div>

                                {renderCta(<> © {new Date().getFullYear()} BROKERGY — Soluciones Sostenibles para Eficiencia Energética, S.L. · CIF: B19350222</>)}
                            </div>

                            {anexoPosition === 'after' && renderAnexos()}
                        </div>
                    </div>
                </div>
            </div>
            <AppConfirm 
                isOpen={!!confirmConfig}
                {...confirmConfig}
                onCancel={confirmConfig?.onCancel || (() => setConfirmConfig(null))}
            />

            {/* POPUP WHATSAPP — 2 pasos: selección de destinatarios + preview/edición del mensaje */}
            {recipientChoice && (() => {
                const IcoWA = () => <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51a12.8 12.8 0 0 0-.57-.01c-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413z" /></svg>;

                const toggleMode = (mode) => {
                    setRecipientSelections(prev => {
                        const next = new Set(prev);
                        next.has(mode) ? next.delete(mode) : next.add(mode);
                        return next;
                    });
                };

                const options = [
                    { mode: 'CLIENTE',    label: 'Cliente',    sublabel: clienteInfo?.name || inputs?.referenciaCliente || null, phone: clienteInfo?.phone || null },
                    ...(partnerInfo    ? [{ mode: 'PARTNER',    label: 'Distribuidor', sublabel: partnerInfo.name,    phone: partnerInfo.phone }]    : []),
                    ...(instaladorInfo ? [{ mode: 'INSTALADOR', label: 'Instalador',   sublabel: instaladorInfo.name, phone: instaladorInfo.phone }] : []),
                    { mode: 'OTRO', label: 'Otro contacto', sublabel: manualContact.name || 'Introducir manualmente', phone: manualContact.phone || null },
                ];

                const nSelected = recipientSelections.size;

                // --- Paso 0: selección ---
                if (waStep === 0) {
                    const goToPreview = () => {
                        const msgs = {};
                        for (const mode of recipientSelections) {
                            const opt = options.find(o => o.mode === mode);
                            msgs[mode] = buildCaption(mode, opt?.sublabel || '');
                        }
                        setWaMessages(msgs);
                        setWaActiveTab(Array.from(recipientSelections)[0]);
                        setWaStep(1);
                    };

                    return (
                        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-3 sm:p-6 bg-black/80 backdrop-blur-sm" onClick={() => setRecipientChoice(false)}>
                            <div className="w-full max-w-sm sm:max-w-lg bg-[#1c1e26] border border-white/15 rounded-2xl shadow-2xl overflow-hidden" onClick={e => e.stopPropagation()}>
                                {/* Header */}
                                <div className="flex items-center gap-3 px-5 py-4 border-b border-white/10">
                                    <div className="w-9 h-9 rounded-full bg-[#25D366]/20 flex items-center justify-center text-[#25D366] border border-[#25D366]/20 shrink-0"><IcoWA /></div>
                                    <div className="flex-1 min-w-0">
                                        <p className="text-white font-black text-sm leading-tight">Enviar propuesta por WhatsApp</p>
                                        <p className="text-white/40 text-xs mt-0.5">Paso 1 de 2 · Selecciona destinatario(s)</p>
                                    </div>
                                    <button onClick={() => setRecipientChoice(false)} className="text-white/30 hover:text-white transition-colors shrink-0">
                                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/></svg>
                                    </button>
                                </div>

                                {/* Destinatarios */}
                                <div className="p-5 space-y-2">
                                    {options.map(opt => {
                                        const checked = recipientSelections.has(opt.mode);
                                        return (
                                            <button key={opt.mode} onClick={() => toggleMode(opt.mode)}
                                                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl border-2 transition-all text-left ${checked ? 'border-[#25D366]/70 bg-[#25D366]/10' : 'border-white/10 bg-white/[0.03] hover:border-white/20'}`}>
                                                <div className={`w-5 h-5 rounded-md border-2 flex items-center justify-center shrink-0 transition-all ${checked ? 'bg-[#25D366] border-[#25D366]' : 'border-white/25'}`}>
                                                    {checked && <svg className="w-3 h-3 text-black" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7"/></svg>}
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <p className="text-[10px] font-black uppercase tracking-widest text-white/35">{opt.label}</p>
                                                    <p className="text-sm font-bold text-white truncate">{opt.sublabel || '—'}</p>
                                                    {opt.mode !== 'OTRO' && (opt.phone
                                                        ? <p className="text-[11px] text-white/40 font-mono mt-0.5">{opt.phone}</p>
                                                        : <p className="text-[11px] text-red-400/70 mt-0.5">Sin teléfono registrado</p>)}
                                                </div>
                                            </button>
                                        );
                                    })}

                                    {/* Campos manuales para OTRO */}
                                    {recipientSelections.has('OTRO') && (
                                        <div className="p-4 bg-white/5 border border-white/10 rounded-xl space-y-3">
                                            <div>
                                                <label className="block text-[10px] font-black uppercase tracking-widest text-white/40 mb-1">Nombre</label>
                                                <input type="text" placeholder="Nombre del contacto…"
                                                    className="w-full bg-black/20 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:border-[#25D366]/50 outline-none"
                                                    value={manualContact.name}
                                                    onChange={e => setManualContact(prev => ({ ...prev, name: e.target.value.toUpperCase() }))} />
                                            </div>
                                            <div>
                                                <label className="block text-[10px] font-black uppercase tracking-widest text-white/40 mb-1">Teléfono WhatsApp</label>
                                                <input type="text" placeholder="600000000"
                                                    className="w-full bg-black/20 border border-white/10 rounded-lg px-3 py-2 text-sm text-white font-mono focus:border-[#25D366]/50 outline-none"
                                                    value={manualContact.phone}
                                                    onChange={e => setManualContact(prev => ({ ...prev, phone: e.target.value }))} />
                                            </div>
                                        </div>
                                    )}
                                </div>

                                {/* Footer */}
                                <div className="px-5 pb-5 flex flex-col gap-2">
                                    <button onClick={goToPreview} disabled={nSelected === 0}
                                        className="w-full py-3 rounded-xl font-black text-sm uppercase tracking-wider transition-all bg-[#25D366] hover:bg-[#1eb554] text-black disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center gap-2 shadow-lg shadow-[#25D366]/15">
                                        {nSelected === 0 ? 'Selecciona al menos uno' : <>Continuar <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7"/></svg></>}
                                    </button>
                                    <button onClick={() => setRecipientChoice(false)} className="w-full py-2 text-white/35 hover:text-white text-xs font-bold uppercase tracking-widest transition-colors">Cancelar</button>
                                </div>
                            </div>
                        </div>
                    );
                }

                // --- Paso 1: preview/edición del mensaje ---
                const selectedOpts = options.filter(o => recipientSelections.has(o.mode));
                const activeMsg = waMessages[waActiveTab] ?? '';

                return (
                    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-3 sm:p-6 bg-black/80 backdrop-blur-sm">
                        <div className="w-full max-w-sm sm:max-w-xl bg-[#1c1e26] border border-white/15 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh]" onClick={e => e.stopPropagation()}>
                            {/* Header */}
                            <div className="flex items-center gap-3 px-5 py-4 border-b border-white/10 shrink-0">
                                <div className="w-9 h-9 rounded-full bg-[#25D366]/20 flex items-center justify-center text-[#25D366] border border-[#25D366]/20 shrink-0"><IcoWA /></div>
                                <div className="flex-1 min-w-0">
                                    <p className="text-white font-black text-sm leading-tight">Previsualización del mensaje</p>
                                    <p className="text-white/40 text-xs mt-0.5">Paso 2 de 2 · Edita si es necesario y envía</p>
                                </div>
                                <button onClick={() => setRecipientChoice(false)} className="text-white/30 hover:text-white transition-colors shrink-0">
                                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/></svg>
                                </button>
                            </div>

                            {/* Tabs (solo si hay >1 destinatario) */}
                            {selectedOpts.length > 1 && (
                                <div className="flex gap-1 px-5 pt-3 pb-0 border-b border-white/10 shrink-0 overflow-x-auto">
                                    {selectedOpts.map(opt => (
                                        <button key={opt.mode} onClick={() => setWaActiveTab(opt.mode)}
                                            className={`px-3 py-2 text-[10px] font-black uppercase tracking-widest rounded-t-lg whitespace-nowrap transition-all border-b-2 ${waActiveTab === opt.mode ? 'border-[#25D366] text-[#25D366] bg-[#25D366]/10' : 'border-transparent text-white/40 hover:text-white/70'}`}>
                                            {opt.label}
                                            {opt.phone ? '' : ' ⚠️'}
                                        </button>
                                    ))}
                                </div>
                            )}

                            {/* Info del destinatario activo */}
                            {(() => {
                                const activeOpt = selectedOpts.find(o => o.mode === waActiveTab);
                                if (!activeOpt) return null;
                                return (
                                    <div className="px-5 pt-3 pb-0 shrink-0">
                                        <div className="flex items-center gap-2 px-3 py-2 bg-white/[0.04] border border-white/10 rounded-lg">
                                            <span className="text-[10px] font-black uppercase tracking-widest text-white/35">{activeOpt.label}:</span>
                                            <span className="text-sm font-bold text-white truncate">{activeOpt.sublabel}</span>
                                            {activeOpt.phone
                                                ? <span className="text-xs text-white/40 font-mono ml-auto shrink-0">{activeOpt.phone}</span>
                                                : <span className="text-xs text-red-400/80 ml-auto shrink-0">Sin teléfono</span>}
                                        </div>
                                    </div>
                                );
                            })()}

                            {/* Textarea editable */}
                            <div className="p-5 flex-1 overflow-y-auto min-h-0">
                                <label className="block text-[10px] font-black uppercase tracking-widest text-white/35 mb-2">Mensaje (editable)</label>
                                <textarea
                                    value={activeMsg}
                                    onChange={e => setWaMessages(prev => ({ ...prev, [waActiveTab]: e.target.value }))}
                                    rows={14}
                                    className="case-sensitive w-full bg-white/[0.04] border border-white/10 focus:border-[#25D366]/50 rounded-xl px-4 py-3 text-white text-sm leading-relaxed outline-none resize-none transition-colors"
                                />
                                {selectedOpts.length > 1 && (
                                    <p className="text-white/30 text-[10px] mt-2">Cada destinatario recibirá su propio mensaje personalizado.</p>
                                )}
                            </div>

                            {/* Footer */}
                            <div className="px-5 pb-5 flex flex-col gap-2 shrink-0 border-t border-white/10 pt-4">
                                <button onClick={() => sendToMultiple(Array.from(recipientSelections), waMessages)}
                                    className="w-full py-3 rounded-xl font-black text-sm uppercase tracking-wider transition-all bg-[#25D366] hover:bg-[#1eb554] text-black flex items-center justify-center gap-2 shadow-lg shadow-[#25D366]/15">
                                    <IcoWA />
                                    {`Enviar a ${nSelected} destinatario${nSelected > 1 ? 's' : ''}`}
                                </button>
                                <button onClick={() => setWaStep(0)} className="w-full py-2 text-white/35 hover:text-white text-xs font-bold uppercase tracking-widest transition-colors flex items-center justify-center gap-1">
                                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 19l-7-7 7-7"/></svg>
                                    Atrás
                                </button>
                            </div>
                        </div>
                    </div>
                );
            })()}
            
            {/* POPUP DE SELECCIÓN DE DESTINATARIOS EMAIL (multi-select) */}
            {emailChoice && (() => {
                const toggleMode = (mode) => {
                    setEmailSelections(prev => {
                        const next = new Set(prev);
                        next.has(mode) ? next.delete(mode) : next.add(mode);
                        return next;
                    });
                };
                const options = [
                    { mode: 'CLIENTE', label: 'CLIENTE', sublabel: clienteInfo?.name || inputs?.referenciaCliente || null, contact: clienteInfo?.email || null, color: 'bg-primary-600/20 border-primary-500/40 hover:border-primary-500', checkColor: 'bg-primary-500' },
                    ...(partnerInfo ? [{ mode: 'PARTNER', label: 'DISTRIBUIDOR', sublabel: partnerInfo.name, contact: partnerInfo.email, color: 'bg-blue-500/10 border-blue-500/30 hover:border-blue-500', checkColor: 'bg-blue-500' }] : []),
                    ...(instaladorInfo ? [{ mode: 'INSTALADOR', label: 'INSTALADOR', sublabel: instaladorInfo.name, contact: instaladorInfo.email, color: 'bg-amber-500/10 border-amber-500/30 hover:border-amber-500', checkColor: 'bg-amber-500' }] : []),
                    { mode: 'OTRO', label: 'OTRO CONTACTO', sublabel: manualContact.name || 'Introducir manualmente', contact: manualContact.email || null, color: 'bg-slate-700/30 border-white/10 hover:border-white/30', checkColor: 'bg-slate-400' }
                ];

                const nSelected = emailSelections.size;
                return (
                    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in" onClick={(e) => e.stopPropagation()}>
                        <div className="glass-card max-w-sm w-full p-7 border border-white/20 shadow-2xl bg-[#1c1e26] animate-scale-in rounded-[20px]">
                            <div className="flex items-center gap-3 mb-5">
                                <div className="w-10 h-10 rounded-full bg-blue-500/20 flex items-center justify-center text-blue-400 border border-blue-500/30 shrink-0">
                                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>
                                </div>
                                <div>
                                    <h3 className="text-lg font-bold text-white leading-tight">Enviar Propuesta por Email</h3>
                                    <p className="text-white/50 text-xs">Selecciona uno o varios destinatarios</p>
                                </div>
                            </div>

                            <div className="flex flex-col gap-2.5 mb-5">
                                {options.map(opt => {
                                    const checked = emailSelections.has(opt.mode);
                                    return (
                                        <button
                                            key={opt.mode}
                                            onClick={() => toggleMode(opt.mode)}
                                            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl border transition-all text-left ${opt.color} ${checked ? 'ring-1 ring-white/20' : ''}`}
                                        >
                                            <div className={`w-5 h-5 rounded flex items-center justify-center border-2 shrink-0 transition-all ${checked ? `${opt.checkColor} border-transparent` : 'border-white/30 bg-transparent'}`}>
                                                {checked && <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>}
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <div className="text-xs font-black uppercase tracking-widest text-white/50">{opt.label}</div>
                                                {opt.sublabel && <div className="text-sm font-bold text-white truncate">{opt.sublabel}</div>}
                                                {opt.mode !== 'OTRO' && (opt.contact
                                                    ? <div className="text-[11px] text-white/40 truncate">{opt.contact}</div>
                                                    : <div className="text-[11px] text-red-400/80">Sin email</div>)}
                                            </div>
                                        </button>
                                    );
                                })}

                                {emailSelections.has('OTRO') && (
                                    <div className="animate-fade-in p-4 bg-white/5 border border-white/10 rounded-xl space-y-3 mt-1">
                                        <div>
                                            <label className="block text-[10px] font-black uppercase tracking-widest text-white/40 mb-1">Nombre</label>
                                            <input 
                                                type="text" 
                                                placeholder="Nombre del contacto..."
                                                className="w-full bg-black/20 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:border-brand/50 outline-none"
                                                value={manualContact.name}
                                                onChange={e => setManualContact(prev => ({ ...prev, name: e.target.value.toUpperCase() }))}
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-[10px] font-black uppercase tracking-widest text-white/40 mb-1">Email</label>
                                            <input 
                                                type="email" 
                                                placeholder="email@ejemplo.com"
                                                className="w-full bg-black/20 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:border-brand/50 outline-none"
                                                value={manualContact.email}
                                                onChange={e => setManualContact(prev => ({ ...prev, email: e.target.value.toLowerCase() }))}
                                            />
                                        </div>
                                    </div>
                                )}
                            </div>


                            <button
                                onClick={() => sendEmailToMultiple(Array.from(emailSelections))}
                                disabled={nSelected === 0}
                                className="w-full py-3 rounded-xl font-black text-sm uppercase tracking-wider transition-all mb-2 bg-blue-600 hover:bg-blue-500 text-white disabled:opacity-30 disabled:cursor-not-allowed shadow-lg shadow-blue-500/20"
                            >
                                {nSelected === 0 ? 'Selecciona al menos uno' : `Enviar a ${nSelected} destinatario${nSelected > 1 ? 's' : ''}`}
                            </button>
                            <button onClick={() => setEmailChoice(false)} className="w-full py-2 text-white/40 hover:text-white text-xs font-semibold tracking-wide transition-colors">
                                CANCELAR
                            </button>
                        </div>
                    </div>
                );
            })()}

            {/* Modal de Gestión de Anexos */}
            {isAnexosOpen && <AnexosModal />}

            {/* Popup unificado de envío de la propuesta (homogéneo con anexos / certificador) */}
            <EnviarPropuestaModal
                isOpen={enviarOpen}
                onClose={() => setEnviarOpen(false)}
                numexpte={displayId}
                candidates={propCandidates}
                buildDefaultMessage={buildCaption}
                getPdfHtml={getProposalPdfHtml}
                getEmailHtml={getProposalEmailHtml}
                buildSummaryData={buildPropSummaryData}
                expedienteId={inputs?.id_oportunidad}
                ceeComparisonAvailable={!!ceeComparison}
                includeCee={includeCeeComp}
                onIncludeCeeChange={setIncludeCeeComp}
            />
        </div>
    );
}
