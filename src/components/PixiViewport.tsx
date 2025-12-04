// Based on https://codepen.io/inlet/pen/yLVmPWv.
// Copyright (c) 2018 Patrick Brouwer, distributed under the MIT license.

import { PixiComponent } from '@pixi/react';
import { Viewport } from 'pixi-viewport';
import { Application } from 'pixi.js';
import { MutableRefObject, ReactNode } from 'react';

export type ViewportProps = {
  app: Application;
  viewportRef?: MutableRefObject<Viewport | undefined>;

  screenWidth: number;
  screenHeight: number;
  worldWidth: number;
  worldHeight: number;
  // When false, do not enable pinch or wheel zoom plugins (useful for mobile)
  allowZoom?: boolean;
  children?: ReactNode;
};

// https://davidfig.github.io/pixi-viewport/jsdoc/Viewport.html
export default PixiComponent('Viewport', {
  create(props: ViewportProps) {
    const { app, children, viewportRef, ...viewportProps } = props;
    const viewport = new Viewport({
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
      events: app.renderer.events,
      passiveWheel: false,
      ...viewportProps,
    });
    if (viewportRef) {
      viewportRef.current = viewport;
    }
    // Activate plugins. Optionally disable pinch/wheel when `allowZoom` is false
    // so mobile can keep drag but lose pinch-to-zoom.
    const allowZoom = typeof props.allowZoom === 'boolean' ? props.allowZoom : true;
    viewport.drag();
    if (allowZoom) {
      viewport.pinch({}).wheel();
    }
    viewport.decelerate().clamp({ direction: 'all', underflow: 'center' });

    // Compute a sensible clamp for min/max zoom so users cannot zoom out
    // past a point where the world would be clipped on either axis. Use
    // the smaller (more restrictive) of the horizontal and vertical fit
    // scales so the entire world remains visible when fully zoomed-out.
    try {
      const sw = props.screenWidth || 1;
      const sh = props.screenHeight || 1;
      const ww = props.worldWidth || 1;
      const wh = props.worldHeight || 1;
      const fitH = sw / ww;
      const fitV = sh / wh;
      const minScale = Math.max(0.0001, Math.min(fitH, fitV));
      viewport.clampZoom({
        minScale,
        maxScale: Math.max(minScale * 3.0, minScale + 0.1),
      });
    } catch (e) {
      // ignore clamp errors
    }
    return viewport;
  },
  applyProps(viewport, oldProps: any, newProps: any) {
    Object.keys(newProps).forEach((p) => {
      if (p !== 'app' && p !== 'viewportRef' && p !== 'children' && oldProps[p] !== newProps[p]) {
        // @ts-expect-error Ignoring TypeScript here
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        viewport[p] = newProps[p];
      }
    });
    // Update clamp bounds on resize so the min-scale respects both
    // horizontal and vertical fit. Do not change the current zoom; we
    // only update allowed bounds so user gestures remain uninterrupted.
    if (
      (oldProps.screenWidth !== newProps.screenWidth || oldProps.screenHeight !== newProps.screenHeight) &&
      newProps.worldWidth &&
      newProps.worldHeight
    ) {
      try {
        const sw = newProps.screenWidth || 1;
        const sh = newProps.screenHeight || 1;
        const ww = newProps.worldWidth || 1;
        const wh = newProps.worldHeight || 1;
        const fitH = sw / ww;
        const fitV = sh / wh;
        const minScale = Math.max(0.0001, Math.min(fitH, fitV));
        viewport.clampZoom({ minScale, maxScale: Math.max(minScale * 3.0, minScale + 0.1) });
      } catch (e) {
        // ignore
      }
    }
  },
});
