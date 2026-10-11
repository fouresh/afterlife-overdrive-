import {
  CHAR_ANIMS,
  CHAR_H,
  CHAR_W,
  composeCharacter,
  type Appearance,
  type EquipLook,
} from '@ao/content';
import { useEffect, useMemo, useRef } from 'preact/hooks';

/** Animated paper-doll preview drawn on a small canvas (CSS-scaled with nearest neighbour). */
export function CharPreview(props: {
  appearance: Appearance;
  look?: EquipLook;
  scale?: number;
  anim?: 'idle' | 'run';
  flip?: boolean;
  class?: string;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const frames = useMemo(
    () => composeCharacter(props.appearance, props.look ?? {}),
    [props.appearance, props.look],
  );
  useEffect(() => {
    const c = ref.current!;
    const ctx = c.getContext('2d')!;
    let k = 0;
    const seq = CHAR_ANIMS[props.anim ?? 'idle'];
    const draw = () => {
      const img = frames[seq[k % seq.length]!]!;
      ctx.clearRect(0, 0, CHAR_W, CHAR_H);
      ctx.putImageData(new ImageData(new Uint8ClampedArray(img.data), CHAR_W, CHAR_H), 0, 0);
      k++;
    };
    draw();
    const id = setInterval(draw, props.anim === 'run' ? 110 : 450);
    return () => clearInterval(id);
  }, [frames, props.anim]);
  const scale = props.scale ?? 4;
  return (
    <canvas
      ref={ref}
      width={CHAR_W}
      height={CHAR_H}
      class={props.class}
      style={{
        width: `${CHAR_W * scale}px`,
        height: `${CHAR_H * scale}px`,
        imageRendering: 'pixelated',
        transform: props.flip ? 'scaleX(-1)' : undefined,
      }}
    />
  );
}
