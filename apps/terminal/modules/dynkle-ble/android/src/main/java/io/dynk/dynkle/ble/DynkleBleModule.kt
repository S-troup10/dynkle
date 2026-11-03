package io.dynk.dynkle.ble

import android.annotation.SuppressLint
import android.bluetooth.BluetoothDevice
import android.bluetooth.BluetoothGatt
import android.bluetooth.BluetoothGattCharacteristic
import android.bluetooth.BluetoothGattServer
import android.bluetooth.BluetoothGattServerCallback
import android.bluetooth.BluetoothGattService
import android.bluetooth.BluetoothManager
import android.bluetooth.BluetoothProfile
import android.bluetooth.le.AdvertiseCallback
import android.bluetooth.le.AdvertiseData
import android.bluetooth.le.AdvertiseSettings
import android.bluetooth.le.BluetoothLeAdvertiser
import android.content.Context
import android.content.pm.PackageManager
import android.os.ParcelUuid
import expo.modules.kotlin.Promise
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import org.json.JSONObject
import java.io.ByteArrayOutputStream
import java.util.UUID

/**
 * DYNK app "Tap to Pay" receiver: a Bluetooth LE GATT server serving the signed
 * session JSON (READ) and taking the phone's status messages (WRITE).
 *
 * Ported from the DYNK app's own receiver (modules/dynk-ble-peripheral) so the
 * protocol matches byte for byte, with the changes the integration spec requires:
 *  - advertising only starts after onServiceAdded (the app's module races this);
 *  - prepared ("long") writes are reassembled — iPhones split the status write;
 *  - one customer per charge: once a phone writes "processing", advertising stops
 *    and other phones can't read or write;
 *  - disconnects are reported so the terminal can reset;
 *  - TX power is configurable, to tune the tap distance on the real hardware.
 *
 * Permissions (BLUETOOTH_ADVERTISE / BLUETOOTH_CONNECT) are requested from JS before start().
 */
@SuppressLint("MissingPermission")
class DynkleBleModule : Module() {
  private val lock = Any()
  private var server: BluetoothGattServer? = null
  private var advertiser: BluetoothLeAdvertiser? = null
  private var advertising = false
  private var startPromise: Promise? = null
  private var txPower = AdvertiseSettings.ADVERTISE_TX_POWER_HIGH

  @Volatile private var sessionBytes = ByteArray(0)
  /** The phone that said "processing": the only one allowed to talk to us until the charge ends. */
  @Volatile private var payingDevice: String? = null
  /** Prepared-write buffers per phone, keyed by Bluetooth address. */
  private val pending = HashMap<String, ByteArrayOutputStream>()

  private val context: Context
    get() = appContext.reactContext ?: throw IllegalStateException("React context is not available")

  private val manager: BluetoothManager?
    get() = context.getSystemService(Context.BLUETOOTH_SERVICE) as? BluetoothManager

  override fun definition() = ModuleDefinition {
    Name("DynkleBle")

    Events("onRead", "onMessage", "onConnectionChange", "onError")

    /** "ready" | "off" | "unsupported" — drives the Connect chip on the armed screen. */
    Function("getState") {
      val adapter = manager?.adapter
      when {
        adapter == null || !context.packageManager.hasSystemFeature(PackageManager.FEATURE_BLUETOOTH_LE) -> "unsupported"
        !adapter.isEnabled -> "off"
        adapter.bluetoothLeAdvertiser == null -> "unsupported"
        else -> "ready"
      }
    }

    /** Opens the GATT server with this session and starts advertising. Resolves once advertising is live. */
    AsyncFunction("start") { sessionJson: String, power: String, promise: Promise ->
      start(sessionJson, power, promise)
    }

    /** Swap the served session (rotation). The phone rejects expired sessions, so this happens before `e`. */
    Function("setSession") { sessionJson: String ->
      sessionBytes = sessionJson.toByteArray(Charsets.UTF_8)
    }

    Function("stopAdvertising") {
      stopAdvertising()
    }

    /** Charge over (paid, cancelled, expired): stop advertising and close the GATT server. */
    Function("stop") {
      stopAll()
    }

    OnDestroy {
      stopAll()
    }
  }

  // ---------------------------------------------------------------------------

  private fun start(sessionJson: String, power: String, promise: Promise) {
    stopAll()
    val mgr = manager
    val adapter = mgr?.adapter
    if (mgr == null || adapter == null || !adapter.isEnabled) {
      promise.reject("E_BLE_OFF", "Bluetooth is off or unavailable", null)
      return
    }
    val adv = adapter.bluetoothLeAdvertiser
    if (adv == null) {
      promise.reject("E_BLE_NO_ADVERTISER", "This device can't advertise over Bluetooth LE", null)
      return
    }
    sessionBytes = sessionJson.toByteArray(Charsets.UTF_8)
    payingDevice = null
    txPower = when (power) {
      "ultraLow" -> AdvertiseSettings.ADVERTISE_TX_POWER_ULTRA_LOW
      "low" -> AdvertiseSettings.ADVERTISE_TX_POWER_LOW
      "medium" -> AdvertiseSettings.ADVERTISE_TX_POWER_MEDIUM
      else -> AdvertiseSettings.ADVERTISE_TX_POWER_HIGH
    }
    advertiser = adv
    startPromise = promise

    val gatt = mgr.openGattServer(context, gattCallback)
    if (gatt == null) {
      startPromise = null
      promise.reject("E_BLE_GATT", "Couldn't open the Bluetooth GATT server", null)
      return
    }
    server = gatt
    val service = BluetoothGattService(SERVICE_UUID, BluetoothGattService.SERVICE_TYPE_PRIMARY)
    val characteristic = BluetoothGattCharacteristic(
      SESSION_UUID,
      BluetoothGattCharacteristic.PROPERTY_READ or BluetoothGattCharacteristic.PROPERTY_WRITE,
      BluetoothGattCharacteristic.PERMISSION_READ or BluetoothGattCharacteristic.PERMISSION_WRITE,
    )
    service.addCharacteristic(characteristic)
    if (!gatt.addService(service)) {
      failStart("E_BLE_SERVICE", "Couldn't add the Tap to Pay service")
    }
    // Advertising starts in onServiceAdded, once the service actually exists.
  }

  private fun failStart(code: String, message: String) {
    val p = startPromise
    startPromise = null
    stopAll()
    p?.reject(code, message, null)
  }

  private fun startAdvertising() {
    val adv = advertiser ?: return
    val settings = AdvertiseSettings.Builder()
      .setAdvertiseMode(AdvertiseSettings.ADVERTISE_MODE_LOW_LATENCY)
      .setTxPowerLevel(txPower)
      .setConnectable(true)
      .setTimeout(0)
      .build()
    // Service UUID in the advertisement, device name not included (as the app does).
    val data = AdvertiseData.Builder()
      .setIncludeDeviceName(false)
      .addServiceUuid(ParcelUuid(SERVICE_UUID))
      .build()
    adv.startAdvertising(settings, data, advertiseCallback)
  }

  private fun stopAdvertising() {
    synchronized(lock) {
      if (advertising) {
        try {
          advertiser?.stopAdvertising(advertiseCallback)
        } catch (_: Exception) {
        }
        advertising = false
      }
    }
  }

  private fun stopAll() {
    stopAdvertising()
    synchronized(lock) {
      try {
        server?.clearServices()
        server?.close()
      } catch (_: Exception) {
      }
      server = null
      pending.clear()
      payingDevice = null
    }
  }

  private val advertiseCallback = object : AdvertiseCallback() {
    override fun onStartSuccess(settingsInEffect: AdvertiseSettings?) {
      synchronized(lock) { advertising = true }
      val p = startPromise
      startPromise = null
      p?.resolve(null)
    }

    override fun onStartFailure(errorCode: Int) {
      val message = "Bluetooth advertising failed (code $errorCode)"
      if (startPromise != null) failStart("E_BLE_ADVERTISE", message)
      else sendEvent("onError", mapOf("message" to message))
    }
  }

  /** Another phone while one is paying: refuse. */
  private fun allowed(device: BluetoothDevice): Boolean {
    val paying = payingDevice
    return paying == null || paying == device.address
  }

  private fun handleMessage(device: BluetoothDevice, text: String) {
    // One customer per charge: lock to this phone as soon as it starts paying.
    val status = try {
      JSONObject(text).optString("transferStatus")
    } catch (_: Exception) {
      ""
    }
    if (status == "processing" && payingDevice == null) {
      payingDevice = device.address
      stopAdvertising()
    }
    sendEvent("onMessage", mapOf("device" to device.address, "text" to text))
  }

  private val gattCallback = object : BluetoothGattServerCallback() {
    override fun onServiceAdded(status: Int, service: BluetoothGattService?) {
      if (status == BluetoothGatt.GATT_SUCCESS && service?.uuid == SERVICE_UUID) startAdvertising()
      else failStart("E_BLE_SERVICE", "Adding the Tap to Pay service failed (status $status)")
    }

    override fun onConnectionStateChange(device: BluetoothDevice, status: Int, newState: Int) {
      val connected = newState == BluetoothProfile.STATE_CONNECTED
      if (!connected) synchronized(lock) { pending.remove(device.address) }
      sendEvent("onConnectionChange", mapOf("device" to device.address, "connected" to connected))
    }

    override fun onCharacteristicReadRequest(
      device: BluetoothDevice,
      requestId: Int,
      offset: Int,
      characteristic: BluetoothGattCharacteristic,
    ) {
      val gatt = server ?: return
      if (characteristic.uuid != SESSION_UUID || !allowed(device)) {
        gatt.sendResponse(device, requestId, BluetoothGatt.GATT_READ_NOT_PERMITTED, offset, null)
        return
      }
      val value = sessionBytes
      // Long reads come back with an offset: serve the rest from there.
      val chunk = if (offset < value.size) value.copyOfRange(offset, value.size) else ByteArray(0)
      gatt.sendResponse(device, requestId, BluetoothGatt.GATT_SUCCESS, offset, chunk)
      if (offset == 0) sendEvent("onRead", mapOf("device" to device.address))
    }

    override fun onCharacteristicWriteRequest(
      device: BluetoothDevice,
      requestId: Int,
      characteristic: BluetoothGattCharacteristic,
      preparedWrite: Boolean,
      responseNeeded: Boolean,
      offset: Int,
      value: ByteArray?,
    ) {
      val gatt = server ?: return
      val bytes = value ?: ByteArray(0)
      if (characteristic.uuid != SESSION_UUID || !allowed(device)) {
        if (responseNeeded) gatt.sendResponse(device, requestId, BluetoothGatt.GATT_WRITE_NOT_PERMITTED, offset, null)
        return
      }
      if (preparedWrite) {
        // iPhones split long writes: buffer the pieces until onExecuteWrite.
        synchronized(lock) {
          val buf = if (offset == 0) ByteArrayOutputStream().also { pending[device.address] = it }
          else pending.getOrPut(device.address) { ByteArrayOutputStream() }
          if (buf.size() != offset) {
            if (responseNeeded) gatt.sendResponse(device, requestId, BluetoothGatt.GATT_INVALID_OFFSET, offset, null)
            return
          }
          buf.write(bytes)
        }
      } else {
        handleMessage(device, String(bytes, Charsets.UTF_8))
      }
      if (responseNeeded) gatt.sendResponse(device, requestId, BluetoothGatt.GATT_SUCCESS, offset, bytes)
    }

    override fun onExecuteWrite(device: BluetoothDevice, requestId: Int, execute: Boolean) {
      val buf = synchronized(lock) { pending.remove(device.address) }
      server?.sendResponse(device, requestId, BluetoothGatt.GATT_SUCCESS, 0, null)
      if (execute && buf != null) handleMessage(device, buf.toString(Charsets.UTF_8.name()))
    }
  }

  companion object {
    // Must match the DYNK app (src/services/ble/bleTypes.ts).
    val SERVICE_UUID: UUID = UUID.fromString("7a1e8f10-7a2c-4b7e-9b7a-1f6a2e6b9c10")
    val SESSION_UUID: UUID = UUID.fromString("7a1e8f11-7a2c-4b7e-9b7a-1f6a2e6b9c10")
  }
}
