const Parse = require('parse/node');
const { master } = require('parse-server/lib/Auth');
const { create } = require('parse-server/lib/rest');
const { dropDB } = require('parse-server-test-runner');
const Config = require('parse-server/lib/Config');

function stripTimezone(d) {
  const isoStr = d.toISOString();
  return isoStr.substring(0, isoStr.length - 1);
}

const installations = require('./fixtures/installations.json');

async function bulkInstallations() {
  const config = Config.get('test', '/1');
  for (let i = 0; i < 1000; i++) {
    await create(config, master(config), '_Installation', {
      id: i.toString(),
      deviceToken: i.toString(),
      deviceType: 'android',
      timeZone: 'America/Buenos_Aires',
    });
  }
}

function setupInstallations(done) {
  const config = Config.get('test', '/1');

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

function createCampaign(now) {
  const pushCampaign = new Parse.Object('PushCampaign');
  return pushCampaign
    .save({
      createdAt: now,
      status: 'active',
      interval: 'daily',
      sendTime: '23:00:00',
      query: '{"user":{"__type":"Pointer","className":"_User","objectId":"0K1kfQnyj6"}}',
      payload: JSON.stringify({
        alert: 'ALERT!!',
        uri: 'foo://bar?baz=qux',
        url: 'foo://bar?baz=qux',
        notification_id: 'AbaINdDnqs',
        type: 'foo',
      }),
    }, { useMasterKey: true });
}

module.exports = {
  stripTimezone,
  setupInstallations,
  installations,
  createCampaign,
  bulkInstallations,
};
