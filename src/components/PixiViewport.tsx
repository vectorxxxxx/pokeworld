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
    // Activate plugins
    viewport
      .drag()
      .pinch({})
      .wheel()
      .decelerate()
      .clamp({ direction: 'all', underflow: 'center' });

    // Compute an initial scale so the world fits the available screen width.
    // Use horizontal fit (width) rather than min(width,height) so the
    // viewport clamps zoom based on the horizontal axis. This prevents
    // excessive empty gutters on wide screens when the canvas has a
    // fixed aspect ratio (e.g. 16:9) and the available container is
    // taller than the canvas aspect.
    const initialScale = (props.screenWidth / props.worldWidth) || 1;
    // Apply initial zoom and clamp bounds so the world never zooms
    // out smaller than the fit-to-screen scale. This prevents showing
    // large empty borders when users zoom out too far.
    viewport.zoom(initialScale);
    viewport.clampZoom({
      minScale: initialScale,
      maxScale: Math.max(initialScale * 3.0, initialScale + 0.1),
    });
    // Also store the fit scale on the viewport and enforce it during
    // zoom events. Some plugins may apply scale changes before the
    // clamp fully takes effect, so snapping back here prevents the
    // user from seeing an over-zoomed-out view.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (viewport as any).__fitMinScale = initialScale;
    viewport.on('zoomed', () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const ms = (viewport as any).__fitMinScale || initialScale;
      if (viewport.scale.x < ms) {
        viewport.scale.set(ms);
      }
    });
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
    // If the screen size changed, adjust zoom to continue fitting the world
    if (
      (oldProps.screenWidth !== newProps.screenWidth || oldProps.screenHeight !== newProps.screenHeight) &&
      newProps.worldWidth &&
      newProps.worldHeight
    ) {
      // When resizing, compute the target fit scale using horizontal
      // fit (width) so the clamp remains governed by the horizontal
      // size rather than the vertical size.
      const targetScale = (newProps.screenWidth / newProps.worldWidth) || 1;
      viewport.zoom(targetScale);
      viewport.clampZoom({
        minScale: targetScale,
        maxScale: Math.max(targetScale * 3.0, targetScale + 0.1),
      });
      // Update stored fit scale so the zoom-enforcer uses the latest
      // target value after a resize.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (viewport as any).__fitMinScale = targetScale;
    }
  },
});
