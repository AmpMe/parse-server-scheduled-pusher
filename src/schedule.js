const moment = require('moment-timezone');
const Parse = require('parse/node');

const { offsetToTimezones } = require('./offsets');

const SEND_TIME_VARIANCE = 60 * 5; // 5 minutes, 300 seconds

function getUnsentOffsets(sentPerUTCOffset) {
  return Object.keys(offsetToTimezones)
    .filter((offset) => sentPerUTCOffset[offset] === undefined);
}

function pushTimeHasTimezoneComponent(pushTimeParam) {
  const offsetPattern = /(.+)([+-])\d\d:\d\d$/;
  return pushTimeParam.indexOf('Z') === pushTimeParam.length - 1
    || offsetPattern.test(pushTimeParam);
}

function getCurrentOffsets(offsets, pushTime, now) {
  return offsets.filter((offset) => {
    const zone = offsetToTimezones[offset][0]; // Pick the first zone in the offset

    const localMoment = moment(now).tz(zone);
    const localTime = new Date();
    localTime.setSeconds(localMoment.seconds());
    localTime.setMinutes(localMoment.minutes());
    localTime.setHours(localMoment.hours());
    localTime.setDate(localMoment.date());
    localTime.setYear(localMoment.year());

    const diffSeconds = ((localTime.getMinutes() * 60) + localTime.getSeconds()) -
      ((pushTime.getMinutes() * 60) + pushTime.getSeconds());

    return localTime.getDate() === pushTime.getDate() &&
      localTime.getHours() === pushTime.getHours() &&
      localTime.getMinutes() >= pushTime.getMinutes() &&
      diffSeconds < SEND_TIME_VARIANCE;
  });
}

// Generates a PushWorkItem for each offset
function createPushWorkItems(pushStatus, applicationId, now) {
  now = now || new Date();

  const where = JSON.parse(pushStatus.get('query'));
  const body = { data: JSON.parse(pushStatus.get('payload')) };

  const offsetToPwi = (UTCOffset) => {
    const installationsQ = Parse.Query.fromJSON('_Installation', { where });

    if (typeof UTCOffset !== 'undefined') {
      let requestedTimezones;
      if (where && where.timeZone && !where.timeZone.$in) {
        requestedTimezones = new Set([ where.timeZone ]);
      } else if (where && where.timeZone && where.timeZone.$in) {
        requestedTimezones = new Set(where.timeZone.$in);
      }

      let timezonesToSend = offsetToTimezones[UTCOffset];
      if (requestedTimezones) {
        // intersection
        timezonesToSend = timezonesToSend.filter((t) => requestedTimezones.has(t));
      }

      installationsQ.containedIn('timeZone', timezonesToSend);
    }

    return {
      applicationId,
      body,
      query: installationsQ.toJSON(),
      pushStatus,
      UTCOffset,
    };
  };

  let pushTime = pushStatus.get('pushTime');
  if (pushTimeHasTimezoneComponent(pushTime)) {
    const ttl = Date.parse(pushTime) + (SEND_TIME_VARIANCE * 1000);
    if (+now > +ttl) {
      return [];
    }

    if (pushStatus.get('status') !== 'scheduled') {
      return [];
    }

    return [ offsetToPwi(undefined) ];
  }

  pushTime = new Date(pushTime);
  const sentPerUTCOffset = pushStatus.get('sentPerUTCOffset') || {};
  const unsentOffsets = getUnsentOffsets(sentPerUTCOffset);
  const offsetsToSend = getCurrentOffsets(unsentOffsets, pushTime, now);
  return offsetsToSend.map(offsetToPwi);
}

module.exports = {
  getCurrentOffsets,
  getUnsentOffsets,
  createPushWorkItems,
  pushTimeHasTimezoneComponent,
};
