module.exports = {
  siteUrl: 'https://www.agendra.site',
  generateRobotsTxt: true,
  robotsTxtOptions: {
    policies: [{ userAgent: '*', allow: '/' }],
    additionalSitemaps: ['https://www.agendra.site/sitemap.xml'],
  },
  // Exclude API routes, admin pages, etc.
  exclude: ['/admin/*', '/api/*'],
};
