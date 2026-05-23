// scripts/measures.js
const { getCLS, getFID, getLCP, getFCP, getTTFB, getINP } = require('web-vitals');

function sendToConsole(metric) {
  console.log(`${metric.name}: ${metric.value}`);
}

const metricFns = { CLS: getCLS, FID: getFID, LCP: getLCP, FCP: getFCP, TTFB: getTTFB, INP: getINP };
Object.entries(metricFns).forEach(([type, fn]) => {
  fn(sendToConsole);
});
