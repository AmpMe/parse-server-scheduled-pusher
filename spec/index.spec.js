const Promise = require('bluebird');
const Parse = require('parse/node');
const { EventEmitterMQ } = require('parse-server/lib/Adapters/MessageQueue/EventEmitterMQ');

const { sendScheduledPushes } = require('../src');
const { stripTimezone } = require('./util');

// Integration tests
describe('Sending scheduled pushes', () => {
  const channel = 'channel';
  const publisher = EventEmitterMQ.createPublisher();
  const subscriber = EventEmitterMQ.createSubscriber();

  describe('in local time', () => {
    it('should work', (done) => {
      const now = new Date();

      const pwiReceivePromise = new Promise((resolve, reject) => {
        subscriber.subscribe(channel);
        subscriber.on('message', (channel, rawMsg) => {
          const pwi = JSON.parse(rawMsg);
          resolve(pwi);
        });
      });

      Parse.Push.send({
        push_time: stripTimezone(new Date(+now + 1)),
        data: {
          alert: 'Alert!!!!!',
          uri: 'foo://bar?baz=qux',
          url: 'foo://bar?baz=qux',
          type: 'bar',
        },
        where: {},
      }, { useMasterKey: true })
        .then(() => sendScheduledPushes(publisher, channel, now))
        .then(() => pwiReceivePromise)
        .then((pwi) => {
          expect(pwi).toBeDefined();
        })
        .then(done, done.fail);
    });
  });

  describe('at a specific time', () => {
    it('should work', (done) => {
      const now = new Date(Date.now() - 1);

      const pwiReceivePromise = new Promise((resolve, reject) => {
        subscriber.subscribe(channel);
        subscriber.on('message', (channel, rawMsg) => {
          const pwi = JSON.parse(rawMsg);
          resolve(pwi);
        });
      });

      Parse.Push.send({
        push_time: now.toISOString(),
        data: {
          alert: 'Alert!!!!!',
          uri: 'foo://bar?baz=qux',
          url: 'foo://bar?baz=qux',
          type: 'bar',
        },
        where: {},
      }, { useMasterKey: true })
        .then(() => sendScheduledPushes(publisher, channel))
        .then(() => pwiReceivePromise)
        .then((pwi) => {
          expect(pwi).toBeDefined();
        })
        .then(done, done.fail);
    });
  });
});
