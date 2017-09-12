const moment = require('moment');
const Parse = require('parse/node');
const { newObjectId } = require('parse-server/lib/cryptoUtils');
const { md5Hash } = require('parse-server/lib/cryptoUtils');

const { PushCampaign } = require('./query');

const { getDistributionRange, sortVariants } = require('./experiment');

function getNextPushTime({ interval, sendTime, dayOfWeek, dayOfMonth }, now) {
  const parsedSendTime = moment(sendTime, 'hh:mm:ss').toDate();
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

      // NOTE: Creating a _PushStatus for N variants means that the Installations
      // have to be fetched N times.
      const pushStatuses = sortVariants(pushCampaign.get('variants'))
        .map((variant, i, sortedVariants) => {
          const { data } = variant;
          const objectId = newObjectId();
          const payload = JSON.stringify(data);
          let pushHash;
          if (typeof data.alert === 'string') {
            pushHash = md5Hash(data.alert);
          } else if (typeof data.alert === 'object') {
            pushHash = md5Hash(JSON.stringify(data.alert));
          } else {
            pushHash = 'd41d8cd98f00b204e9800998ecf8427e';
          }

          const distribution = getDistributionRange(sortedVariants, i);
          return {
            objectId,
            createdAt: now,
            pushTime: nextPushTime.toISOString(),
            query: JSON.stringify(pushCampaign.get('query')),
            payload,
            source: 'parse-scheduled-pusher',
            status: 'scheduled',
            pushHash,
            distribution: Object.assign(distribution, { salt: pushCampaign.id }),

            // lockdown!
            ACL: {},
          };
        });

      return Promise.all(pushStatuses.map((p) => {
        const pushStatus = Parse.Object.fromJSON(Object.assign({ className: '_PushStatus' }, p));
        pushCampaign.add('pushes', pushStatus);
        return database.create('_PushStatus', p, {});
      }))
        // Save the added 'pushes'
        .then(() => pushCampaign.save(null, { useMasterKey: true }));
    });
}

module.exports = {
  PushCampaign,
  createScheduledPush,
  getNextPushTime,
};
