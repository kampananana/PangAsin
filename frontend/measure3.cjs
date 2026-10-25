const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe' });
  const page = await browser.newPage();

  for (const width of [1366, 1920]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('http://127.0.0.1:5000/login', { waitUntil: 'networkidle' });
    await page.waitForSelector('.login-hero-copy', { timeout: 10000 });

    const r = await page.evaluate(() => {
      const copy = document.querySelector('.login-hero-copy');
      const pwWrap = document.querySelector('#loginPassword').closest('.encoder-login-input-wrap');
      const scrollHint = document.querySelector('.login-hero-scroll-hint');
      const tagline = document.querySelector('.login-hero-tagline');
      const cr = copy.getBoundingClientRect();
      const pr = pwWrap.getBoundingClientRect();
      const sr = scrollHint.getBoundingClientRect();
      const tr = tagline.getBoundingClientRect();
      return {
        width: window.innerWidth,
        copyCenter: cr.top + cr.height / 2,
        pwCenter: pr.top + pr.height / 2,
        delta: (pr.top + pr.height / 2) - (cr.top + cr.height / 2),
        taglineBottom: tr.bottom,
        scrollTop: sr.top,
        overlap: tr.bottom > sr.top,
      };
    });

    console.log(`WIDTH ${r.width}: copy-pw delta=${r.delta.toFixed(1)}px  taglineBottom=${r.taglineBottom.toFixed(1)}  scrollTop=${r.scrollTop.toFixed(1)}  overlap=${r.overlap}`);
  }

  // Mobile breakpoint check
  await page.setViewportSize({ width: 767, height: 900 });
  await page.goto('http://127.0.0.1:5000/login', { waitUntil: 'networkidle' });
  await page.waitForSelector('.login-hero-copy', { timeout: 10000 });
  const mobile = await page.evaluate(() => {
    const copy = document.querySelector('.login-hero-copy');
    const cs = getComputedStyle(copy);
    return { transform: cs.transform, width: window.innerWidth };
  });
  console.log(`WIDTH ${mobile.width} (mobile): copy transform=${mobile.transform || 'none'}`);

  await browser.close();
})();