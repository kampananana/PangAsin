// WHAT: jsdom + jest-dom matchers shared by every admin smoke test.
// WHY: the tests must run inside the REAL providers (Router, Toast, auth) with
//      mocked API responses — that is the only way a route crash shows up.
import '@testing-library/jest-dom';

// jsdom has no layout — recharts needs a ResizeObserver.
if (typeof globalThis.ResizeObserver === 'undefined') {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}

// Leaflet needs a DOMRect in jsdom.
if (typeof globalThis.DOMRect === 'undefined') {
  globalThis.DOMRect = class {
    constructor(x = 0, y = 0, w = 0, h = 0) {
      this.x = x; this.y = y; this.width = w; this.height = h;
      this.top = y; this.right = x + w; this.bottom = y + h; this.left = x;
    }
    static fromRect() { return new DOMRect(); }
  };
}

// matchMedia is not implemented in jsdom.
if (typeof globalThis.matchMedia === 'undefined') {
  globalThis.matchMedia = (query) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener() {},
    removeListener() {},
    addEventListener() {},
    removeEventListener() {},
    dispatchEvent() { return false; },
  });
}