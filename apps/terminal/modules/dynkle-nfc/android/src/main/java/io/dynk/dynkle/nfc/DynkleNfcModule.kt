package io.dynk.dynkle.nfc

import android.content.pm.PackageManager
import android.nfc.NfcAdapter
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class DynkleNfcModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("DynkleNfc")

    /** "ready" | "off" | "unsupported" — drives the Tap chip on the armed screen. */
    Function("getState") {
      val context = appContext.reactContext ?: return@Function "unsupported"
      val pm = context.packageManager
      val adapter = NfcAdapter.getDefaultAdapter(context)
      when {
        adapter == null || !pm.hasSystemFeature(PackageManager.FEATURE_NFC_HOST_CARD_EMULATION) -> "unsupported"
        !adapter.isEnabled -> "off"
        else -> "ready"
      }
    }

    Function("setPayload") { uri: String? ->
      NdefPayload.setUri(uri)
    }
  }
}
