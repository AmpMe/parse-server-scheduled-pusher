const Parse = require('parse/node');
const { master } = require('parse-server/lib/Auth');
const { create } = require('parse-server/lib/rest');
const { dropDB } = require('parse-server-test-runner');
const Config = require('parse-server/lib/Config');

const { PushCampaign } = require('../src/query');
const { createScheduledPush } = require('../src/campaign');

function createCampaign(
  config = new Config('test', '/1'),
  now = new Date('2017-08-10T19:18:07.309Z')
) {
  const pushCampaign = new PushCampaign();
  pushCampaign
    .set('status', 'active')
    .set('interval', 'daily')
    .set('sendTime', '23:00:00')
    .set('query', '{"user":{"__type":"Pointer","className":"_User","objectId":"0K1kfQnyj6"}}')
    .set('variants', [ {
      ratio: 1,
      data: {
        alert: 'ALERT!!',
        uri: 'foo://bar?baz=qux',
        url: 'foo://bar?baz=qux',
        notification_id: 'AbaINdDnqs',
        type: 'foo',
      },
    } ]);

  return pushCampaign.save(null, { useMasterKey: true })
    .then((pushCampaign) => createScheduledPush(pushCampaign, config.database, now))
    .then(getCampaignWithPushes);
}

function getCampaignWithPushes(pushCampaign) {
  const q = new Parse.Query(PushCampaign);
  return q.include('pushes')
    .get(pushCampaign.id, { useMasterKey: true });
}

function stripTimezone(d) {
  const isoStr = d.toISOString();
  return isoStr.substring(0, isoStr.length - 1);
}

const installations = require('./fixtures/installations.json');
function setupInstallations(done) {
  const config = new Config('test', '/1');
  const p = dropDB()
    .then(() => Promise.all(installations.map((inst, i) => create(config, master(config), '_Installation', {
      id: i.toString(),
      deviceToken: inst.deviceToken,
      deviceType: inst.deviceType,
      timeZone: inst.timeZone,
    }))));

  if (done) {
    return p.then(done, done.fail);
  }
  return p;
}

module.exports = {
  createCampaign,
  getCampaignWithPushes,
  stripTimezone,
  setupInstallations,
  installations,
};
