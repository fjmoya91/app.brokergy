import { Composition } from 'remotion';
import { DURACION, DURACION_VOZ, FPS, Promo } from './Promo';

export const Root = () => (
    <>
        <Composition id="PromoVertical" component={Promo} durationInFrames={DURACION} fps={FPS} width={1080} height={1920} />
        {/* La misma pieza con voz en off (src/locucion.js), para anuncios. */}
        <Composition id="PromoVerticalVoz" component={Promo} defaultProps={{ voz: true }} durationInFrames={DURACION_VOZ} fps={FPS} width={1080} height={1920} />
    </>
);
