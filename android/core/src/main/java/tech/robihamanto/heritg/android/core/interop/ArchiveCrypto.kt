package tech.robihamanto.heritg.android.core.interop

import java.nio.ByteBuffer
import java.nio.ByteOrder
import java.security.GeneralSecurityException
import java.security.SecureRandom
import java.text.Normalizer
import javax.crypto.Cipher
import javax.crypto.Mac
import javax.crypto.spec.GCMParameterSpec
import javax.crypto.spec.SecretKeySpec

internal object ArchiveCrypto {
    fun protection(bytes: ByteArray): ArchiveProtection = when {
        bytes.size > ArchiveConstants.MaximumArchiveBytes -> throw ArchiveException.FileTooLarge()
        bytes.startsWith(ArchiveConstants.EncryptedMagic) -> ArchiveProtection.ENCRYPTED
        bytes.startsWith(ArchiveConstants.LegacyEncryptedMagic) -> ArchiveProtection.ENCRYPTED
        bytes.startsWith(ArchiveConstants.LegacyUnencryptedMagic) -> ArchiveProtection.UNENCRYPTED
        bytes.startsWith(ArchiveConstants.ZipMagic) ->
            ArchiveProtection.UNENCRYPTED
        else -> throw ArchiveException.InvalidArchive()
    }

    fun encrypt(
        plaintext: ByteArray,
        password: String,
        random: SecureRandom = SecureRandom(),
    ): ByteArray {
        val salt = ByteArray(ArchiveConstants.SaltBytes).also(random::nextBytes)
        val nonce = ByteArray(ArchiveConstants.NonceBytes).also(random::nextBytes)
        return encrypt(plaintext, password, salt, nonce)
    }

    fun encrypt(plaintext: ByteArray, password: String, salt: ByteArray, nonce: ByteArray): ByteArray {
        if (salt.size != ArchiveConstants.SaltBytes || nonce.size != ArchiveConstants.NonceBytes) {
            throw ArchiveException.InvalidArchive()
        }
        val header = header(salt, nonce)
        val passwordBytes = normalizedPassword(password)
        val key = pbkdf2(passwordBytes, salt, ArchiveConstants.Pbkdf2Iterations)
        return try {
            val cipher = Cipher.getInstance("AES/GCM/NoPadding")
            cipher.init(
                Cipher.ENCRYPT_MODE,
                SecretKeySpec(key, "AES"),
                GCMParameterSpec(ArchiveConstants.TagBytes * 8, nonce),
            )
            cipher.updateAAD(header)
            header + cipher.doFinal(plaintext)
        } catch (error: GeneralSecurityException) {
            throw ArchiveException.InvalidArchive(error)
        } finally {
            passwordBytes.fill(0)
            key.fill(0)
        }
    }

    fun decrypt(envelope: ByteArray, password: String): ByteArray {
        if (envelope.size > ArchiveConstants.MaximumArchiveBytes) throw ArchiveException.FileTooLarge()
        if (envelope.size < ArchiveConstants.HeaderBytes + ArchiveConstants.TagBytes ||
            !envelope.startsWith(ArchiveConstants.EncryptedMagic)
        ) throw ArchiveException.InvalidArchive()
        val buffer = ByteBuffer.wrap(envelope).order(ByteOrder.BIG_ENDIAN)
        buffer.position(ArchiveConstants.EncryptedMagic.size)
        if (buffer.short.toInt() and 0xffff != ArchiveConstants.EnvelopeVersion) {
            throw ArchiveException.UnsupportedVersion()
        }
        if (buffer.get().toInt() and 0xff != ArchiveConstants.KdfIdPbkdf2HmacSha256 ||
            buffer.get().toInt() and 0xff != ArchiveConstants.CipherIdAes256Gcm
        ) throw ArchiveException.InvalidArchive()
        val iterations = buffer.int
        if (iterations != ArchiveConstants.Pbkdf2Iterations) {
            throw ArchiveException.InvalidArchive()
        }
        val salt = ByteArray(ArchiveConstants.SaltBytes).also(buffer::get)
        val nonce = ByteArray(ArchiveConstants.NonceBytes).also(buffer::get)
        val header = envelope.copyOfRange(0, ArchiveConstants.HeaderBytes)
        val sealed = envelope.copyOfRange(ArchiveConstants.HeaderBytes, envelope.size)
        val passwordBytes = normalizedPassword(password)
        val key = pbkdf2(passwordBytes, salt, iterations)
        return try {
            val cipher = Cipher.getInstance("AES/GCM/NoPadding")
            cipher.init(
                Cipher.DECRYPT_MODE,
                SecretKeySpec(key, "AES"),
                GCMParameterSpec(ArchiveConstants.TagBytes * 8, nonce),
            )
            cipher.updateAAD(header)
            cipher.doFinal(sealed)
        } catch (error: GeneralSecurityException) {
            throw ArchiveException.WrongPasswordOrCorrupt(error)
        } finally {
            passwordBytes.fill(0)
            key.fill(0)
        }
    }

    private fun header(salt: ByteArray, nonce: ByteArray): ByteArray =
        ByteBuffer.allocate(ArchiveConstants.HeaderBytes).order(ByteOrder.BIG_ENDIAN).apply {
            put(ArchiveConstants.EncryptedMagic)
            putShort(ArchiveConstants.EnvelopeVersion.toShort())
            put(ArchiveConstants.KdfIdPbkdf2HmacSha256.toByte())
            put(ArchiveConstants.CipherIdAes256Gcm.toByte())
            putInt(ArchiveConstants.Pbkdf2Iterations)
            put(salt)
            put(nonce)
        }.array()

    private fun normalizedPassword(password: String): ByteArray =
        Normalizer.normalize(password, Normalizer.Form.NFC).encodeToByteArray()

    // This byte-oriented PBKDF2 avoids provider-specific char-to-byte conversion.
    internal fun pbkdf2(password: ByteArray, salt: ByteArray, iterations: Int): ByteArray {
        val mac = Mac.getInstance("HmacSHA256")
        mac.init(SecretKeySpec(password, "HmacSHA256"))
        val firstInput = salt + byteArrayOf(0, 0, 0, 1)
        var u = mac.doFinal(firstInput)
        val result = u.copyOf()
        repeat(iterations - 1) {
            val next = mac.doFinal(u)
            u.fill(0)
            u = next
            result.indices.forEach { index -> result[index] = (result[index].toInt() xor u[index].toInt()).toByte() }
        }
        u.fill(0)
        return result.copyOf(ArchiveConstants.KeyBytes).also { result.fill(0) }
    }
}

private fun ByteArray.startsWith(prefix: ByteArray): Boolean =
    size >= prefix.size && prefix.indices.all { this[it] == prefix[it] }
