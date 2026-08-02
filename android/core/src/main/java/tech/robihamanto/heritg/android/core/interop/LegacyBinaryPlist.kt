package tech.robihamanto.heritg.android.core.interop

import java.nio.ByteBuffer
import java.nio.charset.CodingErrorAction
import java.nio.charset.StandardCharsets

internal class LegacyBinaryPlist(private val bytes: ByteArray) {
    private val dataCache = mutableMapOf<Int, ByteArray>()
    private val stringCache = mutableMapOf<Int, String>()
    private val trailerStart: Int
    private val offsetSize: Int
    private val referenceSize: Int
    private val objectCount: Int
    private val offsetTableStart: Int
    val rootReference: Int

    init {
        if (bytes.size < Header.size + TrailerBytes || !bytes.copyOfRange(0, Header.size).contentEquals(Header)) {
            invalid()
        }
        trailerStart = bytes.size - TrailerBytes
        if ((trailerStart until trailerStart + 6).any { bytes[it] != 0.toByte() }) invalid()
        offsetSize = bytes[trailerStart + 6].toInt() and 0xff
        referenceSize = bytes[trailerStart + 7].toInt() and 0xff
        if (offsetSize !in 1..8 || referenceSize !in 1..8) invalid()
        objectCount = readUnsigned(trailerStart + 8, 8).toIntExact()
        rootReference = readUnsigned(trailerStart + 16, 8).toIntExact()
        offsetTableStart = readUnsigned(trailerStart + 24, 8).toIntExact()
        if (objectCount <= 0 || rootReference !in 0 until objectCount || offsetTableStart < Header.size) invalid()
        val tableBytes = checkedProduct(objectCount, offsetSize)
        if (offsetTableStart.toLong() + tableBytes != trailerStart.toLong()) invalid()
    }

    fun dictionary(reference: Int, allowedKeys: Set<String>): Map<String, Int> {
        val (offset, info) = objectMarker(reference, DictionaryType)
        val (count, refsStart) = readLength(offset, info)
        if (count > allowedKeys.size) invalid()
        ensureObjectRange(refsStart, checkedProduct(count, referenceSize * 2))
        val result = LinkedHashMap<String, Int>(count)
        repeat(count) { index ->
            val keyRef = readReference(refsStart + index * referenceSize)
            val valueRef = readReference(refsStart + (count + index) * referenceSize)
            val key = string(keyRef, MaximumKeyBytes)
            if (key !in allowedKeys || result.put(key, valueRef) != null) invalid()
        }
        return result
    }

    fun array(reference: Int, maximumCount: Int): IntArray {
        val (offset, info) = objectMarker(reference, ArrayType)
        val (count, refsStart) = readLength(offset, info)
        if (count > maximumCount) throw ArchiveException.TooManyRecords()
        ensureObjectRange(refsStart, checkedProduct(count, referenceSize))
        return IntArray(count) { index -> readReference(refsStart + index * referenceSize) }
    }

    fun integer(reference: Int): Long {
        val (offset, info) = objectMarker(reference, IntegerType)
        if (info > 3) invalid()
        val width = 1 shl info
        ensureObjectRange(offset + 1, width.toLong())
        var value = 0L
        repeat(width) { value = (value shl 8) or (bytes[offset + 1 + it].toLong() and 0xff) }
        if (width < 8 && bytes[offset + 1].toInt() and 0x80 != 0) value = value or (-1L shl (width * 8))
        return value
    }

    fun date(reference: Int): Double {
        val (offset, info) = objectMarker(reference, DateType)
        if (info != 3) invalid()
        ensureObjectRange(offset + 1, 8L)
        return Double.fromBits(readBits(offset + 1, 8)).also { if (!it.isFinite()) invalid() }
    }

    fun data(reference: Int, maximumBytes: Int): ByteArray {
        dataCache[reference]?.let {
            if (it.size > maximumBytes) throw ArchiveException.MediaTooLarge()
            return it
        }
        val (offset, info) = objectMarker(reference, DataType)
        val (count, start) = readLength(offset, info)
        if (count > maximumBytes) throw ArchiveException.MediaTooLarge()
        ensureObjectRange(start, count.toLong())
        return bytes.copyOfRange(start, start + count).also { dataCache[reference] = it }
    }

    fun string(reference: Int, maximumUtf8Bytes: Int): String {
        stringCache[reference]?.let {
            if (it.encodeToByteArray().size > maximumUtf8Bytes) throw ArchiveException.FieldTooLarge()
            return it
        }
        val offset = objectOffset(reference)
        val marker = bytes[offset].toInt() and 0xff
        val type = marker ushr 4
        val (count, start) = readLength(offset, marker and 0x0f)
        val value = when (type) {
            AsciiStringType -> {
                if (count > maximumUtf8Bytes) throw ArchiveException.FieldTooLarge()
                ensureObjectRange(start, count.toLong())
                if ((start until start + count).any { bytes[it].toInt() and 0x80 != 0 }) invalid()
                String(bytes, start, count, StandardCharsets.US_ASCII)
            }
            Utf16StringType -> {
                val byteCount = checkedProduct(count, 2).toIntExact()
                ensureObjectRange(start, byteCount.toLong())
                decodeUtf16(start, byteCount)
            }
            else -> invalid()
        }
        if (value.encodeToByteArray().size > maximumUtf8Bytes) throw ArchiveException.FieldTooLarge()
        return value.also { stringCache[reference] = it }
    }

    private fun decodeUtf16(start: Int, count: Int): String = try {
        StandardCharsets.UTF_16BE.newDecoder()
            .onMalformedInput(CodingErrorAction.REPORT)
            .onUnmappableCharacter(CodingErrorAction.REPORT)
            .decode(ByteBuffer.wrap(bytes, start, count)).toString()
    } catch (error: Exception) {
        throw ArchiveException.InvalidArchive(error)
    }

    private fun objectMarker(reference: Int, expectedType: Int): Pair<Int, Int> {
        val offset = objectOffset(reference)
        val marker = bytes[offset].toInt() and 0xff
        if (marker ushr 4 != expectedType) invalid()
        return offset to (marker and 0x0f)
    }

    private fun objectOffset(reference: Int): Int {
        if (reference !in 0 until objectCount) invalid()
        val offset = readUnsigned(offsetTableStart + reference * offsetSize, offsetSize).toIntExact()
        if (offset !in Header.size until offsetTableStart) invalid()
        return offset
    }

    private fun readReference(offset: Int): Int {
        val reference = readUnsigned(offset, referenceSize).toIntExact()
        if (reference !in 0 until objectCount) invalid()
        return reference
    }

    private fun readLength(objectOffset: Int, markerInfo: Int): Pair<Int, Int> {
        if (markerInfo < 15) return markerInfo to (objectOffset + 1)
        ensureObjectRange(objectOffset + 1, 1L)
        val marker = bytes[objectOffset + 1].toInt() and 0xff
        if (marker ushr 4 != IntegerType || marker and 0x0f > 3) invalid()
        val width = 1 shl (marker and 0x0f)
        ensureObjectRange(objectOffset + 2, width.toLong())
        val count = readUnsigned(objectOffset + 2, width).toIntExact()
        if (count < 15) invalid()
        return count to (objectOffset + 2 + width)
    }

    private fun readUnsigned(offset: Int, count: Int): Long {
        if (offset < 0 || count < 0 || offset.toLong() + count > bytes.size) invalid()
        var value = 0L
        repeat(count) {
            val next = bytes[offset + it].toLong() and 0xff
            if (value > (Long.MAX_VALUE - next) / 256) invalid()
            value = value * 256 + next
        }
        return value
    }

    private fun readBits(offset: Int, count: Int): Long {
        var value = 0L
        repeat(count) { value = (value shl 8) or (bytes[offset + it].toLong() and 0xff) }
        return value
    }

    private fun ensureObjectRange(offset: Int, count: Long) {
        if (offset < Header.size || count < 0 || offset.toLong() + count > offsetTableStart) invalid()
    }

    private fun checkedProduct(left: Int, right: Int): Long = left.toLong() * right.toLong()

    private fun Long.toIntExact(): Int = if (this in 0..Int.MAX_VALUE.toLong()) toInt() else invalid()

    private fun invalid(): Nothing = throw ArchiveException.InvalidArchive()

    private companion object {
        val Header = "bplist00".encodeToByteArray()
        const val TrailerBytes = 32
        const val MaximumKeyBytes = 64
        const val IntegerType = 0x1
        const val DateType = 0x3
        const val DataType = 0x4
        const val AsciiStringType = 0x5
        const val Utf16StringType = 0x6
        const val ArrayType = 0xa
        const val DictionaryType = 0xd
    }
}
