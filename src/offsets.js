const moment = require('moment-timezone');

const offsetToTimezones = {};
const timezoneToOffset = {};

function compute() {
  const now = +new Date();
  const timezones = moment.tz.names();

  for (const zone of timezones) {
    const offset = moment.tz.zone(zone).offset(now);
    timezoneToOffset[zone] = offset;
    offsetToTimezones[offset] = offsetToTimezones[offset] || [];
    offsetToTimezones[offset].push(zone);
  }
}

compute();

module.exports = {
  offsetToTimezones,
  timezoneToOffset,
};
