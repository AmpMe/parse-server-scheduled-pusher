const { startParseServer, stopParseServer } = require('parse-server-test-runner');
const Parse = require('parse/node');
const mockPush = require('./mockPushAdapter');

if (process.env.TZ !== 'UTC') {
  throw new Error('TZ must be UTC');
}

const { compute } = require('../src/offsets');
compute(new Date('2017-08-01T18:57:07.239Z'));

process.on('unhandledRejection', (reason, p) => {
  // eslint-disable-next-line no-console
  console.log(reason, p);
});

beforeAll((done) => {
  startParseServer({
    push: mockPush,
    hasPushSupport: true,
    hasPushScheduledSupport: true,
    scheduledPush: true,
  })
    .then(() => {
      Parse.initialize('test', 'test', 'test');
      Parse.serverURL = 'http://localhost:30001/1';
    })
    .then(done, done.fail);
}, 1000 * 60 * 2);

afterAll((done) => {
  stopParseServer()
    .then(done, done.fail);
}, 1000 * 10);
