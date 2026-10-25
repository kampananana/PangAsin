const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe' });
  const page = await browser.newPage();

  for (const width of [1366, 1920]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('http://127.0.0.1:5000/login', { waitUntil: 'networkidle' });
    await page.waitForSelector('.login-hero-copy', { timeout: 10000 });

    const result = await page.evaluate(() => {
      const copy = document.querySelector('.login-hero-copy');
      const card = document.querySelector('.login-form-card');
      const pwField = document.querySelector('#loginPassword');
      const pwWrap = pwField.closest('.encoder-login-input-wrap');
      const scrollHint = document.querySelector('.login-hero-scroll-hint');
      const tagline = document.querySelector('.login-hero-tagline');

      const copyRect = copy.getBoundingClientRect();
      const pwRect = pwWrap.getBoundingClientRect();
      const scrollRect = scrollHint.getBoundingClientRect();
      const tagRect = tagline.getBoundingClientRect();

      const copyCenter = copyRect.top + copyRect.height / 2;
      const pwCenter = pwRect.top + pwRect.height / 2;

      return {
        width: window.innerWidth,
        copyTop: copyRect.top,
        copyHeight: copyRect.height,
        copyCenter,
        pwTop: pwRect.top,
        pwHeight: pwRect.height,
        pwCenter,
        delta: pwCenter - copyCenter,
        taglineBottom: tagRect.bottom,
        scrollTop: scrollRect.top,
        overlap: tagRect.bottom > scrollRect.top,
      };
    });

    console.log(`WIDTH ${result.width}:`);
    console.log(`  copy center=${result.copyCenter.toFixed(1)}  pw center=${result.pwCenter.toFixed(1)}  delta=${result.delta.toFixed(1)}`);
    console.log(`  tagline bottom=${result.taglineBottom.toFixed(1)}  scroll top=${result.scrollTop.toFixed(1)}  overlap=${result.overlap}`);
  }

  await browser.close();
})();