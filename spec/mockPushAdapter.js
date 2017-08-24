const state = {
  sent: 0,
};

module.exports = {
  adapter: {
    send(body, installations, pushStatus) {
      state.sent += installations.length;
      return Promise.resolve(installations.map(() => {
        return { transmitted: true };
      }));
    },
    getValidPushTypes() {
      return [ 'ios', 'android', 'gcm', 'fcm' ];
    },
  },
  state,
};
