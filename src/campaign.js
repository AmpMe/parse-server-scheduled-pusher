const moment = require('moment');
const Parse = require('parse/node');
const { newObjectId } = require('parse-server/lib/cryptoUtils');
const { md5Hash } = require('parse-server/lib/cryptoUtils');

const { PushCampaign } = require('./query');

function getNextPushTime({ interval, sendTime, dayOfWeek, dayOfMonth }, now) {
  const parsedSendTime = new Date(moment(sendTime, 'hh:mm:ss').toDate());
  const pushTime = new Date(now);

  pushTime.setUTCHours(parsedSendTime.getUTCHours());
  pushTime.setUTCMinutes(parsedSendTime.getUTCMinutes());
  pushTime.setUTCSeconds(parsedSendTime.getUTCSeconds());
  pushTime.setUTCMilliseconds(0);

  switch (interval) {
  case 'monthly':
    pushTime.setUTCDate(dayOfMonth);
    // pick the date in the next month
    if (+pushTime < +now) {
      // When the next month is January
      if (pushTime.getUTCMonth() + 1 > 11) {
        pushTime.setUTCMonth(0);
        pushTime.setUTCFullYear(pushTime.getUTCFullYear() + 1);
      } else {
        pushTime.setUTCMonth(pushTime.getUTCMonth() + 1);
      }
    }
    return pushTime;

  case 'weekly':
    function thisWeek() {
      const date = now.getUTCDate() + (dayOfWeek - now.getUTCDay());
      pushTime.setUTCDate(date);
    }

    function nextWeek() {
      const date = now.getUTCDate() + (dayOfWeek - now.getUTCDay()) + 7;
      pushTime.setUTCDate(date);
    }

    if (now.getUTCDay() > dayOfWeek) {
      nextWeek();
    } else if (now.getUTCDay() < dayOfWeek) {
      thisWeek();
    } else if (now.getUTCDay() === dayOfWeek && +pushTime < +now) { // too late for today
      nextWeek();
    }
    return pushTime;

  case 'daily':
    return pushTime;
  }
}

function createScheduledPush(pushCampaign, database, now) {
  now = now || new Date();

  const nextPushTime = getNextPushTime({
    interval: pushCampaign.get('interval'),
    sendTime: pushCampaign.get('sendTime'),
    dayOfWeek: pushCampaign.get('dayOfWeek'),
    dayOfMonth: pushCampaign.get('dayOfMonth'),
  }, now);

  const q = new Parse.Query(PushCampaign);
  return q.include('pushes')
    .get(pushCampaign.id, { useMasterKey: true })
    .then((pushCampaign) => {
      // Bail out if the push for the next interval has already been scheduled
      if (pushCampaign.get('pushes')) {
        for (const push of pushCampaign.get('pushes')) {
          if (push.get('pushTime') === nextPushTime.toISOString()) {
            return null;
          }
        }
      }

      const objectId = newObjectId();
      const data = pushCampaign.get('data');
      const payload = JSON.stringify(data);
      let pushHash;
      if (typeof data.alert === 'string') {
        pushHash = md5Hash(data.alert);
      } else if (typeof data.alert === 'object') {
        pushHash = md5Hash(JSON.stringify(data.alert));
      } else {
        pushHash = 'd41d8cd98f00b204e9800998ecf8427e';
      }

      const pushStatusObj = {
        objectId,
        createdAt: now,
        pushTime: nextPushTime.toISOString(),
        query: JSON.stringify(pushCampaign.get('query')),
        payload,
        source: 'parse-scheduled-pusher',
        status: 'scheduled',
        pushHash,
        // lockdown!
        ACL: {},
      };

      return database.create('_PushStatus', pushStatusObj, {})
        .then(() => {
          const pushStatus = Parse.Object.fromJSON(Object.assign({ className: '_PushStatus' }, pushStatusObj));
          pushCampaign.add('pushes', pushStatus);
          return pushCampaign.save(null, { useMasterKey: true });
        });
    });
}

module.exports = {
  PushCampaign,
  createScheduledPush,
  getNextPushTime,
};
