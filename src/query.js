const Parse = require('parse/node');

function getScheduledPushes() {
  const pushStatusesQ = new Parse.Query('_PushStatus');
  pushStatusesQ.containedIn('status', [ 'scheduled', 'running' ]);

  return pushStatusesQ.find({ useMasterKey: true })
    .then((pushStatuses) => pushStatuses.filter((pushStatus) => {
      // Scheduled pushes are sometimes in the running state.
      // If it has offsets set, don't resend
      if (pushStatus.get('status') === 'running') {
        if (!pushStatus.get('numSent') && !pushStatus.get('sentPerUTCOffset')) {
          return false;
        }
      }

      return true;
    }));
}

module.exports = { getScheduledPushes };
