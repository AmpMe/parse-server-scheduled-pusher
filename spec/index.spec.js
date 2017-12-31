const Promise = require('bluebird');
const Parse = require('parse/node');
const { setupInstallations } = require('./util');
const { EventEmitterMQ } = require('parse-server/lib/Adapters/MessageQueue/EventEmitterMQ');

const { sendScheduledPushes, runCampaigns } = require('../src');
const { stripTimezone, createCampaign } = require('./util');

// Integration tests
describe('Sending scheduled pushes', () => {
  beforeEach(setupInstallations);

  const channel = 'my-channel';

  describe('in local time', () => {
    it('should work', (done) => {
      const now = new Date('2017-08-24T17:27:43.105Z');
      const pushTime = new Date('2017-08-24T14:27:43.105Z');

      const subscriber = EventEmitterMQ.createSubscriber();
      const publisher = EventEmitterMQ.createPublisher();

      const pwiReceivePromise = new Promise((resolve, reject) => {
        subscriber.subscribe(channel);
        subscriber.on('message', (channel, rawMsg) => {
          const pwi = JSON.parse(rawMsg);
          resolve(pwi);
        });
      });

      Parse.Push.send({
        push_time: stripTimezone(pushTime),
        data: {
          alert: 'Alert!!!!!',
          uri: 'foo://bar?baz=qux',
          url: 'foo://bar?baz=qux',
          type: 'bar',
        },
        where: {},
      }, { useMasterKey: true })
        .then(() => sendScheduledPushes(publisher, channel, 'my-application-id', now))
        .then(() => pwiReceivePromise)
        .then((pwi) => {
          expect(pwi).toBeDefined();
        })
        .then(done, done.fail);
    });
  });

  describe('at a specific time', () => {
    it('should work', (done) => {
      const now = new Date('2017-08-24T17:27:43.105Z');
      const subscriber = EventEmitterMQ.createSubscriber();
      const publisher = EventEmitterMQ.createPublisher();

      const pushWorkItems = [];
      const pwiReceivePromise = new Promise((resolve, reject) => {
        subscriber.subscribe(channel);
        subscriber.on('message', (channel, rawMsg) => {
          const pwi = JSON.parse(rawMsg);
          pushWorkItems.push(pwi);
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
        .then(() => sendScheduledPushes(publisher, channel, 'my-application-id', now))
        .then(() => pwiReceivePromise)
        .then((pwi) => {
          expect(pushWorkItems.length).toBe(1);
          expect(pwi).toBeDefined();
        })

        // It shouldn't re-send
        .then(() => sendScheduledPushes(publisher, channel, 'my-application-id', now))
        .then(() => Promise.delay(100))
        .then(() => {
          expect(pushWorkItems.length).toBe(1, 'Scheduled push should only be sent once');
        })
        .then(done, done.fail);
    });
  });
});

describe('Running PushCampaigns', () => {
  it('should work', (done) => {
    const now = new Date('2017-08-24T17:27:43.105Z');
    createCampaign(now)
      .then(() => runCampaigns(now))
      .then(done, done.fail);
  });
});
