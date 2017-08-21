module.exports = {
  push: {
    ios: [ ],
    android: {
      senderId: process.env.PUSH_ANDROID_SENDER_ID,
      apiKey: process.env.PUSH_ANDROID_API_KEY,
    },
  },
};
