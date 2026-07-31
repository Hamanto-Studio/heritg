package tech.robihamanto.heritg.android.core.interop

import java.io.ByteArrayOutputStream
import java.nio.ByteBuffer
import java.nio.charset.CodingErrorAction
import java.nio.charset.StandardCharsets
import java.util.zip.CRC32

internal object HeritgZip {
    private const val LocalSignature = 0x04034b50L
    private const val CentralSignature = 0x02014b50L
    private const val EndSignature = 0x06054b50L
    private const val Version = 20
    private const val Flags = 0x0800
    private const val Stored = 0
    private const val DosTime = 0
    private const val DosDate = 0x0021

    private data class Central(
        val path: String,
        val crc: Long,
        val size: Int,
        val localOffset: Int,
    )

    fun encode(entries: Map<String, ByteArray>): ByteArray {
        if (entries.size > UShort.MAX_VALUE.toInt()) throw ArchiveException.TooManyRecords()
        val sorted = entries.entries.sortedBy { it.key }
        val output = ByteArrayOutputStream()
        val central = mutableListOf<Central>()
        sorted.forEach { (path, data) ->
            validatePath(path)
            val name = path.encodeToByteArray()
            if (name.size > UShort.MAX_VALUE.toInt()) throw ArchiveException.FieldTooLarge()
            val crc = crc32(data)
            central += Central(path, crc, data.size, output.size())
            output.u32(LocalSignature)
            output.u16(Version)
            output.u16(Flags)
            output.u16(Stored)
            output.u16(DosTime)
            output.u16(DosDate)
            output.u32(crc)
            output.u32(data.size.toLong())
            output.u32(data.size.toLong())
            output.u16(name.size)
            output.u16(0)
            output.write(name)
            output.write(data)
            checkSize(output.size())
        }
        val centralOffset = output.size()
        central.forEach { record ->
            val name = record.path.encodeToByteArray()
            output.u32(CentralSignature)
            output.u16(Version)
            output.u16(Version)
            output.u16(Flags)
            output.u16(Stored)
            output.u16(DosTime)
            output.u16(DosDate)
            output.u32(record.crc)
            output.u32(record.size.toLong())
            output.u32(record.size.toLong())
            output.u16(name.size)
            output.u16(0)
            output.u16(0)
            output.u16(0)
            output.u16(0)
            output.u32(0)
            output.u32(record.localOffset.toLong())
            output.write(name)
        }
        val centralSize = output.size() - centralOffset
        output.u32(EndSignature)
        output.u16(0)
        output.u16(0)
        output.u16(central.size)
        output.u16(central.size)
        output.u32(centralSize.toLong())
        output.u32(centralOffset.toLong())
        output.u16(0)
        checkSize(output.size())
        return output.toByteArray()
    }

    fun decode(archive: ByteArray): Map<String, ByteArray> {
        if (archive.size > ArchiveConstants.MaximumArchiveBytes) throw ArchiveException.FileTooLarge()
        if (archive.size < 22) throw ArchiveException.InvalidArchive()
        val end = archive.size - 22
        if (archive.u32(end) != EndSignature || archive.u16(end + 4) != 0 || archive.u16(end + 6) != 0 ||
            archive.u16(end + 8) != archive.u16(end + 10) || archive.u16(end + 20) != 0
        ) throw ArchiveException.InvalidArchive()
        val entryCount = archive.u16(end + 10)
        val centralSize = archive.u32(end + 12).toIntExact()
        val centralOffset = archive.u32(end + 16).toIntExact()
        if (centralOffset + centralSize != end) throw ArchiveException.InvalidArchive()

        val central = mutableListOf<Central>()
        val names = mutableSetOf<String>()
        var cursor = centralOffset
        repeat(entryCount) {
            if (archive.u32(cursor) != CentralSignature) throw ArchiveException.InvalidArchive()
            val madeBy = archive.u16(cursor + 4)
            val needed = archive.u16(cursor + 6)
            val flags = archive.u16(cursor + 8)
            val method = archive.u16(cursor + 10)
            val time = archive.u16(cursor + 12)
            val date = archive.u16(cursor + 14)
            val crc = archive.u32(cursor + 16)
            val compressed = archive.u32(cursor + 20).toIntExact()
            val size = archive.u32(cursor + 24).toIntExact()
            val nameLength = archive.u16(cursor + 28)
            val extraLength = archive.u16(cursor + 30)
            val commentLength = archive.u16(cursor + 32)
            val disk = archive.u16(cursor + 34)
            val internalAttributes = archive.u16(cursor + 36)
            val externalAttributes = archive.u32(cursor + 38)
            val localOffset = archive.u32(cursor + 42).toIntExact()
            if (needed != Version || flags != Flags || method != Stored || time != DosTime || date != DosDate ||
                compressed != size || extraLength != 0 || commentLength != 0 || disk != 0 || internalAttributes != 0
            ) throw ArchiveException.InvalidArchive()
            if (madeBy ushr 8 == 3) {
                val fileType = (externalAttributes ushr 16) and 0xf000
                if (fileType != 0L && fileType != 0x8000L) throw ArchiveException.InvalidArchive()
            }
            val nameStart = cursor + 46
            val path = archive.utf8(nameStart, nameStart + nameLength)
            validatePath(path)
            if (!names.add(path)) throw ArchiveException.InvalidArchive()
            central += Central(path, crc, size, localOffset)
            cursor = nameStart + nameLength
        }
        if (cursor != end) throw ArchiveException.InvalidArchive()

        val result = linkedMapOf<String, ByteArray>()
        val ranges = mutableListOf<IntRange>()
        var totalSize = 0L
        central.forEach { entry ->
            val offset = entry.localOffset
            if (archive.u32(offset) != LocalSignature || archive.u16(offset + 4) != Version ||
                archive.u16(offset + 6) != Flags || archive.u16(offset + 8) != Stored ||
                archive.u16(offset + 10) != DosTime || archive.u16(offset + 12) != DosDate ||
                archive.u32(offset + 14) != entry.crc || archive.u32(offset + 18).toIntExact() != entry.size ||
                archive.u32(offset + 22).toIntExact() != entry.size
            ) throw ArchiveException.InvalidArchive()
            val nameLength = archive.u16(offset + 26)
            val extraLength = archive.u16(offset + 28)
            if (extraLength != 0) throw ArchiveException.InvalidArchive()
            val nameStart = offset + 30
            val dataStart = nameStart + nameLength
            val dataEnd = dataStart + entry.size
            if (dataEnd > centralOffset || archive.utf8(nameStart, dataStart) != entry.path) {
                throw ArchiveException.InvalidArchive()
            }
            val data = archive.slice(dataStart, dataEnd)
            if (crc32(data) != entry.crc) throw ArchiveException.InvalidArchive()
            totalSize += data.size
            if (totalSize > ArchiveConstants.MaximumArchiveBytes) throw ArchiveException.FileTooLarge()
            ranges += offset until dataEnd
            result[entry.path] = data
        }
        var expectedStart = 0
        ranges.sortedBy { it.first }.forEach {
            if (it.first != expectedStart) throw ArchiveException.InvalidArchive()
            expectedStart = it.last + 1
        }
        if (expectedStart != centralOffset) throw ArchiveException.InvalidArchive()
        return result
    }

    fun validatePath(path: String) {
        val components = path.split('/', ignoreCase = false, limit = 0)
        if (path.isEmpty() || path.encodeToByteArray().size > ArchiveConstants.MaximumShortFieldBytes ||
            path.startsWith('/') || path.endsWith('/') || '\\' in path || '\u0000' in path ||
            components.any { it.isEmpty() || it == "." || it == ".." }
        ) throw ArchiveException.InvalidArchive()
    }

    private fun checkSize(size: Int) {
        if (size > ArchiveConstants.MaximumArchiveBytes) throw ArchiveException.FileTooLarge()
    }

    private fun crc32(bytes: ByteArray): Long = CRC32().apply { update(bytes) }.value

    private fun ByteArray.u16(offset: Int): Int {
        if (offset < 0 || offset > size - 2) throw ArchiveException.InvalidArchive()
        return (this[offset].toInt() and 0xff) or ((this[offset + 1].toInt() and 0xff) shl 8)
    }

    private fun ByteArray.u32(offset: Int): Long {
        if (offset < 0 || offset > size - 4) throw ArchiveException.InvalidArchive()
        return (this[offset].toLong() and 0xff) or
            ((this[offset + 1].toLong() and 0xff) shl 8) or
            ((this[offset + 2].toLong() and 0xff) shl 16) or
            ((this[offset + 3].toLong() and 0xff) shl 24)
    }

    private fun ByteArray.slice(start: Int, end: Int): ByteArray {
        if (start < 0 || end < start || end > size) throw ArchiveException.InvalidArchive()
        return copyOfRange(start, end)
    }

    private fun ByteArray.utf8(start: Int, end: Int): String = try {
        StandardCharsets.UTF_8.newDecoder()
            .onMalformedInput(CodingErrorAction.REPORT)
            .onUnmappableCharacter(CodingErrorAction.REPORT)
            .decode(ByteBuffer.wrap(slice(start, end))).toString()
    } catch (error: Exception) {
        throw ArchiveException.InvalidArchive(error)
    }

    private fun Long.toIntExact(): Int =
        if (this > Int.MAX_VALUE) throw ArchiveException.InvalidArchive() else toInt()

    private fun ByteArrayOutputStream.u16(value: Int) {
        write(value and 0xff)
        write((value ushr 8) and 0xff)
    }

    private fun ByteArrayOutputStream.u32(value: Long) {
        u16((value and 0xffff).toInt())
        u16(((value ushr 16) and 0xffff).toInt())
    }
}
