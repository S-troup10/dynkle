package io.dynk.dynkle.nfc

import android.nfc.cardemulation.HostApduService
import android.os.Bundle

/**
 * Emulates an NFC Forum Type 4 tag holding one URI record (the payment link).
 * A customer's phone reads it exactly like an NFC sticker and opens the DYNK app
 * (or browser) on the universal link that wraps the Solana Pay request.
 */
class DynkleHceService : HostApduService() {
  private enum class File { NONE, CC, NDEF }

  private var selected = File.NONE

  override fun processCommandApdu(apdu: ByteArray, extras: Bundle?): ByteArray {
    if (apdu.size < 4) return SW_WRONG_LENGTH
    val ins = apdu[1].toInt() and 0xFF
    return when (ins) {
      INS_SELECT -> select(apdu)
      INS_READ_BINARY -> readBinary(apdu)
      else -> SW_INS_NOT_SUPPORTED
    }
  }

  override fun onDeactivated(reason: Int) {
    selected = File.NONE
  }

  private fun select(apdu: ByteArray): ByteArray {
    val p1 = apdu[2].toInt() and 0xFF
    val lc = if (apdu.size > 4) apdu[4].toInt() and 0xFF else 0
    if (apdu.size < 5 + lc) return SW_WRONG_LENGTH
    val data = apdu.copyOfRange(5, 5 + lc)
    return when {
      p1 == 0x04 && data.contentEquals(NDEF_AID) -> {
        // Only answer while a charge is armed, so idle terminals don't pop links on phones.
        if (NdefPayload.ndefFile == null) SW_FILE_NOT_FOUND else SW_OK.also { selected = File.NONE }
      }
      p1 == 0x00 && data.contentEquals(CC_FILE_ID) -> SW_OK.also { selected = File.CC }
      p1 == 0x00 && data.contentEquals(NDEF_FILE_ID) -> {
        if (NdefPayload.ndefFile == null) SW_FILE_NOT_FOUND else SW_OK.also { selected = File.NDEF }
      }
      else -> SW_FILE_NOT_FOUND
    }
  }

  private fun readBinary(apdu: ByteArray): ByteArray {
    val file = when (selected) {
      File.CC -> CAPABILITY_CONTAINER
      File.NDEF -> NdefPayload.ndefFile ?: return SW_FILE_NOT_FOUND
      File.NONE -> return SW_FILE_NOT_FOUND
    }
    val offset = ((apdu[2].toInt() and 0xFF) shl 8) or (apdu[3].toInt() and 0xFF)
    var le = if (apdu.size > 4) apdu[4].toInt() and 0xFF else 0
    if (le == 0) le = 256
    if (offset > file.size) return SW_WRONG_PARAMS
    val end = minOf(file.size, offset + le)
    return file.copyOfRange(offset, end) + SW_OK
  }

  companion object {
    private const val INS_SELECT = 0xA4
    private const val INS_READ_BINARY = 0xB0

    private val NDEF_AID = hex("D2760000850101")
    private val CC_FILE_ID = hex("E103")
    private val NDEF_FILE_ID = hex("E104")

    /** CC file: v2.0, MLe 0x3B, MLc 0x34, NDEF file E104 up to 1 KB, read-only. */
    private val CAPABILITY_CONTAINER = hex("000F20003B00340406E104040000FF")

    private val SW_OK = hex("9000")
    private val SW_FILE_NOT_FOUND = hex("6A82")
    private val SW_WRONG_PARAMS = hex("6B00")
    private val SW_WRONG_LENGTH = hex("6700")
    private val SW_INS_NOT_SUPPORTED = hex("6D00")

    private fun hex(s: String) = ByteArray(s.length / 2) { s.substring(it * 2, it * 2 + 2).toInt(16).toByte() }
  }
}
