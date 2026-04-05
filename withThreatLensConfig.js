const { withAndroidManifest, withMainApplication } = require('@expo/config-plugins');

function withThreatLensManifest(config) {
  return withAndroidManifest(config, async config => {
    const androidManifest = config.modResults;
    const mainApplication = androidManifest.manifest.application[0];

    // Add NotificationListenerService
    if (!mainApplication.service) {
      mainApplication.service = [];
    }

    const hasService = mainApplication.service.some(
      s => s.$['android:name'] === '.NotificationService'
    );

    if (!hasService) {
      mainApplication.service.push({
        $: {
          'android:name': '.NotificationService',
          'android:label': 'ThreatLens Breach Scanner',
          'android:permission': 'android.permission.BIND_NOTIFICATION_LISTENER_SERVICE',
          'android:exported': 'true'
        },
        'intent-filter': [
          {
            action: [{ $: { 'android:name': 'android.service.notification.NotificationListenerService' } }]
          }
        ]
      });
    }

    // Add ACTION_SEND intent filter to MainActivity
    const mainActivity = mainApplication.activity.find(
      a => a.$['android:name'] === '.MainActivity'
    );

    if (mainActivity) {
      if (!mainActivity['intent-filter']) {
        mainActivity['intent-filter'] = [];
      }
      
      const hasActionSend = mainActivity['intent-filter'].some(
        f => f.action && f.action.some(a => a.$['android:name'] === 'android.intent.action.SEND')
      );

      if (!hasActionSend) {
        mainActivity['intent-filter'].push({
          action: [{ $: { 'android:name': 'android.intent.action.SEND' } }],
          category: [{ $: { 'android:name': 'android.intent.category.DEFAULT' } }],
          data: [{ $: { 'android:mimeType': 'text/plain' } }]
        });
      }
    }

    return config;
  });
}

function withThreatLensMainApp(config) {
  return withMainApplication(config, async config => {
    // Basic setup to ensure the package is registered if we need manual linking.
    // However, RN > 0.60 usually auto-links custom modules inside the android/app/src folders.
    return config;
  });
}

module.exports = function withThreatLensConfig(config) {
  config = withThreatLensManifest(config);
  config = withThreatLensMainApp(config);
  return config;
};
