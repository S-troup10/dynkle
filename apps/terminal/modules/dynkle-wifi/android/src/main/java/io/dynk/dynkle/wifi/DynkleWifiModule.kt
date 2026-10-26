package io.dynk.dynkle.wifi

import android.app.admin.DevicePolicyManager
import android.bluetooth.BluetoothManager
import android.content.Context
import android.content.Intent
import android.net.wifi.ScanResult
import android.net.wifi.WifiConfiguration
import android.net.wifi.WifiManager
import android.net.wifi.WifiNetworkSuggestion
import android.os.Build
import android.provider.Settings
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.kotlin.records.Field
import expo.modules.kotlin.records.Record

class WifiNetwork : Record {
  @Field var ssid: String = ""
  @Field var secured: Boolean = true
  @Field var level: Int = 0
  @Field var connected: Boolean = false
}

/**
 * Network setup for the "Get online" screen. As device owner the terminal can
 * join networks directly; otherwise it registers a network suggestion and the
 * system connects (or the merchant finishes in the WiFi panel).
 */
class DynkleWifiModule : Module() {
  private val context: Context
    get() = requireNotNull(appContext.reactContext)

  private val wifi: WifiManager
    get() = context.applicationContext.getSystemService(Context.WIFI_SERVICE) as WifiManager

  private fun isOwner(): Boolean {
    val dpm = context.getSystemService(Context.DEVICE_POLICY_SERVICE) as DevicePolicyManager
    return dpm.isDeviceOwnerApp(context.packageName)
  }

  @Suppress("DEPRECATION")
  private fun currentSsid(): String? =
    wifi.connectionInfo?.ssid?.trim('"')?.takeUnless { it.isBlank() || it == WifiManager.UNKNOWN_SSID.trim('<', '>') || it == "<unknown ssid>" }

  private fun isSecured(r: ScanResult) = listOf("WEP", "PSK", "EAP", "SAE").any { r.capabilities.contains(it) }

  override fun definition() = ModuleDefinition {
    Name("DynkleWifi")

    AsyncFunction("scan") {
      @Suppress("DEPRECATION")
      wifi.startScan()
      val current = currentSsid()
      @Suppress("DEPRECATION")
      wifi.scanResults
        .filter { !it.SSID.isNullOrBlank() }
        .groupBy { it.SSID }
        .map { (ssid, results) ->
          val best = results.maxBy { it.level }
          WifiNetwork().apply {
            this.ssid = ssid
            secured = isSecured(best)
            level = WifiManager.calculateSignalLevel(best.level, 4)
            connected = ssid == current
          }
        }
        .sortedWith(compareByDescending<WifiNetwork> { it.connected }.thenByDescending { it.level })
    }

    AsyncFunction("connect") { ssid: String, password: String? ->
      if (isOwner()) {
        // Device owners may still configure networks directly on every Android version.
        @Suppress("DEPRECATION")
        val config = WifiConfiguration().apply {
          SSID = "\"$ssid\""
          if (password.isNullOrEmpty()) {
            allowedKeyManagement.set(WifiConfiguration.KeyMgmt.NONE)
          } else {
            preSharedKey = "\"$password\""
          }
        }
        @Suppress("DEPRECATION")
        val id = wifi.addNetwork(config)
        @Suppress("DEPRECATION")
        return@AsyncFunction id != -1 && wifi.enableNetwork(id, true)
      }
      val suggestion = WifiNetworkSuggestion.Builder().setSsid(ssid).apply {
        if (!password.isNullOrEmpty()) setWpa2Passphrase(password)
      }.build()
      wifi.addNetworkSuggestions(listOf(suggestion)) == WifiManager.STATUS_NETWORK_SUGGESTIONS_SUCCESS
    }

    Function("currentSsid") { currentSsid() }

    Function("openPanel") {
      val action = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) Settings.Panel.ACTION_WIFI else Settings.ACTION_WIFI_SETTINGS
      context.startActivity(Intent(action).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
    }

    AsyncFunction("forgetAll") {
      wifi.removeNetworkSuggestions(emptyList())
      if (isOwner()) {
        @Suppress("DEPRECATION", "MissingPermission")
        wifi.configuredNetworks?.forEach { wifi.removeNetwork(it.networkId) }
      }
    }

    Function("bluetoothState") {
      val adapter = (context.getSystemService(Context.BLUETOOTH_SERVICE) as? BluetoothManager)?.adapter
      when {
        adapter == null -> "unsupported"
        !adapter.isEnabled -> "off"
        else -> "ready"
      }
    }
  }
}
