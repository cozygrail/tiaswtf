module.exports = { 
  reactStrictMode: true,
  devIndicators: false,
  compiler: {
    removeConsole: process.env.NODE_ENV === 'production',
  },
};
