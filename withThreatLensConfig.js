const fs = require('fs');
const path = require('path');
const { withAndroidManifest, withMainApplication, withDangerousMod } = require('@expo/config-plugins');

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
    const source = config.modResults.contents;
    if (source.includes('add(NotificationPackage())')) {
      return config;
    }

    if (source.includes('// add(MyReactNativePackage())')) {
      config.modResults.contents = source.replace(
        '// add(MyReactNativePackage())',
        '// add(MyReactNativePackage())\n              add(NotificationPackage())'
      );
      return config;
    }

    config.modResults.contents = source.replace(
      'PackageList(this).packages.apply {',
      'PackageList(this).packages.apply {\n              add(NotificationPackage())'
    );

    return config;
  });
}

function getAndroidPackage(config) {
  return config?.android?.package || 'com.anonymous.threatlens';
}

function writeFileIfChanged(filePath, content) {
  if (fs.existsSync(filePath)) {
    const existing = fs.readFileSync(filePath, 'utf8');
    if (existing === content) {
      return;
    }
  }
  fs.writeFileSync(filePath, content, 'utf8');
}

function notificationServiceSource(packageName) {
  return `package ${packageName}

import android.app.Notification
import android.content.Intent
import android.os.Bundle
import android.service.notification.NotificationListenerService
import android.service.notification.StatusBarNotification

class NotificationService : NotificationListenerService() {

  companion object {
    const val ACTION_NOTIFICATION_CAPTURED = "${packageName}.NOTIFICATION_CAPTURED"
    const val EXTRA_PACKAGE_NAME = "packageName"
    const val EXTRA_TITLE = "title"
    const val EXTRA_TEXT = "text"
    const val EXTRA_IS_TRUNCATED = "isTruncated"
    const val EXTRA_POSTED_AT = "postedAt"
  }

  override fun onNotificationPosted(sbn: StatusBarNotification?) {
    if (sbn == null) {
      return
    }

    if (sbn.packageName == packageName) {
      return
    }

    val extras = sbn.notification.extras ?: Bundle.EMPTY
    val messageText = extractBestText(extras)
    val title = extras.getCharSequence(Notification.EXTRA_TITLE)?.toString()?.trim().orEmpty()
    val isTruncated = isLikelyTruncated(extras, messageText)

    val intent = Intent(ACTION_NOTIFICATION_CAPTURED).apply {
      \`package\` = packageName
      putExtra(EXTRA_PACKAGE_NAME, sbn.packageName)
      putExtra(EXTRA_TITLE, title)
      putExtra(EXTRA_TEXT, messageText)
      putExtra(EXTRA_IS_TRUNCATED, isTruncated)
      putExtra(EXTRA_POSTED_AT, sbn.postTime)
    }

    sendBroadcast(intent)
  }

  private fun extractBestText(extras: Bundle): String {
    val text = extras.getCharSequence(Notification.EXTRA_TEXT)?.toString()?.trim().orEmpty()
    val bigText = extras.getCharSequence(Notification.EXTRA_BIG_TEXT)?.toString()?.trim().orEmpty()

    val lines = extras.getCharSequenceArray(Notification.EXTRA_TEXT_LINES)
      ?.mapNotNull { it?.toString()?.trim() }
      ?.filter { it.isNotEmpty() }
      ?.joinToString("\\n")
      .orEmpty()

    return listOf(bigText, lines, text)
      .filter { it.isNotEmpty() }
      .maxByOrNull { it.length }
      .orEmpty()
  }

  private fun isLikelyTruncated(extras: Bundle, extractedText: String): Boolean {
    if (extractedText.isBlank()) {
      return true
    }

    val text = extras.getCharSequence(Notification.EXTRA_TEXT)?.toString()?.trim().orEmpty()
    val bigText = extras.getCharSequence(Notification.EXTRA_BIG_TEXT)?.toString()?.trim().orEmpty()

    val hasEllipsis = text.endsWith("...") || text.endsWith("…") ||
      extractedText.endsWith("...") || extractedText.endsWith("…")

    val hasLongCollapsedText = bigText.isBlank() && text.length >= 140

    return hasEllipsis || hasLongCollapsedText
  }
}
`;
}

function notificationModuleSource(packageName) {
  return `package ${packageName}

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.provider.Settings
import androidx.core.content.ContextCompat
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.BaseActivityEventListener
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.modules.core.DeviceEventManagerModule

class NotificationModule(
  private val reactContext: ReactApplicationContext
) : ReactContextBaseJavaModule(reactContext) {

  private var receiverRegistered = false
  private var lastSharedText: String? = null

  private val activityEventListener = object : BaseActivityEventListener() {
    override fun onNewIntent(intent: Intent) {
      emitSharedTextIfPresent(intent)
    }
  }

  private val notificationReceiver = object : BroadcastReceiver() {
    override fun onReceive(context: Context?, intent: Intent?) {
      if (intent == null || intent.action != NotificationService.ACTION_NOTIFICATION_CAPTURED) {
        return
      }

      val payload = Arguments.createMap().apply {
        putString(
          NotificationService.EXTRA_PACKAGE_NAME,
          intent.getStringExtra(NotificationService.EXTRA_PACKAGE_NAME).orEmpty()
        )
        putString(
          NotificationService.EXTRA_TITLE,
          intent.getStringExtra(NotificationService.EXTRA_TITLE).orEmpty()
        )
        putString(
          NotificationService.EXTRA_TEXT,
          intent.getStringExtra(NotificationService.EXTRA_TEXT).orEmpty()
        )
        putBoolean(
          NotificationService.EXTRA_IS_TRUNCATED,
          intent.getBooleanExtra(NotificationService.EXTRA_IS_TRUNCATED, false)
        )
        putDouble(
          NotificationService.EXTRA_POSTED_AT,
          intent.getLongExtra(NotificationService.EXTRA_POSTED_AT, 0L).toDouble()
        )
      }

      emitEvent("NotificationReceived", payload)
    }
  }

  override fun getName(): String = "NotificationModule"

  override fun initialize() {
    super.initialize()
    reactContext.addActivityEventListener(activityEventListener)
    registerReceiverIfNeeded()
    emitSharedTextIfPresent(reactContext.currentActivity?.intent)
  }

  override fun invalidate() {
    reactContext.removeActivityEventListener(activityEventListener)
    unregisterReceiverIfNeeded()
    super.invalidate()
  }

  @ReactMethod
  fun addListener(eventName: String) {
    // Required by NativeEventEmitter on newer React Native versions.
  }

  @ReactMethod
  fun removeListeners(count: Int) {
    // Required by NativeEventEmitter on newer React Native versions.
  }

  @ReactMethod
  fun openNotificationAccessSettings() {
    val intent = Intent("android.settings.ACTION_NOTIFICATION_LISTENER_SETTINGS").apply {
      addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
    }
    reactContext.startActivity(intent)
  }

  @ReactMethod
  fun isNotificationAccessGranted(promise: Promise) {
    try {
      val enabledListeners = Settings.Secure.getString(
        reactContext.contentResolver,
        "enabled_notification_listeners"
      ).orEmpty()

      val granted = enabledListeners.contains(reactContext.packageName)
      promise.resolve(granted)
    } catch (error: Exception) {
      promise.reject("NOTIFICATION_ACCESS_CHECK_FAILED", error)
    }
  }

  @ReactMethod
  fun getInitialSharedText(promise: Promise) {
    try {
      val text = consumeSharedText(reactContext.currentActivity?.intent)
      promise.resolve(text)
    } catch (error: Exception) {
      promise.reject("SHARE_INTENT_READ_FAILED", error)
    }
  }

  private fun registerReceiverIfNeeded() {
    if (receiverRegistered) {
      return
    }

    val filter = IntentFilter(NotificationService.ACTION_NOTIFICATION_CAPTURED)
    ContextCompat.registerReceiver(
      reactContext,
      notificationReceiver,
      filter,
      ContextCompat.RECEIVER_NOT_EXPORTED
    )
    receiverRegistered = true
  }

  private fun unregisterReceiverIfNeeded() {
    if (!receiverRegistered) {
      return
    }

    try {
      reactContext.unregisterReceiver(notificationReceiver)
    } catch (_: IllegalArgumentException) {
      // Receiver may already be unregistered when React context is recreated.
    } finally {
      receiverRegistered = false
    }
  }

  private fun emitEvent(eventName: String, params: com.facebook.react.bridge.WritableMap) {
    if (!reactContext.hasActiveReactInstance()) {
      return
    }

    reactContext
      .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
      .emit(eventName, params)
  }

  private fun emitSharedTextIfPresent(intent: Intent?) {
    val text = consumeSharedText(intent) ?: return

    val payload = Arguments.createMap().apply {
      putString("text", text)
    }
    emitEvent("SharedTextReceived", payload)
  }

  private fun consumeSharedText(intent: Intent?): String? {
    if (intent?.action != Intent.ACTION_SEND) {
      return null
    }

    val type = intent.type.orEmpty()
    if (!type.startsWith("text/")) {
      return null
    }

    val sharedText = intent.getStringExtra(Intent.EXTRA_TEXT)?.trim().orEmpty()
    if (sharedText.isBlank()) {
      return null
    }

    if (sharedText == lastSharedText) {
      return null
    }

    lastSharedText = sharedText
    return sharedText
  }
}
`;
}

function notificationPackageSource(packageName) {
  return `package ${packageName}

import com.facebook.react.ReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.uimanager.ViewManager

class NotificationPackage : ReactPackage {
  override fun createNativeModules(reactContext: ReactApplicationContext): List<NativeModule> {
    return listOf(NotificationModule(reactContext))
  }

  override fun createViewManagers(
    reactContext: ReactApplicationContext
  ): List<ViewManager<*, *>> {
    return emptyList()
  }
}
`;
}

function withThreatLensNativeFiles(config) {
  return withDangerousMod(config, ['android', async config => {
    const projectRoot = config.modRequest.projectRoot;
    const packageName = getAndroidPackage(config);
    const packagePath = packageName.split('.');
    const javaDir = path.join(projectRoot, 'android', 'app', 'src', 'main', 'java', ...packagePath);

    fs.mkdirSync(javaDir, { recursive: true });

    writeFileIfChanged(
      path.join(javaDir, 'NotificationService.kt'),
      notificationServiceSource(packageName)
    );
    writeFileIfChanged(
      path.join(javaDir, 'NotificationModule.kt'),
      notificationModuleSource(packageName)
    );
    writeFileIfChanged(
      path.join(javaDir, 'NotificationPackage.kt'),
      notificationPackageSource(packageName)
    );

    return config;
  }]);
}

module.exports = function withThreatLensConfig(config) {
  config = withThreatLensManifest(config);
  config = withThreatLensMainApp(config);
  config = withThreatLensNativeFiles(config);
  return config;
};
