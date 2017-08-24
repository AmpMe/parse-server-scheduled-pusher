const Parse = require('parse/node');

const { PushCampaign } = require('../src/query');
const Config = require('parse-server/lib/Config');

const { createScheduledPush } = require('../src/campaign');

function createCampaign(config = new Config('test', '/1'), now = new Date('2017-08-10T19:18:07.309Z')) {
  const pushCampaign = new PushCampaign();
  pushCampaign
    .set('status', 'active')
    .set('interval', 'daily')
    .set('sendTime', '23:00:00')
    .set('query', '{"user":{"__type":"Pointer","className":"_User","objectId":"0K1kfQnyj6"}}')
    .set('data', {
      alert: 'ALERT!!',
      uri: 'foo://bar?baz=qux',
      url: 'foo://bar?baz=qux',
      notification_id: 'AbaINdDnqs',
      type: 'foo',
    });

  return pushCampaign.save(null, { useMasterKey: true })
    .then((pushCampaign) => createScheduledPush(pushCampaign, config.database, now))
    .then(getCampaignWithPushes);
}

function getCampaignWithPushes(pushCampaign) {
  const q = new Parse.Query(PushCampaign);
  return q.include('pushes')
    .get(pushCampaign.id, { useMasterKey: true });
}


module.exports = {
  createCampaign,
  getCampaignWithPushes,
};
