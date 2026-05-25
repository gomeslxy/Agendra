module.exports = {
  siteUrl: 'https://www.agendra.site',
  generateRobotsTxt: true,
  robotsTxtOptions: {
    policies: [{ userAgent: '*', allow: '/' }],
    additionalSitemaps: ['https://www.agendra.site/sitemap.xml'],
  },
  // Exclude API routes, admin pages, metadata files, and authentication steps
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
  additionalPaths: async (config) => [
    await config.transform(config, '/'),
  ],
};
