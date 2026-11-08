package io.github.sami_gor.daymark.packs;

import io.github.sami_gor.daymark.voice.ModelStoragePreflight;

/**
 * Storage preflight for optional narration packs.
 *
 * <p>The peak requirement is larger than the download alone:
 * <ul>
 *   <li>the remaining payload bytes are downloaded into {@code staging};</li>
 *   <li>the verified payload is moved into the pack version directory and a
 *       copy is published as {@code filesDir/kokoro/<voice>.bin}, so one full
 *       payload worth of extra space is needed;</li>
 *   <li>the previous working version is kept until activation succeeds.</li>
 * </ul>
 *
 * <p>This mirrors {@link ModelStoragePreflight}'s margin policy rather than
 * trusting the nominal pack size. A partial download reduces the remaining
 * amount but never removes the need for the voice copy.
 */
public final class PackStoragePreflight {

    private PackStoragePreflight() {
    }

    /** Bytes required to finish and install a payload of {@code payloadSize}. */
    public static long requiredBytes(long payloadSize, long alreadyDownloaded) {
        if (payloadSize <= 0) {
            throw new IllegalArgumentException("payload-size");
        }
        if (alreadyDownloaded < 0) {
            throw new IllegalArgumentException("negative-downloaded");
        }
        long remaining = Math.max(0L, payloadSize - alreadyDownloaded);
        long margin = Math.max(
                ModelStoragePreflight.MIN_MARGIN_BYTES,
                payloadSize * ModelStoragePreflight.MARGIN_PERCENT / 100L);
        return remaining + payloadSize + margin;
    }

    public static boolean hasRoom(long availableBytes, long payloadSize, long alreadyDownloaded) {
        return availableBytes >= requiredBytes(payloadSize, alreadyDownloaded);
    }
}
