const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe' });
  const page = await browser.newPage();

  for (const width of [1366, 1920]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('http://127.0.0.1:5000/login', { waitUntil: 'networkidle' });
    await page.waitForSelector('.login-hero-copy', { timeout: 10000 });

    const withTransform = await page.evaluate(() => {
      const copy = document.querySelector('.login-hero-copy');
      const pwWrap = document.querySelector('#loginPassword').closest('.encoder-login-input-wrap');
      const cr = copy.getBoundingClientRect();
      const pr = pwWrap.getBoundingClientRect();
      return { copyCenter: cr.top + cr.height / 2, pwCenter: pr.top + pr.height / 2, delta: (pr.top + pr.height / 2) - (cr.top + cr.height / 2) };
    });

    // Now neutralize the transform and re-measure
    await page.evaluate(() => {
      document.querySelector('.login-hero-copy').style.transform = 'none';
    });
    await page.waitForTimeout(50);

    const noTransform = await page.evaluate(() => {
      const copy = document.querySelector('.login-hero-copy');
      const pwWrap = document.querySelector('#loginPassword').closest('.encoder-login-input-wrap');
      const cr = copy.getBoundingClientRect();
      const pr = pwWrap.getBoundingClientRect();
      return { copyCenter: cr.top + cr.height / 2, pwCenter: pr.top + pr.height / 2, delta: (pr.top + pr.height / 2) - (cr.top + cr.height / 2) };
    });

    console.log(`WIDTH ${width}: with-transform delta=${withTransform.delta.toFixed(1)}  no-transform delta=${noTransform.delta.toFixed(1)}`);
  }

  await browser.close();
})();