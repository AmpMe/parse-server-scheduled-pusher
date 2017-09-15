const { master } = require('parse-server/lib/Auth');
const { create } = require('parse-server/lib/rest');
const { dropDB } = require('parse-server-test-runner');
const Config = require('parse-server/lib/Config');

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
  stripTimezone,
  setupInstallations,
  installations,
};
