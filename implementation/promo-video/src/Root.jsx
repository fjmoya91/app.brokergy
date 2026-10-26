import { Composition } from 'remotion';
import { DURACION, FPS, Promo } from './Promo';

export const Root = () => (
    <Composition
        id="PromoVertical"
        component={Promo}
        durationInFrames={DURACION}
        fps={FPS}
        width={1080}
        height={1920}
    />
);
