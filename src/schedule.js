const moment = require('moment-timezone');

const Parse = require('parse/node');
const { master } = require('parse-server/lib/Auth');
const { find } = require('parse-server/lib/rest');
const { pushTimeHasTimezoneComponent } = require('parse-server/lib/Controllers/PushController').default;

const { offsetToTimezones } = require('./offsets');
const { batchQuery } = require('./query');

function getUnsentOffsets(sentPerUTCOffset) {
  return Object.keys(offsetToTimezones)
    .filter((offset) => sentPerUTCOffset[offset] === undefined);
}

const SEND_TIME_VARIANCE = 60 * 5; // 5 minutes, 300 seconds

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

const ABSOLUTE_TIME = 'absolute-time'; // 2017-09-06T13:27:04+02:00

// Generates a PushWorkItem for each offset
function createPushWorkItems(pushStatus, now) {
  now = now || new Date();

  const offsetToPwi = (offset, includeTimezones=true) => {
    const installationsQ = Parse.Query.fromJSON('_Installation', {
      where: JSON.parse(pushStatus.get('query')),
    });
    if (includeTimezones) {
      const timezonesToSend = offsetToTimezones[offset];
      installationsQ.containedIn('timeZone', timezonesToSend);
    }

    return {
      body: pushStatus.get('payload'),
      query: JSON.parse(JSON.stringify(installationsQ)),
      pushStatus,
      offset,
    };
  };

  let pushTime = pushStatus.get('pushTime');
  if (pushTimeHasTimezoneComponent(pushTime)) {
     // The `count` implies that the push work item has already been created
    if (!pushStatus.get('count')) {
      return [ offsetToPwi(ABSOLUTE_TIME, false) ];
    }
    return [];
  }

  pushTime = new Date(pushTime);
  const sentPerUTCOffset = pushStatus.get('sentPerUTCOffset') || {};
  const unsentOffsets = getUnsentOffsets(sentPerUTCOffset);
  const offsetsToSend = getCurrentOffsets(unsentOffsets, pushTime, now);
  return offsetsToSend.map((offset) => offsetToPwi(offset));
}

function batchPushWorkItem(
  pushWorkItem,
  config,
  batchSize = process.env.PUSH_BATCH_SIZE || 100
) {
  const auth = master(config);
  return find(config, auth, '_Installation', pushWorkItem.query.where, { limit: 0, count: true })
    .then(({ count }) => (
      batchQuery(pushWorkItem.query.where, batchSize, count)
        .map((batch) => Object.assign({}, pushWorkItem, { query: batch }))
    ));
}

module.exports = {
  getCurrentOffsets,
  getUnsentOffsets,
  createPushWorkItems,
  batchPushWorkItem,

  ABSOLUTE_TIME,
};
