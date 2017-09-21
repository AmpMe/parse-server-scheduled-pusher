const { createLogger } = require('bunyan');

const flatten = (arr) => arr.reduce((a, b) => (
  Array.isArray(b) ? a.concat(flatten(b))
    : a.concat(b)
), []);

const log = createLogger({
  name: 'parse-server-scheduled-pusher',
});

module.exports = { flatten, log };
