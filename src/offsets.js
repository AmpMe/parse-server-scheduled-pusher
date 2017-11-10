const moment = require('moment-timezone');

const offsetToTimezones = {};
const timezoneToOffset = {};

function compute(now = new Date()) {
  now = +now;
  const timezones = moment.tz.names();

  for (const zone of timezones) {
    const offset = moment.tz.zone(zone).utcOffset(now);
    timezoneToOffset[zone] = offset;
    offsetToTimezones[offset] = offsetToTimezones[offset] || [];
    offsetToTimezones[offset].push(zone);
  }
}

compute();

module.exports = {
  compute,
  offsetToTimezones,
  timezoneToOffset,
};
