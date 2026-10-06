/**
 * SWiSH loader - React binding.
 *
 * Deliberately thin. All motion lives in ../swish-loader.js; this file only
 * handles the React lifecycle, so there is exactly one implementation of the
 * animation to maintain and to get right.
 */

import React, { Component, useEffect, useRef } from 'react';
import { createSwishLoader } from '../swish-loader.js';
import '../swish-loader.css';

/**
 * @param {object}   props
 * @param {boolean} [props.ready=false]      flip to true when the app is loaded
 * @param {boolean} [props.loop=true]        false = play once, hold final state
 * @param {number}  [props.minDuration=900]  ms the loader must stay visible
 * @param {number|string} [props.size]       stage size; number = px
 * @param {boolean} [props.overlay=false]    render as a fixed full-screen cover
 * @param {Function}[props.onComplete]       fired after the exit fade
 * @param {boolean} [props.reducedMotion]    force the static state
 * @param {Function}[props.onRetry]          fired by the 30s retry affordance
 */
export function SwishLoader({
  ready = false,
  loop = true,
  minDuration = 900,
  size,
  overlay = false,
  onComplete,
  onRetry,
  reducedMotion,
  className = ''
}) {
  const hostRef = useRef(null);
  const loaderRef = useRef(null);

  // Callbacks live in refs so that a new inline function on every parent
  // render does not tear down and rebuild the animation mid-flight.
  const onCompleteRef = useRef(onComplete);
  const onRetryRef = useRef(onRetry);
  onCompleteRef.current = onComplete;
  onRetryRef.current = onRetry;

  useEffect(() => {
    // Everything that touches `window` is inside the effect, so the server
    // render is inert markup and hydration cannot mismatch.
    const host = hostRef.current;
    if (!host) return undefined;

    let instance;
    try {
      instance = createSwishLoader({
        mount: host,
        loop,
        minDuration,
        reducedMotion,
        onComplete: () => onCompleteRef.current && onCompleteRef.current()
      });
    } catch (err) {
      console.error('[SwishLoader] failed to mount:', err);
      return undefined;
    }

    loaderRef.current = instance;
    if (overlay) instance.root.classList.add('swish-loader--overlay');

    const handleRetry = () => onRetryRef.current && onRetryRef.current();
    instance.root.addEventListener('swish-retry', handleRetry);

    return () => {
      instance.root.removeEventListener('swish-retry', handleRetry);
      // Safe under StrictMode's double-invoke: teardown is idempotent and
      // cancels the rAF, both media-query listeners and visibilitychange.
      instance.destroy();
      loaderRef.current = null;
    };
    // `loop` / `minDuration` / `reducedMotion` / `overlay` are structural.
  }, [loop, minDuration, reducedMotion, overlay]);

  useEffect(() => {
    if (size == null || !loaderRef.current) return;
    loaderRef.current.root.style.setProperty(
      '--swish-size',
      typeof size === 'number' ? `${size}px` : size
    );
  }, [size]);

  useEffect(() => {
    if (ready) loaderRef.current?.finish();
  }, [ready]);

  return <div ref={hostRef} className={className} />;
}

/**
 * Error boundary. A loading screen that throws leaves a blank void or - worse
 * in development - a red error overlay, at the exact moment the user has
 * nothing else to look at. This guarantees a wordmark instead.
 */
export class SwishLoaderBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { failed: false };
  }

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error, info) {
    console.error('[SwishLoader] render error:', error, info);
  }

  render() {
    if (this.state.failed) {
      return (
        <div className="swish-loader is-ready is-fallback" role="status" aria-live="polite">
          <div className="swish-loader__stage">
            <div className="swish-loader__fallback">SWiSH</div>
          </div>
          <span className="swish-loader__sr">Loading, please wait</span>
        </div>
      );
    }
    return this.props.children;
  }
}

/** Convenience: the loader already wrapped in its boundary. */
export default function SafeSwishLoader(props) {
  return (
    <SwishLoaderBoundary>
      <SwishLoader {...props} />
    </SwishLoaderBoundary>
  );
}
