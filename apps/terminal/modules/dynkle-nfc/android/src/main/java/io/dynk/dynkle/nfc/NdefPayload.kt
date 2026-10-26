package io.dynk.dynkle.nfc

import android.nfc.NdefMessage
import android.nfc.NdefRecord

/** The NDEF message the HCE service serves. Null means nothing is armed and the tag hides itself. */
object NdefPayload {
  @Volatile
  var ndefFile: ByteArray? = null
    private set

  fun setUri(uri: String?) {
    ndefFile = uri?.let {
      val message = NdefMessage(NdefRecord.createUri(it)).toByteArray()
      // NDEF file = 2-byte length (NLEN) followed by the message.
      byteArrayOf((message.size shr 8).toByte(), (message.size and 0xFF).toByte()) + message
    }
  }
}
