package io.dynk.dynkle.kiosk

import android.app.ActivityManager
import android.app.admin.DevicePolicyManager
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.os.Build
import android.view.WindowManager
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import kotlin.system.exitProcess

/**
 * Kiosk ("QoS") mode for the counter terminal. As device owner the app whitelists
 * itself for lock task mode and pins without the "screen pinned" prompt; the
 * status and navigation bars are hidden so customers can't leave the app.
 */
class DynkleKioskModule : Module() {
  private val context: Context
    get() = requireNotNull(appContext.reactContext)

  private val dpm: DevicePolicyManager
    get() = context.getSystemService(Context.DEVICE_POLICY_SERVICE) as DevicePolicyManager

  private val admin: ComponentName
    get() = ComponentName(context, DynkleAdminReceiver::class.java)

  private fun isOwner() = dpm.isDeviceOwnerApp(context.packageName)

  override fun definition() = ModuleDefinition {
    Name("DynkleKiosk")

    Function("isDeviceOwner") { isOwner() }

    Function("isLocked") {
      val am = context.getSystemService(Context.ACTIVITY_SERVICE) as ActivityManager
      am.lockTaskModeState != ActivityManager.LOCK_TASK_MODE_NONE
    }

    Function("start") {
      val activity = appContext.currentActivity ?: return@Function null
      if (isOwner()) {
        dpm.setLockTaskPackages(admin, arrayOf(context.packageName))
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
          // Keep the system UI out of reach: no home, recents or notifications.
          dpm.setLockTaskFeatures(admin, DevicePolicyManager.LOCK_TASK_FEATURE_NONE)
        }
        dpm.setKeyguardDisabled(admin, true)
        dpm.setStatusBarDisabled(admin, true)
      }
      activity.runOnUiThread {
        activity.window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        WindowCompat.setDecorFitsSystemWindows(activity.window, false)
        WindowInsetsControllerCompat(activity.window, activity.window.decorView).apply {
          hide(WindowInsetsCompat.Type.systemBars())
          systemBarsBehavior = WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
        }
        // Without device owner this falls back to screen pinning, which asks the user once.
        activity.startLockTask()
      }
    }

    Function("stop") {
      val activity = appContext.currentActivity ?: return@Function null
      if (isOwner()) dpm.setStatusBarDisabled(admin, false)
      activity.runOnUiThread {
        activity.stopLockTask()
        WindowInsetsControllerCompat(activity.window, activity.window.decorView).show(WindowInsetsCompat.Type.systemBars())
      }
    }

    Function("restart") {
      if (isOwner()) {
        dpm.reboot(admin)
        return@Function null
      }
      // Not device owner: relaunch the app instead of rebooting the terminal.
      val intent = context.packageManager.getLaunchIntentForPackage(context.packageName)?.apply {
        addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK)
      }
      context.startActivity(intent)
      exitProcess(0)
    }
  }
}
