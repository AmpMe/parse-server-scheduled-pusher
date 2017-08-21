const state = {
  sent: 0,
};

module.exports = {
  adapter: {
    send(body, installations, pushStatus) {
      state.sent += 1;
      return Promise.resolve();
    },
    getValidPushTypes() {
      return [ 'ios', 'android', 'gcm', 'fcm' ];
    },
  },
  state,
};
