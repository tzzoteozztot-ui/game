/**
 * Full screen for «Тёмный рубеж»: Fullscreen API where the browser has it (Android, computers),
 * landscape lock on phones. iPhone Safari has no page full screen: there the game goes full
 * screen when started from the home screen (manifest + apple-mobile-web-app-capable).
 */

import { useEffect, useState } from 'react';

type FsDocument = Document & {
  webkitFullscreenEnabled?: boolean;
  webkitFullscreenElement?: Element | null;
  webkitExitFullscreen?: () => Promise<void>;
};
type FsElement = HTMLElement & { webkitRequestFullscreen?: () => Promise<void> };

const doc = () => document as FsDocument;

/** Shown where the browser has no page full screen (iPhone Safari) */
export const HOME_SCREEN_HINT =
  'На iPhone браузер не даёт открыть страницу во весь экран. Нажмите «Поделиться» (квадрат со стрелкой) → «На экран «Домой»», и игра будет открываться с рабочего стола телефона без адресной строки.';

export function fullscreenSupported(): boolean {
  return !!(doc().fullscreenEnabled || doc().webkitFullscreenEnabled);
}

/** Started from the home screen: already full screen, the button is not needed */
export function isStandalone(): boolean {
  return (
    // display-mode: fullscreen also matches after requestFullscreen, so it counts only without it
    (window.matchMedia('(display-mode: fullscreen)').matches && !isActive()) ||
    window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

function isActive(): boolean {
  return !!(doc().fullscreenElement || doc().webkitFullscreenElement);
}

export async function toggleFullscreen() {
  try {
    if (isActive()) {
      await (doc().exitFullscreen ?? doc().webkitExitFullscreen)?.call(doc());
      return;
    }
    const el = document.documentElement as FsElement;
    await (el.requestFullscreen ?? el.webkitRequestFullscreen)?.call(el);
    const orientation = screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> };
    await orientation?.lock?.('landscape').catch(() => {});
  } catch {
    // refused by the browser: the game keeps running in the page
  }
}

export function useFullscreen() {
  const [active, setActive] = useState(isActive);
  useEffect(() => {
    const onChange = () => setActive(isActive());
    document.addEventListener('fullscreenchange', onChange);
    document.addEventListener('webkitfullscreenchange', onChange);
    return () => {
      document.removeEventListener('fullscreenchange', onChange);
      document.removeEventListener('webkitfullscreenchange', onChange);
    };
  }, []);
  return { supported: fullscreenSupported() && !isStandalone(), active, toggle: toggleFullscreen };
}
