const crypto = require('crypto');

const moment = require('moment');
const Parse = require('parse/node');

const { getPushesByCampaign } = require('./query');
const { logger } = require('./util');

const md5Hash = (str) => crypto.createHash('md5').update(str).digest('hex');

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

function toLocalTime(date) {
  const isoString = date.toISOString();
  return isoString.substring(0, isoString.indexOf('Z'));
}

function scheduleNextPush(pushCampaign, now) {
  const nextPushTime = toLocalTime(
    getNextPushTime({
      interval: pushCampaign.get('interval'),
      sendTime: pushCampaign.get('sendTime'),
      dayOfWeek: pushCampaign.get('dayOfWeek'),
      dayOfMonth: pushCampaign.get('dayOfMonth'),
    }, now)
  );

  const campaignName = pushCampaign.get('name');
  logger.info('Next push time', {
    campaignName,
    nextPushTime,
  });

  return getPushesByCampaign(pushCampaign)
    .then((pushStatuses) => {
      // Bail out if the push for the next interval has already been scheduled
      for (const push of pushStatuses) {
        if (push.get('pushTime') === nextPushTime) {
          logger.info('Push already scheduled', { campaignName, pushTime: push.get('pushTime') });
          return null;
        }
      }

      const payload = pushCampaign.get('payload');
      const data = JSON.parse(payload);
      let pushHash;
      if (typeof data.alert === 'string') {
        pushHash = md5Hash(data.alert);
      } else if (typeof data.alert === 'object') {
        pushHash = md5Hash(JSON.stringify(data.alert));
      } else {
        pushHash = 'd41d8cd98f00b204e9800998ecf8427e';
      }

      const pushStatus = new Parse.Object('_PushStatus');
      return pushStatus.save({
        pushTime: nextPushTime,
        query: pushCampaign.get('query'),
        payload,
        source: 'parse-server-scheduled-pusher',
        status: 'scheduled',
        pushHash,
      }, { useMasterKey: true })
        .then(() => {
          const pushes = pushCampaign.relation('pushes');
          pushes.add(pushStatus);
          return pushCampaign.save(null, { useMasterKey: true });
        })
        .then(() => {
          logger.info('Scheduled next push', {
            pushStatus: pushStatus.toJSON(),
            campaignName,
          });
          return pushStatus;
        });
  });
}

module.exports = {
  scheduleNextPush,
  getNextPushTime,
};
