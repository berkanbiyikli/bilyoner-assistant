import { Composition } from 'remotion';
import { PromoVideo } from './PromoVideo';

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition
        id="BilyonerPromo"
        component={PromoVideo}
        durationInFrames={30 * 55} // 55 seconds at 30fps
        fps={30}
        width={1080}
        height={1920}
      />
      <Composition
        id="BilyonerPromoLandscape"
        component={PromoVideo}
        durationInFrames={30 * 55}
        fps={30}
        width={1920}
        height={1080}
        defaultProps={{ landscape: true }}
      />
    </>
  );
};
