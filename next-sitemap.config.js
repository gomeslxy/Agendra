module.exports = {
  siteUrl: 'https://www.agendra.site',
  generateRobotsTxt: true,
  robotsTxtOptions: {
    policies: [{ userAgent: '*', allow: '/' }],
    additionalSitemaps: ['https://www.agendra.site/sitemap.xml'],
  },
  exclude: [
    '/admin/*',
    '/api/*',
    '/robots.txt',
    '/sitemap.xml',
    '/accept-invite',
    '/verify',
    '/nova-senha',
    '/recuperar-senha',
    '/onboarding',
  ],
};
