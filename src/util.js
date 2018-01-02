const winston = require('winston');

const flatten = (arr) => arr.reduce((a, b) => (
  Array.isArray(b) ? a.concat(flatten(b))
    : a.concat(b)
), []);

const level = process.env.LOG_LEVEL || 'info';

const logger = new winston.Logger({
  transports: [
    new winston.transports.Console({
      handleExceptions: true,
      json: true,
      stringify: true,
      level,
    }),
  ],
});

module.exports = { flatten, logger };
