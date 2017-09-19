const Parse = require('parse/node');

function getScheduledPushes() {
  const pushStatusesQ = new Parse.Query('_PushStatus');
  pushStatusesQ.containedIn('status', [ 'scheduled', 'running' ]);
  pushStatusesQ.limit(1000);
  pushStatusesQ.addDescending('createdAt'); // Newest to oldest

  return pushStatusesQ.find({ useMasterKey: true })
    .then((pushStatuses) => pushStatuses.filter((pushStatus) => {
      // Filter out immediate pushes which are currently running
      if (pushStatus.get('status') === 'running' && !pushStatus.has('sentPerUTCOffset')) {
        return false;
      }

      return true;
    }));
}

module.exports = { getScheduledPushes };
